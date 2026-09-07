import { Injectable, NotFoundException, ForbiddenException, Logger } from "@nestjs/common";
import { readFile, unlink } from "fs/promises";
import { existsSync } from "fs";
import { PrismaService } from "../database/prisma.service";
import { FilterPagesDto } from "./dto/pages.dto";
import { PaginationParams, PageStatus } from "@mpc/shared";
import { assertPagesPathSafe } from "../../common/utils/path-guard";
import { escapeHtml } from "../../common/utils/xss";

// Metadata-only select — no HTML content, no dataRow
const PAGE_META_SELECT = {
  id: true,
  slug: true,
  title: true,
  filePath: true,
  templateId: true,
  status: true,
  seoScore: true,
  publishedUrl: true,
  publishedAt: true,
  canonicalUrl: true,
  focusKeyword: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class PagesService {
  private readonly logger = new Logger(PagesService.name);

  constructor(private prisma: PrismaService) {}

  async getTemplateGroups(orgId: string, projectId: string) {
    const templates = await this.prisma.template.findMany({
      where: { orgId, projectId, OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] },
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    });

    const groups = await Promise.all(
      templates.map(async (t) => {
        const totalPages = await this.prisma.generatedPage.count({
          where: { orgId, projectId, templateId: t.id, OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] },
        });
        return { templateId: t.id, templateName: t.name, totalPages };
      })
    );

    return groups;
  }

  async findByTemplate(orgId: string, projectId: string, templateId: string, params: PaginationParams, filters: FilterPagesDto) {
    const { page, limit, search } = params;
    const skip = (page - 1) * limit;

    const where: any = {
      orgId, projectId, templateId,
      OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
      ...(filters.status ? { status: filters.status } : {}),
      ...(search ? { OR: [
        { title: { contains: search, mode: "insensitive" as const } },
        { slug: { contains: search, mode: "insensitive" as const } },
      ]} : {}),
    };

    const [total, items] = await Promise.all([
      this.prisma.generatedPage.count({ where }),
      this.prisma.generatedPage.findMany({
        where, skip, take: limit,
        orderBy: { createdAt: "desc" },
        select: PAGE_META_SELECT,
      }),
    ]);

    return { items, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findAll(orgId: string, projectId: string, params: PaginationParams, filters: FilterPagesDto) {
    const { page, limit, search } = params;
    const skip = (page - 1) * limit;

    const where: any = {
      orgId, projectId,
      OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.templateId ? { templateId: filters.templateId } : {}),
      ...(search ? { OR: [
        { title: { contains: search, mode: "insensitive" as const } },
        { slug: { contains: search, mode: "insensitive" as const } },
      ]} : {}),
    };

    const [total, items] = await Promise.all([
      this.prisma.generatedPage.count({ where }),
      this.prisma.generatedPage.findMany({
        where, skip, take: limit,
        orderBy: { createdAt: "desc" },
        select: PAGE_META_SELECT,
      }),
    ]);

    return { items, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findById(id: string, orgId: string) {
    const page = await this.prisma.generatedPage.findFirst({
      where: { id, orgId, OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] },
      include: {
        aiGenerations: { select: { placeholder: true, response: true, status: true } },
        schemaMarkups: true,
        _count: { select: { outboundLinks: true, inboundLinks: true } },
      },
    }) as any;

    if (!page) throw new NotFoundException("Page not found");

    // Read HTML from disk — not stored in Mongo
    // assertPagesPathSafe guards against a corrupted/tampered filePath in the DB
    let html: string | null = null;
    if (page.filePath) {
      try {
        assertPagesPathSafe(page.filePath);
        if (existsSync(page.filePath)) {
          html = await readFile(page.filePath, "utf-8");
        }
      } catch {
        html = null; // path traversal attempt or missing root — return no content
      }
    }

    // Escape user-generated text fields before returning to the API consumer
    return {
      ...page,
      title: escapeHtml(page.title ?? ""),
      slug: escapeHtml(page.slug ?? ""),
      content: html,
    };
  }

  async deleteByTemplate(orgId: string, projectId: string, templateId: string) {
    const pages = await this.prisma.generatedPage.findMany({
      where: { orgId, projectId, templateId, OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] },
      select: { id: true, filePath: true },
    });
    // Heavy cleanup can take much longer than the UI can tolerate.
    // Start it asynchronously so the request returns quickly.
    void this.deletePagesInBackground(pages);

    this.logger.log(`Delete started for ${pages.length} pages for templateId=${templateId}`);
    return {
      deleted: pages.length,
      status: "queued",
      message: "Template page deletion started in background",
    };
  }

  async deleteEmptyDraftPages(orgId: string, projectId: string) {
    const pages = await this.prisma.generatedPage.findMany({
      where: {
        orgId, projectId, status: PageStatus.DRAFT,
        OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
      },
      select: { id: true, filePath: true },
    });
    // Heavy cleanup can take much longer than the UI can tolerate.
    // Start it asynchronously so the request returns quickly.
    void this.deletePagesInBackground(pages);

    this.logger.log(`Delete started for ${pages.length} draft pages for project ${projectId}`);
    return {
      deleted: pages.length,
      status: "queued",
      message: "Draft page deletion started in background",
    };
  }

  async applyCanonicalUrls(orgId: string, projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { settings: true },
    });
    const seoSettings = ((project?.settings as any)?.seo ?? {}) as Record<string, string>;
    const baseUrl = (seoSettings.baseUrl ?? "").replace(/\/$/, "");
    if (!baseUrl) throw new Error("Base URL not set. Please save SEO settings first.");

    const pages = await this.prisma.generatedPage.findMany({
      where: { orgId, projectId, OR: [{ canonicalUrl: null }, { canonicalUrl: "" }] },
      select: { id: true, slug: true },
    });

    let updated = 0;
    for (const p of pages) {
      await this.prisma.generatedPage.update({
        where: { id: p.id },
        data: { canonicalUrl: `${baseUrl}/${p.slug}` },
      });
      updated++;
    }

    this.logger.log(`Applied canonical URLs to ${updated} pages for project ${projectId}`);
    return { updated, baseUrl };
  }

  async bulkDelete(orgId: string, ids: string[]) {
    const pages = await this.prisma.generatedPage.findMany({
      where: { id: { in: ids }, orgId, OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] },
      select: { id: true, filePath: true },
    });
    if (pages.length !== ids.length) throw new ForbiddenException("One or more pages not found or access denied");

    // Heavy cleanup can take much longer than the UI can tolerate.
    // Start it asynchronously so the request returns quickly.
    void this.deletePagesInBackground(pages);

    return {
      deleted: ids.length,
      status: "queued",
      message: "Page deletion started in background",
    };
  }

  // ── Internal ─────────────────────────────────────────────────────────────

  private async deletePagesInBackground(pages: Array<{ id: string; filePath: string | null }>) {
    try {
      await this.deleteFiles(pages.map((p) => p.filePath));

      const BATCH = 100;
      const pageIds = pages.map((p) => p.id);
      for (let i = 0; i < pageIds.length; i += BATCH) {
        const batch = pageIds.slice(i, i + BATCH);
        await Promise.all([
          this.deleteManyWithRetry("internalLink", { sourcePageId: { in: batch } }),
          this.deleteManyWithRetry("internalLink", { targetPageId: { in: batch } }),
          this.deleteManyWithRetry("schemaMarkup", { pageId: { in: batch } }),
          this.deleteManyWithRetry("aiGeneration", { pageId: { in: batch } }),
        ]);
        await this.prisma.generatedPage.updateMany({
          where: { id: { in: batch } },
          data: { deletedAt: new Date(), status: PageStatus.ARCHIVED },
        });
      }

      this.logger.log(`Background delete completed for ${pages.length} pages`);
    } catch (err) {
      this.logger.error(
        `Background delete failed for ${pages.length} pages`,
        err instanceof Error ? err.stack : String(err)
      );
    }
  }

  /** Delete HTML files from disk, silently skipping missing or unsafe files. */
  private async deleteManyWithRetry(
    model: "internalLink" | "schemaMarkup" | "aiGeneration" | "generatedPage",
    where: Record<string, unknown>
  ) {
    const maxAttempts = 3;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await (this.prisma as any)[model].deleteMany({ where });
      } catch (err) {
        lastError = err;
        const message = (err as Error).message || "";
        const isTimeout = message.includes("TransactionExceededLifetimeLimitSeconds") ||
          message.includes("transaction exceeded") ||
          message.includes("TransactionExceeded");

        if (!isTimeout || attempt === maxAttempts) {
          throw err;
        }

        const waitMs = 250 * attempt;
        this.logger.warn(
          `Retrying ${model} delete after timeout (attempt ${attempt}/${maxAttempts}) in ${waitMs}ms`
        );
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
    }

    throw lastError;
  }

  async deleteFiles(filePaths: (string | null)[]): Promise<void> {
    await Promise.allSettled(
      filePaths
        .filter((p): p is string => !!p)
        .map(async (p) => {
          try {
            assertPagesPathSafe(p);
            if (existsSync(p)) await unlink(p);
          } catch {
            // Silently skip: file missing or path failed safety check
          }
        })
    );
  }
}
