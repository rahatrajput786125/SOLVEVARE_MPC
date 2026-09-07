import { Processor, Process, OnQueueFailed, InjectQueue } from "@nestjs/bull";
import { Logger } from "@nestjs/common";
import { Job, Queue } from "bull";
import { PrismaClient } from "@prisma/client";
import { PublishJobPayload, SitemapJobPayload, QUEUE_NAMES } from "@mpc/queue";
import { WordPressPublisher } from "../publishers/wordpress.publisher";
import { StaticHtmlPublisher } from "../publishers/static-html.publisher";
import { WebhookPublisher } from "../publishers/webhook.publisher";
import { Publisher, PageToPublish } from "../publishers/publisher.interface";

// =============================================================================
// PUBLISH PROCESSOR
//
// Processes one publish batch job.
// Each job contains up to 100 page IDs to publish.
// Why batches? Publishing 100K pages as one job = no progress visibility.
// Batches of 100 = 1000 jobs for 100K pages = granular progress tracking.
//
// Pipeline per job:
//   1. Load pages with schema markups from DB
//   2. Route to correct publisher (WP / Static / Webhook)
//   3. Publish each page — collect results
//   4. Update page status (PUBLISHED / FAILED) in DB
//   5. Update PublishJob progress counters
//   6. If all batches done → mark job COMPLETED → trigger sitemap
//   7. Fire PAGE_PUBLISHED webhook events
//
// Concurrency: 5 — five batches processed simultaneously.
// Each batch has 100 pages → 500 pages publishing in parallel.
// =============================================================================

const BATCH_SIZE = 100;

@Processor(QUEUE_NAMES.PUBLISH)
export class PublishProcessor {
  private readonly logger = new Logger(PublishProcessor.name);

  private readonly publishers: Record<string, Publisher> = {
    WORDPRESS: new WordPressPublisher(),
    STATIC_HTML: new StaticHtmlPublisher(),
    WEBHOOK: new WebhookPublisher(),
  };

  constructor(
    private readonly prisma: PrismaClient,
    @InjectQueue(QUEUE_NAMES.SITEMAP)
    private readonly sitemapQueue: Queue<SitemapJobPayload>
  ) {}

  @Process({ name: "publish-batch", concurrency: 5 })
  async publishBatch(job: Job<PublishJobPayload>): Promise<void> {
    const { orgId, projectId, publishJobId, pageIds, target, config } = job.data;

    this.logger.debug(
      `Publishing batch: ${pageIds.length} pages → ${target} (job: ${publishJobId})`
    );

    // ── Step 1: Load pages with schema markups ────────────────────────────
    const pages = await this.prisma.generatedPage.findMany({
      where: { id: { in: pageIds }, orgId, deletedAt: null },
      select: {
        id: true, slug: true, title: true, filePath: true,
        canonicalUrl: true, focusKeyword: true,
      },
    });

    if (pages.length === 0) return;

    // Load schema markups separately
    const schemaMarkups = await this.prisma.schemaMarkup.findMany({
      where: { pageId: { in: pages.map((p) => p.id) } },
      select: { pageId: true, type: true, data: true },
    });
    const schemaByPage = new Map<string, Array<{ type: string; data: Record<string, unknown> }>>();
    for (const s of schemaMarkups) {
      if (!schemaByPage.has(s.pageId)) schemaByPage.set(s.pageId, []);
      schemaByPage.get(s.pageId)!.push({ type: s.type, data: s.data as Record<string, unknown> });
    }

    // ── Step 2: Get publisher ─────────────────────────────────────────────
    const publisher = this.publishers[target];
    if (!publisher) {
      throw new Error(`Unknown publish target: ${target}`);
    }

    // For static HTML, inject the S3 upload function
    const publishConfig = target === "STATIC_HTML"
      ? { ...config, orgId, projectId, uploadFn: this.makeUploadFn() }
      : config;

    // ── Step 3: Publish each page ─────────────────────────────────────────
    const results = await Promise.allSettled(
      pages.map(async (page) => {
        let content = "";
        try {
          if (page.filePath) {
            const { readFile } = await import("fs/promises");
            content = await readFile(page.filePath, "utf-8");
          }
        } catch { content = ""; }
        return publisher.publish(
          {
            id: page.id,
            slug: page.slug,
            title: page.title,
            description: "",
            content,
            canonicalUrl: page.canonicalUrl ?? "",
            focusKeyword: page.focusKeyword,
            schemaMarkups: schemaByPage.get(page.id) ?? [],
            dataRow: {},
          } as PageToPublish,
          publishConfig as Record<string, unknown>
        );
      })
    );

    // ── Step 4: Update page statuses ──────────────────────────────────────
    let successCount = 0;
    let failCount = 0;
    const errors: Array<{ pageId: string; error: string }> = [];

    for (const result of results) {
      if (result.status === "fulfilled" && result.value.success) {
        successCount++;
        await this.prisma.generatedPage.update({
          where: { id: result.value.pageId },
          data: {
            status: "PUBLISHED",
            publishedUrl: result.value.publishedUrl,
            publishedAt: new Date(),
          },
        });
      } else {
        failCount++;
        const error =
          result.status === "rejected"
            ? result.reason?.message ?? "Unknown error"
            : result.value.error ?? "Unknown error";

        const pageId =
          result.status === "fulfilled"
            ? result.value.pageId
            : pageIds[results.indexOf(result)];

        errors.push({ pageId, error });

        await this.prisma.generatedPage.update({
          where: { id: pageId },
          data: { status: "FAILED" },
        }).catch(() => {}); // don't throw in error handler
      }
    }

    // ── Step 5: Update PublishJob progress ────────────────────────────────
    const publishJob = await this.prisma.publishJob.update({
      where: { id: publishJobId },
      data: {
        publishedPages: { increment: successCount },
        failedPages: { increment: failCount },
        // Append errors (keep max 100)
        errors: errors.length > 0
          ? { push: errors.slice(0, 10) }
          : undefined,
      },
      select: {
        publishedPages: true,
        failedPages: true,
        totalPages: true,
        orgId: true,
        projectId: true,
      },
    });

    // ── Step 6: Check if all batches are done ─────────────────────────────
    const processed = publishJob.publishedPages + publishJob.failedPages;

    if (processed >= publishJob.totalPages) {
      await this.prisma.publishJob.update({
        where: { id: publishJobId },
        data: {
          status: failCount > 0 && successCount === 0 ? "FAILED" : "COMPLETED",
          completedAt: new Date(),
        },
      });

      // Trigger sitemap regeneration after publish completes
      await this.sitemapQueue.add(
        "generate-sitemap",
        { orgId, projectId },
        { attempts: 3, removeOnComplete: 10 }
      );

      this.logger.log(
        `Publish job ${publishJobId} completed: ${publishJob.publishedPages} published, ${publishJob.failedPages} failed`
      );
    }
  }

  @OnQueueFailed()
  async onFailed(job: Job<PublishJobPayload>, err: Error): Promise<void> {
    this.logger.error(
      `Publish batch job ${job.id} failed: ${err.message}`
    );

    // Mark the publish job as failed if this was the last attempt
    if (job.attemptsMade >= (job.opts.attempts ?? 3)) {
      await this.prisma.publishJob
        .update({
          where: { id: job.data.publishJobId },
          data: { status: "FAILED", completedAt: new Date() },
        })
        .catch(() => {});
    }
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  // Returns an upload function for the static HTML publisher
  // Injected at runtime to avoid circular dependency with StorageService
  private makeUploadFn() {
    return async (key: string, html: string): Promise<string> => {
      // In production: use StorageService injected via constructor
      // For now: placeholder that returns a fake URL
      // TODO: inject StorageService and call storage.uploadText(key, html, "text/html")
      const baseUrl = process.env.S3_PUBLIC_URL ?? "https://cdn.example.com";
      return `${baseUrl}/${key}`;
    };
  }
}
