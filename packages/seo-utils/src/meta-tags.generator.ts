// =============================================================================
// META TAGS GENERATOR
//
// Generates all HTML <head> meta tags for a generated page:
//   - Standard: title, description, canonical, robots
//   - Open Graph: og:title, og:description, og:image, og:type, og:url
//   - Twitter Cards: twitter:card, twitter:title, twitter:description
//   - Pagination: rel=prev/next for paginated series
//
// Why centralize this?
// Meta tags are rendered in 3 places: static HTML export, Next.js head,
// and WordPress REST API. One generator = consistent output everywhere.
//
// Output is a plain object — each publisher formats it for their target.
// The Next.js publisher uses the Metadata API.
// The HTML publisher injects raw <meta> tags.
// The WordPress publisher maps to Yoast/RankMath fields.
// =============================================================================

export interface MetaTagInput {
  title: string;
  description: string;
  canonicalUrl: string;
  slug: string;
  focusKeyword?: string;

  // Open Graph
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  ogType?: "website" | "article" | "product";
  siteName?: string;

  // Twitter
  twitterCard?: "summary" | "summary_large_image";
  twitterSite?: string;   // @handle
  twitterCreator?: string;

  // Robots directives
  noIndex?: boolean;
  noFollow?: boolean;
  noArchive?: boolean;

  // Pagination
  prevUrl?: string;
  nextUrl?: string;

  // Hreflang — array of { lang, url }
  hreflang?: Array<{ lang: string; url: string }>;

  // Article-specific
  publishedTime?: string;
  modifiedTime?: string;
  author?: string;
}

export interface MetaTagOutput {
  // Rendered as <title>
  title: string;

  // All <meta> tags as key-value pairs
  meta: Array<{ name?: string; property?: string; content: string }>;

  // All <link> tags
  links: Array<{ rel: string; href: string; hreflang?: string }>;

  // Convenience: robots string e.g. "index, follow"
  robots: string;
}

export function generateMetaTags(input: MetaTagInput): MetaTagOutput {
  const meta: MetaTagOutput["meta"] = [];
  const links: MetaTagOutput["links"] = [];

  // ── Standard meta ─────────────────────────────────────────────────────────
  meta.push({ name: "description", content: input.description });

  if (input.focusKeyword) {
    meta.push({ name: "keywords", content: input.focusKeyword });
  }

  // ── Robots ────────────────────────────────────────────────────────────────
  // Build robots directive string from individual flags
  const robotsDirectives: string[] = [];
  robotsDirectives.push(input.noIndex ? "noindex" : "index");
  robotsDirectives.push(input.noFollow ? "nofollow" : "follow");
  if (input.noArchive) robotsDirectives.push("noarchive");
  const robots = robotsDirectives.join(", ");
  meta.push({ name: "robots", content: robots });

  // ── Canonical ─────────────────────────────────────────────────────────────
  // Canonical is critical for programmatic SEO — prevents duplicate content
  // penalties when the same page is accessible via multiple URLs.
  links.push({ rel: "canonical", href: input.canonicalUrl });

  // ── Open Graph ────────────────────────────────────────────────────────────
  // OG tags control how the page appears when shared on social media.
  // For programmatic SEO pages, og:title and og:description should match
  // the page title/description — don't create separate social copy.
  meta.push({ property: "og:title", content: input.ogTitle ?? input.title });
  meta.push({ property: "og:description", content: input.ogDescription ?? input.description });
  meta.push({ property: "og:url", content: input.canonicalUrl });
  meta.push({ property: "og:type", content: input.ogType ?? "website" });

  if (input.siteName) {
    meta.push({ property: "og:site_name", content: input.siteName });
  }

  if (input.ogImage) {
    meta.push({ property: "og:image", content: input.ogImage });
    // og:image:alt improves accessibility and is recommended by Facebook
    meta.push({ property: "og:image:alt", content: input.ogTitle ?? input.title });
  }

  // Article-specific OG tags
  if (input.ogType === "article") {
    if (input.publishedTime) {
      meta.push({ property: "article:published_time", content: input.publishedTime });
    }
    if (input.modifiedTime) {
      meta.push({ property: "article:modified_time", content: input.modifiedTime });
    }
    if (input.author) {
      meta.push({ property: "article:author", content: input.author });
    }
  }

  // ── Twitter Cards ─────────────────────────────────────────────────────────
  // summary_large_image when we have an OG image, summary otherwise
  const twitterCard = input.twitterCard ?? (input.ogImage ? "summary_large_image" : "summary");
  meta.push({ name: "twitter:card", content: twitterCard });
  meta.push({ name: "twitter:title", content: input.ogTitle ?? input.title });
  meta.push({ name: "twitter:description", content: input.ogDescription ?? input.description });

  if (input.twitterSite) {
    meta.push({ name: "twitter:site", content: input.twitterSite });
  }
  if (input.twitterCreator) {
    meta.push({ name: "twitter:creator", content: input.twitterCreator });
  }
  if (input.ogImage) {
    meta.push({ name: "twitter:image", content: input.ogImage });
  }

  // ── Pagination links ──────────────────────────────────────────────────────
  // rel=prev/next tells Google these pages are part of a series.
  // Important for paginated location/service listing pages.
  if (input.prevUrl) {
    links.push({ rel: "prev", href: input.prevUrl });
  }
  if (input.nextUrl) {
    links.push({ rel: "next", href: input.nextUrl });
  }

  // ── Hreflang ──────────────────────────────────────────────────────────────
  // Hreflang tells Google which language/region variant to serve.
  // Required when the same content exists in multiple languages.
  // Always include x-default pointing to the canonical language.
  if (input.hreflang && input.hreflang.length > 0) {
    for (const { lang, url } of input.hreflang) {
      links.push({ rel: "alternate", href: url, hreflang: lang });
    }
    // x-default = fallback for users whose language isn't listed
    const defaultEntry = input.hreflang.find((h) => h.lang === "en") ?? input.hreflang[0];
    links.push({ rel: "alternate", href: defaultEntry.url, hreflang: "x-default" });
  }

  return { title: input.title, meta, links, robots };
}

// ── HTML serializer ───────────────────────────────────────────────────────────
// Converts MetaTagOutput to raw HTML string for static export

export function serializeMetaTagsToHtml(output: MetaTagOutput): string {
  const lines: string[] = [];

  lines.push(`  <title>${escapeHtml(output.title)}</title>`);

  for (const tag of output.meta) {
    if (tag.name) {
      lines.push(`  <meta name="${escapeHtml(tag.name)}" content="${escapeHtml(tag.content)}">`);
    } else if (tag.property) {
      lines.push(`  <meta property="${escapeHtml(tag.property)}" content="${escapeHtml(tag.content)}">`);
    }
  }

  for (const link of output.links) {
    const hreflangAttr = link.hreflang ? ` hreflang="${escapeHtml(link.hreflang)}"` : "";
    lines.push(`  <link rel="${escapeHtml(link.rel)}" href="${escapeHtml(link.href)}"${hreflangAttr}>`);
  }

  return lines.join("\n");
}

// ── Next.js Metadata API serializer ──────────────────────────────────────────
// Converts MetaTagOutput to Next.js 13+ Metadata object shape

export function serializeMetaTagsToNextJs(output: MetaTagOutput): Record<string, unknown> {
  const ogMeta = output.meta.filter((m) => m.property?.startsWith("og:"));
  const twitterMeta = output.meta.filter((m) => m.name?.startsWith("twitter:"));

  const openGraph: Record<string, unknown> = {};
  for (const tag of ogMeta) {
    const key = tag.property!.replace("og:", "").replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    openGraph[key] = tag.content;
  }

  const twitter: Record<string, unknown> = {};
  for (const tag of twitterMeta) {
    const key = tag.name!.replace("twitter:", "").replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    twitter[key] = tag.content;
  }

  const canonical = output.links.find((l) => l.rel === "canonical");
  const alternates: Record<string, unknown> = {};
  const hreflangLinks = output.links.filter((l) => l.rel === "alternate" && l.hreflang);
  if (hreflangLinks.length > 0) {
    alternates.languages = Object.fromEntries(
      hreflangLinks.map((l) => [l.hreflang!, l.href])
    );
  }

  return {
    title: output.title,
    description: output.meta.find((m) => m.name === "description")?.content ?? "",
    robots: output.robots,
    alternates: {
      canonical: canonical?.href,
      ...alternates,
    },
    openGraph,
    twitter,
  };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
