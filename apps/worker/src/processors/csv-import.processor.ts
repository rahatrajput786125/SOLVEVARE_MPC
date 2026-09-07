import { Processor, Process, OnQueueFailed } from "@nestjs/bull";
import { Logger } from "@nestjs/common";
import { Job } from "bull";
import { createReadStream, existsSync } from "fs";
import { readFile } from "fs/promises";
import { Readable } from "stream";
import { PrismaClient } from "@prisma/client";
import { CsvImportJobPayload, QUEUE_NAMES } from "@mpc/queue";
import { ImportStatus } from "@mpc/shared";
import { CsvParser } from "../parsers/csv.parser";
import { ExcelParser } from "../parsers/excel.parser";

@Processor(QUEUE_NAMES.CSV_IMPORT)
export class CsvImportProcessor {
  private readonly logger = new Logger(CsvImportProcessor.name);
  private readonly csvParser = new CsvParser();
  private readonly excelParser = new ExcelParser();

  constructor(private readonly prisma: PrismaClient) {}

  @Process({ name: "process-import", concurrency: 2 })
  async processImport(job: Job<CsvImportJobPayload>): Promise<void> {
    const { importId, dataSourceId, fileKey } = job.data;
    this.logger.log(`Starting import ${importId} — file: ${fileKey}`);

    const dataSource = await this.prisma.dataSource.findUnique({
      where: { id: dataSourceId },
      select: { columnMap: true, projectId: true },
    });
    if (!dataSource) throw new Error(`Data source ${dataSourceId} not found`);

    const columnMap = (dataSource.columnMap as Record<string, string>) ?? {};
    const ext = fileKey.split(".").pop()?.toLowerCase();

    let totalRows = 0;

    try {
      if (ext === "xlsx" || ext === "xls") {
        const buffer = await this.readFileBuffer(fileKey);
        const { rows } = this.excelParser.parse(buffer, { columnMap });
        totalRows = rows.length;
      } else {
        const stream = await this.readFileStream(fileKey);

        await this.csvParser.parseStream(
          stream,
          async (chunk) => {
            totalRows += chunk.rows.length;
            await job.progress(10); // minimal progress signal
          },
          { columnMap }
        );
      }

      await job.progress(100);

      await this.prisma.csvImport.update({
        where: { id: importId },
        data: {
          status: ImportStatus.COMPLETED,
          totalRows,
          processedRows: totalRows,
          failedRows: 0,
          completedAt: new Date(),
        },
      });

      await this.prisma.dataSource.update({
        where: { id: dataSourceId },
        data: { rowCount: totalRows },
      });

      this.logger.log(`Import ${importId} done: ${totalRows} rows stored, no pages created`);
    } catch (err) {
      this.logger.error(`Import ${importId} failed: ${(err as Error).message}`);

      await this.prisma.csvImport.update({
        where: { id: importId },
        data: {
          status: ImportStatus.FAILED,
          totalRows,
          processedRows: 0,
          failedRows: totalRows,
          errors: [{ message: (err as Error).message }] as object[],
          completedAt: new Date(),
        },
      });

      throw err;
    }
  }

  @OnQueueFailed()
  onFailed(job: Job<CsvImportJobPayload>, err: Error): void {
    this.logger.error(`Import job ${job.id} permanently failed after ${job.attemptsMade} attempts: ${err.message}`);
  }

  protected async readFileStream(fileKey: string): Promise<Readable> {
    if (!existsSync(fileKey)) throw new Error(`File not found: ${fileKey}`);
    return createReadStream(fileKey);
  }

  protected async readFileBuffer(fileKey: string): Promise<Buffer> {
    if (!existsSync(fileKey)) throw new Error(`File not found: ${fileKey}`);
    return readFile(fileKey);
  }
}
