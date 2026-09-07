import { existsSync } from "fs";
import { readFile } from "fs/promises";
import { PrismaClient } from "@prisma/client";

// =============================================================================
// EXPORT VALIDATOR SERVICE
//
// All checks run in a single cursor-batched pass over generated_pages.
// HTML files are read once per page and reused across checks that need them.
// No additional full-table scans beyond what was already here.
//
// Checks:
//   1.  Missing HTML files on disk
//   2.  Broken internal links (target slug not in DB)
//   3.  Invalid route slugs
//   4.  Missing / inactive templates
//   5.  Blank SEO fields (title, slug, canonicalUrl)
//   6.  Unreplaced {{variable}} tokens in HTML, title, description, canonical
//   7.  Empty or thin HTML body (< MIN_BODY_CHARS useful text)
//   8.  Invalid canonical URLs (bad format or wrong domain)
//   9.  Duplicate slugs
//   10. SEO score = 0 or missing focusKeyword
//   11. Pages stuck in GENERATING (AI content never completed)
// =============================================================================

// ── Constants ─────────────────────────────────────────────────────────────────

const BATCH_SIZE = 500;
const MAX_DETAIL = 100;
const MIN_BODY_CHARS = 200;
// Pages stuck in GENERATING for longer than this are flagged
const STUCK_AI_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Variable tokens we explicitly track. The regex below also catches any
 * other {{...}} pattern so templates with custom variables are covered too.
 */
const KNOWN_VARIABLES = [
  "city", "state", "service", "zip_code", "industry", "technology",
];

// Matches any unreplaced {{ variable }} token (with optional whitespace)
const UNRESOLVED_VAR_RE = /\{\{\s*[\w]+\s*\}\}/g;

// Minimal URL validation: must be http(s) with a non-empty host
const URL_RE = /^https?:\/\/[^/\s]+/i;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UnreplacedVarEntry {
  slug: string;
  fields: string[];      // which fields contain unreplaced vars, e.g. ["html","title"]
  tokens: string[];      // the actual tokens found, e.g. ["{{city}}", "{{service}}"]
}

export interface EmptyPageEntry {
  slug: string;
  reason: "empty_body" | "thin_content";
  bodyChars: number;
}

export interface InvalidCanonicalEntry {
  slug: string;
  canonicalUrl: string;
  reason: "bad_format" | "wrong_domain";
}

export interface DuplicateSlugEntry {
  slug: string;
  count: number;
}

export interface LowSeoScoreEntry {
  slug: string;
  seoScore: number | null;
  missingFocusKeyword: boolean;
}

export interface StuckAiEntry {
  slug: string;
  pageId: string;
  stuckSinceMinutes: number;
}

export interface ValidationReport {
  generatedAt: string;
  projectId: string;
  generatedPages: number;

  // ── Legacy checks (unchanged field names for backwards compatibility) ──
  missingFiles: number;
  missingFilesList: string[];
  brokenLinks: number;
  brokenLinksList: Array<{ sourceSlug: string; targetSlug: string }>;
  invalidRoutes: number;
  invalidRoutesList: string[];
  missingTemplates: number;
  missingTemplatesList: string[];
  invalidSeoVariables: number;
  invalidSeoVariablesList: string[];

  // ── New checks ────────────────────────────────────────────────────────
  unreplacedVariables: number;
  unreplacedVariablesList: UnreplacedVarEntry[];

  emptyPages: number;
  emptyPagesList: EmptyPageEntry[];

  invalidCanonicals: number;
  invalidCanonicalsList: InvalidCanonicalEntry[];

  duplicateSlugs: number;
  duplicateSlugsList: DuplicateSlugEntry[];

  lowSeoScores: number;
  lowSeoScoresList: LowSeoScoreEntry[];

  stuckAiPages: number;
  stuckAiPagesList: StuckAiEntry[];

  // ── Summary ───────────────────────────────────────────────────────────
  routingPassed: boolean;
  seoQualityPassed: boolean;  // new: all SEO-quality checks green
  passed: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractUnresolvedTokens(text: string | null | undefined): string[] {
  if (!text) return [];
  return [...new Set(text.match(UNRESOLVED_VAR_RE) ?? [])];
}

/**
 * Strips HTML tags and returns visible text content length.
 * Fast — no DOM parser needed.
 */
function visibleTextLength(html: string): number {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim().length;
}

/** Extract base origin (scheme + host) from a URL string, or null on failure. */
function extractOrigin(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

// ── Main validator ────────────────────────────────────────────────────────────

export async function validateExport(
  prisma: PrismaClient,
  orgId: string,
  projectId: string,
  templateId?: string,
): Promise<ValidationReport> {
  const where: any = { orgId, projectId, OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] };
  if (templateId) where.templateId = templateId;

  const now = Date.now();

  // ── Pre-load: active template IDs (check 4) ───────────────────────────────
  const activeTemplates = await prisma.template.findMany({
    where: { projectId, orgId, deletedAt: null, isActive: true },
    select: { id: true },
  });
  const activeTemplateIds = new Set(activeTemplates.map((t) => t.id));

  // ── Pre-load: project baseUrl for canonical domain check (check 8) ────────
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { settings: true },
  });
  const projectBaseUrl: string | null =
    ((project?.settings as any)?.seo?.baseUrl as string | undefined)?.replace(/\/$/, "") ?? null;
  const projectOrigin = projectBaseUrl ? extractOrigin(projectBaseUrl) : null;

  // ── Pass 1: collect all valid slugs for broken-link check (check 2) ──────
  const validSlugs = new Set<string>();
  let slugCursor: string | undefined;

  while (true) {
    const batch = await prisma.generatedPage.findMany({
      where,
      select: { id: true, slug: true },
      orderBy: { id: "asc" },
      take: BATCH_SIZE,
      ...(slugCursor ? { skip: 1, cursor: { id: slugCursor } } : {}),
    });
    if (batch.length === 0) break;
    for (const p of batch) validSlugs.add(p.slug);
    slugCursor = batch[batch.length - 1].id;
  }

  const totalPages = validSlugs.size;

  // ── Pass 2: main validation pass ─────────────────────────────────────────
  let missingFiles = 0;
  const missingFilesList: string[] = [];

  let invalidRoutes = 0;
  const invalidRoutesList: string[] = [];

  const missingTemplateIds = new Set<string>();

  let invalidSeoVariables = 0;
  const invalidSeoVariablesList: string[] = [];

  // New accumulators
  let unreplacedVariables = 0;
  const unreplacedVariablesList: UnreplacedVarEntry[] = [];

  let emptyPages = 0;
  const emptyPagesList: EmptyPageEntry[] = [];

  let invalidCanonicals = 0;
  const invalidCanonicalsList: InvalidCanonicalEntry[] = [];

  // slug → occurrence count for duplicate detection
  const slugCounts = new Map<string, number>();

  let lowSeoScores = 0;
  const lowSeoScoresList: LowSeoScoreEntry[] = [];

  let stuckAiPages = 0;
  const stuckAiPagesList: StuckAiEntry[] = [];

  let cursor: string | undefined;

  while (true) {
    const batch = await prisma.generatedPage.findMany({
      where,
      select: {
        id: true,
        slug: true,
        filePath: true,
        templateId: true,
        title: true,
        canonicalUrl: true,
        focusKeyword: true,
        seoScore: true,
        status: true,
        updatedAt: true,
      },
      orderBy: { id: "asc" },
      take: BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });

    if (batch.length === 0) break;

    for (const page of batch) {
      // ── Check 1: missing file ──────────────────────────────────────────
      const fileExists = !!page.filePath && existsSync(page.filePath);
      if (!fileExists) {
        missingFiles++;
        if (missingFilesList.length < MAX_DETAIL) missingFilesList.push(page.slug);
      }

      // ── Check 3: invalid route slug ───────────────────────────────────
      if (!SLUG_RE.test(page.slug)) {
        invalidRoutes++;
        if (invalidRoutesList.length < MAX_DETAIL) invalidRoutesList.push(page.slug);
      }

      // ── Check 4: missing template ─────────────────────────────────────
      if (!activeTemplateIds.has(page.templateId)) {
        missingTemplateIds.add(page.templateId);
      }

      // ── Check 5: blank SEO fields ─────────────────────────────────────
      if (!page.title?.trim() || !page.slug?.trim() || !page.canonicalUrl?.trim()) {
        invalidSeoVariables++;
        if (invalidSeoVariablesList.length < MAX_DETAIL) invalidSeoVariablesList.push(page.slug);
      }

      // ── Read HTML once — reused by checks 6 & 7 ──────────────────────
      let htmlContent: string | null = null;
      if (fileExists && page.filePath) {
        htmlContent = await readFile(page.filePath, "utf-8").catch(() => null);
      }

      // ── Check 6: unreplaced {{variable}} tokens ───────────────────────
      const varFields: string[] = [];
      const varTokens = new Set<string>();

      const htmlTokens = extractUnresolvedTokens(htmlContent);
      if (htmlTokens.length) { varFields.push("html"); htmlTokens.forEach((t) => varTokens.add(t)); }

      const titleTokens = extractUnresolvedTokens(page.title);
      if (titleTokens.length) { varFields.push("title"); titleTokens.forEach((t) => varTokens.add(t)); }

      const canonicalTokens = extractUnresolvedTokens(page.canonicalUrl);
      if (canonicalTokens.length) { varFields.push("canonical"); canonicalTokens.forEach((t) => varTokens.add(t)); }

      if (varFields.length > 0 && unreplacedVariablesList.length < MAX_DETAIL) {
        unreplacedVariables++;
        unreplacedVariablesList.push({
          slug: page.slug,
          fields: varFields,
          tokens: [...varTokens],
        });
      } else if (varFields.length > 0) {
        unreplacedVariables++;
      }

      // ── Check 7: empty / thin body ────────────────────────────────────
      if (htmlContent !== null) {
        const bodyMatch = htmlContent.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
        const bodyHtml = bodyMatch ? bodyMatch[1] : htmlContent;
        const chars = visibleTextLength(bodyHtml);

        if (chars === 0) {
          emptyPages++;
          if (emptyPagesList.length < MAX_DETAIL) {
            emptyPagesList.push({ slug: page.slug, reason: "empty_body", bodyChars: 0 });
          }
        } else if (chars < MIN_BODY_CHARS) {
          emptyPages++;
          if (emptyPagesList.length < MAX_DETAIL) {
            emptyPagesList.push({ slug: page.slug, reason: "thin_content", bodyChars: chars });
          }
        }
      }

      // ── Check 8: invalid canonical URL ───────────────────────────────
      if (page.canonicalUrl?.trim()) {
        const canonical = page.canonicalUrl.trim();
        if (!URL_RE.test(canonical)) {
          invalidCanonicals++;
          if (invalidCanonicalsList.length < MAX_DETAIL) {
            invalidCanonicalsList.push({ slug: page.slug, canonicalUrl: canonical, reason: "bad_format" });
          }
        } else if (projectOrigin) {
          const canonicalOrigin = extractOrigin(canonical);
          if (canonicalOrigin && canonicalOrigin !== projectOrigin) {
            invalidCanonicals++;
            if (invalidCanonicalsList.length < MAX_DETAIL) {
              invalidCanonicalsList.push({ slug: page.slug, canonicalUrl: canonical, reason: "wrong_domain" });
            }
          }
        }
      }

      // ── Check 9: duplicate slug tracking ─────────────────────────────
      slugCounts.set(page.slug, (slugCounts.get(page.slug) ?? 0) + 1);

      // ── Check 10: SEO score / focus keyword ───────────────────────────
      const zeroScore = page.seoScore === 0 || page.seoScore === null;
      const missingKeyword = !page.focusKeyword?.trim();
      if (zeroScore || missingKeyword) {
        lowSeoScores++;
        if (lowSeoScoresList.length < MAX_DETAIL) {
          lowSeoScoresList.push({
            slug: page.slug,
            seoScore: page.seoScore ?? null,
            missingFocusKeyword: missingKeyword,
          });
        }
      }

      // ── Check 11: stuck AI pages (status=GENERATING for >30 min) ─────
      if (page.status === "GENERATING") {
        const stuckMs = now - new Date(page.updatedAt).getTime();
        if (stuckMs > STUCK_AI_THRESHOLD_MS) {
          stuckAiPages++;
          if (stuckAiPagesList.length < MAX_DETAIL) {
            stuckAiPagesList.push({
              slug: page.slug,
              pageId: page.id,
              stuckSinceMinutes: Math.floor(stuckMs / 60_000),
            });
          }
        }
      }
    }

    cursor = batch[batch.length - 1].id;
  }

  // ── Check 9 finalise: collect slugs that appear more than once ────────────
  const duplicateSlugsList: DuplicateSlugEntry[] = [];
  for (const [slug, count] of slugCounts) {
    if (count > 1) duplicateSlugsList.push({ slug, count });
  }
  // Sort descending by count for readability, cap at MAX_DETAIL
  duplicateSlugsList.sort((a, b) => b.count - a.count);
  const duplicateSlugs = duplicateSlugsList.length;
  if (duplicateSlugsList.length > MAX_DETAIL) duplicateSlugsList.length = MAX_DETAIL;

  // ── Check 2: broken internal links ───────────────────────────────────────
  let brokenLinks = 0;
  const brokenLinksList: Array<{ sourceSlug: string; targetSlug: string }> = [];
  let linkCursor: string | undefined;

  while (true) {
    const linkBatch = await prisma.internalLink.findMany({
      where: { projectId, orgId },
      select: {
        id: true,
        sourcePage: { select: { slug: true } },
        targetPage: { select: { slug: true } },
      },
      orderBy: { id: "asc" },
      take: BATCH_SIZE,
      ...(linkCursor ? { skip: 1, cursor: { id: linkCursor } } : {}),
    });
    if (linkBatch.length === 0) break;

    for (const link of linkBatch) {
      if (!validSlugs.has(link.targetPage.slug)) {
        brokenLinks++;
        if (brokenLinksList.length < MAX_DETAIL) {
          brokenLinksList.push({
            sourceSlug: link.sourcePage.slug,
            targetSlug: link.targetPage.slug,
          });
        }
      }
    }
    linkCursor = linkBatch[linkBatch.length - 1].id;
  }

  // ── Summary flags ─────────────────────────────────────────────────────────
  const missingTemplatesList = [...missingTemplateIds];
  const missingTemplates = missingTemplatesList.length;

  const routingPassed = missingFiles === 0 && invalidRoutes === 0;

  // SEO quality: warn-level issues do NOT block passed (duplicates, low scores)
  // Critical issues DO block: unreplaced vars, empty pages, stuck AI, bad canonicals
  const seoQualityPassed =
    unreplacedVariables === 0 &&
    emptyPages === 0 &&
    invalidCanonicals === 0 &&
    stuckAiPages === 0;

  const passed =
    brokenLinks === 0 &&
    missingFiles === 0 &&
    invalidRoutes === 0 &&
    missingTemplates === 0 &&
    invalidSeoVariables === 0 &&
    seoQualityPassed;

  return {
    generatedAt: new Date().toISOString(),
    projectId,
    generatedPages: totalPages,

    // Legacy checks
    missingFiles,
    missingFilesList,
    brokenLinks,
    brokenLinksList,
    invalidRoutes,
    invalidRoutesList,
    missingTemplates,
    missingTemplatesList,
    invalidSeoVariables,
    invalidSeoVariablesList,

    // New checks
    unreplacedVariables,
    unreplacedVariablesList,
    emptyPages,
    emptyPagesList,
    invalidCanonicals,
    invalidCanonicalsList,
    duplicateSlugs,
    duplicateSlugsList,
    lowSeoScores,
    lowSeoScoresList,
    stuckAiPages,
    stuckAiPagesList,

    // Summary
    routingPassed,
    seoQualityPassed,
    passed,
  };
}

// ── Re-used from legacy ───────────────────────────────────────────────────────
const SLUG_RE = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;
