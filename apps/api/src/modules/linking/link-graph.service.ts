import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bull";
import { Queue } from "bull";
import { PrismaService } from "../database/prisma.service";
import { QUEUE_NAMES } from "@mpc/queue";

// =============================================================================
// LINK GRAPH SERVICE
//
// The internal link graph is a directed graph:
//   Nodes = GeneratedPage
//   Edges = InternalLink (sourcePageId → targetPageId)
//
// This service provides:
//   1. Link stats per page (inbound count, outbound count, link types)
//   2. PageRank-style scoring — pages with more inbound links rank higher
//      in our internal "importance" score (used for sitemap priority)
//   3. Orphan page detection — pages with 0 inbound links
//   4. Link graph overview for the dashboard
//   5. Rebuild trigger — enqueues a worker job to rebuild all links
//
// PageRank implementation:
//   We use a simplified iterative PageRank (not the full Google algorithm).
//   Iterations: 20 (enough to converge for typical project sizes)
//   Damping factor: 0.85 (standard value)
//   This runs as a background job — not on every page view.
//
// Why store PageRank scores?
//   - Sitemap priority: high-PR pages get priority=0.9, low-PR get 0.3
//   - Internal link targeting: prefer linking TO high-PR pages
//   - Dashboard insights: show users which pages are most "important"
// =============================================================================

const PAGERANK_DAMPING = 0.85;
const PAGERANK_ITERATIONS = 20;
const PAGERANK_BATCH = 5000; // process this many nodes per iteration

@Injectable()
export class LinkGraphService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_NAMES.SITEMAP)
    private readonly sitemapQueue: Queue
  ) {}

  // ── Link stats for a single page ──────────────────────────────────────────

  async getPageLinkStats(pageId: string, orgId: string) {
    const page = await this.prisma.generatedPage.findFirst({
      where: { id: pageId, orgId, deletedAt: null },
      select: { id: true, title: true, slug: true },
    });
    if (!page) throw new NotFoundException("Page not found");

    const [outbound, inbound] = await Promise.all([
      this.prisma.internalLink.findMany({
        where: { sourcePageId: pageId },
        select: {
          anchorText: true,
          linkType: true,
          targetPage: { select: { slug: true, title: true } },
        },
      }),
      this.prisma.internalLink.findMany({
        where: { targetPageId: pageId },
        select: {
          anchorText: true,
          linkType: true,
          sourcePage: { select: { slug: true, title: true } },
        },
      }),
    ]);

    return {
      page: { id: page.id, title: page.title, slug: page.slug },
      outboundCount: outbound.length,
      inboundCount: inbound.length,
      outboundLinks: outbound,
      inboundLinks: inbound,
    };
  }

  // ── Project-level link graph overview ─────────────────────────────────────

  async getProjectLinkOverview(projectId: string, orgId: string) {
    // Verify project belongs to org
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, orgId, deletedAt: null },
      select: { id: true },
    });
    if (!project) throw new NotFoundException("Project not found");

    const [totalLinks, byType, orphanCount, totalPages] = await Promise.all([
      // Total link count
      this.prisma.internalLink.count({ where: { projectId, orgId } }),

      // Links by type
      this.prisma.internalLink.groupBy({
        by: ["linkType"],
        where: { projectId, orgId },
        _count: { id: true },
      }),

      // Orphan pages: pages with 0 inbound links
      this.prisma.generatedPage.count({
        where: {
          projectId,
          orgId,
          deletedAt: null,
          inboundLinks: {
            none: {},
          },
        },
      }).then(count => [{ count: BigInt(count) }]),

      this.prisma.generatedPage.count({
        where: { projectId, orgId, deletedAt: null },
      }),
    ]);

    // Average links per page
    const avgLinksPerPage = totalPages > 0
      ? Math.round((totalLinks / totalPages) * 10) / 10
      : 0;

    return {
      totalLinks,
      totalPages,
      avgLinksPerPage,
      orphanPages: Number((orphanCount[0] as { count: bigint })?.count ?? 0),
      byType: byType.map((r) => ({
        type: r.linkType,
        count: r._count.id,
      })),
    };
  }

  // ── Orphan pages ──────────────────────────────────────────────────────────
  // Pages with no inbound internal links — Google may not discover them

  async getOrphanPages(
    projectId: string,
    orgId: string,
    limit = 50
  ) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, orgId, deletedAt: null },
      select: { id: true },
    });
    if (!project) throw new NotFoundException("Project not found");

    // Standard Prisma query for pages with no inbound links
    return this.prisma.generatedPage.findMany({
      where: {
        projectId,
        orgId,
        deletedAt: null,
        inboundLinks: {
          none: {},
        },
      },
      select: {
        id: true,
        slug: true,
        title: true,
        seoScore: true,
      },
      orderBy: {
        seoScore: "desc",
      },
      take: limit,
    }) as any;
  }

  // ── PageRank calculation ───────────────────────────────────────────────────
  // Simplified iterative PageRank for a project's link graph.
  // Stores scores back into generated_pages.seo_score (weighted blend).
  // This is a heavy operation — run as a background job, not on-demand.

  async calculatePageRank(projectId: string, orgId: string): Promise<void> {
    // Fetch all pages and links for this project
    const [pages, links] = await Promise.all([
      this.prisma.generatedPage.findMany({
        where: { projectId, orgId, deletedAt: null },
        select: { id: true, seoScore: true },
      }),
      this.prisma.internalLink.findMany({
        where: { projectId, orgId },
        select: { sourcePageId: true, targetPageId: true },
      }),
    ]);

    if (pages.length === 0) return;

    const N = pages.length;
    const initialRank = 1 / N;

    // Initialize ranks
    const ranks = new Map<string, number>();
    for (const page of pages) {
      ranks.set(page.id, initialRank);
    }

    // Build adjacency: outbound link count per page
    const outboundCount = new Map<string, number>();
    for (const link of links) {
      outboundCount.set(
        link.sourcePageId,
        (outboundCount.get(link.sourcePageId) ?? 0) + 1
      );
    }

    // Build inbound link map: targetId → [sourceId, ...]
    const inboundMap = new Map<string, string[]>();
    for (const link of links) {
      const existing = inboundMap.get(link.targetPageId) ?? [];
      existing.push(link.sourcePageId);
      inboundMap.set(link.targetPageId, existing);
    }

    // Iterative PageRank
    for (let iter = 0; iter < PAGERANK_ITERATIONS; iter++) {
      const newRanks = new Map<string, number>();

      for (const page of pages) {
        const inbound = inboundMap.get(page.id) ?? [];

        // Sum of (rank / outbound_count) for all pages linking to this page
        const inboundSum = inbound.reduce((sum, sourceId) => {
          const sourceRank = ranks.get(sourceId) ?? 0;
          const sourceOutbound = outboundCount.get(sourceId) ?? 1;
          return sum + sourceRank / sourceOutbound;
        }, 0);

        // PageRank formula: (1 - d) / N + d * sum
        newRanks.set(
          page.id,
          (1 - PAGERANK_DAMPING) / N + PAGERANK_DAMPING * inboundSum
        );
      }

      // Update ranks for next iteration
      for (const [id, rank] of newRanks) {
        ranks.set(id, rank);
      }
    }

    // Normalize ranks to 0-100 scale and blend with existing SEO score
    const maxRank = Math.max(...ranks.values());
    const updates: Array<{ id: string; score: number }> = [];

    for (const page of pages) {
      const normalizedRank = maxRank > 0
        ? Math.round((ranks.get(page.id) ?? 0) / maxRank * 100)
        : 0;

      // Blend: 70% existing SEO score + 30% PageRank
      // This prevents PageRank from overriding content quality signals
      const blended = Math.round(
        (page.seoScore ?? 50) * 0.7 + normalizedRank * 0.3
      );

      updates.push({ id: page.id, score: blended });
    }

    // Batch update in chunks to avoid massive single query
    for (let i = 0; i < updates.length; i += PAGERANK_BATCH) {
      const chunk = updates.slice(i, i + PAGERANK_BATCH);
      await Promise.all(
        chunk.map((u) =>
          this.prisma.generatedPage.update({
            where: { id: u.id },
            data: { seoScore: u.score },
          })
        )
      );
    }
  }

  // ── Rebuild trigger ───────────────────────────────────────────────────────
  // Enqueues a sitemap job which also triggers link rebuild in the worker

  async triggerLinkRebuild(projectId: string, orgId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, orgId, deletedAt: null },
      select: { id: true },
    });
    if (!project) throw new NotFoundException("Project not found");

    // We reuse the sitemap queue with a special job name for link rebuild
    await this.sitemapQueue.add(
      "rebuild-links",
      { orgId, projectId },
      { attempts: 2, removeOnComplete: 5 }
    );

    return { queued: true, message: "Link rebuild job enqueued" };
  }
}
