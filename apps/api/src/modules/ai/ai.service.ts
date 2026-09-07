import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { UpdateAiSettingsDto } from "./dto/ai-settings.dto";
import { PaginationParams } from "@mpc/shared";

@Injectable()
export class AiService {
  constructor(private readonly prisma: PrismaService) {}

  // Get AI usage stats for an org — used in the billing/analytics dashboard
  async getUsageStats(orgId: string, days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const [totalGenerations, totalTokens, totalCost, byModel, byPlaceholder] =
      await Promise.all([
        // Total generation count
        this.prisma.aiGeneration.count({
          where: { orgId, createdAt: { gte: since } },
        }),

        // Total tokens used
        this.prisma.aiGeneration.aggregate({
          where: { orgId, createdAt: { gte: since } },
          _sum: { totalTokens: true, costUsd: true },
        }),

        // Cost by day (for chart)
        this.prisma.aiGeneration.groupBy({
          by: ["model"],
          where: { orgId, createdAt: { gte: since } },
          _sum: { totalTokens: true, costUsd: true },
          _count: { id: true },
        }),

        // Breakdown by model
        this.prisma.aiGeneration.groupBy({
          by: ["model"],
          where: { orgId, createdAt: { gte: since } },
          _sum: { costUsd: true },
          _count: { id: true },
        }),

        // Breakdown by placeholder type
        this.prisma.aiGeneration.groupBy({
          by: ["placeholder"],
          where: { orgId, createdAt: { gte: since } },
          _count: { id: true },
        }),
      ]);

    // Cache hit rate
    const cacheHits = await this.prisma.aiGeneration.count({
      where: { orgId, status: "CACHED", createdAt: { gte: since } },
    });

    const cacheHitRate =
      totalGenerations > 0
        ? Math.round((cacheHits / totalGenerations) * 100)
        : 0;

    return {
      totalGenerations,
      totalTokens: totalTokens._sum.totalTokens ?? 0,
      totalCostUsd: Number((totalTokens._sum.costUsd ?? 0).toFixed(4)),
      cacheHitRate,
      byModel: (totalCost as any).map((m: any) => ({
        model: m.model,
        count: m._count.id,
        costUsd: Number((m._sum.costUsd ?? 0).toFixed(4)),
        tokens: m._sum.totalTokens ?? 0,
      })),
      byPlaceholder: byPlaceholder.map((p: { placeholder: string; _count: { id: number } }) => ({
        placeholder: p.placeholder,
        count: p._count.id,
      })),
    };
  }

  // Get AI generations for a specific page
  async getPageGenerations(pageId: string, orgId: string) {
    const page = await this.prisma.generatedPage.findFirst({
      where: { id: pageId, orgId },
      select: { id: true },
    });
    if (!page) throw new NotFoundException("Page not found");

    return this.prisma.aiGeneration.findMany({
      where: { pageId },
      select: {
        id: true,
        placeholder: true,
        model: true,
        status: true,
        qualityScore: true,
        totalTokens: true,
        costUsd: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  // Update AI settings for a project
  async updateProjectAiSettings(
    projectId: string,
    orgId: string,
    dto: UpdateAiSettingsDto
  ) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, orgId, deletedAt: null },
    });
    if (!project) throw new NotFoundException("Project not found");

    const currentSettings = (project.settings as Record<string, unknown>) ?? {};

    return this.prisma.project.update({
      where: { id: projectId },
      data: {
        settings: {
          ...currentSettings,
          ai: {
            defaultModel: dto.defaultModel,
            temperature: dto.temperature,
            maxTokens: dto.maxTokens,
            promptOverrides: dto.promptOverrides,
            enabledPlaceholders: dto.enabledPlaceholders,
          },
        },
      },
      select: { id: true, settings: true },
    });
  }

  // List recent AI generations with quality scores
  async listGenerations(orgId: string, params: PaginationParams) {
    const { page, limit } = params;
    const skip = (page - 1) * limit;

    const [total, items] = await Promise.all([
      this.prisma.aiGeneration.count({ where: { orgId } }),
      this.prisma.aiGeneration.findMany({
        where: { orgId },
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          placeholder: true,
          model: true,
          status: true,
          qualityScore: true,
          totalTokens: true,
          costUsd: true,
          createdAt: true,
          page: { select: { slug: true, title: true } },
        },
      }),
    ]);

    return {
      items,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }
}
