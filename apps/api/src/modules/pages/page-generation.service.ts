import { Injectable, NotFoundException, ForbiddenException, BadRequestException, ConflictException, Logger } from "@nestjs/common";
import { existsSync } from "fs";
import { statfs } from "fs/promises";
import { resolve } from "path";
import { PrismaService } from "../database/prisma.service";
import { GeneratePagesDto } from "./dto/pages.dto";
import { PLAN_LIMITS, OrgPlan } from "@mpc/shared";
import { PageGenerationQueue, CHUNK_SIZE } from "./page-generation.queue";

const BYTES_PER_PAGE = 50 * 1024;       // 50 KB estimated per page
const MIN_BUFFER_BYTES = 500 * 1024 * 1024; // 500 MB safety buffer

@Injectable()
export class PageGenerationService {
  private readonly logger = new Logger(PageGenerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: PageGenerationQueue
  ) {}

  async enqueueGeneration(
    orgId: string,
    projectId: string,
    dto: GeneratePagesDto
  ): Promise<{ message: string; jobId: string; totalChunks: number; estimatedPages: number }> {
    // ── 0. Duplicate generation guard — prevent concurrent runs ───────────
    const activeRun = await (this.prisma as any).generationRun.findFirst({
      where: {
        orgId,
        projectId,
        templateId: dto.templateId,
        dataSourceId: dto.dataSourceId,
        status: { in: ["QUEUED", "PROCESSING"] },
      },
      select: { id: true, status: true },
    });
    if (activeRun) {
      throw new ConflictException(
        `A generation run (id=${activeRun.id}) is already ${activeRun.status} for this template/data-source combination. Wait for it to complete or cancel it first.`
      );
    }

    // ── 1. Validate template ──────────────────────────────────────────────
    const template = await this.prisma.template.findFirst({
      where: { id: dto.templateId, orgId, projectId, OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] },
      select: { id: true, name: true, content: true },
    });
    if (!template) throw new NotFoundException("Template not found");
    if (!template.content?.trim()) {
      throw new NotFoundException(
        `Template "${template.name}" has no content. Save template content first.`
      );
    }

    // ── 2. Validate data source ───────────────────────────────────────────
    const dataSource = await this.prisma.dataSource.findFirst({
      where: { id: dto.dataSourceId, orgId, projectId, OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] },
      select: { id: true, rowCount: true, sourceUrl: true },
    });
    if (!dataSource) throw new NotFoundException("Data source not found");
    if (!dataSource.sourceUrl) {
      throw new NotFoundException("Data source has no uploaded file.");
    }
    if (!existsSync(dataSource.sourceUrl)) {
      throw new NotFoundException(`File not found on disk: ${dataSource.sourceUrl}`);
    }

    const totalRows = dataSource.rowCount ?? 0;
    if (totalRows === 0) throw new NotFoundException("Data source has no rows.");

    // ── 3. Enforce plan limits ────────────────────────────────────────────
    await this.enforcePageLimit(orgId, totalRows);

    // ── 3b. Enforce disk space ────────────────────────────────────────────
    await this.enforceDiskSpace(totalRows);

    // ── 4. Create GenerationJob record — single source of truth for progress
    const totalChunks = Math.ceil(totalRows / CHUNK_SIZE);

    const run = await (this.prisma as any).generationRun.create({
      data: {
        orgId,
        projectId,
        templateId: dto.templateId,
        dataSourceId: dto.dataSourceId,
        status: "QUEUED",
        totalRows,
        totalChunks,
        startedAt: new Date(),
      },
    });

    // ── 5. Enqueue all chunk jobs in one Redis pipeline ───────────────────
    // Small delay to ensure MongoDB write is committed before worker picks up chunks
    await new Promise((r) => setTimeout(r, 200));
    await this.queue.enqueueChunks(
      run.id,
      orgId,
      projectId,
      dto.templateId,
      dto.dataSourceId,
      dataSource.sourceUrl,
      totalRows
    );

    // ── 6. Mark run as PROCESSING ─────────────────────────────────────────
    await (this.prisma as any).generationRun.update({
      where: { id: run.id },
      data: { status: "PROCESSING" },
    });

    this.logger.log(
      `GenerationRun ${run.id} queued — ` +
      `${totalRows} rows → ${totalChunks} chunks (${CHUNK_SIZE}/chunk) ` +
      `project=${projectId} template=${dto.templateId}`
    );

    return {
      message: "Generation queued",
      jobId: run.id,
      totalChunks,
      estimatedPages: totalRows,
    };
  }

  async getJobProgress(jobId: string, orgId: string) {
    const run = await (this.prisma as any).generationRun.findFirst({
      where: { id: jobId, orgId },
    });
    if (!run) throw new NotFoundException("Generation run not found");

    return {
      jobId: run.id,
      status: run.status,
      totalRows: run.totalRows,
      processedRows: run.processedRows,
      totalChunks: run.totalChunks,
      doneChunks: run.doneChunks,
      failedChunks: run.failedChunks,
      generatedPages: run.generatedPages,
      failedPages: run.failedPages,
      progressPct: run.totalChunks > 0
        ? Math.round((run.doneChunks / run.totalChunks) * 100)
        : 0,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
    };
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private async enforceDiskSpace(pageCount: number): Promise<void> {
    const pagesRoot = process.env.PAGES_DIST_ROOT;
    if (!pagesRoot?.trim()) return; // not configured — skip silently

    try {
      const stats = await statfs(resolve(pagesRoot.trim()));
      const available = stats.bavail * stats.bsize;
      const required = pageCount * BYTES_PER_PAGE + MIN_BUFFER_BYTES;

      if (available < required) {
        this.logger.warn(
          `Disk space check failed: available=${(available / 1024 / 1024).toFixed(1)} MB ` +
          `required=${(required / 1024 / 1024).toFixed(1)} MB pages=${pageCount}`
        );
        throw new BadRequestException("Insufficient disk space");
      }
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      // statfs failure (e.g. dir not yet created) — allow generation to proceed
      this.logger.warn(`Disk space check skipped: ${(err as Error).message}`);
    }
  }

  private async enforcePageLimit(_orgId: string, _newPages: number): Promise<void> {
    // No page limit enforced
  }
}
