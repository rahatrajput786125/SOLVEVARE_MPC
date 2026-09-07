import {
  Injectable, NotFoundException, BadRequestException, Logger,
} from "@nestjs/common";
import { InjectQueue } from "@nestjs/bull";
import { Queue } from "bull";
import { createReadStream, existsSync } from "fs";
import { readFile } from "fs/promises";
import { Response } from "express";
import { PrismaService } from "../database/prisma.service";
import { ExportJobPayload, QUEUE_NAMES } from "@mpc/queue";

@Injectable()
export class ExportService {
  private readonly logger = new Logger(ExportService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_NAMES.EXPORT)
    private readonly exportQueue: Queue<ExportJobPayload>
  ) {}

  async createExport(projectId: string, orgId: string, templateId?: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, orgId, OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] },
      select: { id: true },
    });
    if (!project) throw new NotFoundException("Project not found");

    const where: any = { orgId, projectId, deletedAt: null };
    if (templateId) where.templateId = templateId;

    const count = await this.prisma.generatedPage.count({ where });
    if (count === 0) throw new BadRequestException("No generated pages found to export");

    const exportJob = await (this.prisma as any).exportJob.create({
      data: { orgId, projectId, templateId: templateId ?? null, status: "QUEUED" },
    });

    await this.exportQueue.add(
      "export-project",
      { exportJobId: exportJob.id, orgId, projectId, templateId } as ExportJobPayload,
      { attempts: 2, removeOnComplete: 20, removeOnFail: 50 }
    );

    return { exportJobId: exportJob.id, status: "QUEUED", totalPages: count };
  }

  async getStatus(exportJobId: string, orgId: string) {
    const job = await (this.prisma as any).exportJob.findFirst({
      where: { id: exportJobId, orgId },
      select: {
        id: true, status: true, totalPages: true, validationPassed: true,
        errorMessage: true, startedAt: true, completedAt: true,
        expiresAt: true, zipPath: true,
      },
    });
    if (!job) throw new NotFoundException("Export job not found");

    const { zipPath, ...rest } = job;
    return {
      ...rest,
      downloadReady: job.status === "COMPLETED" && !!zipPath && existsSync(zipPath),
    };
  }

  async getReport(exportJobId: string, orgId: string) {
    const job = await (this.prisma as any).exportJob.findFirst({
      where: { id: exportJobId, orgId },
      select: { status: true, reportPath: true },
    });
    if (!job) throw new NotFoundException("Export job not found");
    if (job.status !== "COMPLETED") throw new BadRequestException("Validation report not ready yet");
    if (!job.reportPath || !existsSync(job.reportPath)) {
      throw new NotFoundException("Report file not found — it may have expired");
    }
    const raw = await readFile(job.reportPath, "utf-8");
    return JSON.parse(raw);
  }

  async streamZip(exportJobId: string, orgId: string, res: Response): Promise<void> {
    const job = await (this.prisma as any).exportJob.findFirst({
      where: { id: exportJobId, orgId },
      select: { status: true, zipPath: true, expiresAt: true, projectId: true },
    });

    if (!job) throw new NotFoundException("Export job not found");
    if (job.status !== "COMPLETED") throw new BadRequestException("Export not ready yet");
    if (!job.zipPath || !existsSync(job.zipPath)) {
      throw new NotFoundException("ZIP file not found — it may have expired");
    }
    if (job.expiresAt && new Date() > new Date(job.expiresAt)) {
      throw new BadRequestException("Export has expired. Please request a new export.");
    }

    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="export-${job.projectId}-${exportJobId}.zip"`
    );

    createReadStream(job.zipPath).pipe(res);
  }
}
