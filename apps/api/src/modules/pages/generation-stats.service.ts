import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";

@Injectable()
export class GenerationStatsService {
  constructor(private prisma: PrismaService) {}

  async getStats(orgId: string, projectId: string) {
    const where = {
      orgId,
      projectId,
      OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
    };

    const counts = await this.prisma.generatedPage.groupBy({
      by: ["status"],
      where,
      _count: { status: true },
    });

    const stats: Record<string, number> = {};
    for (const row of counts) {
      stats[row.status.toLowerCase()] = row._count.status;
    }

    const total = Object.values(stats).reduce((sum, n) => sum + n, 0);
    return { ...stats, total };
  }

  async getRecentActivity(orgId: string, projectId: string, limit = 10) {
    return this.prisma.generatedPage.findMany({
      where: {
        orgId,
        projectId,
        OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
      },
      select: {
        id: true,
        slug: true,
        title: true,
        status: true,
        seoScore: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }
}
