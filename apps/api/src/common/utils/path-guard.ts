import { resolve, normalize, join, sep } from "path";

// Resolved once at module load — zero overhead on hot paths
const UPLOADS_ROOT = resolve(join(process.cwd(), "uploads"));

/**
 * Asserts filePath stays inside the uploads directory.
 * Guards every readFile / writeFile / createReadStream / unlink
 * that operates on user-supplied upload paths in the API process.
 */
export function assertUploadPathSafe(filePath: string): void {
  const normalized = normalize(resolve(filePath));
  if (!normalized.startsWith(UPLOADS_ROOT + sep) && normalized !== UPLOADS_ROOT) {
    throw new Error(
      `[path-guard] Path traversal detected: "${filePath}" escapes uploads root`
    );
  }
}

/**
 * Asserts filePath stays inside PAGES_DIST_ROOT.
 * Used by pages.service.ts which reads HTML files whose paths come from the DB.
 */
export function assertPagesPathSafe(filePath: string): void {
  const raw = process.env.PAGES_DIST_ROOT;
  if (!raw?.trim()) {
    throw new Error(
      "[path-guard] PAGES_DIST_ROOT is not set; cannot validate filePath safety"
    );
  }
  const resolvedRoot = resolve(raw.trim());
  const normalized = normalize(resolve(filePath));
  if (!normalized.startsWith(resolvedRoot + sep) && normalized !== resolvedRoot) {
    throw new Error(
      `[path-guard] Path traversal detected: "${filePath}" escapes PAGES_DIST_ROOT`
    );
  }
}
