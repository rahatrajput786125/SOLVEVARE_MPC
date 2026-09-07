// =============================================================================
// ROBOTS.TXT GENERATOR
//
// Generates robots.txt content for a project's published pages.
//
// Why does this matter for programmatic SEO?
// When you generate 100K+ pages, you MUST control crawl budget.
// Google allocates a fixed crawl budget per domain. If you waste it
// on low-value pages (pagination, filters, duplicates), your important
// pages get crawled less frequently.
//
// Strategy:
//   - Allow all important content pages
//   - Disallow admin, API, and internal routes
//   - Set crawl-delay for bots that respect it (not Googlebot)
//   - Always include sitemap location
//
// One robots.txt per domain — not per project.
// If multiple projects share a domain, their rules are merged.
// =============================================================================

export interface RobotsRule {
  userAgent: string;          // "*" | "Googlebot" | "Bingbot" etc.
  allow?: string[];           // paths to explicitly allow
  disallow?: string[];        // paths to block
  crawlDelay?: number;        // seconds between requests (not respected by Google)
}

export interface RobotsConfig {
  rules: RobotsRule[];
  sitemapUrls: string[];      // full URLs to sitemap files
  host?: string;              // preferred domain (used by Yandex)
}

// Default rules for a SaaS-generated site
// These protect internal routes while allowing all content pages
const DEFAULT_DISALLOW = [
  "/api/",
  "/admin/",
  "/_next/",
  "/static/",
  "/*.json$",
  "/*?*",              // block all query string URLs — prevents duplicate content
];

export function generateRobotsTxt(config: RobotsConfig): string {
  const lines: string[] = [];

  // Write each user-agent block
  for (const rule of config.rules) {
    lines.push(`User-agent: ${rule.userAgent}`);

    // Allow directives come before Disallow (order matters for some parsers)
    for (const path of rule.allow ?? []) {
      lines.push(`Allow: ${path}`);
    }

    for (const path of rule.disallow ?? []) {
      lines.push(`Disallow: ${path}`);
    }

    if (rule.crawlDelay !== undefined) {
      lines.push(`Crawl-delay: ${rule.crawlDelay}`);
    }

    lines.push(""); // blank line between blocks
  }

  // Sitemap declarations — one per line
  for (const url of config.sitemapUrls) {
    lines.push(`Sitemap: ${url}`);
  }

  if (config.host) {
    lines.push(`Host: ${config.host}`);
  }

  return lines.join("\n").trim();
}

// Build a standard robots.txt for a programmatic SEO site
// Allows all content, blocks internal/technical routes
export function buildDefaultRobotsConfig(
  sitemapUrls: string[],
  options: {
    host?: string;
    additionalDisallow?: string[];
    blockAiBots?: boolean;       // block GPTBot, Claude, etc. from scraping
  } = {}
): RobotsConfig {
  const rules: RobotsRule[] = [
    {
      userAgent: "*",
      allow: ["/"],
      disallow: [
        ...DEFAULT_DISALLOW,
        ...(options.additionalDisallow ?? []),
      ],
    },
  ];

  // Googlebot gets its own block — no crawl-delay, full access to content
  // Googlebot ignores crawl-delay anyway, but explicit allow is good practice
  rules.push({
    userAgent: "Googlebot",
    allow: ["/"],
    disallow: ["/api/", "/admin/"],
  });

  // Block AI training bots if requested
  // These bots scrape content for LLM training — not for indexing
  if (options.blockAiBots) {
    const aiBots = [
      "GPTBot",           // OpenAI
      "ChatGPT-User",     // OpenAI ChatGPT browsing
      "CCBot",            // Common Crawl (used by many AI companies)
      "anthropic-ai",     // Anthropic Claude
      "Claude-Web",       // Anthropic
      "Google-Extended",  // Google Bard/Gemini training
      "PerplexityBot",    // Perplexity AI
    ];

    for (const bot of aiBots) {
      rules.push({
        userAgent: bot,
        disallow: ["/"],
      });
    }
  }

  return { rules, sitemapUrls, host: options.host };
}

// Parse existing robots.txt — used when merging rules from multiple projects
export function parseRobotsTxt(content: string): RobotsConfig {
  const rules: RobotsRule[] = [];
  const sitemapUrls: string[] = [];
  let host: string | undefined;

  let currentRule: RobotsRule | null = null;

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();

    // Skip comments and empty lines
    if (!line || line.startsWith("#")) {
      if (currentRule && line === "") {
        rules.push(currentRule);
        currentRule = null;
      }
      continue;
    }

    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;

    const directive = line.slice(0, colonIdx).trim().toLowerCase();
    const value = line.slice(colonIdx + 1).trim();

    switch (directive) {
      case "user-agent":
        if (currentRule) rules.push(currentRule);
        currentRule = { userAgent: value };
        break;
      case "allow":
        if (currentRule) {
          currentRule.allow = [...(currentRule.allow ?? []), value];
        }
        break;
      case "disallow":
        if (currentRule) {
          currentRule.disallow = [...(currentRule.disallow ?? []), value];
        }
        break;
      case "crawl-delay":
        if (currentRule) {
          currentRule.crawlDelay = parseInt(value, 10);
        }
        break;
      case "sitemap":
        sitemapUrls.push(value);
        break;
      case "host":
        host = value;
        break;
    }
  }

  if (currentRule) rules.push(currentRule);

  return { rules, sitemapUrls, host };
}
