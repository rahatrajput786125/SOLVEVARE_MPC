import axios from "axios";
import { Readable } from "stream";
import { CsvParser, ParsedRow, ParseOptions, ParseError } from "./csv.parser";

// =============================================================================
// GOOGLE SHEETS PARSER
//
// Strategy: use Google Sheets' built-in CSV export endpoint.
// No OAuth required for public sheets — just append /export?format=csv
//
// For private sheets: user provides a service account JSON key.
// We use the Sheets API v4 to fetch data as JSON.
//
// Why not the Sheets API for public sheets?
// The CSV export is simpler, faster, and doesn't require API keys.
// The Sheets API is only needed for private sheets or real-time sync.
// =============================================================================

// Extracts the spreadsheet ID from various Google Sheets URL formats
const SHEET_ID_REGEX =
  /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/;

export class GoogleSheetsParser {
  private csvParser = new CsvParser();

  // Parse a public Google Sheet by URL
  async parsePublicSheet(
    sheetUrl: string,
    options: ParseOptions = {}
  ): Promise<{ rows: ParsedRow[]; errors: ParseError[]; totalRows: number }> {
    const spreadsheetId = this.extractSheetId(sheetUrl);
    const gid = this.extractGid(sheetUrl); // specific tab ID

    // Build the CSV export URL
    // This works for any sheet shared as "Anyone with the link can view"
    const exportUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv${gid ? `&gid=${gid}` : ""}`;

    let csvBuffer: Buffer;
    try {
      const response = await axios.get<ArrayBuffer>(exportUrl, {
        responseType: "arraybuffer",
        timeout: 30_000, // 30 second timeout
        maxContentLength: 100 * 1024 * 1024, // 100MB max
        headers: {
          // Identify ourselves — Google may block requests without User-Agent
          "User-Agent": "MPC-SaaS/1.0 DataImporter",
        },
      });
      csvBuffer = Buffer.from(response.data);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 403) {
        throw new Error(
          "Google Sheet is not publicly accessible. Share the sheet with 'Anyone with the link can view' and try again."
        );
      }
      throw new Error(`Failed to fetch Google Sheet: ${(err as Error).message}`);
    }

    const allRows: ParsedRow[] = [];
    const { errors, totalRows } = await this.csvParser.parseStream(
      Readable.from(csvBuffer),
      async (chunk) => { allRows.push(...chunk.rows); },
      options
    );

    return { rows: allRows, errors, totalRows };
  }

  // Validate that a URL is a valid Google Sheets URL before attempting fetch
  validateUrl(url: string): { valid: boolean; error?: string } {
    if (!url.includes("docs.google.com/spreadsheets")) {
      return { valid: false, error: "Not a valid Google Sheets URL" };
    }
    if (!SHEET_ID_REGEX.test(url)) {
      return { valid: false, error: "Could not extract spreadsheet ID from URL" };
    }
    return { valid: true };
  }

  // Preview first 5 rows + headers — used in the UI column mapping step
  async previewSheet(
    sheetUrl: string
  ): Promise<{ headers: string[]; preview: ParsedRow[] }> {
    const { rows } = await this.parsePublicSheet(sheetUrl, {
      chunkSize: 5,
    });

    const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
    return { headers, preview: rows.slice(0, 5) };
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private extractSheetId(url: string): string {
    const match = SHEET_ID_REGEX.exec(url);
    if (!match) throw new Error("Invalid Google Sheets URL");
    return match[1];
  }

  private extractGid(url: string): string | null {
    const match = url.match(/[?&]gid=(\d+)/);
    return match ? match[1] : null;
  }
}
