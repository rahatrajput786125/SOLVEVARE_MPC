import * as XLSX from "xlsx";
import { ParsedRow, ParseOptions, ParseError } from "./csv.parser";

// =============================================================================
// EXCEL PARSER
//
// Excel files can't be streamed like CSV — the xlsx format is a ZIP archive
// with XML inside. We must load the whole file to parse it.
//
// Mitigation: enforce a file size limit (50MB) before parsing.
// For files > 50MB, require CSV export instead.
//
// Why xlsx library? It handles .xlsx, .xls, .ods, and .csv in one package.
// =============================================================================

const MAX_EXCEL_SIZE_BYTES = 50 * 1024 * 1024; // 50MB

export class ExcelParser {
  parse(
    buffer: Buffer,
    options: ParseOptions = {}
  ): { rows: ParsedRow[]; errors: ParseError[]; sheetNames: string[] } {
    if (buffer.length > MAX_EXCEL_SIZE_BYTES) {
      throw new Error(
        `Excel file too large (${Math.round(buffer.length / 1024 / 1024)}MB). Maximum is 50MB. Please export as CSV for larger files.`
      );
    }

    const { columnMap = {}, skipEmptyRows = true } = options;
    const errors: ParseError[] = [];

    // Parse the workbook
    const workbook = XLSX.read(buffer, {
      type: "buffer",
      cellDates: true,   // convert date cells to JS Date objects
      cellNF: false,     // don't parse number formats
      cellText: false,   // don't generate text representations
    });

    const sheetNames = workbook.SheetNames;

    // Always use the first sheet — UI can let user pick sheet later
    const firstSheet = workbook.Sheets[sheetNames[0]];
    if (!firstSheet) {
      throw new Error("Excel file contains no sheets");
    }

    // Convert sheet to array of arrays
    const rawData = XLSX.utils.sheet_to_json<string[]>(firstSheet, {
      header: 1,          // return arrays, not objects (we handle headers ourselves)
      defval: "",         // empty cells become empty string, not undefined
      blankrows: false,
    });

    if (rawData.length === 0) {
      return { rows: [], errors: [], sheetNames };
    }

    // First row is headers
    const headers = (rawData[0] as string[]).map((h) =>
      String(h ?? "").trim()
    );

    const rows: ParsedRow[] = [];

    for (let i = 1; i < rawData.length; i++) {
      const record = rawData[i] as string[];
      const row: ParsedRow = {};

      headers.forEach((header, colIdx) => {
        const rawValue = record[colIdx];
        // Convert dates, numbers, booleans to strings
        const value = this.cellToString(rawValue);
        const mappedKey =
          columnMap[header] ?? this.normalizeHeader(header);
        row[mappedKey] = value;
      });

      // Skip empty rows
      if (skipEmptyRows && Object.values(row).every((v) => !v)) continue;

      // Validate cell sizes
      for (const [key, value] of Object.entries(row)) {
        if (value.length > 10_000) {
          errors.push({
            row: i + 1,
            message: `Column "${key}" exceeds 10,000 characters`,
          });
        }
      }

      rows.push(row);
    }

    return { rows, errors, sheetNames };
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private cellToString(value: unknown): string {
    if (value === null || value === undefined) return "";
    if (value instanceof Date) return value.toISOString().split("T")[0]; // YYYY-MM-DD
    if (typeof value === "boolean") return value ? "true" : "false";
    if (typeof value === "number") return String(value);
    return String(value).trim();
  }

  private normalizeHeader(header: string): string {
    return header
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");
  }
}
