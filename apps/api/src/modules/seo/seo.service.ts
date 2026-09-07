import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bull";
import { Queue } from "bull";
import { PrismaService } from "../database/prisma.service";
import { SitemapJobPayload, QUEUE_NAMES } from "@mpc/queue";
import {
  generateMetaTags,
  serializeMetaTagsToHtml,
  serializeMetaTagsToNextJs,
  buildDefaultRobotsConfig,
  generateRobotsTxt,
  buildProgrammaticHreflang,
} from "@mpc/seo-utils";
import { UpdateSeoSettingsDto, UpdatePageSeoDto } from "./dto/seo-settings.dto";

// =============================================================================
// SEO SERVICE
//
// Responsibilities:
//   1. Generate and serve robots.txt for a project's domain
//   2. Preview meta tags for any generated page
//   3. Trigger sitemap regeneration
//   4. Run SEO audit across all pages in a project
//   5. Update per-page SEO overrides (title, description, noindex)
//   6. Serve hreflang configuration
//
// robots.txt and sitemaps are stored in S3 and served via CDN.
// They are regenerated on-demand or after each publish batch.
// =============================================================================

@Injectable()
export class SeoService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_NAMES.SITEMAP)
    private readonly sitemapQueue: Queue<SitemapJobPayload>
  ) {}

  // ── robots.txt ─────────────────────────────────────────────────────────────

  async generateAndStoreRobotsTxt(projectId: string, orgId: string): Promise<string> {
    const project = await this.getProject(projectId, orgId);
    const settings = (project.settings as Record<string, unknown>) ?? {};
    const seoSettings = (settings.seo as Record<string, unknown>) ?? {};

    const baseUrl = (seoSettings.baseUrl as string) ?? "https://example.com";

    // Get sitemap URL for this project
    const sitemap = await this.prisma.sitemap.findUnique({
      where: { projectId },
      select: { publicUrl: true },
    });

    const sitemapUrls = sitemap ? [sitemap.publicUrl] : [`${baseUrl}/sitemap.xml`];

    const config = buildDefaultRobotsConfig(sitemapUrls, {
      host: new URL(baseUrl).hostname,
      blockAiBots: (seoSettings.blockAiBots as boolean) ?? false,
      additionalDisallow: (seoSettings.additionalDisallowPaths as string[]) ?? [],
    });

    const robotsTxt = generateRobotsTxt(config);

    return robotsTxt;
  }

  // ── Meta tag preview ───────────────────────────────────────────────────────

  // Returns meta tags for a page in multiple formats
  // Used by the dashboard "SEO Preview" panel
  async getPageMetaPreview(
    pageId: string,
    orgId: string,
    format: "html" | "nextjs" | "json" = "json"
  ) {
    const page = await this.prisma.generatedPage.findFirst({
      where: { 
        id: pageId, 
        orgId, 
        OR: [
          { deletedAt: null },
          { deletedAt: { isSet: false } }
        ]
      },
      select: {
        title: true,
        slug: true,
        canonicalUrl: true,
        focusKeyword: true,
        projectId: true,
      },
    });

    if (!page) throw new NotFoundException("Page not found");

    const seoSettings = this.extractSeoSettings(
      (await this.prisma.project.findUnique({ where: { id: page.projectId }, select: { settings: true } }))?.settings
    );

    // Build hreflang if project has locale config
    const hreflangLocales = seoSettings.hreflangLocales as { lang: string; baseUrl: string }[] | undefined;
    const hreflang =
      hreflangLocales && hreflangLocales.length > 0
        ? buildProgrammaticHreflang(page.slug, hreflangLocales)
        : undefined;

    const metaInput = {
      title: page.title,
      description: page.title,
      canonicalUrl: page.canonicalUrl ?? `${seoSettings.baseUrl}/${page.slug}`,
      slug: page.slug,
      focusKeyword: page.focusKeyword ?? undefined,
      siteName: seoSettings.siteName as string | undefined,
      ogImage: seoSettings.defaultOgImage as string | undefined,
      twitterSite: seoSettings.twitterSite as string | undefined,
      hreflang,
    };

    const output = generateMetaTags(metaInput);

    if (format === "html") return { html: serializeMetaTagsToHtml(output) };
    if (format === "nextjs") return { metadata: serializeMetaTagsToNextJs(output) };
    return output;
  }

  // ── SEO settings ───────────────────────────────────────────────────────────

  async updateProjectSeoSettings(
    projectId: string,
    orgId: string,
    dto: UpdateSeoSettingsDto
  ) {
    const project = await this.getProject(projectId, orgId);
    const currentSettings = (project.settings as Record<string, unknown>) ?? {};

    return this.prisma.project.update({
      where: { id: projectId },
      data: {
        settings: {
          ...currentSettings,
          seo: {
            ...(currentSettings.seo as object ?? {}),
            ...dto,
          },
        } as any,
      },
      select: { id: true, settings: true },
    });
  }

  // Update SEO fields for a single page (manual override)
  async updatePageSeo(pageId: string, orgId: string, dto: UpdatePageSeoDto) {
    const page = await this.prisma.generatedPage.findFirst({
      where: { 
        id: pageId, 
        orgId, 
        OR: [
          { deletedAt: null },
          { deletedAt: { isSet: false } }
        ]
      },
    });
    if (!page) throw new NotFoundException("Page not found");

    return this.prisma.generatedPage.update({
      where: { id: pageId },
      data: {
        ...(dto.title && { title: dto.title }),
        ...(dto.focusKeyword && { focusKeyword: dto.focusKeyword }),
      },
      select: {
        id: true,
        title: true,
        slug: true,
        focusKeyword: true,
        seoScore: true,
      },
    });
  }

  // ── SEO audit ──────────────────────────────────────────────────────────────

  // Returns aggregate SEO health stats for a project
  // Used in the dashboard SEO overview panel
  async getProjectSeoAudit(projectId: string, orgId: string) {
    await this.getProject(projectId, orgId);

    const activePageWhere = {
      projectId,
      orgId,
      OR: [
        { deletedAt: null },
        { deletedAt: { isSet: false } },
      ],
    };

    const [total, byScore, missingTitle, missingKeyword, noSchema] =
      await Promise.all([
        this.prisma.generatedPage.count({
          where: activePageWhere,
        }),

        // Distribution of SEO scores
        this.prisma.generatedPage.groupBy({
          by: ["seoScore"],
          where: {
            ...activePageWhere,
            seoScore: { not: null },
          },
          _count: { id: true },
        }),

        // Pages with title < 30 chars or > 60 chars
        this.prisma.generatedPage.count({
          where: {
            ...activePageWhere,
            title: { equals: "" },
          },
        }),

        // Pages with no focus keyword (description not a DB column)
        this.prisma.generatedPage.count({
          where: {
            ...activePageWhere,
            focusKeyword: null,
          },
        }),

        // Pages with no schema markup
        this.prisma.generatedPage.count({
          where: {
            ...activePageWhere,
            schemaMarkups: {
              none: {},
            },
          },
        }),
      ]);

    // Bucket scores into ranges for the chart
    const scoreBuckets = { excellent: 0, good: 0, fair: 0, poor: 0 };
    for (const row of byScore) {
      const s = row.seoScore ?? 0;
      if (s >= 80) scoreBuckets.excellent += row._count.id;
      else if (s >= 60) scoreBuckets.good += row._count.id;
      else if (s >= 40) scoreBuckets.fair += row._count.id;
      else scoreBuckets.poor += row._count.id;
    }

    const avgScore =
      byScore.length > 0
        ? Math.round(
            byScore.reduce((sum, r) => sum + (r.seoScore ?? 0) * r._count.id, 0) /
              byScore.reduce((sum, r) => sum + r._count.id, 0)
          )
        : 0;

    return {
      totalPages: total,
      averageSeoScore: avgScore,
      scoreBuckets,
      issues: {
        missingTitle,
        missingDescription: 0,
        missingFocusKeyword: missingKeyword,
        noSchemaMarkup: noSchema,
      },
    };
  }

  // ── Schema markup ──────────────────────────────────────────────────────────

  async getPageSchemas(pageId: string, orgId: string) {
    const page = await this.prisma.generatedPage.findFirst({
      where: { 
        id: pageId, 
        orgId, 
        OR: [
          { deletedAt: null },
          { deletedAt: { isSet: false } }
        ]
      },
      select: { id: true },
    });
    if (!page) throw new NotFoundException("Page not found");

    return this.prisma.schemaMarkup.findMany({
      where: { pageId },
      select: { id: true, type: true, data: true, isValid: true, createdAt: true },
    });
  }

  // ── Sitemap ──────────────────────────────────────────────────────────────

  async enqueueSitemapRegeneration(projectId: string, orgId: string) {
    await this.getProject(projectId, orgId);
    await this.sitemapQueue.add(
      "generate-sitemap",
      { orgId, projectId },
      { attempts: 3, backoff: { type: "exponential", delay: 5000 }, removeOnComplete: 10 }
    );
    return { queued: true };
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async getProject(projectId: string, orgId: string) {
    const project = await this.prisma.project.findFirst({
      where: { 
        id: projectId, 
        orgId, 
        OR: [
          { deletedAt: null },
          { deletedAt: { isSet: false } }
        ]
      },
      select: { id: true, settings: true },
    });
    if (!project) throw new NotFoundException("Project not found");
    return project;
  }

  private extractSeoSettings(settings: unknown): Record<string, unknown> {
    const s = (settings as Record<string, unknown>) ?? {};
    return (s.seo as Record<string, unknown>) ?? {};
  }
}
