// =============================================================================
// SEO SCORE CALCULATOR
//
// Scores a generated page 0-100 based on measurable SEO signals.
// This is NOT a ranking predictor — it's a quality gate.
// Pages scoring below 40 are flagged for review before publishing.
//
// Scoring breakdown:
//   Title quality        (20 pts): length, keyword presence
//   Description quality  (20 pts): length, keyword presence, uniqueness
//   Content length       (20 pts): word count thresholds
//   Keyword density      (15 pts): focus keyword in content
//   Schema markup        (10 pts): has valid structured data
//   Internal links       (10 pts): has outbound internal links
//   Slug quality         (5 pts):  clean, keyword-rich slug
// =============================================================================

export interface SeoScoreInput {
  title: string;
  description: string;
  slug: string;
  htmlContent: string;
  focusKeyword: string;
  hasSchema: boolean;
  internalLinkCount: number;
}

export interface SeoScoreResult {
  score: number;        // 0-100
  breakdown: Record<string, number>;
  issues: string[];     // human-readable improvement suggestions
}

export function calculateSeoScore(input: SeoScoreInput): SeoScoreResult {
  const breakdown: Record<string, number> = {};
  const issues: string[] = [];

  // Strip HTML tags for text analysis
  const plainText = input.htmlContent.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const wordCount = plainText.split(/\s+/).filter(Boolean).length;
  const keyword = input.focusKeyword.toLowerCase();

  // ── Title quality (20 pts) ────────────────────────────────────────────────
  let titleScore = 0;
  const titleLen = input.title.length;

  if (titleLen >= 30 && titleLen <= 60) {
    titleScore += 10; // ideal length
  } else if (titleLen >= 20 && titleLen < 30) {
    titleScore += 5;
    issues.push("Title is short — aim for 30-60 characters");
  } else if (titleLen > 60) {
    titleScore += 5;
    issues.push("Title is too long — keep under 60 characters");
  } else {
    issues.push("Title is too short — aim for 30-60 characters");
  }

  if (keyword && input.title.toLowerCase().includes(keyword)) {
    titleScore += 10;
  } else if (keyword) {
    issues.push(`Focus keyword "${input.focusKeyword}" not found in title`);
  }

  breakdown.title = titleScore;

  // ── Description quality (20 pts) ─────────────────────────────────────────
  let descScore = 0;
  const descLen = input.description.length;

  if (descLen >= 120 && descLen <= 160) {
    descScore += 10;
  } else if (descLen >= 80 && descLen < 120) {
    descScore += 5;
    issues.push("Meta description is short — aim for 120-160 characters");
  } else if (descLen > 160) {
    descScore += 5;
    issues.push("Meta description is too long — keep under 160 characters");
  } else {
    issues.push("Meta description is too short — aim for 120-160 characters");
  }

  if (keyword && input.description.toLowerCase().includes(keyword)) {
    descScore += 10;
  } else if (keyword) {
    issues.push(`Focus keyword not found in meta description`);
  }

  breakdown.description = descScore;

  // ── Content length (20 pts) ───────────────────────────────────────────────
  let contentScore = 0;

  if (wordCount >= 500) {
    contentScore = 20;
  } else if (wordCount >= 300) {
    contentScore = 15;
    issues.push(`Content is thin (${wordCount} words) — aim for 500+ words`);
  } else if (wordCount >= 150) {
    contentScore = 8;
    issues.push(`Content is very thin (${wordCount} words) — aim for 500+ words`);
  } else {
    contentScore = 0;
    issues.push(`Content is too thin (${wordCount} words) — Google may not index this page`);
  }

  breakdown.contentLength = contentScore;

  // ── Keyword density (15 pts) ──────────────────────────────────────────────
  let keywordScore = 0;

  if (keyword && wordCount > 0) {
    const keywordCount = (plainText.toLowerCase().match(new RegExp(keyword, "g")) ?? []).length;
    const density = (keywordCount / wordCount) * 100;

    if (density >= 0.5 && density <= 2.5) {
      keywordScore = 15; // ideal density
    } else if (density > 0 && density < 0.5) {
      keywordScore = 7;
      issues.push(`Keyword density is low (${density.toFixed(1)}%) — mention the keyword more naturally`);
    } else if (density > 2.5) {
      keywordScore = 5;
      issues.push(`Keyword density is high (${density.toFixed(1)}%) — avoid keyword stuffing`);
    } else {
      issues.push(`Focus keyword not found in content`);
    }
  } else {
    keywordScore = 15; // no keyword set — don't penalize
  }

  breakdown.keywordDensity = keywordScore;

  // ── Schema markup (10 pts) ────────────────────────────────────────────────
  breakdown.schema = input.hasSchema ? 10 : 0;
  if (!input.hasSchema) {
    issues.push("No schema markup — add structured data for rich results");
  }

  // ── Internal links (10 pts) ───────────────────────────────────────────────
  let linkScore = 0;
  if (input.internalLinkCount >= 3) {
    linkScore = 10;
  } else if (input.internalLinkCount >= 1) {
    linkScore = 5;
    issues.push(`Only ${input.internalLinkCount} internal link(s) — aim for 3-8`);
  } else {
    issues.push("No internal links — add links to related pages");
  }
  breakdown.internalLinks = linkScore;

  // ── Slug quality (5 pts) ──────────────────────────────────────────────────
  let slugScore = 0;
  const slugLen = input.slug.length;

  if (slugLen >= 10 && slugLen <= 75 && !input.slug.includes("_")) {
    slugScore = 5;
  } else {
    slugScore = 2;
    if (slugLen > 75) issues.push("URL slug is too long — keep under 75 characters");
    if (input.slug.includes("_")) issues.push("URL slug uses underscores — use hyphens instead");
  }
  breakdown.slug = slugScore;

  // ── Total ─────────────────────────────────────────────────────────────────
  const score = Object.values(breakdown).reduce((sum, v) => sum + v, 0);

  return { score: Math.min(100, score), breakdown, issues };
}
