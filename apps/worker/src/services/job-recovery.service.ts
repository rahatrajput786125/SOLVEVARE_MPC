import { Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bull";
import { Queue } from "bull";
import { PrismaClient } from "@prisma/client";
import { QUEUE_NAMES, PageGenerationChunkPayload, QUEUE_OPTIONS } from "@mpc/queue";

const STALE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes — chunks can take 10-15 min on large datasets
const CHUNK_SIZE = 500; // must match page-generation.queue.ts CHUNK_SIZE

// How long to wait after boot before attempting recovery.
// Must be long enough for MongoDB connection to be established.
const BOOT_DELAY_MS = 10_000; // 10 seconds

@Injectable()
export class JobRecoveryService implements OnApplicationBootstrap {
  private readonly logger = new Logger(JobRecoveryService.name);

  constructor(
    private readonly prisma: PrismaClient,
    @InjectQueue(QUEUE_NAMES.PAGE_GENERATION)
    private readonly queue: Queue<PageGenerationChunkPayload>
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    // Delay so MongoDB connection is fully established before querying
    setTimeout(() => {
      this.recover().catch((e) =>
        this.logger.warn(`Recovery skipped: ${e.message}`)
      );
    }, BOOT_DELAY_MS);
  }

  private async recover(): Promise<void> {
    // Test connection first — if MongoDB is not ready, skip silently
    try {
      await this.prisma.$runCommandRaw({ ping: 1 });
    } catch (err) {
      this.logger.warn(`Recovery skipped — MongoDB not ready: ${(err as Error).message}`);
      return;
    }

    const staleAt = new Date(Date.now() - STALE_THRESHOLD_MS);

    let staleRuns: any[];
    try {
      staleRuns = await (this.prisma as any).generationRun.findMany({
        where: {
          status: "PROCESSING",
          updatedAt: { lt: staleAt },
        },
        select: {
          id: true,
          orgId: true,
          projectId: true,
          templateId: true,
          dataSourceId: true,
          totalRows: true,
          totalChunks: true,
          doneChunks: true,
          failedChunks: true,
        },
      });
    } catch (err) {
      this.logger.warn(`Recovery skipped — DB query failed: ${(err as Error).message}`);
      return;
    }

    if (staleRuns.length === 0) {
      this.logger.log("Recovery: no stale runs found");
      return;
    }

    this.logger.warn(`Recovery: found ${staleRuns.length} stale GenerationRun(s)`);

    const [waiting, active, delayed, failed] = await Promise.all([
      this.queue.getWaiting(),
      this.queue.getActive(),
      this.queue.getDelayed(),
      this.queue.getFailed(),
    ]);

    const presentJobIds = new Set<string>(
      [...waiting, ...active, ...delayed, ...failed].map(
        (j) => String(j.opts?.jobId ?? j.id)
      )
    );

    for (const run of staleRuns) {
      await this.recoverRun(run, presentJobIds).catch((e) =>
        this.logger.warn(`Recovery for run=${run.id} failed: ${e.message}`)
      );
    }
  }

  private async recoverRun(
    run: {
      id: string; orgId: string; projectId: string; templateId: string;
      dataSourceId: string; totalRows: number; totalChunks: number;
      doneChunks: number; failedChunks: number;
    },
    presentJobIds: Set<string>
  ): Promise<void> {
    const ds = await this.prisma.dataSource.findUnique({
      where: { id: run.dataSourceId },
      select: { sourceUrl: true },
    });
    if (!ds?.sourceUrl) {
      this.logger.warn(`Recovery: run=${run.id} — dataSource has no sourceUrl, skipping`);
      return;
    }

    const missingJobs: Array<{ name: string; data: PageGenerationChunkPayload; opts: object }> = [];

    for (let i = 0; i < run.totalChunks; i++) {
      const stableId = `chunk:${run.id}:${i}`;
      if (presentJobIds.has(stableId)) continue;

      missingJobs.push({
        name: "process-chunk",
        data: {
          generationJobId: run.id,
          orgId: run.orgId,
          projectId: run.projectId,
          templateId: run.templateId,
          dataSourceId: run.dataSourceId,
          filePath: ds.sourceUrl,
          startIndex: i * CHUNK_SIZE,
          endIndex: Math.min((i + 1) * CHUNK_SIZE, run.totalRows),
          chunkIndex: i,
          totalChunks: run.totalChunks,
        },
        opts: {
          ...QUEUE_OPTIONS[QUEUE_NAMES.PAGE_GENERATION],
          jobId: stableId,
        },
      });
    }

    if (missingJobs.length === 0) {
      this.logger.log(`Recovery: run=${run.id} — all chunks present, no action needed`);
      return;
    }

    await this.queue.addBulk(missingJobs);
    this.logger.warn(
      `Recovery: run=${run.id} — re-enqueued ${missingJobs.length}/${run.totalChunks} missing chunks`
    );
  }
}
