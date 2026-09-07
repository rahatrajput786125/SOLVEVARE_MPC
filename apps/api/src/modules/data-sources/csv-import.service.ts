import { Injectable, Logger } from "@nestjs/common";
import { createReadStream, existsSync } from "fs";
import { readFile } from "fs/promises";
import { parse } from "csv-parse";
import * as XLSX from "xlsx";
import { PrismaService } from "../database/prisma.service";
import { ImportStatus } from "@mpc/shared";
import { assertUploadPathSafe } from "../../common/utils/path-guard";

// Characters that trigger formula injection in spreadsheet apps.
const FORMULA_START = /^[=+\-@]/;

/** Strip leading formula-injection characters from a cell value. */
function sanitizeCell(value: string): string {
  return FORMULA_START.test(value) ? `'${value}` : value;
}

@Injectable()
export class CsvImportService {
  private readonly logger = new Logger(CsvImportService.name);

  constructor(private readonly prisma: PrismaService) {}

  processAsync(importId: string, dataSourceId: string, orgId: string, fileKey: string): void {
    this.process(importId, dataSourceId, orgId, fileKey).catch(async (err) => {
      this.logger.error(`Import ${importId} failed: ${err.message}`, err.stack);
      await this.markFailed(importId, err.message).catch(() => null);
    });
  }

  private async process(importId: string, dataSourceId: string, _orgId: string, fileKey: string): Promise<void> {
    this.logger.log(`Processing import ${importId} — ${fileKey}`);

    // Guard: ensure the file path stays inside the uploads directory
    assertUploadPathSafe(fileKey);

    if (!existsSync(fileKey)) {
      throw new Error(`File not found: ${fileKey}`);
    }

    const dataSource = await this.prisma.dataSource.findUnique({
      where: { id: dataSourceId },
      select: { projectId: true, columnMap: true },
    });
    if (!dataSource) throw new Error(`DataSource ${dataSourceId} not found`);

    const columnMap = (dataSource.columnMap as Record<string, string>) ?? {};
    const ext = fileKey.split(".").pop()?.toLowerCase();
    let rows: Record<string, string>[];

    if (ext === "xlsx" || ext === "xls") {
      rows = await this.parseExcel(fileKey);
    } else {
      rows = await this.parseCsv(fileKey);
    }

    // Apply column map — rename CSV headers to template variable names
    if (Object.keys(columnMap).length > 0) {
      rows = rows.map((row) => {
        const mapped: Record<string, string> = { ...row };
        for (const [csvCol, varName] of Object.entries(columnMap)) {
          const normalizedCol = this.normalizeHeader(csvCol);
          if (mapped[normalizedCol] !== undefined) {
            mapped[varName] = mapped[normalizedCol];
          }
        }
        return mapped;
      });
    }

    // CSV upload only stores data — pages are created only when user clicks Generate Pages
    await this.prisma.csvImport.update({
      where: { id: importId },
      data: {
        status: ImportStatus.COMPLETED,
        totalRows: rows.length,
        processedRows: rows.length,
        failedRows: 0,
        completedAt: new Date(),
      },
    });

    await this.prisma.dataSource.update({
      where: { id: dataSourceId },
      data: { rowCount: rows.length },
    });

    this.logger.log(`Import ${importId} completed: ${rows.length} rows stored, no pages created`);
  }

  private async parseExcel(fileKey: string): Promise<Record<string, string>[]> {
    assertUploadPathSafe(fileKey);
    const buffer = await readFile(fileKey);
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) throw new Error("Excel file contains no sheets");

    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
    return raw.map((r) =>
      Object.fromEntries(
        Object.entries(r).map(([k, v]) => [
          this.normalizeHeader(k),
          sanitizeCell(this.cellToString(v)),
        ])
      )
    );
  }

  private parseCsv(fileKey: string): Promise<Record<string, string>[]> {
    assertUploadPathSafe(fileKey);
    return new Promise((resolve, reject) => {
      const rows: Record<string, string>[] = [];
      let headers: string[] = [];
      let isFirst = true;

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
          if (isFirst) {
            headers = record.map((h) => this.normalizeHeader(h));
            isFirst = false;
            continue;
          }
          const row: Record<string, string> = {};
          headers.forEach((h, i) => { row[h] = sanitizeCell(record[i] ?? ""); });
          if (Object.values(row).some((v) => v)) rows.push(row);
        }
      });

      parser.on("end", () => resolve(rows));
      parser.on("error", reject);
      createReadStream(fileKey).pipe(parser);
    });
  }

  private normalizeHeader(header: string): string {
    return String(header).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  }

  private cellToString(value: unknown): string {
    if (value === null || value === undefined) return "";
    if (value instanceof Date) return value.toISOString().split("T")[0];
    return String(value).trim();
  }

  private async markFailed(importId: string, message: string): Promise<void> {
    await this.prisma.csvImport.update({
      where: { id: importId },
      data: { status: ImportStatus.FAILED, errors: [{ message }] as object[], completedAt: new Date() },
    });
  }
}
