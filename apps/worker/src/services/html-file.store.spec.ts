/**
 * P0 Fix #2 — DIST folder collision
 *
 * Verifies:
 *   1. getPagesRoot() throws when PAGES_DIST_ROOT is unset.
 *   2. getPagesRoot() resolves the env var to an absolute path.
 *   3. buildFilePath() places files inside the root, never in process.cwd()/dist.
 *   4. assertSafe() (via buildFilePath) blocks path-traversal slugs.
 *   5. writeHtmlFile / readHtmlFile round-trip works correctly.
 *   6. The root is NOT a sub-path of process.cwd()/dist, so a build
 *      cannot delete generated pages.
 */

import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import {
  getPagesRoot,
  buildFilePath,
  writeHtmlFile,
  readHtmlFile,
  deleteHtmlFile,
  _resetPagesRootForTest,
} from "./html-file.store";

// ── helpers ──────────────────────────────────────────────────────────────────

function withTmpRoot(fn: (tmpDir: string) => Promise<void> | void) {
  return async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mpc-pages-"));
    _resetPagesRootForTest();
    const original = process.env.PAGES_DIST_ROOT;
    process.env.PAGES_DIST_ROOT = tmpDir;
    try {
      await fn(tmpDir);
    } finally {
      process.env.PAGES_DIST_ROOT = original;
      _resetPagesRootForTest();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  };
}

// ── tests ────────────────────────────────────────────────────────────────────

describe("html-file.store — P0 Fix #2 (DIST folder collision)", () => {
  afterEach(() => {
    _resetPagesRootForTest();
  });

  it("throws a descriptive error when PAGES_DIST_ROOT is not set", () => {
    delete process.env.PAGES_DIST_ROOT;
    expect(() => getPagesRoot()).toThrow("PAGES_DIST_ROOT");
  });

  it("resolves PAGES_DIST_ROOT to an absolute path", withTmpRoot((tmpDir) => {
    const root = getPagesRoot();
    expect(path.isAbsolute(root)).toBe(true);
    expect(root).toBe(path.resolve(tmpDir));
  }));

  it("buildFilePath places the file inside PAGES_DIST_ROOT", withTmpRoot((tmpDir) => {
    const filePath = buildFilePath("proj1", "tpl1", "plumber-in-london");
    expect(filePath.startsWith(path.resolve(tmpDir))).toBe(true);
  }));

  it("pages root is NOT inside process.cwd()/dist — build cannot delete pages", withTmpRoot((tmpDir) => {
    const buildOutput = path.join(process.cwd(), "dist");
    const root = getPagesRoot();
    // The generated-pages root must be completely outside the build output dir.
    expect(root.startsWith(buildOutput)).toBe(false);
  }));

  it("blocks path-traversal slug", withTmpRoot(() => {
    expect(() => buildFilePath("proj1", "tpl1", "../../etc/passwd")).toThrow(
      /path traversal/i
    );
  }));

  it("write + read round-trip", withTmpRoot(async () => {
    const filePath = buildFilePath("proj1", "tpl1", "electrician-in-paris");
    await writeHtmlFile(filePath, "<html>Paris</html>");
    const result = await readHtmlFile(filePath);
    expect(result).toBe("<html>Paris</html>");
  }));

  it("readHtmlFile returns null for a missing file", withTmpRoot(async () => {
    const filePath = buildFilePath("proj1", "tpl1", "ghost-page");
    const result = await readHtmlFile(filePath);
    expect(result).toBeNull();
  }));

  it("deleteHtmlFile removes the file and is idempotent", withTmpRoot(async () => {
    const filePath = buildFilePath("proj1", "tpl1", "delete-me");
    await writeHtmlFile(filePath, "<html></html>");
    await deleteHtmlFile(filePath);
    expect(await readHtmlFile(filePath)).toBeNull();
    // second call must not throw
    await expect(deleteHtmlFile(filePath)).resolves.toBeUndefined();
  }));
});
