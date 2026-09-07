// =============================================================================
// HREFLANG BUILDER
//
// Generates hreflang alternate link tags for multi-language/region pages.
//
// When do you need hreflang?
// When the same content exists in multiple languages OR the same language
// targets different regions (e.g., en-US vs en-GB vs en-AU).
//
// For programmatic SEO, common use cases:
//   - "plumber in Austin" (en-US) + "plombier à Paris" (fr-FR)
//   - Same service pages for US, UK, Australia (all English, different regions)
//   - Location pages in Spanish for US Hispanic market
//
// Hreflang rules:
//   1. Every page must reference ALL its variants (including itself)
//   2. Must include x-default for users whose language isn't listed
//   3. Must be bidirectional — if A references B, B must reference A
//   4. Use BCP 47 language codes: "en", "en-US", "fr-FR", "es-MX"
//
// Implementation: we store hreflang groups in the project settings.
// Each group maps a slug pattern to its language variants.
// =============================================================================

export interface HreflangEntry {
  lang: string;   // BCP 47: "en", "en-US", "fr-FR"
  url: string;    // absolute URL
}

export interface HreflangGroup {
  // The canonical (default) URL
  defaultUrl: string;
  // All language variants including the default
  variants: HreflangEntry[];
}

// Build hreflang tags for a single page given its variants
// Returns the array to pass into MetaTagInput.hreflang
export function buildHreflangTags(group: HreflangGroup): HreflangEntry[] {
  // Validate: every variant must have a non-empty lang and url
  const valid = group.variants.filter(
    (v) => v.lang && v.url && isValidBcp47(v.lang)
  );

  if (valid.length === 0) return [];

  // Deduplicate by lang — last one wins if duplicates exist
  const deduped = new Map<string, string>();
  for (const { lang, url } of valid) {
    deduped.set(lang.toLowerCase(), url);
  }

  return Array.from(deduped.entries()).map(([lang, url]) => ({ lang, url }));
}

// Generate hreflang variants for a programmatic SEO page
// given a base URL pattern and a list of locale configs
//
// Example:
//   baseSlug = "plumber-in-{city}"
//   locales = [{ lang: "en-US", baseUrl: "https://us.example.com" },
//              { lang: "en-GB", baseUrl: "https://uk.example.com" }]
//   data = { city: "london" }
//
// Output: [
//   { lang: "en-US", url: "https://us.example.com/plumber-in-london" },
//   { lang: "en-GB", url: "https://uk.example.com/plumber-in-london" },
// ]
export function buildProgrammaticHreflang(
  slug: string,
  locales: Array<{ lang: string; baseUrl: string }>
): HreflangEntry[] {
  return locales
    .filter((l) => isValidBcp47(l.lang))
    .map(({ lang, baseUrl }) => ({
      lang,
      url: `${baseUrl.replace(/\/$/, "")}/${slug}`,
    }));
}

// Validate a BCP 47 language tag
// Accepts: "en", "en-US", "zh-Hans-CN", "fr-FR"
// Rejects: "english", "EN_US", empty strings
function isValidBcp47(lang: string): boolean {
  // BCP 47 subtag pattern: 2-8 alphanumeric chars separated by hyphens
  return /^[a-zA-Z]{2,8}(-[a-zA-Z0-9]{1,8})*$/.test(lang);
}

// Serialize hreflang entries to HTML <link> tags
export function serializeHreflangToHtml(entries: HreflangEntry[], defaultUrl: string): string {
  const lines = entries.map(
    ({ lang, url }) =>
      `  <link rel="alternate" hreflang="${escapeHtml(lang)}" href="${escapeHtml(url)}">`
  );

  // x-default must always be present
  const hasXDefault = entries.some((e) => e.lang === "x-default");
  if (!hasXDefault) {
    lines.push(`  <link rel="alternate" hreflang="x-default" href="${escapeHtml(defaultUrl)}">`);
  }

  return lines.join("\n");
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}
