import { mkdir, writeFile, readFile, unlink } from "fs/promises";
import { existsSync } from "fs";
import { join, dirname, resolve, normalize, sep } from "path";

// =============================================================================
// HTML FILE STORE
//
// P0 FIX: storage root is now driven by the PAGES_DIST_ROOT environment
// variable instead of process.cwd()/dist.
//
// Why this matters:
//   `nest build` runs `rimraf dist` before compiling TypeScript.
//   If PAGES_DIST_ROOT were process.cwd()/dist, every deployment would wipe
//   all generated HTML pages — a silent, irreversible data loss.
//
// Required environment variable:
//   PAGES_DIST_ROOT=/data/generated-pages   (production)
//   PAGES_DIST_ROOT=./local-pages           (local dev fallback)
//
// The root is resolved to an absolute path at module load time and validated
// once via getPagesRoot(). All file operations then assert the resolved path
// stays inside that root (path traversal guard).
// =============================================================================

let _resolvedRoot: string | null = null;

/**
 * Returns the absolute, resolved pages storage root.
 * Throws a descriptive error on first call if the env var is missing.
 * Cached after first resolution — zero overhead on hot paths.
 */
export function getPagesRoot(): string {
  if (_resolvedRoot) return _resolvedRoot;

  const raw = process.env.PAGES_DIST_ROOT;
  if (!raw || !raw.trim()) {
    throw new Error(
      "[html-file.store] PAGES_DIST_ROOT environment variable is not set.\n" +
      "  Production example: PAGES_DIST_ROOT=/data/generated-pages\n" +
      "  Local dev example:  PAGES_DIST_ROOT=./local-pages\n" +
      "  This MUST point to a directory outside the TypeScript build output."
    );
  }

  _resolvedRoot = resolve(raw.trim());
  return _resolvedRoot;
}

/**
 * Asserts `filePath` is inside the pages root.
 * Prevents a malicious slug like `../../etc/passwd` from escaping the sandbox.
 */
function assertSafe(filePath: string): void {
  const root = getPagesRoot();
  const normalized = normalize(resolve(filePath));
  if (!normalized.startsWith(root + sep) && normalized !== root) {
    throw new Error(
      `[html-file.store] Path traversal detected: "${filePath}" is outside PAGES_DIST_ROOT "${root}"`
    );
  }
}

/**
 * Builds the absolute file path for a page.
 * Pattern: <PAGES_DIST_ROOT>/<projectId>/<templateId>/<slug>.html
 *
 * slugs are already normalised by the template engine (lowercase, hyphens only)
 * but we sanitise again here with path.basename to strip any residual separators.
 */
export function buildFilePath(projectId: string, templateId: string, slug: string): string {
  if (/[/\\]|\.\./.test(projectId) || /[/\\]|\.\./.test(templateId) || /[/\\]|\.\./.test(slug)) {
    throw new Error("[html-file.store] Path traversal detected in arguments");
  }
  const filePath = join(getPagesRoot(), projectId, templateId, `${slug}.html`);
  assertSafe(filePath);
  return filePath;
}

/** Write HTML to disk. Creates parent directories if needed. */
export async function writeHtmlFile(filePath: string, html: string): Promise<void> {
  assertSafe(filePath);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, html, "utf-8");
}

/** Read HTML from disk. Returns null if file does not exist. */
export async function readHtmlFile(filePath: string): Promise<string | null> {
  assertSafe(filePath);
  if (!existsSync(filePath)) return null;
  return readFile(filePath, "utf-8");
}

/** Delete a single HTML file. Silent if already gone. */
export async function deleteHtmlFile(filePath: string): Promise<void> {
  assertSafe(filePath);
  if (existsSync(filePath)) await unlink(filePath);
}

// ── Exposed for tests only ────────────────────────────────────────────────────
/** Reset the cached root (used in unit tests to inject a temp dir). */
export function _resetPagesRootForTest(): void {
  _resolvedRoot = null;
}
