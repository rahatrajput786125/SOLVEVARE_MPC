import { Injectable, NotFoundException, BadRequestException, Logger } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bull";
import { Queue } from "bull";
import { PrismaService } from "../database/prisma.service";
import { QUEUE_NAMES } from "@mpc/queue";

export type RunStatus = "QUEUED" | "PROCESSING" | "COMPLETED" | "PARTIAL" | "FAILED" | "CANCELLED";

// Rows-per-second throughput used when no history is available yet.
// Tuned for a 10-worker cluster processing 1000-row chunks at ~100 rows/s each.
const FALLBACK_ROWS_PER_SEC = 50;

@Injectable()
export class GenerationRunsService {
  private readonly logger = new Logger(GenerationRunsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_NAMES.PAGE_GENERATION)
    private readonly pageGenQueue: Queue
  ) {}

  async findAll(orgId: string, projectId?: string, status?: RunStatus) {
    const where: any = { orgId };
    if (projectId) where.projectId = projectId;
    if (status) where.status = status;

    try {
      const runs = await this.prisma.generationRun.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 100,
      });
      return runs.map((r: any) => this.format(r));
    } catch (err) {
      this.logger.error(`generationRun.findMany failed: ${(err as Error).message}`, (err as Error).stack);
      // Fallback: try without orderBy if createdAt field causes issues
      try {
        const runs = await this.prisma.generationRun.findMany({ where, take: 100 });
        return runs.map((r: any) => this.format(r));
      } catch (fallbackErr) {
        this.logger.error(`Fallback generationRun query failed: ${(fallbackErr as Error).message}`);
        return [];
      }
    }
  }

  async findById(id: string, orgId: string) {
    const run = await this.prisma.generationRun.findFirst({
      where: { id, orgId },
    });
    if (!run) throw new NotFoundException("Generation run not found");
    return this.format(run);
  }

  // ── Cancel: mark DB + drain queued Bull jobs for this run ─────────────────
  async cancel(id: string, orgId: string) {
    const run = await this.prisma.generationRun.findFirst({
      where: { id, orgId },
    });
    if (!run) throw new NotFoundException("Generation run not found");
    if (!["QUEUED", "PROCESSING"].includes(run.status)) {
      throw new BadRequestException(`Cannot cancel a run with status: ${run.status}`);
    }

    const updated = await this.prisma.generationRun.update({
      where: { id },
      data: { status: "CANCELLED", completedAt: new Date() },
    });

    // Drain all WAITING chunk jobs for this run from Bull queue.
    // Jobs already active (being processed) will finish naturally — the worker
    // checks run.status before writing pages and no-ops if CANCELLED.
    // We target only waiting/delayed jobs to avoid killing in-flight work.
    try {
      const waiting = await this.pageGenQueue.getWaiting();
      const delayed = await this.pageGenQueue.getDelayed();
      const toRemove = [...waiting, ...delayed].filter(
        (job) => job.data?.generationJobId === id
      );
      await Promise.allSettled(toRemove.map((job) => job.remove()));
      this.logger.log(`Cancel run=${id}: removed ${toRemove.length} queued chunks`);
    } catch (err) {
      // Non-fatal — run is already marked CANCELLED in DB
      this.logger.warn(`Cancel run=${id}: failed to drain queue: ${(err as Error).message}`);
    }

    return this.format(updated);
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private format(run: any) {
    const progressPct =
      run.totalChunks > 0
        ? Math.round((run.doneChunks / run.totalChunks) * 100)
        : 0;

    const eta = this.calcEta(run);

    return {
      id: run.id,
      projectId: run.projectId,
      templateId: run.templateId,
      dataSourceId: run.dataSourceId,
      status: run.status,
      totalRows: run.totalRows,
      processedRows: run.processedRows,
      generatedPages: run.generatedPages,
      failedPages: run.failedPages,
      totalChunks: run.totalChunks,
      doneChunks: run.doneChunks,
      failedChunks: run.failedChunks,
      progressPct,
      estimatedRemainingMs: eta.remainingMs,
      estimatedCompletionTime: eta.completionTime,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      createdAt: run.createdAt,
    };
  }

  private calcEta(run: any): { remainingMs: number | null; completionTime: string | null } {
    const isActive = run.status === "QUEUED" || run.status === "PROCESSING";
    if (!isActive || run.totalRows === 0) {
      return { remainingMs: null, completionTime: null };
    }

    const remaining = run.totalRows - (run.processedRows ?? 0);
    if (remaining <= 0) return { remainingMs: 0, completionTime: new Date().toISOString() };

    let rowsPerSec: number;

    if (run.startedAt && run.processedRows > 0) {
      const elapsedSec = (Date.now() - new Date(run.startedAt).getTime()) / 1000;
      rowsPerSec = elapsedSec > 0 ? run.processedRows / elapsedSec : FALLBACK_ROWS_PER_SEC;
    } else {
      // QUEUED — not started yet, use fallback throughput
      rowsPerSec = FALLBACK_ROWS_PER_SEC;
    }

    const remainingMs = Math.ceil((remaining / rowsPerSec) * 1000);
    const completionTime = new Date(Date.now() + remainingMs).toISOString();

    return { remainingMs, completionTime };
  }
}
