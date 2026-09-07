import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { ProjectStatus } from "@mpc/shared";
import { PaginationParams } from "@mpc/shared";
import { existsSync } from "fs";
import { unlink } from "fs/promises";

@Injectable()
export class ProjectsRepository {
  constructor(private prisma: PrismaService) {}

  private readonly ALLOWED_SORT_FIELDS = new Set(["createdAt", "updatedAt", "name"]);

  async findAll(orgId: string, params: PaginationParams) {
    const { page, limit, search, sortOrder = "desc" } = params;
    const sortBy = this.ALLOWED_SORT_FIELDS.has(params.sortBy ?? "")
      ? params.sortBy!
      : "createdAt";
    const skip = (page - 1) * limit;

    const where: any = {
      orgId,
      status: "ACTIVE",
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" as const } },
              { description: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [total, items] = await Promise.all([
      this.prisma.project.count({ where }),
      this.prisma.project.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          _count: {
            select: { templates: true, dataSources: true },
          },
        },
      }),
    ]);

    return { items, total };
  }

  async findById(id: string, orgId: string) {
    return this.prisma.project.findFirst({
      where: { id, orgId },
      include: {
        _count: {
          select: { templates: true, dataSources: true },
        },
      },
    });
  }

  async create(orgId: string, data: {
    name: string;
    description?: string;
    settings?: Record<string, unknown>;
  }) {
    const slug = await this.generateSlug(data.name, orgId);
    return this.prisma.project.create({
      data: { ...data, orgId, slug, settings: data.settings as any },
    });
  }

  async update(id: string, orgId: string, data: {
    name?: string;
    description?: string;
    settings?: Record<string, unknown>;
  }) {
    return this.prisma.project.update({
      where: { id },
      data: { ...data, settings: data.settings as any, updatedAt: new Date() },
    });
  }

  async softDelete(id: string) {
    const now = new Date();
    // Fetch all HTML file paths before deleting DB records
    const pages = await this.prisma.generatedPage.findMany({
      where: { projectId: id, deletedAt: null },
      select: { filePath: true },
    });
    // Delete HTML files concurrently — silently skip missing files
    await Promise.allSettled(
      pages
        .filter((p) => p.filePath && existsSync(p.filePath))
        .map((p) => unlink(p.filePath!))
    );
    await this.prisma.generatedPage.updateMany({
      where: { projectId: id, deletedAt: null },
      data: { deletedAt: now },
    });
    return this.prisma.project.update({
      where: { id },
      data: { deletedAt: now, status: ProjectStatus.DELETED },
    });
  }

  private async generateSlug(name: string, orgId: string): Promise<string> {
    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50);
    const suffix = Math.random().toString(36).slice(2, 6);
    const slug = `${base}-${suffix}`;
    const exists = await this.prisma.project.findUnique({ where: { orgId_slug: { orgId, slug } } });
    return exists ? this.generateSlug(name, orgId) : slug;
  }
}
