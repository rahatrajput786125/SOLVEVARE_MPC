// =============================================================================
// AI QUALITY SCORER
//
// Scores AI-generated content 0-100 before it's saved.
// Low scores trigger a retry with a stronger prompt.
//
// Why score AI content?
// Without quality gates, AI will occasionally produce:
//   - Empty responses (API timeout, content filter)
//   - Repetitive content (same sentence 5 times)
//   - Off-topic content (hallucination)
//   - Keyword-stuffed content (prompt injection from CSV data)
//   - Content that's too short to be useful
//
// Scoring dimensions:
//   Length adequacy    (30 pts): meets minimum length for the placeholder
//   Uniqueness         (25 pts): no excessive repetition
//   Keyword presence   (20 pts): mentions the target keyword
//   Format compliance  (15 pts): follows the requested output format
//   No spam signals    (10 pts): no banned phrases
// =============================================================================

export interface QualityScoreResult {
  score: number;       // 0-100
  passed: boolean;     // score >= threshold
  reasons: string[];   // why it failed (for logging/debugging)
}

// Phrases that indicate low-quality AI output
const SPAM_SIGNALS = [
  "as an ai",
  "i cannot",
  "i'm unable",
  "i apologize",
  "certainly!",
  "absolutely!",
  "great question",
  "look no further",
  "best in class",
  "second to none",
  "state of the art",
  "[insert",
  "[your ",
  "lorem ipsum",
];

// Minimum character counts per placeholder type
const MIN_LENGTHS: Record<string, number> = {
  faq: 400,
  intro: 150,
  conclusion: 100,
  benefits: 250,
  local_content: 250,
  meta_description: 100,
  title_variations: 100,
  default: 80,
};

// Quality threshold — below this, retry with stronger prompt
export const QUALITY_THRESHOLD = 50;
// After this many retries, accept whatever we have
export const MAX_QUALITY_RETRIES = 2;

export function scoreAiContent(
  content: string,
  placeholder: string,
  data: Record<string, string>,
  expectedMinLength?: number
): QualityScoreResult {
  const reasons: string[] = [];
  let score = 0;

  if (!content || content.trim().length === 0) {
    return { score: 0, passed: false, reasons: ["Empty response"] };
  }

  const text = content.trim();
  const minLength = expectedMinLength ?? MIN_LENGTHS[placeholder] ?? MIN_LENGTHS.default;

  // ── Length adequacy (30 pts) ─────────────────────────────────────────────
  const lengthRatio = Math.min(text.length / minLength, 1);
  const lengthScore = Math.round(lengthRatio * 30);
  score += lengthScore;

  if (text.length < minLength * 0.5) {
    reasons.push(`Content too short: ${text.length} chars, expected ${minLength}+`);
  }

  // ── Uniqueness / no repetition (25 pts) ──────────────────────────────────
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 10);
  const uniqueSentences = new Set(sentences.map((s) => s.trim().toLowerCase()));
  const uniquenessRatio = sentences.length > 0
    ? uniqueSentences.size / sentences.length
    : 1;

  const uniquenessScore = Math.round(uniquenessRatio * 25);
  score += uniquenessScore;

  if (uniquenessRatio < 0.7) {
    reasons.push(`High repetition: ${Math.round((1 - uniquenessRatio) * 100)}% duplicate sentences`);
  }

  // ── Keyword presence (20 pts) ────────────────────────────────────────────
  const city = (data.city ?? data.location ?? "").toLowerCase();
  const service = (data.service ?? data.service_type ?? "").toLowerCase();
  const textLower = text.toLowerCase();

  let keywordScore = 0;
  if (city && textLower.includes(city)) keywordScore += 10;
  if (service && textLower.includes(service)) keywordScore += 10;
  if (!city && !service) keywordScore = 20; // no keywords to check

  score += keywordScore;

  if (city && !textLower.includes(city)) {
    reasons.push(`Missing location keyword: "${city}"`);
  }
  if (service && !textLower.includes(service)) {
    reasons.push(`Missing service keyword: "${service}"`);
  }

  // ── Format compliance (15 pts) ───────────────────────────────────────────
  let formatScore = 15; // start with full marks, deduct for violations

  // FAQ format check
  if (placeholder === "faq") {
    const qCount = (text.match(/^Q:/gm) ?? []).length;
    const aCount = (text.match(/^A:/gm) ?? []).length;
    if (qCount < 3 || aCount < 3) {
      formatScore -= 10;
      reasons.push(`FAQ format issue: found ${qCount} Q's and ${aCount} A's, expected 5`);
    }
  }

  // Meta description length check
  if (placeholder === "meta_description") {
    if (text.length < 120 || text.length > 165) {
      formatScore -= 8;
      reasons.push(`Meta description length: ${text.length} chars (expected 120-160)`);
    }
  }

  score += formatScore;

  // ── No spam signals (10 pts) ─────────────────────────────────────────────
  const spamFound = SPAM_SIGNALS.filter((signal) =>
    textLower.includes(signal.toLowerCase())
  );

  if (spamFound.length === 0) {
    score += 10;
  } else {
    const deduction = Math.min(spamFound.length * 3, 10);
    score += 10 - deduction;
    reasons.push(`Spam signals found: ${spamFound.join(", ")}`);
  }

  const finalScore = Math.min(100, Math.max(0, score));

  return {
    score: finalScore,
    passed: finalScore >= QUALITY_THRESHOLD,
    reasons,
  };
}
