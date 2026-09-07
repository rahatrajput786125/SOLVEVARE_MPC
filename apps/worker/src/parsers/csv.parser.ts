import { parse } from "csv-parse";
import { Readable } from "stream";

// =============================================================================
// CSV PARSER — Streaming
//
// Reads a Node.js Readable stream (from S3) and emits rows in chunks.
// Memory usage: O(chunkSize) regardless of file size.
//
// Why csv-parse over manual splitting?
// - Handles quoted fields with commas: "New York, NY"
// - Handles escaped quotes: "He said ""hello"""
// - Handles different line endings: \r\n, \n, \r
// - Handles BOM (byte order mark) in Excel-exported CSVs
// =============================================================================

export interface ParsedRow {
  // Column name → cell value (all strings — type coercion happens later)
  [column: string]: string;
}

export interface ChunkResult {
  rows: ParsedRow[];
  chunkIndex: number;
}

export interface ParseOptions {
  chunkSize?: number;       // rows per chunk (default: 1000)
  columnMap?: Record<string, string>; // "CSV Header" → "variable name"
  skipEmptyRows?: boolean;
  maxErrors?: number;       // stop after N errors (default: 100)
}

export interface ParseError {
  row: number;
  message: string;
  raw?: string;
}

export class CsvParser {
  // Parse a stream and call onChunk for each batch of rows.
  // Returns total row count and any errors encountered.
  async parseStream(
    stream: Readable,
    onChunk: (chunk: ChunkResult) => Promise<void>,
    options: ParseOptions = {}
  ): Promise<{ totalRows: number; errors: ParseError[] }> {
    const {
      chunkSize = 1000,
      columnMap = {},
      skipEmptyRows = true,
      maxErrors = 100,
    } = options;

    return new Promise((resolve, reject) => {
      const errors: ParseError[] = [];
      let totalRows = 0;
      let chunkIndex = 0;
      let currentChunk: ParsedRow[] = [];
      let headers: string[] = [];
      let isFirstRow = true;

      // csv-parse options:
      // - bom: strips UTF-8 BOM (common in Excel exports)
      // - trim: strips whitespace from cell values
      // - skip_empty_lines: skips blank rows
      // - relax_quotes: tolerates slightly malformed quoting
      const parser = parse({
        bom: true,
        trim: true,
        skip_empty_lines: skipEmptyRows,
        relax_quotes: true,
        relax_column_count: true, // don't fail on rows with wrong column count
      });

      parser.on("readable", async () => {
        let record: string[];

        // eslint-disable-next-line no-cond-assign
        while ((record = parser.read()) !== null) {
          // First row is always the header
          if (isFirstRow) {
            headers = record.map((h) => h.trim());
            isFirstRow = false;
            continue;
          }

          // Map record array to object using headers
          const row = this.recordToObject(record, headers, columnMap);

          // Skip rows where all values are empty
          if (skipEmptyRows && this.isEmptyRow(row)) continue;

          // Validate row
          const rowErrors = this.validateRow(row, totalRows + 1);
          if (rowErrors.length > 0) {
            errors.push(...rowErrors);
            if (errors.length >= maxErrors) {
              parser.destroy(new Error(`Max errors (${maxErrors}) reached`));
              return;
            }
            continue; // skip invalid rows
          }

          currentChunk.push(row);
          totalRows++;

          // When chunk is full, flush it
          if (currentChunk.length >= chunkSize) {
            const chunk = currentChunk;
            currentChunk = [];
            const idx = chunkIndex++;

            try {
              await onChunk({ rows: chunk, chunkIndex: idx });
            } catch (err) {
              parser.destroy(err as Error);
              return;
            }
          }
        }
      });

      parser.on("end", async () => {
        // Flush the final partial chunk
        if (currentChunk.length > 0) {
          try {
            await onChunk({ rows: currentChunk, chunkIndex: chunkIndex++ });
          } catch (err) {
            reject(err);
            return;
          }
        }
        resolve({ totalRows, errors });
      });

      parser.on("error", (err) => {
        // Don't reject on max-errors — that's a controlled stop
        if (err.message.includes("Max errors")) {
          resolve({ totalRows, errors });
        } else {
          reject(err);
        }
      });

      // Pipe the S3 stream into the CSV parser
      stream.pipe(parser);
    });
  }

  // Parse a complete buffer (for small files / Google Sheets data)
  async parseBuffer(
    buffer: Buffer,
    options: ParseOptions = {}
  ): Promise<{ rows: ParsedRow[]; errors: ParseError[] }> {
    const allRows: ParsedRow[] = [];
    const { errors } = await this.parseStream(
      Readable.from(buffer),
      async (chunk) => { allRows.push(...chunk.rows); },
      options
    );
    return { rows: allRows, errors };
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private recordToObject(
    record: string[],
    headers: string[],
    columnMap: Record<string, string>
  ): ParsedRow {
    const row: ParsedRow = {};

    headers.forEach((header, i) => {
      const value = record[i] ?? "";
      // Apply column mapping: "City Name" → "city"
      const mappedKey = columnMap[header] ?? this.normalizeHeader(header);
      row[mappedKey] = value;
    });

    return row;
  }

  // Normalize header to a valid variable name:
  // "City Name" → "city_name", "Service Type" → "service_type"
  private normalizeHeader(header: string): string {
    return header
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");
  }

  private isEmptyRow(row: ParsedRow): boolean {
    return Object.values(row).every((v) => !v || v.trim() === "");
  }

  private validateRow(row: ParsedRow, rowNumber: number): ParseError[] {
    const errors: ParseError[] = [];

    // Check for cells that are suspiciously large (possible injection)
    for (const [key, value] of Object.entries(row)) {
      if (value.length > 10_000) {
        errors.push({
          row: rowNumber,
          message: `Column "${key}" exceeds 10,000 characters`,
        });
      }
    }

    return errors;
  }
}
