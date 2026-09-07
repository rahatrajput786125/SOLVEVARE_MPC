import { Injectable, Logger } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

// =============================================================================
// SITEMAP GENERATOR
//
// Generates XML sitemaps for published pages.
// Google's sitemap limit: 50,000 URLs per file, 50MB uncompressed.
// For projects > 50K pages, we generate a sitemap index file that
// references multiple sitemap files.
//
// Strategy:
//   ≤ 50K pages  → single sitemap.xml
//   > 50K pages  → sitemap-index.xml + sitemap-1.xml, sitemap-2.xml, ...
//
// Stored in S3 at: sitemaps/{orgId}/{projectId}/sitemap.xml
// =============================================================================

const MAX_URLS_PER_SITEMAP = 50_000;
const SITEMAP_BATCH_SIZE = 1_000; // fetch pages in batches to avoid memory issues

export interface SitemapUrl {
  loc: string;
  lastmod?: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: number;
}

@Injectable()
export class SitemapGeneratorService {
  private readonly logger = new Logger(SitemapGeneratorService.name);

  constructor(private readonly prisma: PrismaClient) {}

  // Generate sitemap XML string for a project
  // Returns array of { filename, xml } — multiple files for large projects
  async generate(
    projectId: string,
    orgId: string,
    baseUrl: string
  ): Promise<Array<{ filename: string; xml: string; pageCount: number }>> {
    const totalPages = await this.prisma.generatedPage.count({
      where: { projectId, orgId, status: "PUBLISHED", deletedAt: null },
    });

    this.logger.log(`Generating sitemap for project ${projectId}: ${totalPages} pages`);

    if (totalPages === 0) {
      return [{ filename: "sitemap.xml", xml: this.buildEmptySitemap(), pageCount: 0 }];
    }

    if (totalPages <= MAX_URLS_PER_SITEMAP) {
      // Single sitemap file
      const urls = await this.fetchAllUrls(projectId, orgId, baseUrl);
      return [{
        filename: "sitemap.xml",
        xml: this.buildSitemapXml(urls),
        pageCount: urls.length,
      }];
    }

    // Multiple sitemap files + index
    const files: Array<{ filename: string; xml: string; pageCount: number }> = [];
    let fileIndex = 1;
    let offset = 0;

    while (offset < totalPages) {
      const urls = await this.fetchUrlsBatch(projectId, orgId, baseUrl, offset, MAX_URLS_PER_SITEMAP);
      if (urls.length === 0) break;

      files.push({
        filename: `sitemap-${fileIndex}.xml`,
        xml: this.buildSitemapXml(urls),
        pageCount: urls.length,
      });

      offset += MAX_URLS_PER_SITEMAP;
      fileIndex++;
    }

    // Build the sitemap index file
    const sitemapBaseUrl = `${baseUrl}/sitemaps`;
    const indexXml = this.buildSitemapIndex(
      files.map((f) => `${sitemapBaseUrl}/${f.filename}`)
    );

    files.unshift({
      filename: "sitemap-index.xml",
      xml: indexXml,
      pageCount: totalPages,
    });

    return files;
  }

  // ── XML builders ─────────────────────────────────────────────────────────

  buildSitemapXml(urls: SitemapUrl[]): string {
    const urlEntries = urls
      .map((url) => this.buildUrlEntry(url))
      .join("\n");

    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9
        http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">
${urlEntries}
</urlset>`;
  }

  buildSitemapIndex(sitemapUrls: string[]): string {
    const entries = sitemapUrls
      .map(
        (url) => `  <sitemap>
    <loc>${this.escapeXml(url)}</loc>
    <lastmod>${new Date().toISOString().split("T")[0]}</lastmod>
  </sitemap>`
      )
      .join("\n");

    return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</sitemapindex>`;
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private async fetchAllUrls(
    projectId: string,
    orgId: string,
    baseUrl: string
  ): Promise<SitemapUrl[]> {
    const urls: SitemapUrl[] = [];
    let offset = 0;

    while (true) {
      const batch = await this.fetchUrlsBatch(projectId, orgId, baseUrl, offset, SITEMAP_BATCH_SIZE);
      if (batch.length === 0) break;
      urls.push(...batch);
      offset += SITEMAP_BATCH_SIZE;
      if (batch.length < SITEMAP_BATCH_SIZE) break;
    }

    return urls;
  }

  private async fetchUrlsBatch(
    projectId: string,
    orgId: string,
    baseUrl: string,
    offset: number,
    limit: number
  ): Promise<SitemapUrl[]> {
    const pages = await this.prisma.generatedPage.findMany({
      where: { projectId, orgId, status: "PUBLISHED", deletedAt: null },
      select: { slug: true, updatedAt: true, seoScore: true },
      orderBy: { publishedAt: "desc" },
      skip: offset,
      take: limit,
    });

    return pages.map((page: { slug: string; updatedAt: Date; seoScore: number | null }) => ({
      loc: `${baseUrl.replace(/\/$/, "")}/${page.slug}`,
      lastmod: page.updatedAt.toISOString().split("T")[0],
      changefreq: "weekly" as const,
      // Higher SEO score = higher priority in sitemap
      priority: page.seoScore ? Math.round((page.seoScore / 100) * 0.8 * 10) / 10 + 0.1 : 0.5,
    }));
  }

  private buildUrlEntry(url: SitemapUrl): string {
    return `  <url>
    <loc>${this.escapeXml(url.loc)}</loc>
    ${url.lastmod ? `<lastmod>${url.lastmod}</lastmod>` : ""}
    ${url.changefreq ? `<changefreq>${url.changefreq}</changefreq>` : ""}
    ${url.priority !== undefined ? `<priority>${url.priority.toFixed(1)}</priority>` : ""}
  </url>`;
  }

  private buildEmptySitemap(): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
</urlset>`;
  }

  private escapeXml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }
}
