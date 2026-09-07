// =============================================================================
// ANCHOR TEXT GENERATOR
//
// Why anchor text matters for SEO:
// Google uses anchor text as a strong signal for what the linked page is about.
// If every internal link says "Click here" → wasted signal.
// If every link says the exact same keyword → over-optimization penalty.
//
// Strategy: generate 3-5 anchor text variants per link, pick one randomly.
// This creates natural variation across thousands of pages.
//
// Anchor text types (in order of SEO value):
//   1. Exact match:   "plumber in Austin"          → strongest signal, use sparingly
//   2. Partial match: "Austin plumbing services"   → natural, safe
//   3. Branded:       "AcmePlumbing Austin"         → brand + location
//   4. Descriptive:   "local plumbing experts"      → generic but natural
//   5. Title-based:   page.title (truncated)        → always available fallback
//
// Rule: never use the same anchor text for more than 30% of links to a page.
// This is enforced at the link-building level, not here.
// =============================================================================

export interface AnchorTextContext {
  sourceData: Record<string, string>;   // data row of the SOURCE page
  targetData: Record<string, string>;   // data row of the TARGET page
  targetTitle: string;
  linkType: "TOPIC_CLUSTER" | "LOCATION_CLUSTER" | "HUB_SPOKE" | "SEMANTIC";
}

export function generateAnchorText(ctx: AnchorTextContext): string {
  const variants = buildVariants(ctx);
  // Pick deterministically based on source+target combo — same pair always
  // gets the same anchor text (important for crawl consistency)
  const seed = simpleHash((ctx.sourceData.slug ?? "") + (ctx.targetData.slug ?? ""));
  return variants[seed % variants.length];
}

export function buildVariants(ctx: AnchorTextContext): string[] {
  const { targetData, targetTitle, linkType } = ctx;

  const city = targetData.city ?? targetData.location ?? "";
  const service = targetData.service ?? targetData.service_type ?? targetData.category ?? "";
  const brand = targetData.brand ?? targetData.business_name ?? "";

  const variants: string[] = [];

  // Always include title as fallback
  const shortTitle = targetTitle.length > 60
    ? targetTitle.slice(0, 57).trimEnd() + "..."
    : targetTitle;
  variants.push(shortTitle);

  if (linkType === "TOPIC_CLUSTER") {
    // Same service, different locations — anchor should mention the service
    if (service && city) {
      variants.push(`${service} in ${city}`);
      variants.push(`${city} ${service} services`);
      variants.push(`${service} services near ${city}`);
    } else if (service) {
      variants.push(`${service} services`);
      variants.push(`professional ${service}`);
    }
  }

  if (linkType === "LOCATION_CLUSTER") {
    // Same location, different services — anchor should mention the location
    if (city && service) {
      variants.push(`${city} ${service}`);
      variants.push(`services in ${city}`);
      variants.push(`${city} local services`);
    } else if (city) {
      variants.push(`services in ${city}`);
      variants.push(`${city} area`);
    }
  }

  if (linkType === "HUB_SPOKE") {
    // Hub → spoke: anchor describes the specific spoke topic
    if (service && city) {
      variants.push(`${service} in ${city}`);
      variants.push(`learn about ${service} in ${city}`);
    }
    // Spoke → hub: anchor is more generic
    if (brand) {
      variants.push(`${brand} services`);
      variants.push(`more ${service} information`);
    }
  }

  if (linkType === "SEMANTIC") {
    // Semantically related — use descriptive anchors
    if (service) {
      variants.push(`related ${service} services`);
      variants.push(`similar ${service} options`);
    }
  }

  // Branded variants (if brand available)
  if (brand && city) {
    variants.push(`${brand} in ${city}`);
  }

  // Deduplicate and filter empty
  return [...new Set(variants.filter((v) => v.trim().length > 0))];
}

// Simple deterministic hash — same input always returns same number
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}
