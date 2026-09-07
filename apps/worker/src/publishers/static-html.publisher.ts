import { Publisher, PageToPublish, PublishResult } from "./publisher.interface";
import {
  generateMetaTags,
  serializeMetaTagsToHtml,
} from "@mpc/seo-utils";

// =============================================================================
// STATIC HTML PUBLISHER
//
// Generates a complete, self-contained HTML file for each page and
// uploads it to S3/R2. The file can then be served via CloudFront/CDN.
//
// Output structure in S3:
//   static/{orgId}/{projectId}/{slug}/index.html
//
// Why index.html in a folder?
//   Clean URLs: /plumber-in-austin/ instead of /plumber-in-austin.html
//   CloudFront + S3 static website hosting supports this natively.
//
// HTML structure:
//   - Full <!DOCTYPE html> document
//   - All meta tags (OG, Twitter, canonical, schema)
//   - Inline CSS reset (no external dependencies)
//   - Page content from template renderer
//   - JSON-LD schema scripts
//   - Internal links injected into content
//
// This publisher is used for:
//   - Standalone static sites
//   - CDN-hosted programmatic SEO pages
//   - Export for headless CMS ingestion
// =============================================================================

export interface StaticHtmlConfig {
  orgId: string;
  projectId: string;
  siteName?: string;
  defaultOgImage?: string;
  twitterSite?: string;
  // S3 upload function injected at runtime (avoids circular deps)
  uploadFn: (key: string, html: string) => Promise<string>; // returns public URL
}

export class StaticHtmlPublisher implements Publisher {
  validateConfig(config: Record<string, unknown>): string | null {
    const c = config as Partial<StaticHtmlConfig>;
    if (!c.orgId) return "orgId is required";
    if (!c.projectId) return "projectId is required";
    if (!c.uploadFn) return "uploadFn is required";
    return null;
  }

  async publish(page: PageToPublish, config: Record<string, unknown>): Promise<PublishResult> {
    const cfg = config as unknown as StaticHtmlConfig;

    try {
      const html = this.buildHtml(page, cfg);
      const s3Key = `static/${cfg.orgId}/${cfg.projectId}/${page.slug}/index.html`;
      const publicUrl = await cfg.uploadFn(s3Key, html);

      return { pageId: page.id, success: true, publishedUrl: publicUrl };
    } catch (err) {
      return {
        pageId: page.id,
        success: false,
        error: err instanceof Error ? err.message : "Upload failed",
      };
    }
  }

  // ── HTML builder ──────────────────────────────────────────────────────────

  private buildHtml(page: PageToPublish, cfg: StaticHtmlConfig): string {
    // If content is already a full HTML document, return it as-is — preserves all user <head> links
    const trimmed = page.content.trimStart();
    if (/^<!DOCTYPE\s+html/i.test(trimmed) || /^<html/i.test(trimmed)) {
      return page.content;
    }

    // Partial content — wrap in a minimal HTML document
    const metaOutput = generateMetaTags({
      title: page.title,
      description: page.description,
      canonicalUrl: page.canonicalUrl,
      slug: page.slug,
      focusKeyword: page.focusKeyword ?? undefined,
      siteName: cfg.siteName,
      ogImage: page.dataRow.og_image ?? page.dataRow.image ?? cfg.defaultOgImage,
      twitterSite: cfg.twitterSite,
      ogType: "website",
    });

    const metaHtml = serializeMetaTagsToHtml(metaOutput);
    const schemaHtml = this.buildSchemaScripts(page.schemaMarkups);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
${metaHtml}
${schemaHtml}
</head>
<body>
  <main class="container">
    ${page.content}
  </main>
</body>
</html>`;
  }

  private buildSchemaScripts(
    schemas: Array<{ type: string; data: Record<string, unknown> }>
  ): string {
    return schemas
      .map(
        (s) =>
          `  <script type="application/ld+json">\n  ${JSON.stringify(s.data)}\n  </script>`
      )
      .join("\n");
  }
}
