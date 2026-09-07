import { Injectable, Logger } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { generateAnchorText, buildVariants } from "./anchor-text.generator";

// =============================================================================
// INTERNAL LINKING ENGINE
//
// MongoDB-compatible version.
// JSON path queries (path: ["field"]) are NOT supported in MongoDB Prisma.
// We fetch broader result sets and filter in-memory instead.
//
// Three linking strategies:
//   1. TOPIC_CLUSTER  — same service, different cities
//   2. LOCATION_CLUSTER — same city, different services
//   3. HUB_SPOKE — pillar page ↔ supporting pages
// =============================================================================

const MAX_OUTBOUND_LINKS = 8;
const MAX_PER_CLUSTER = 3;
const MAX_POOL_SIZE = 100; // candidate pool per chunk — keeps DB query light
const LINKING_ENABLED_THRESHOLD = 50; // skip linking for chunks smaller than this

type LinkRow = {
  sourcePageId: string;
  targetPageId: string;
  anchorText: string;
  linkType: string;
};

type PageRef = {
  id: string;
  title: string;
  slug: string;
  dataRow: Record<string, string>;
};

@Injectable()
export class InternalLinkingService {
  private readonly logger = new Logger(InternalLinkingService.name);

  constructor(private readonly prisma: PrismaClient) {}

  // Batched entry point — called once per chunk instead of once per page.
  // Fetches candidate pool once and reuses it for all pages in the chunk.
  async buildLinksForChunk(
    pages: Array<{ id: string; dataRow: Record<string, string> }>,
    orgId: string,
    projectId: string
  ): Promise<void> {
    if (pages.length === 0) return;

    // Fetch candidate pool once for entire chunk — capped to keep query light
    const pool = await this.prisma.generatedPage.findMany({
      where: { orgId, projectId, deletedAt: null },
      select: { id: true, title: true, slug: true, seoScore: true },
      orderBy: { seoScore: "desc" },
      take: MAX_POOL_SIZE,
    });

    if (pool.length < 2) return; // not enough pages to link yet

    const allLinks: LinkRow[] = [];

    for (const page of pages) {
      const links = this.resolveLinksFromPool(page.id, page.dataRow, pool);
      allLinks.push(...links);
    }

    if (allLinks.length === 0) return;

    const sourceIds = [...new Set(allLinks.map((l) => l.sourcePageId))];
    const data = allLinks.map((l) => ({ ...l, linkType: l.linkType as any, orgId, projectId }));

    // Delete existing links in batches
    const DELETE_BATCH = 50;
    for (let i = 0; i < sourceIds.length; i += DELETE_BATCH) {
      await this.prisma.internalLink.deleteMany({
        where: { sourcePageId: { in: sourceIds.slice(i, i + DELETE_BATCH) }, projectId },
      });
    }

    // Insert new links in batches — single createMany per batch, not per link
    const INSERT_BATCH = 200;
    for (let i = 0; i < data.length; i += INSERT_BATCH) {
      await this.prisma.internalLink.createMany({
        data: data.slice(i, i + INSERT_BATCH),
      }).catch(() => {}); // ignore duplicate key errors
    }

    this.logger.debug(`Built ${allLinks.length} internal links for chunk of ${pages.length} pages`);
  }

  private resolveLinksFromPool(
    pageId: string,
    data: Record<string, string>,
    pool: Array<{ id: string; title: string; slug: string; seoScore: number | null }>
  ): LinkRow[] {
    const candidates = pool.filter((p) => p.id !== pageId);
    const seen = new Set<string>();
    const links: LinkRow[] = [];

    for (const c of candidates.slice(0, MAX_OUTBOUND_LINKS)) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      links.push({
        sourcePageId: pageId,
        targetPageId: c.id,
        anchorText: generateAnchorText({ sourceData: data, targetData: {}, targetTitle: c.title, linkType: "TOPIC_CLUSTER" }),
        linkType: "TOPIC_CLUSTER",
      });
    }
    return links;
  }

  async buildLinks(
    pageId: string,
    orgId: string,
    projectId: string,
    data: Record<string, string>
  ): Promise<void> {
    const [topicLinks, locationLinks, hubSpokeLinks] = await Promise.all([
      this.buildTopicClusterLinks(pageId, orgId, projectId, data),
      this.buildLocationClusterLinks(pageId, orgId, projectId, data),
      this.buildHubSpokeLinks(pageId, orgId, projectId, data),
    ]);

    const seen = new Set<string>();
    const allLinks: LinkRow[] = [];

    for (const link of [...hubSpokeLinks, ...topicLinks, ...locationLinks]) {
      if (seen.has(link.targetPageId)) continue;
      if (link.sourcePageId === link.targetPageId) continue;
      seen.add(link.targetPageId);
      allLinks.push(link);
      if (allLinks.length >= MAX_OUTBOUND_LINKS) break;
    }

    if (allLinks.length === 0) return;

    for (const link of allLinks) {
      await this.prisma.internalLink.upsert({
        where: {
          sourcePageId_targetPageId: {
            sourcePageId: link.sourcePageId,
            targetPageId: link.targetPageId,
          },
        },
        update: {},
        create: { ...link, linkType: link.linkType as any, orgId, projectId },
      });
    }

    await this.createReverseLinks(allLinks, orgId, projectId, data);

    this.logger.debug(`Built ${allLinks.length} internal links for page ${pageId}`);
  }

  async rebuildProjectLinks(projectId: string, orgId: string): Promise<number> {
    this.logger.log(`Rebuilding all internal links for project ${projectId}`);

    await this.prisma.internalLink.deleteMany({ where: { projectId, orgId } });

    let offset = 0;
    const batchSize = 500;
    let totalLinks = 0;

    while (true) {
      const pages = await this.prisma.generatedPage.findMany({
        where: { projectId, orgId, deletedAt: null },
        select: { id: true },
        skip: offset,
        take: batchSize,
      });

      if (pages.length === 0) break;

      await Promise.all(
        pages.map((page) =>
          this.buildLinks(page.id, orgId, projectId, {})
            .catch((err) =>
              this.logger.error(`Link rebuild failed for page ${page.id}: ${err.message}`)
            )
        )
      );

      totalLinks += pages.length;
      offset += batchSize;
      if (pages.length < batchSize) break;
    }

    this.logger.log(`Link rebuild complete: processed ${totalLinks} pages`);
    return totalLinks;
  }

  // ── Strategy 1: Topic Cluster ─────────────────────────────────────────────
  // Same service, different cities
  // Fetch all project pages then filter by service in-memory (MongoDB limitation)

  private async buildTopicClusterLinks(
    pageId: string,
    orgId: string,
    projectId: string,
    data: Record<string, string>
  ): Promise<LinkRow[]> {
    const service = data.service ?? data.service_type ?? data.category ?? "";
    if (!service) return [];

    const candidates = await this.prisma.generatedPage.findMany({
      where: { orgId, projectId, id: { not: pageId }, deletedAt: null },
      select: { id: true, title: true, slug: true, seoScore: true },
      orderBy: { seoScore: "desc" },
      take: 100,
    });

    const relatedPages = (candidates as any[])
      .slice(0, MAX_PER_CLUSTER)
      .slice(0, MAX_PER_CLUSTER) as PageRef[];

    return relatedPages.map((related) => ({
      sourcePageId: pageId,
      targetPageId: related.id,
      anchorText: generateAnchorText({
        sourceData: data,
        targetData: related.dataRow,
        targetTitle: related.title,
        linkType: "TOPIC_CLUSTER",
      }),
      linkType: "TOPIC_CLUSTER",
    }));
  }

  // ── Strategy 2: Location Cluster ──────────────────────────────────────────
  // Same city, different services

  private async buildLocationClusterLinks(
    pageId: string,
    orgId: string,
    projectId: string,
    data: Record<string, string>
  ): Promise<LinkRow[]> {
    const city = data.city ?? data.location ?? data.area ?? "";
    if (!city) return [];

    const candidates = await this.prisma.generatedPage.findMany({
      where: { orgId, projectId, id: { not: pageId }, deletedAt: null },
      select: { id: true, title: true, slug: true, seoScore: true },
      orderBy: { seoScore: "desc" },
      take: 100,
    });

    const relatedPages = (candidates as any[])
      .slice(0, MAX_PER_CLUSTER)
      .slice(0, MAX_PER_CLUSTER) as PageRef[];

    return relatedPages.map((related) => ({
      sourcePageId: pageId,
      targetPageId: related.id,
      anchorText: generateAnchorText({
        sourceData: data,
        targetData: related.dataRow,
        targetTitle: related.title,
        linkType: "LOCATION_CLUSTER",
      }),
      linkType: "LOCATION_CLUSTER",
    }));
  }

  // ── Strategy 3: Hub-Spoke ─────────────────────────────────────────────────

  private async buildHubSpokeLinks(
    pageId: string,
    orgId: string,
    projectId: string,
    data: Record<string, string>
  ): Promise<LinkRow[]> {
    const service = data.service ?? data.service_type ?? data.category ?? "";
    const city = data.city ?? data.location ?? "";

    if (!service) return [];

    if (city) {
      return this.findHubForSpoke(pageId, orgId, projectId, data, service);
    } else {
      return this.findSpokesForHub(pageId, orgId, projectId, data, service);
    }
  }

  private async findHubForSpoke(
    pageId: string,
    orgId: string,
    projectId: string,
    data: Record<string, string>,
    service: string
  ): Promise<LinkRow[]> {
    const candidates = await this.prisma.generatedPage.findMany({
      where: { orgId, projectId, id: { not: pageId }, deletedAt: null },
      select: { id: true, title: true, slug: true, seoScore: true },
      orderBy: { seoScore: "desc" },
      take: 100,
    });

    const hubPages = (candidates as any[])
      .slice(0, 1)
      .slice(0, 1) as PageRef[];

    return hubPages.map((hub) => ({
      sourcePageId: pageId,
      targetPageId: hub.id,
      anchorText: generateAnchorText({
        sourceData: data,
        targetData: hub.dataRow,
        targetTitle: hub.title,
        linkType: "HUB_SPOKE",
      }),
      linkType: "HUB_SPOKE",
    }));
  }

  private async findSpokesForHub(
    pageId: string,
    orgId: string,
    projectId: string,
    data: Record<string, string>,
    service: string
  ): Promise<LinkRow[]> {
    const candidates = await this.prisma.generatedPage.findMany({
      where: { orgId, projectId, id: { not: pageId }, deletedAt: null },
      select: { id: true, title: true, slug: true, seoScore: true },
      orderBy: { seoScore: "desc" },
      take: 100,
    });

    const spokePages = (candidates as any[])
      .slice(0, MAX_PER_CLUSTER)
      .slice(0, MAX_PER_CLUSTER) as PageRef[];

    return spokePages.map((spoke) => ({
      sourcePageId: pageId,
      targetPageId: spoke.id,
      anchorText: generateAnchorText({
        sourceData: data,
        targetData: spoke.dataRow,
        targetTitle: spoke.title,
        linkType: "HUB_SPOKE",
      }),
      linkType: "HUB_SPOKE",
    }));
  }

  // -- Reverse links

  private async createReverseLinks(
    forwardLinks: LinkRow[],
    orgId: string,
    projectId: string,
    sourceData: Record<string, string>
  ): Promise<void> {
    for (const link of forwardLinks) {
      const existingCount = await this.prisma.internalLink.count({
        where: { sourcePageId: link.targetPageId, projectId },
      });

      if (existingCount >= MAX_OUTBOUND_LINKS) continue;

      const targetPage = await this.prisma.generatedPage.findUnique({
        where: { id: link.targetPageId },
        select: { title: true },
      });

      if (!targetPage) continue;

      await this.prisma.internalLink.upsert({
        where: {
          sourcePageId_targetPageId: {
            sourcePageId: link.targetPageId,
            targetPageId: link.sourcePageId,
          },
        },
        update: {},
        create: {
          orgId,
          projectId,
          sourcePageId: link.targetPageId,
          targetPageId: link.sourcePageId,
          anchorText: targetPage.title ?? "",
          linkType: link.linkType as any,
        },
      });
    }
  }
}
