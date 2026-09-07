import { Processor, Process, OnQueueFailed, InjectQueue } from "@nestjs/bull";
import { Logger } from "@nestjs/common";
import { Job, Queue } from "bull";
import { createReadStream, existsSync } from "fs";
import { readFile } from "fs/promises";
import { parse } from "csv-parse";
import * as XLSX from "xlsx";
import { PrismaClient } from "@prisma/client";
import { TemplateEngine } from "@mpc/template-engine";
import { PageGenerationChunkPayload, AiContentJobPayload, QUEUE_NAMES } from "@mpc/queue";
import { PageStatus } from "@mpc/shared";
import { TemplateCacheService } from "../services/template-cache.service";
import { SchemaMarkupGenerator } from "../services/schema-markup.generator";
import { InternalLinkingService } from "../services/internal-linking.service";
import { calculateSeoScore } from "../services/seo-score.calculator";
import { buildFilePath, writeHtmlFile, readHtmlFile } from "../services/html-file.store";

type CachedTemplate = Awaited<ReturnType<TemplateCacheService["get"]>>;

// Holds rendered data for one row before any DB write.
// HTML is written to disk; only metadata goes to Mongo.
interface RenderedPage {
  dataRow: Record<string, string>;
  slug: string;
  title: string;
  filePath: string;
  canonicalUrl: string;
  focusKeyword: string;
  seoScore: number;
  status: PageStatus;
  unresolvedAi: string[];
  schemas: Array<{ type: string; data: unknown; isValid: boolean }>;
}

// Global cache for parsed files to prevent O(N^2) parsing
const parsedFileCache = new Map<string, { promise: Promise<Record<string, string>[]>, timestamp: number }>();
// PROCESSOR_CONCURRENCY: balance between throughput and resource pressure
// - Too high (25): EMFILE errors, transaction aborts
// - Too low (1): generation extremely slow
// - Sweet spot (3): good throughput without crashing
const PROCESSOR_CONCURRENCY = 3;
const ROW_RENDER_CONCURRENCY = 8;

@Processor(QUEUE_NAMES.PAGE_GENERATION)
export class PageGenerationProcessor {
  private readonly logger = new Logger(PageGenerationProcessor.name);
  private readonly engine = new TemplateEngine();
  private readonly schemaGenerator = new SchemaMarkupGenerator();
  private readonly baseUrlCache = new Map<string, string>();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly templateCache: TemplateCacheService,
    private readonly internalLinking: InternalLinkingService,
    @InjectQueue(QUEUE_NAMES.AI_CONTENT)
    private readonly aiQueue: Queue<AiContentJobPayload>
  ) {}

  @Process({ name: "process-chunk", concurrency: PROCESSOR_CONCURRENCY })
  async processChunk(job: Job<PageGenerationChunkPayload>): Promise<void> {
    const { generationJobId, orgId, projectId, templateId, filePath, startIndex, endIndex, chunkIndex, totalChunks } = job.data;

    this.logger.log(`Chunk ${chunkIndex + 1}/${totalChunks} [rows ${startIndex}–${endIndex - 1}] job=${generationJobId}`);

    // Skip if the run was cancelled while this chunk was waiting in queue
    const runCheck = await (this.prisma as any).generationRun.findFirst({
      where: { id: generationJobId },
      select: { status: true },
    });
    if (runCheck?.status === "CANCELLED") {
      this.logger.log(`Chunk ${chunkIndex + 1}/${totalChunks} skipped — run ${generationJobId} is CANCELLED`);
      return;
    }

    if (!existsSync(filePath)) throw new Error(`File not found: ${filePath}`);

    const template = await this.templateCache.get(templateId);
    const baseUrl = await this.getProjectBaseUrl(projectId);
    const rows = await this.readChunk(filePath, startIndex, endIndex);

    // ── Phase 1: Render rows + write HTML files to dist/ ─────────────────
    const renderedResults = await this.runWithConcurrency(
      rows,
      ROW_RENDER_CONCURRENCY,
      async (row) => {
        try {
          return await this.renderRow(row, projectId, templateId, template, baseUrl);
        } catch (err) {
          this.logger.warn(`Chunk ${chunkIndex + 1}/${totalChunks} — render skipped: ${(err as Error).message}`);
          return null;
        }
      }
    );

    const rendered = renderedResults.filter((page): page is RenderedPage => page !== null);
    const failedPages = rows.length - rendered.length;

    await job.progress(30);

    if (rendered.length === 0) {
      await this.updateJobProgress(generationJobId, 0, failedPages, totalChunks);
      return;
    }

    // ── Phase 2: createMany new + updateMany existing — 2 DB calls total ──
    const uniqueRendered: RenderedPage[] = [];
    const seenSlugs = new Set<string>();
    for (const p of rendered) {
      if (!seenSlugs.has(p.slug)) { seenSlugs.add(p.slug); uniqueRendered.push(p); }
    }

    const slugs = uniqueRendered.map((p) => p.slug);

    // Find which slugs already exist — 1 DB call
    const existing = await this.prisma.generatedPage.findMany({
      where: { projectId, templateId, slug: { in: slugs } },
      select: { slug: true },
    });
    const existingSlugs = new Set(existing.map((e) => e.slug));

    const toCreate = uniqueRendered.filter((p) => !existingSlugs.has(p.slug));
    const toUpdate = uniqueRendered.filter((p) => existingSlugs.has(p.slug));

    // createMany for new pages — 1 DB call
    if (toCreate.length > 0) {
      await this.prisma.generatedPage.createMany({
        data: toCreate.map((p) => ({
          orgId, projectId, templateId,
          slug: p.slug, title: p.title, filePath: p.filePath,
          canonicalUrl: p.canonicalUrl, focusKeyword: p.focusKeyword,
          seoScore: p.seoScore, status: p.status,
        })),
      }).catch(() => {});
    }

    // updateMany per slug serially to avoid Mongo transaction aborts / write conflicts.
    if (toUpdate.length > 0) {
      await this.runWithConcurrency(toUpdate, 1, async (p) => {
        await this.retryOnTransactionAbort(() =>
          this.prisma.generatedPage.updateMany({
            where: { projectId, templateId, slug: p.slug },
            data: {
              title: p.title,
              filePath: p.filePath,
              canonicalUrl: p.canonicalUrl,
              focusKeyword: p.focusKeyword,
              seoScore: p.seoScore,
              status: p.status,
              deletedAt: null,
            },
          })
        ).catch(() => {});
      });
    }

    await job.progress(60);

    // ── Phase 3: Fetch back IDs — createMany doesn't return them ─────────
    const savedPages = await this.prisma.generatedPage.findMany({
      where: { projectId, templateId, slug: { in: slugs } },
      select: { id: true, slug: true, orgId: true },
    });

    const slugToId = new Map(savedPages.map((p) => [p.slug, p.id]));

    // ── Phase 4: createMany schemas — 1 DB call ───────────────────────────
    const schemaRecords: Array<{ orgId: string; pageId: string; type: any; data: object; isValid: boolean }> = [];

    for (const rp of rendered) {
      const pageId = slugToId.get(rp.slug);
      if (!pageId || rp.schemas.length === 0) continue;
      for (const s of rp.schemas) {
        schemaRecords.push({
          orgId, pageId,
          type: this.mapSchemaType(s.type) as any,
          data: s.data as object,
          isValid: s.isValid,
        });
      }
    }

    if (schemaRecords.length > 0) {
      // Simple createMany without duplicate handling — MongoDB will ignore duplicates
      // if they exist, and we don't care about strict uniqueness for schema markup
      try {
        await this.prisma.schemaMarkup.createMany({ 
          data: schemaRecords
        });
      } catch (err) {
        // Ignore duplicate key errors — multiple chunks might create same schemas
        if (!(err as Error).message?.includes("duplicate") && !(err as Error).message?.includes("E11000")) {
          throw err;
        }
      }
    }

    await job.progress(80);

    // ── Phase 5: Enqueue AI jobs ──────────────────────────────────────────
    const aiJobs: Array<{ name: string; data: AiContentJobPayload; opts: object }> = [];

    for (const rp of rendered) {
      if (rp.unresolvedAi.length === 0) continue;
      const pageId = slugToId.get(rp.slug);
      if (!pageId) continue;
      for (const placeholder of rp.unresolvedAi) {
        const prompt = this.buildAiPrompt(placeholder, rp.dataRow);
        aiJobs.push({
          name: "generate-ai-content",
          data: {
            orgId, pageId, placeholder, prompt,
            provider: "OPENAI" as const,
            model: "gpt-4o-mini",
            cacheKey: this.buildCacheKey("OPENAI", "gpt-4o-mini", prompt),
          },
          opts: { attempts: 5, backoff: { type: "exponential", delay: 3000 } },
        });
      }
    }

    if (aiJobs.length > 0) await this.aiQueue.addBulk(aiJobs);

    // ── Phase 6: Usage record — increment with retry on write conflict ────
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    await this.incrementUsage(orgId, rendered.length, today);

    // ── Phase 7: Fire-and-forget internal linking — only after enough pages exist ──
    // Skip linking for early chunks (< 100 pages total) to avoid empty pool queries.
    const totalSaved = await this.prisma.generatedPage.count({ where: { orgId, projectId } });
    if (totalSaved >= 100) {
      this.internalLinking
        .buildLinksForChunk(savedPages.map((p) => ({ id: p.id, dataRow: rendered.find((r) => r.slug === p.slug)?.dataRow ?? {} })), orgId, projectId)
        .catch(() => {});
    }

    await job.progress(100);

    await this.updateJobProgress(generationJobId, savedPages.length, failedPages, totalChunks);

    this.logger.log(
      `Chunk ${chunkIndex + 1}/${totalChunks} done — ` +
      `saved=${savedPages.length} failed=${failedPages} dbCalls=4 job=${generationJobId}`
    );
  }

  @OnQueueFailed()
  async onFailed(job: Job<PageGenerationChunkPayload>, err: Error): Promise<void> {
    const { generationJobId, chunkIndex, totalChunks } = job.data;
    this.logger.error(`Chunk ${chunkIndex + 1}/${totalChunks} failed after ${job.attemptsMade} attempts: ${err.message} job=${generationJobId}`);
    await this.atomicIncrement(generationJobId, { failedChunks: 1 }).catch(() => {});

    // Check if all chunks are done after this failure
    const run = await (this.prisma as any).generationRun.findFirst({
      where: { id: generationJobId },
      select: { doneChunks: true, failedChunks: true, totalChunks: true, generatedPages: true },
    }).catch(() => null);
    if (!run) return;

    if (run.doneChunks + run.failedChunks >= run.totalChunks) {
      const status = run.doneChunks === 0 ? "FAILED" : "PARTIAL";
      await this.atomicSet(generationJobId, { status, completedAt: new Date() }).catch(() => {});
      this.logger.log(`GenerationRun ${generationJobId} ${status} — generatedPages=${run.generatedPages}`);
    }
  }

  // ── Render + write HTML to dist/ ─────────────────────────────────────────

  private async renderRow(
    dataRow: Record<string, string>,
    projectId: string,
    templateId: string,
    template: CachedTemplate,
    baseUrl: string
  ): Promise<RenderedPage> {
    const firstPass = this.engine.render(
      {
        content: template.content,
        titleTemplate: template.titleTemplate,
        descriptionTemplate: template.descriptionTemplate,
        slugTemplate: template.slugTemplate,
      },
      { data: dataRow, aiContent: {}, seo: {}, schema: { schemas: {} }, images: { images: {} } },
      baseUrl
    );

    const slug = firstPass.seo.slug;
    const hasAi = firstPass.unresolvedAi.length > 0;

    const schemas = this.schemaGenerator.generate(
      template.schemaTemplate,
      dataRow,
      { ...firstPass.seo, canonicalUrl: `${baseUrl}/${slug}` }
    );
    if (dataRow.city || dataRow.service) {
      schemas.push(this.schemaGenerator.buildLocalBusiness(dataRow));
    }

    const seoScore = hasAi ? 0 : calculateSeoScore({
      title: firstPass.seo.title,
      description: firstPass.seo.description,
      slug,
      htmlContent: firstPass.html,
      focusKeyword: firstPass.seo.focusKeyword,
      hasSchema: schemas.some((s) => s.isValid),
      internalLinkCount: 0,
    }).score;

    // Write HTML to dist/<projectId>/<templateId>/<slug>.html
    // If template has headContent (from HTML import), reconstruct the full document
    // so all <link>, <meta>, <script> tags are preserved in the output file.
    const htmlFilePath = buildFilePath(projectId, templateId, slug);
    let finalHtml: string;
    if (template.headContent) {
      // Render headContent variables too (e.g. {{brand}}, {{city}} in meta tags)
      const renderedHead = this.engine.render(
        { content: template.headContent, titleTemplate: "", descriptionTemplate: "", slugTemplate: "" },
        { data: dataRow, aiContent: {}, seo: {}, schema: { schemas: {} }, images: { images: {} } },
        baseUrl
      ).html;
      finalHtml = `<!DOCTYPE html>\n<html lang="en">\n<head>\n${renderedHead}\n</head>\n<body>\n${firstPass.html}\n</body>\n</html>`;
    } else {
      finalHtml = firstPass.html;
    }
    await writeHtmlFile(htmlFilePath, finalHtml);

    return {
      dataRow,
      slug,
      title: firstPass.seo.title,
      filePath: htmlFilePath,
      canonicalUrl: `${baseUrl}/${slug}`,
      focusKeyword: firstPass.seo.focusKeyword ?? "",
      seoScore,
      status: hasAi ? PageStatus.GENERATING : PageStatus.GENERATED,
      unresolvedAi: firstPass.unresolvedAi,
      schemas,
    };
  }

  private async runWithConcurrency<T, R>(
    items: T[],
    limit: number,
    worker: (item: T) => Promise<R>
  ): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let nextIndex = 0;

    const runNext = async (): Promise<void> => {
      const currentIndex = nextIndex++;
      if (currentIndex >= items.length) return;

      results[currentIndex] = await worker(items[currentIndex]);
      await runNext();
    };

    const workers = Array.from({ length: Math.min(limit, items.length) }, () => runNext());
    await Promise.all(workers);
    return results;
  }

  private async retryOnTransactionAbort<T>(
    fn: () => Promise<T>,
    attempts = 3,
    delayMs = 250
  ): Promise<T> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err;
        const message = String((err as Error).message || "").toLowerCase();
        const isTxnAbort = message.includes("transaction with") && message.includes("aborted");

        if (!isTxnAbort || attempt === attempts) {
          throw err;
        }

        await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
      }
    }

    throw lastError;
  }

  // ── Usage record — retry on write conflict ──────────────────────────
  // MongoDB standalone mein concurrent upserts deadlock dete hain.
  // Fix: pehle update try karo, agar document nahi mila toh insert karo.
  // Retry with jitter handles the rare concurrent insert race.
  private async incrementUsage(orgId: string, count: number, date: Date): Promise<void> {
    try {
      const updated = await this.prisma.usageRecord.updateMany({
        where: { orgId, metric: "pages_generated", date },
        data: { value: { increment: count } },
      });
      if (updated.count === 0) {
        await this.prisma.usageRecord.create({
          data: { orgId, metric: "pages_generated", date, value: count },
        }).catch(() =>
          this.prisma.usageRecord.updateMany({
            where: { orgId, metric: "pages_generated", date },
            data: { value: { increment: count } },
          }).catch(() => {})
        );
      }
    } catch {
      // non-fatal — never block chunk progress over usage tracking
    }
  }

  // ── Progress ──────────────────────────────────────────────────────────────

  private async updateJobProgress(
    generationJobId: string,
    savedPages: number,
    failedPages: number,
    totalChunks: number
  ): Promise<void> {
    // Use atomic $inc via runCommandRaw — avoids Prisma transaction deadlocks on MongoDB
    await this.atomicIncrement(generationJobId, {
      doneChunks: 1,
      processedRows: savedPages + failedPages,
      generatedPages: savedPages,
      failedPages,
    });

    const updated = await (this.prisma as any).generationRun.findFirst({
      where: { id: generationJobId },
      select: { doneChunks: true, failedChunks: true, generatedPages: true },
    });
    if (!updated) return;

    if (updated.doneChunks + updated.failedChunks >= totalChunks) {
      const status = updated.failedChunks > 0 && updated.doneChunks === 0
        ? "FAILED"
        : updated.failedChunks > 0 ? "PARTIAL" : "COMPLETED";

      await this.atomicSet(generationJobId, { status, completedAt: new Date() });
      this.logger.log(`GenerationRun ${generationJobId} ${status} — generatedPages=${updated.generatedPages}`);
    }
  }

  // ── Atomic MongoDB helpers (no Prisma transaction = no deadlock) ──────────

  private async atomicIncrement(runId: string, fields: Record<string, number>): Promise<void> {
    const $inc: Record<string, number> = {};
    for (const [k, v] of Object.entries(fields)) $inc[k] = v;
    await (this.prisma as any).generationRun.update({
      where: { id: runId },
      data: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, { increment: v }])),
    }).catch(() => {});
  }

  private async atomicSet(runId: string, fields: Record<string, unknown>): Promise<void> {
    await (this.prisma as any).generationRun.update({
      where: { id: runId },
      data: fields,
    }).catch(() => {});
  }

  // ── AI finalization ───────────────────────────────────────────────────────

  async finalizePageWithAiContent(pageId: string, aiContent: Record<string, string>): Promise<void> {
    const page = await this.prisma.generatedPage.findUnique({ where: { id: pageId } }) as any;
    if (!page) return;

    const template = await this.templateCache.get(page.templateId);
    const baseUrl = await this.getProjectBaseUrl(page.projectId);

    const finalRender = this.engine.render(
      {
        content: template.content,
        titleTemplate: template.titleTemplate,
        descriptionTemplate: template.descriptionTemplate,
        slugTemplate: template.slugTemplate,
      },
      { data: {}, aiContent, seo: {}, schema: { schemas: {} }, images: { images: {} } },
      baseUrl
    );

    if (aiContent.faq) {
      const faqSchema = this.schemaGenerator.buildFaq(aiContent.faq);
      if (faqSchema.isValid) {
        await this.prisma.schemaMarkup.create({
          data: { orgId: page.orgId, pageId, type: "FAQ", data: faqSchema.data as object, isValid: true },
        });
      }
    }

    const internalLinkCount = await this.prisma.internalLink.count({ where: { sourcePageId: pageId } });
    const scoreResult = calculateSeoScore({
      title: finalRender.seo.title,
      description: finalRender.seo.description,
      slug: page.slug,
      htmlContent: finalRender.html,
      focusKeyword: finalRender.seo.focusKeyword,
      hasSchema: true,
      internalLinkCount,
    });

    // Overwrite HTML file on disk with AI-enriched version
    let finalHtml: string;
    if (template.headContent) {
      const renderedHead = this.engine.render(
        { content: template.headContent, titleTemplate: "", descriptionTemplate: "", slugTemplate: "" },
        { data: {}, aiContent, seo: {}, schema: { schemas: {} }, images: { images: {} } },
        baseUrl
      ).html;
      finalHtml = `<!DOCTYPE html>\n<html lang="en">\n<head>\n${renderedHead}\n</head>\n<body>\n${finalRender.html}\n</body>\n</html>`;
    } else {
      finalHtml = finalRender.html;
    }
    await writeHtmlFile(page.filePath, finalHtml);

    await this.prisma.generatedPage.update({
      where: { id: pageId },
      data: { status: PageStatus.GENERATED, seoScore: scoreResult.score },
    });
  }

  // ── File readers ──────────────────────────────────────────────────────────

  private async readChunk(filePath: string, startIndex: number, endIndex: number): Promise<Record<string, string>[]> {
    const ext = filePath.split(".").pop()?.toLowerCase();

    if (ext === "xlsx" || ext === "xls") {
      // Excel files are still parsed once because the sheet format is not row-streamable
      // in the same way as CSV. This is acceptable for spreadsheet uploads that are
      // already small enough to fit in memory.
      const now = Date.now();
      for (const [key, cache] of parsedFileCache.entries()) {
        if (now - cache.timestamp > 15 * 60 * 1000) parsedFileCache.delete(key);
      }

      if (!parsedFileCache.has(filePath)) {
        parsedFileCache.set(filePath, {
          promise: this.readExcelFile(filePath),
          timestamp: now,
        });
      }

      const cached = parsedFileCache.get(filePath)!;
      cached.timestamp = now;
      const allRows = await cached.promise;
      return allRows.slice(startIndex, endIndex);
    }

    // CSV: stream only the requested row range instead of loading the whole file.
    return this.readCsvChunk(filePath, startIndex, endIndex);
  }

  private async readExcelFile(filePath: string): Promise<Record<string, string>[]> {
    const buffer = await readFile(filePath);
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const all = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
    return all.map((r) =>
      Object.fromEntries(Object.entries(r).map(([k, v]) => [this.normalizeKey(k), String(v ?? "")]))
    );
  }

  private readCsvChunk(filePath: string, startIndex: number, endIndex: number): Promise<Record<string, string>[]> {
    return new Promise((resolve, reject) => {
      const rows: Record<string, string>[] = [];
      let headers: string[] = [];
      let rowIndex = -1;
      let isFirstRow = true;

      const parser = parse({
        bom: true,
        trim: true,
        skip_empty_lines: true,
        relax_quotes: true,
        relax_column_count: true,
      });

      parser.on("readable", () => {
        let record: string[];
        while ((record = parser.read()) !== null) {
          if (isFirstRow) {
            headers = record.map((h) => this.normalizeKey(h));
            isFirstRow = false;
            continue;
          }

          rowIndex++;
          if (rowIndex < startIndex || rowIndex >= endIndex) continue;

          const row: Record<string, string> = {};
          headers.forEach((h, i) => {
            row[h] = record[i] ?? "";
          });

          if (Object.values(row).some((v) => v)) {
            rows.push(row);
          }
        }
      });

      parser.on("end", () => resolve(rows));
      parser.on("error", reject);
      createReadStream(filePath).pipe(parser);
    });
  }

  // ── Utilities ─────────────────────────────────────────────────────────────

  private async enqueueAiJobs(pageId: string, orgId: string, placeholders: string[], dataRow: Record<string, string>): Promise<void> {
    await this.aiQueue.addBulk(placeholders.map((placeholder) => {
      const prompt = this.buildAiPrompt(placeholder, dataRow);
      return {
        name: "generate-ai-content",
        data: { orgId, pageId, placeholder, prompt, provider: "OPENAI" as const, model: "gpt-4o-mini", cacheKey: this.buildCacheKey("OPENAI", "gpt-4o-mini", prompt) } as AiContentJobPayload,
        opts: { attempts: 5, backoff: { type: "exponential" as const, delay: 3000 } },
      };
    }));
  }

  private buildAiPrompt(placeholder: string, data: Record<string, string>): string {
    const city = data.city ?? data.location ?? "";
    const service = data.service ?? data.category ?? "";
    const brand = data.brand ?? data.business_name ?? "";
    const prompts: Record<string, string> = {
      faq: `Write 5 FAQs about ${service} in ${city}. Format: Q: ... A: ...`,
      intro: `Write a 150-word intro about ${service} services in ${city}.`,
      conclusion: `Write a 100-word conclusion encouraging ${city} residents to choose ${brand || "a local provider"} for ${service}.`,
      benefits: `List 5 benefits of professional ${service} in ${city}.`,
      local_content: `Write 2 paragraphs about the ${service} industry in ${city}.`,
    };
    return prompts[placeholder] ?? `Write SEO content about ${service} in ${city} for: ${placeholder}. Max 200 words.`;
  }

  private buildCacheKey(provider: string, model: string, prompt: string): string {
    const str = `${provider}:${model}:${prompt}`;
    let hash = 0;
    for (let i = 0; i < str.length; i++) { hash = ((hash << 5) - hash) + str.charCodeAt(i); hash |= 0; }
    return `ai_cache_${Math.abs(hash).toString(36)}`;
  }

  private async getProjectBaseUrl(projectId: string): Promise<string> {
    if (this.baseUrlCache.has(projectId)) return this.baseUrlCache.get(projectId)!;
    const project = await this.prisma.project.findUnique({ where: { id: projectId }, select: { settings: true } });
    const settings = (project?.settings as Record<string, string>) ?? {};
    const url = (settings.baseUrl ?? "https://example.com").replace(/\/$/, "");
    this.baseUrlCache.set(projectId, url);
    return url;
  }

  private normalizeKey(key: string): string {
    return String(key).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  }

  private mapSchemaType(type: string): string {
    const map: Record<string, string> = {
      LocalBusiness: "LOCAL_BUSINESS", Article: "ARTICLE", FAQ: "FAQ", FAQPage: "FAQ",
      BreadcrumbList: "BREADCRUMB", Product: "PRODUCT", Service: "SERVICE",
      WebPage: "ARTICLE", Organization: "ORGANIZATION", WebSite: "WEBSITE",
    };
    return map[type] ?? "ARTICLE";
  }
}
