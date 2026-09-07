import { Processor, Process, OnQueueFailed } from "@nestjs/bull";
import { Logger } from "@nestjs/common";
import { Job } from "bull";
import { PrismaClient } from "@prisma/client";
import { AiContentJobPayload, QUEUE_NAMES } from "@mpc/queue";
import { RedisCacheService } from "../services/redis-cache.service";
import { OpenAiProvider } from "../services/ai/openai.provider";
import { PromptBuilder } from "../services/ai/prompt-builder";
import {
  scoreAiContent,
  QUALITY_THRESHOLD,
  MAX_QUALITY_RETRIES,
} from "../services/ai/quality-scorer";
import { PageGenerationProcessor } from "./page-generation.processor";

// =============================================================================
// AI CONTENT PROCESSOR
//
// Concurrency: 3 — limited to respect OpenAI's rate limits.
// OpenAI's default TPM (tokens per minute) limit for tier-1 accounts
// is 200K TPM. At ~500 tokens per request, that's ~400 requests/minute.
// 3 concurrent workers × 20 req/s = 60 req/s = well within limits.
//
// Scale up concurrency as you upgrade OpenAI tier.
// =============================================================================

@Processor(QUEUE_NAMES.AI_CONTENT)
export class AiContentProcessor {
  private readonly logger = new Logger(AiContentProcessor.name);
  private readonly promptBuilder = new PromptBuilder();
  private openAiProvider: OpenAiProvider | null = null;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly cache: RedisCacheService,
    private readonly pageGenProcessor: PageGenerationProcessor
  ) {}

  @Process({ name: "generate-ai-content", concurrency: 3 })
  async generateContent(job: Job<AiContentJobPayload>): Promise<void> {
    const { orgId, pageId, placeholder, prompt, provider, model, cacheKey } = job.data;

    this.logger.debug(`AI job: page=${pageId} placeholder=${placeholder}`);

    // ── Step 1: Check Redis cache ─────────────────────────────────────────
    const cached = await this.cache.getAiCache(cacheKey);
    if (cached) {
      this.logger.debug(`Cache hit for ${cacheKey}`);

      // Save as CACHED generation record
      await this.saveGeneration({
        orgId,
        pageId,
        placeholder,
        prompt,
        response: cached,
        provider,
        model,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        costUsd: 0,
        status: "CACHED",
        qualityScore: 100, // cached = already passed quality check
      });

      await this.checkAndFinalizePageIfComplete(pageId);
      return;
    }

    // ── Step 2: Check org AI rate limit ──────────────────────────────────
    const allowed = await this.cache.checkRateLimit(
      `ai_rpm:${orgId}`,
      300,  // 300 requests per minute per org
      60
    );

    if (!allowed) {
      // Re-queue with a delay instead of failing
      throw new Error("Org AI rate limit exceeded — job will be retried");
    }

    // ── Step 3: Build prompt ──────────────────────────────────────────────
    // Fetch page data row for context
    const page = await this.prisma.generatedPage.findUnique({
      where: { id: pageId },
      select: { id: true },
    });

    if (!page) {
      this.logger.warn(`Page ${pageId} not found — skipping AI generation`);
      return;
    }

    const data: Record<string, string> = {};
    const builtPrompt = this.promptBuilder.build({
      placeholder,
      data,
      promptOverride: prompt !== this.buildDefaultPromptKey(placeholder, data)
        ? prompt
        : undefined,
    });

    // ── Step 4: Call AI provider with quality retry loop ──────────────────
    let content = "";
    let promptTokens = 0;
    let completionTokens = 0;
    let totalTokens = 0;
    let costUsd = 0;
    let qualityScore = 0;
    let qualityRetries = 0;

    const aiProvider = this.getProvider(provider, orgId);

    while (qualityRetries <= MAX_QUALITY_RETRIES) {
      const response = await aiProvider.complete({
        messages: builtPrompt.messages,
        model,
        maxTokens: builtPrompt.maxTokens,
        temperature: builtPrompt.temperature + qualityRetries * 0.05, // slightly increase creativity on retry
      });

      content = response.content;
      promptTokens += response.promptTokens;
      completionTokens += response.completionTokens;
      totalTokens += response.totalTokens;
      costUsd += response.costUsd;

      // ── Step 5: Score quality ─────────────────────────────────────────
      const scoreResult = scoreAiContent(
        content,
        placeholder,
        data,
        builtPrompt.expectedMinLength
      );

      qualityScore = scoreResult.score;

      if (scoreResult.passed) {
        break; // quality is good enough
      }

      qualityRetries++;

      if (qualityRetries <= MAX_QUALITY_RETRIES) {
        this.logger.warn(
          `Quality check failed (score: ${qualityScore}) for ${placeholder} on page ${pageId}. ` +
          `Reasons: ${scoreResult.reasons.join(", ")}. Retry ${qualityRetries}/${MAX_QUALITY_RETRIES}`
        );

        // Strengthen the prompt on retry — add explicit quality instructions
        builtPrompt.messages.push({
          role: "assistant",
          content,
        });
        builtPrompt.messages.push({
          role: "user",
          content: `The previous response had issues: ${scoreResult.reasons.join("; ")}. 
Please rewrite it addressing these specific problems. Be more specific, detailed, and locally relevant.`,
        });
      }
    }

    // ── Step 6: Cache the result ──────────────────────────────────────────
    if (qualityScore >= QUALITY_THRESHOLD) {
      await this.cache.setAiCache(cacheKey, content);
    }

    // ── Step 7: Save generation record ───────────────────────────────────
    await this.saveGeneration({
      orgId,
      pageId,
      placeholder,
      prompt,
      response: content,
      provider,
      model,
      promptTokens,
      completionTokens,
      totalTokens,
      costUsd,
      status: "COMPLETED",
      qualityScore,
    });

    // ── Step 8: Track AI token usage ─────────────────────────────────────
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    await this.prisma.usageRecord.upsert({
      where: {
        orgId_metric_date: {
          orgId,
          metric: "ai_tokens",
          date: today,
        },
      },
      update: {
        value: {
          increment: totalTokens,
        },
      },
      create: {
        orgId,
        metric: "ai_tokens",
        date: today,
        value: totalTokens,
      },
    });

    // ── Step 9: Check if all AI placeholders for this page are resolved ───
    await this.checkAndFinalizePageIfComplete(pageId);
  }

  @OnQueueFailed()
  onFailed(job: Job<AiContentJobPayload>, err: Error): void {
    this.logger.error(
      `AI job ${job.id} failed after ${job.attemptsMade} attempts: ${err.message}`
    );
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  // Check if all AI placeholders for a page are resolved.
  // If yes, trigger the second-pass render to finalize the page.
  private async checkAndFinalizePageIfComplete(pageId: string): Promise<void> {
    const [totalAiJobs, completedAiJobs] = await Promise.all([
      this.prisma.aiGeneration.count({ where: { pageId } }),
      this.prisma.aiGeneration.count({
        where: { pageId, status: { in: ["COMPLETED", "CACHED"] } },
      }),
    ]);

    if (totalAiJobs === 0 || completedAiJobs < totalAiJobs) return;

    // All AI jobs done — collect content and finalize the page
    const generations = await this.prisma.aiGeneration.findMany({
      where: { pageId, status: { in: ["COMPLETED", "CACHED"] } },
      select: { placeholder: true, response: true },
    });

    const aiContent: Record<string, string> = {};
    for (const gen of generations) {
      aiContent[gen.placeholder] = gen.response;
    }

    await this.pageGenProcessor.finalizePageWithAiContent(pageId, aiContent);
  }

  private async saveGeneration(data: {
    orgId: string;
    pageId: string;
    placeholder: string;
    prompt: string;
    response: string;
    provider: string;
    model: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    costUsd: number;
    status: string;
    qualityScore: number;
  }): Promise<void> {
    await this.prisma.aiGeneration.create({
      data: {
        orgId: data.orgId,
        pageId: data.pageId,
        provider: data.provider as "OPENAI" | "ANTHROPIC" | "GEMINI",
        model: data.model,
        placeholder: data.placeholder,
        prompt: data.prompt,
        response: data.response,
        promptTokens: data.promptTokens,
        completionTokens: data.completionTokens,
        totalTokens: data.totalTokens,
        costUsd: data.costUsd,
        status: data.status as "COMPLETED" | "CACHED" | "FAILED",
        qualityScore: data.qualityScore,
        cacheKey: data.status === "CACHED" ? undefined : undefined,
      },
    });
  }

  private getProvider(provider: string, orgId: string): OpenAiProvider {
    // In production: fetch org-specific API key from encrypted DB field
    // For now: use the global API key from config
    if (!this.openAiProvider) {
      const apiKey = process.env.OPENAI_API_KEY ?? "";
      this.openAiProvider = new OpenAiProvider(apiKey);
    }
    return this.openAiProvider;
  }

  private buildDefaultPromptKey(placeholder: string, data: Record<string, string>): string {
    const city = data.city ?? "";
    const service = data.service ?? "";
    return `${placeholder}:${service}:${city}`;
  }
}
