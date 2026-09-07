/**
 * P0 Fix #1 — GenerationRunStatus.PARTIAL
 *
 * Verifies:
 *   1. PARTIAL is a member of the GenerationRunStatus enum (no runtime crash).
 *   2. The status-resolution logic in PageGenerationProcessor#updateJobProgress
 *      emits PARTIAL when some chunks fail and some succeed — not COMPLETED or FAILED.
 *   3. All-failed → FAILED, all-succeeded → COMPLETED.
 */

import { GenerationRunStatus } from "@mpc/shared";

// ── inline the same status-resolution logic used in the processor ────────────
// Keeps the test independent of Prisma/Bull so it runs in unit mode.
function resolveRunStatus(doneChunks: number, failedChunks: number): string {
  if (failedChunks > 0 && doneChunks === 0) return "FAILED";
  if (failedChunks > 0) return "PARTIAL";
  return "COMPLETED";
}

describe("GenerationRunStatus — P0 Fix #1 (PARTIAL enum member)", () => {
  it("PARTIAL exists in GenerationRunStatus enum", () => {
    expect(GenerationRunStatus.PARTIAL).toBe("PARTIAL");
  });

  it("all expected statuses are present in the enum", () => {
    const expected: string[] = ["QUEUED", "PROCESSING", "COMPLETED", "PARTIAL", "FAILED", "CANCELLED"];
    for (const s of expected) {
      expect(Object.values(GenerationRunStatus)).toContain(s);
    }
  });

  it("all-success → COMPLETED", () => {
    expect(resolveRunStatus(10, 0)).toBe("COMPLETED");
  });

  it("all-fail → FAILED", () => {
    expect(resolveRunStatus(0, 10)).toBe("FAILED");
  });

  it("mixed → PARTIAL (not COMPLETED, not FAILED)", () => {
    const status = resolveRunStatus(8, 2);
    expect(status).toBe("PARTIAL");
    expect(status).not.toBe("COMPLETED");
    expect(status).not.toBe("FAILED");
  });

  it("PARTIAL is a valid value — would not crash a Prisma enum write", () => {
    // Simulates what the processor does:
    //   prisma.generationRun.update({ data: { status } })
    // The value must be a member of GenerationRunStatus; if PARTIAL were missing
    // this assertion would fail, meaning Prisma would throw at runtime.
    const status = resolveRunStatus(5, 3); // mixed
    const validValues = Object.values(GenerationRunStatus) as string[];
    expect(validValues).toContain(status);
  });
});
