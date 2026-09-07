import { Injectable } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

// =============================================================================
// SLUG DEDUPLICATION SERVICE
//
// Problem: two CSV rows might produce the same slug.
// Example: "New York" and "new york" both → "new-york"
//
// Strategy: check if slug exists, append counter if it does.
// "plumber-in-new-york" → "plumber-in-new-york-2" → "plumber-in-new-york-3"
//
// Why not UUID suffix? UUID slugs are ugly and hurt SEO.
// Counter suffix is clean and still keyword-rich.
//
// Performance: we check existence with a single indexed query.
// The @@unique([projectId, slug]) index makes this O(log n).
// =============================================================================

@Injectable()
export class SlugDeduplicationService {
  constructor(private readonly prisma: PrismaClient) {}

  async deduplicate(slug: string, projectId: string, templateId: string): Promise<string> {
    const exists = await this.prisma.generatedPage.findUnique({
      where: { projectId_templateId_slug: { projectId, templateId, slug } },
      select: { id: true },
    });

    if (!exists) return slug; // no collision

    // Find the highest existing counter for this base slug
    const similar = await this.prisma.generatedPage.findMany({
      where: {
        projectId,
        slug: { startsWith: slug },
      },
      select: { slug: true },
    });

    // Extract counter numbers from existing slugs
    const counters = similar
      .map((p: { slug: string }) => {
        const match = p.slug.match(new RegExp(`^${this.escapeRegex(slug)}-(\\d+)$`));
        return match ? parseInt(match[1], 10) : 0;
      })
      .filter((n: number) => n > 0);

    const nextCounter = counters.length > 0 ? Math.max(...counters) + 1 : 2;
    return `${slug}-${nextCounter}`;
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}
