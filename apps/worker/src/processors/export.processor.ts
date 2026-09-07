import { Processor, Process, OnQueueFailed } from "@nestjs/bull";
import { Logger } from "@nestjs/common";
import { Job } from "bull";
import { createWriteStream, existsSync, mkdirSync } from "fs";
import { writeFile } from "fs/promises";
import { join } from "path";
import archiver from "archiver";
import { PrismaClient } from "@prisma/client";
import { ExportJobPayload, QUEUE_NAMES } from "@mpc/queue";
import { validateExport } from "../services/export-validator.service";

// =============================================================================
// EXPORT PROCESSOR
//
// Phase 1 (0–90%): Stream all HTML files into a ZIP on disk.
// Phase 2 (90–99%): Run all 5 validation checks in cursor batches.
// Phase 3 (99–100%): Append export-report.json to the ZIP, finalize.
//
// Memory is bounded: BATCH_SIZE page rows + archiver 16 KB buffer at all times.
// =============================================================================

const BATCH_SIZE = 500;
const TMP_DIR = join(process.cwd(), "tmp", "exports");
const ZIP_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

@Processor(QUEUE_NAMES.EXPORT)
export class ExportProcessor {
  private readonly logger = new Logger(ExportProcessor.name);

  constructor(private readonly prisma: PrismaClient) {}

  @Process({ name: "export-project", concurrency: 2 })
  async exportProject(job: Job<ExportJobPayload>): Promise<void> {
    const { exportJobId, orgId, projectId, templateId } = job.data;

    this.logger.log(`Export started: job=${exportJobId} project=${projectId}`);

    if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true });

    const zipPath = join(TMP_DIR, `${exportJobId}.zip`);
    const reportPath = join(TMP_DIR, `${exportJobId}-report.json`);

    await (this.prisma as any).exportJob.update({
      where: { id: exportJobId },
      data: { status: "PROCESSING", startedAt: new Date() },
    });

    const where: any = { orgId, projectId, OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] };
    if (templateId) where.templateId = templateId;

    const totalPages = await this.prisma.generatedPage.count({ where });

    await (this.prisma as any).exportJob.update({
      where: { id: exportJobId },
      data: { totalPages },
    });

    // ── Phase 1: Stream HTML files into ZIP ──────────────────────────────

    // We use a two-pass approach:
    //   Pass 1 → collect all file entries (no data held in memory, only paths)
    //   archiver streams them directly from disk
    const output = createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 1 } });

    archive.on("warning", (err) => { if (err.code !== "ENOENT") throw err; });
    archive.pipe(output);

    let cursor: string | undefined;
    let processed = 0;

    while (true) {
      const batch = await this.prisma.generatedPage.findMany({
        where,
        select: { id: true, slug: true, filePath: true, templateId: true, title: true, canonicalUrl: true },
        orderBy: { id: "asc" },
        take: BATCH_SIZE,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });

      if (batch.length === 0) break;

      for (const page of batch) {
        const archiveName = `dist/${page.templateId}/${page.slug}.html`;
        if (page.filePath && existsSync(page.filePath)) {
          archive.file(page.filePath, { name: archiveName });
        } else {
          // Fallback: minimal HTML shell (disk file missing)
          const canonical = page.canonicalUrl ?? `https://yoursite.com/${page.slug}`;
          const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${page.title ?? page.slug}</title>
  <link rel="canonical" href="${canonical}" />
</head>
<body><p>Content not available.</p></body>
</html>`;
          archive.append(html, { name: archiveName });
        }
      }

      cursor = batch[batch.length - 1].id;
      processed += batch.length;
      await job.progress(Math.floor((processed / totalPages) * 80));
    }

    // ── Phase 2: Validate (cursor-batched, no memory spike) ───────────────

    await job.progress(80);
    this.logger.log(`Export validation started: job=${exportJobId}`);

    const report = await validateExport(this.prisma, orgId, projectId, templateId);

    await job.progress(95);

    // ── Phase 3: Append report to ZIP and finalize ────────────────────────

    const reportJson = JSON.stringify(report, null, 2);
    await writeFile(reportPath, reportJson, "utf-8");

    archive.append(reportJson, { name: "export-report.json" });

    await new Promise<void>((resolve, reject) => {
      output.on("close", resolve);
      archive.on("error", reject);
      archive.finalize();
    });

    const expiresAt = new Date(Date.now() + ZIP_TTL_MS);

    await (this.prisma as any).exportJob.update({
      where: { id: exportJobId },
      data: {
        status: "COMPLETED",
        zipPath,
        reportPath,
        validationPassed: report.passed,
        completedAt: new Date(),
        expiresAt,
      },
    });

    await job.progress(100);

    this.logger.log(
      `Export done: job=${exportJobId} pages=${processed} passed=${report.passed} ` +
      `seoQuality=${report.seoQualityPassed} ` +
      `missingFiles=${report.missingFiles} brokenLinks=${report.brokenLinks} ` +
      `invalidRoutes=${report.invalidRoutes} missingTemplates=${report.missingTemplates} ` +
      `invalidSeo=${report.invalidSeoVariables} unreplacedVars=${report.unreplacedVariables} ` +
      `emptyPages=${report.emptyPages} invalidCanonicals=${report.invalidCanonicals} ` +
      `duplicateSlugs=${report.duplicateSlugs} lowSeoScores=${report.lowSeoScores} ` +
      `stuckAiPages=${report.stuckAiPages}`
    );
  }

  @OnQueueFailed()
  async onFailed(job: Job<ExportJobPayload>, err: Error): Promise<void> {
    this.logger.error(`Export job=${job.data.exportJobId} failed: ${err.message}`);
    await (this.prisma as any).exportJob
      .update({
        where: { id: job.data.exportJobId },
        data: { status: "FAILED", errorMessage: err.message, completedAt: new Date() },
      })
      .catch(() => {});
  }
}
