import {
  Injectable, NotFoundException, BadRequestException,
} from "@nestjs/common";
import { InjectQueue } from "@nestjs/bull";
import { Queue } from "bull";
import { PrismaService } from "../database/prisma.service";
import { PublishJobPayload, QUEUE_NAMES } from "@mpc/queue";
import { CreatePublishJobDto } from "./dto/publish.dto";
import { WordPressPublisher } from "../../../../worker/src/publishers/wordpress.publisher";
import { StaticHtmlPublisher } from "../../../../worker/src/publishers/static-html.publisher";
import { WebhookPublisher } from "../../../../worker/src/publishers/webhook.publisher";

// =============================================================================
// PUBLISH SERVICE
//
// Responsibilities:
//   1. Validate publish config before creating a job
//   2. Determine which pages to publish (all GENERATED or specific IDs)
//   3. Split pages into batches of 100 → enqueue BullMQ jobs
//   4. Track job progress
//   5. Cancel in-progress jobs
//
// Batch strategy:
//   100 pages per batch job.
//   Why 100? Small enough for fast retries, large enough to minimize
//   queue overhead. At 5 concurrent workers × 100 pages = 500 pages/batch-cycle.
// =============================================================================

const BATCH_SIZE = 100;

// Validators map — used to validate config before creating a job
const CONFIG_VALIDATORS: Record<string, { validateConfig: (c: Record<string, unknown>) => string | null }> = {
  WORDPRESS: new WordPressPublisher(),
  STATIC_HTML: new StaticHtmlPublisher(),
  WEBHOOK: new WebhookPublisher(),
};

@Injectable()
export class PublishService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_NAMES.PUBLISH)
    private readonly publishQueue: Queue<PublishJobPayload>
  ) {}

  // ── Create publish job ────────────────────────────────────────────────────

  async createJob(projectId: string, orgId: string, dto: CreatePublishJobDto) {
    // Verify project
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, orgId, OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] },
      select: { id: true },
    });
    if (!project) throw new NotFoundException("Project not found");

    // Validate target config
    const validator = CONFIG_VALIDATORS[dto.target];
    if (validator) {
      const error = validator.validateConfig(dto.config);
      if (error) throw new BadRequestException(`Invalid config: ${error}`);
    }

    // Determine pages to publish
    const pageIds = await this.resolvePageIds(projectId, orgId, dto);

    if (pageIds.length === 0) {
      throw new BadRequestException(
        "No pages to publish. Make sure pages have GENERATED status."
      );
    }

    // Create PublishJob record
    const publishJob = await this.prisma.publishJob.create({
      data: {
        orgId,
        projectId,
        target: dto.target as "WORDPRESS" | "STATIC_HTML" | "NEXTJS" | "WEBHOOK" | "HEADLESS_CMS",
        status: "QUEUED",
        config: dto.config as any,
        totalPages: pageIds.length,
      },
    });

    // Mark pages as PUBLISHING
    await this.prisma.generatedPage.updateMany({
      where: { id: { in: pageIds } },
      data: { status: "PUBLISHING" },
    });

    // Split into batches and enqueue
    const batches = this.chunk(pageIds, BATCH_SIZE);

    const jobs = batches.map((batch, i) => ({
      name: "publish-batch",
      data: {
        orgId,
        projectId,
        publishJobId: publishJob.id,
        pageIds: batch,
        target: dto.target,
        config: dto.config,
      } as PublishJobPayload,
      opts: {
        attempts: 3,
        backoff: { type: "exponential" as const, delay: 5000 },
        removeOnComplete: 50,
        removeOnFail: 200,
        // Delay each batch slightly to avoid hammering the target
        delay: i * 200,
      },
    }));

    await this.publishQueue.addBulk(jobs);

    // Update job status to PROCESSING
    await this.prisma.publishJob.update({
      where: { id: publishJob.id },
      data: { status: "PROCESSING", startedAt: new Date() },
    });

    return {
      jobId: publishJob.id,
      totalPages: pageIds.length,
      batches: batches.length,
      target: dto.target,
    };
  }

  // ── Get job status ────────────────────────────────────────────────────────

  async getJob(jobId: string, orgId: string) {
    const job = await this.prisma.publishJob.findFirst({
      where: { id: jobId, orgId },
      select: {
        id: true, target: true, status: true,
        totalPages: true, publishedPages: true, failedPages: true,
        errors: true, startedAt: true, completedAt: true, createdAt: true,
        config: true,
      },
    });
    if (!job) throw new NotFoundException("Publish job not found");

    const progress = job.totalPages > 0
      ? Math.round(((job.publishedPages + job.failedPages) / job.totalPages) * 100)
      : 0;

    return { ...job, progress };
  }

  // ── List jobs for a project ───────────────────────────────────────────────

  async listJobs(projectId: string, orgId: string) {
    return this.prisma.publishJob.findMany({
      where: { projectId, orgId },
      select: {
        id: true, target: true, status: true,
        totalPages: true, publishedPages: true, failedPages: true,
        startedAt: true, completedAt: true, createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
  }

  // ── Cancel job ────────────────────────────────────────────────────────────

  async cancelJob(jobId: string, orgId: string) {
    const job = await this.prisma.publishJob.findFirst({
      where: { id: jobId, orgId, status: { in: ["QUEUED", "PROCESSING"] } },
    });
    if (!job) throw new NotFoundException("Active publish job not found");

    // Remove queued Bull jobs
    const bullJobs = await this.publishQueue.getJobs(["waiting", "delayed", "active"]);
    for (const bj of bullJobs) {
      if ((bj.data as PublishJobPayload).publishJobId === jobId) {
        await bj.remove().catch(() => {});
      }
    }

    // Revert PUBLISHING pages back to GENERATED
    await this.prisma.generatedPage.updateMany({
      where: { projectId: job.projectId, status: "PUBLISHING" },
      data: { status: "GENERATED" },
    });

    await this.prisma.publishJob.update({
      where: { id: jobId },
      data: { status: "CANCELLED", completedAt: new Date() },
    });

    return { cancelled: true };
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private async resolvePageIds(
    projectId: string,
    orgId: string,
    dto: CreatePublishJobDto
  ): Promise<string[]> {
    if (dto.pageIds && dto.pageIds.length > 0) {
      // Specific pages requested — verify they belong to this project
      const pages = await this.prisma.generatedPage.findMany({
        where: { id: { in: dto.pageIds }, projectId, orgId, OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] },
        select: { id: true },
      });
      return pages.map((p) => p.id);
    }

    // All pages with target status
    const status = dto.pageStatus ?? "GENERATED";
    const pages = await this.prisma.generatedPage.findMany({
      where: { projectId, orgId, status: status as "GENERATED", OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] },
      select: { id: true },
      orderBy: { seoScore: "desc" }, // publish highest-quality pages first
    });
    return pages.map((p) => p.id);
  }

  private chunk<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  }
}
