import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { unlink, readdir, rm } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { PrismaClient } from "@prisma/client";
import { getPagesRoot } from "./html-file.store";

const RUN_RETENTION_DAYS = parseInt(process.env.GENERATION_RUN_RETENTION_DAYS ?? "30", 10);
const TMP_EXPORTS_DIR = join(process.cwd(), "tmp", "exports");

@Injectable()
export class CleanupService {
  private readonly logger = new Logger(CleanupService.name);

  constructor(private readonly prisma: PrismaClient) {}

  // ── 1. ZIP cleanup — runs every hour ──────────────────────────────────────

  @Cron(CronExpression.EVERY_HOUR)
  async cleanExpiredZips(): Promise<void> {
    try {
      const now = new Date();

      const expired = await (this.prisma as any).exportJob.findMany({
        where: {
          expiresAt: { lt: now },
          zipPath: { not: null },
        },
        select: { id: true, zipPath: true, reportPath: true },
      });

      let deleted = 0;
      for (const job of expired) {
        await this.safeUnlink(job.zipPath);
        await this.safeUnlink(job.reportPath);
        await (this.prisma as any).exportJob.update({
          where: { id: job.id },
          data: { zipPath: null, reportPath: null },
        });
        deleted++;
      }

      if (deleted > 0) {
        this.logger.log(`ZIP cleanup: removed ${deleted} expired export file(s)`);
      }

      await this.cleanOrphanedZips();
    } catch (err) {
      // Never crash the scheduler — log and move on
      this.logger.warn(`ZIP cleanup skipped: ${(err as Error).message}`);
    }
  }

  // ── 2. Orphaned ZIP cleanup ────────────────────────────────────────────────

  private async cleanOrphanedZips(): Promise<void> {
    if (!existsSync(TMP_EXPORTS_DIR)) return;

    const files = await readdir(TMP_EXPORTS_DIR).catch(() => [] as string[]);
    if (files.length === 0) return;

    const jobIds = new Set(
      files.map((f) => f.replace(/-report\.json$/, "").replace(/\.zip$/, ""))
    );

    const existing = await (this.prisma as any).exportJob.findMany({
      where: { id: { in: [...jobIds] } },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((j: { id: string }) => j.id));

    let orphans = 0;
    for (const file of files) {
      const jobId = file.replace(/-report\.json$/, "").replace(/\.zip$/, "");
      if (!existingIds.has(jobId)) {
        await this.safeUnlink(join(TMP_EXPORTS_DIR, file));
        orphans++;
      }
    }

    if (orphans > 0) {
      this.logger.warn(`ZIP cleanup: removed ${orphans} orphaned export file(s)`);
    }
  }

  // ── 3. GenerationRun archival — runs daily at 02:00 ───────────────────────
  // Uses findMany + individual deletes instead of deleteMany to avoid
  // MongoDB standalone transaction requirement (Prisma limitation).

  @Cron("0 2 * * *")
  async archiveOldGenerationRuns(): Promise<void> {
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - RUN_RETENTION_DAYS);

      // findMany first — no transaction needed
      const oldRuns = await (this.prisma as any).generationRun.findMany({
        where: {
          status: { in: ["COMPLETED", "PARTIAL", "FAILED", "CANCELLED"] },
          completedAt: { lt: cutoff },
        },
        select: { id: true },
      });

      if (oldRuns.length === 0) return;

      // Delete one by one — MongoDB standalone doesn't support multi-doc transactions
      let count = 0;
      for (const run of oldRuns) {
        await (this.prisma as any).generationRun
          .delete({ where: { id: run.id } })
          .catch(() => {}); // skip if already deleted
        count++;
      }

      this.logger.log(
        `GenerationRun archival: purged ${count} run(s) older than ${RUN_RETENTION_DAYS} days`
      );
    } catch (err) {
      this.logger.warn(`GenerationRun archival skipped: ${(err as Error).message}`);
    }
  }

  // ── 4. Orphaned page directory cleanup — runs daily at 03:00 ──────────────

  @Cron("0 3 * * *")
  async cleanOrphanedPageDirectories(): Promise<void> {
    try {
      let pagesRoot: string;
      try {
        pagesRoot = getPagesRoot();
      } catch {
        return;
      }

      if (!existsSync(pagesRoot)) return;

      const projectDirs = await readdir(pagesRoot).catch(() => [] as string[]);
      let removed = 0;

      for (const projectId of projectDirs) {
        const projectPath = join(pagesRoot, projectId);
        const templateDirs = await readdir(projectPath).catch(() => [] as string[]);

        for (const templateId of templateDirs) {
          const count = await this.prisma.generatedPage.count({
            where: { projectId, templateId, deletedAt: null },
          });

          if (count === 0) {
            await rm(join(projectPath, templateId), { recursive: true, force: true });
            removed++;
          }
        }

        const remaining = await readdir(projectPath).catch(() => [] as string[]);
        if (remaining.length === 0) {
          await rm(projectPath, { recursive: true, force: true });
        }
      }

      if (removed > 0) {
        this.logger.log(`Page directory cleanup: removed ${removed} orphaned template dir(s)`);
      }
    } catch (err) {
      this.logger.warn(`Page directory cleanup skipped: ${(err as Error).message}`);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async safeUnlink(filePath: string | null | undefined): Promise<void> {
    if (!filePath) return;
    try {
      if (existsSync(filePath)) await unlink(filePath);
    } catch (err) {
      this.logger.warn(`Failed to delete file ${filePath}: ${(err as Error).message}`);
    }
  }
}
