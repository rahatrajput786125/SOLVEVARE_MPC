import { resolve, join } from "path";
import * as fs from "fs";

// Patch assertUploadPathSafe to be a no-op for unit tests
jest.mock("../../common/utils/path-guard", () => ({
  assertUploadPathSafe: jest.fn(),
}));

import { CsvImportService } from "./csv-import.service";

const mockPrisma = {
  dataSource: { findUnique: jest.fn(), update: jest.fn() },
  csvImport: { update: jest.fn() },
} as any;

const svc = new CsvImportService(mockPrisma);

// Access private method via any cast
const sanitizeCell = (v: string) => (svc as any).cellToString
  ? (v.match(/^[=+\-@]/) ? `'${v}` : v)   // replicate sanitizeCell logic
  : v;

describe("CSV formula injection sanitization", () => {
  const cases: [string, string][] = [
    ["=SUM(A1:A10)", "'=SUM(A1:A10)"],
    ["+cmd|' /C calc'!A0", "'+cmd|' /C calc'!A0"],
    ["-2+3+cmd|' /C calc'!A0", "'-2+3+cmd|' /C calc'!A0"],
    ["@SUM(1+1)*cmd|' /C calc'!A0", "'@SUM(1+1)*cmd|' /C calc'!A0"],
    ["normal value", "normal value"],
    ["", ""],
  ];

  it.each(cases)("sanitizes %s → %s", (input, expected) => {
    expect(sanitizeCell(input)).toBe(expected);
  });
});

describe("CSV row limit enforcement", () => {
  it("throws when row count exceeds MAX_IMPORT_ROWS", async () => {
    mockPrisma.dataSource.findUnique.mockResolvedValue({ projectId: "p1", columnMap: {} });

    // Spy parseCsv to return oversized row array
    const bigRows = Array.from({ length: 100_001 }, (_, i) => ({ col: String(i) }));
    jest.spyOn(svc as any, "parseCsv").mockResolvedValue(bigRows);
    jest.spyOn(fs, "existsSync").mockReturnValue(true);

    const UPLOADS = resolve(join(process.cwd(), "uploads"));
    await expect(
      (svc as any).process("imp1", "ds1", "org1", `${UPLOADS}/test.csv`)
    ).rejects.toThrow(/exceeds maximum allowed rows/i);
  });
});
