import {
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { CreateTemplateDto, UpdateTemplateDto } from "./dto/template.dto";
import { PreviewTemplateDto } from "./dto/preview.dto";
import { PaginationParams } from "@mpc/shared";
import { TemplateEngine } from "@mpc/template-engine";

@Injectable()
export class TemplatesService {
  private engine = new TemplateEngine();

  constructor(private prisma: PrismaService) {}

  async findAll(orgId: string, projectId: string, params: PaginationParams) {
    const { page, limit, search } = params;
    const skip = (page - 1) * limit;

    const where = {
      orgId,
      projectId,
      OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
      ...(search ? { name: { contains: search, mode: "insensitive" as const } } : {}),
    };

    const [total, items] = await Promise.all([
      this.prisma.template.count({ where }),
      this.prisma.template.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: { variables: true, _count: { select: { pages: true } } },
      }),
    ]);

    return { items, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findById(id: string, orgId: string) {
    const template = await this.prisma.template.findFirst({
      where: { id, orgId, OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] },
      include: { variables: true },
    });
    if (!template) throw new NotFoundException("Template not found");
    return template;
  }

  // Extract mpc-* meta tags from HTML content
  private extractMetaTags(html: string): { slug?: string; title?: string; description?: string } {
    const slug = html.match(/<meta\s+name=["']mpc-slug["']\s+content=["']([^"']+)["']/i)?.[1]
      ?? html.match(/<meta\s+content=["']([^"']+)["']\s+name=["']mpc-slug["']/i)?.[1];
    const title = html.match(/<meta\s+name=["']mpc-title["']\s+content=["']([^"']+)["']/i)?.[1]
      ?? html.match(/<meta\s+content=["']([^"']+)["']\s+name=["']mpc-title["']/i)?.[1]
      ?? html.match(/<title>([^<]+)<\/title>/i)?.[1];
    const description = html.match(/<meta\s+name=["']mpc-description["']\s+content=["']([^"']+)["']/i)?.[1]
      ?? html.match(/<meta\s+content=["']([^"']+)["']\s+name=["']mpc-description["']/i)?.[1]
      ?? html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i)?.[1]
      ?? html.match(/<meta\s+content=["']([^"']+)["']\s+name=["']description["']/i)?.[1];
    return { slug, title, description };
  }

  async create(orgId: string, dto: CreateTemplateDto) {
    const content = dto.content ?? "";
    const detected = this.extractMetaTags(content);
    const titleTemplate = dto.titleTemplate || detected.title || "";
    const descriptionTemplate = dto.descriptionTemplate || detected.description || "";
    const slugTemplate = dto.slugTemplate || detected.slug || "";
    const schemaTemplate = (dto.schemaTemplate ?? null) as Prisma.InputJsonValue | null;

    const template = await this.prisma.template.create({
      data: {
        orgId,
        projectId: dto.projectId ?? "",
        name: dto.name,
        description: dto.description,
        content,
        headContent: dto.headContent,
        titleTemplate,
        descriptionTemplate,
        slugTemplate,
        schemaTemplate,
        version: 1,
        variables: dto.variables ? { create: dto.variables } : undefined,
      },
      include: { variables: true },
    });

    // Version snapshot — sequential write, no transaction (MongoDB standalone)
    await this.prisma.templateVersion.create({
      data: {
        templateId: template.id,
        version: 1,
        content,
        titleTemplate,
        descriptionTemplate,
        slugTemplate,
        schemaTemplate,
      },
    }).catch(() => {}); // non-fatal — template already created

    return template;
  }

  async update(id: string, orgId: string, dto: UpdateTemplateDto) {
    const existing = await this.findById(id, orgId);
    const newVersion = existing.version + 1;
    const content = dto.content ?? existing.content;
    const detected = this.extractMetaTags(content);
    const titleTemplate = dto.titleTemplate || detected.title || existing.titleTemplate;
    const descriptionTemplate = dto.descriptionTemplate || detected.description || existing.descriptionTemplate;
    const slugTemplate = dto.slugTemplate || detected.slug || existing.slugTemplate;
    const schemaTemplate = (dto.schemaTemplate ?? existing.schemaTemplate) as Prisma.InputJsonValue | null;

    const updated = await this.prisma.template.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        content,
        headContent: dto.headContent,
        titleTemplate,
        descriptionTemplate,
        slugTemplate,
        schemaTemplate,
        version: newVersion,
        ...(dto.variables ? { variables: { deleteMany: {}, create: dto.variables } } : {}),
      },
      include: { variables: true },
    });

    // Version snapshot — sequential write, no transaction (MongoDB standalone)
    await this.prisma.templateVersion.create({
      data: {
        templateId: id,
        version: newVersion,
        content,
        titleTemplate,
        descriptionTemplate,
        slugTemplate,
        schemaTemplate,
      },
    }).catch(() => {}); // non-fatal — template already updated

    return updated;
  }

  async getVersions(id: string, orgId: string) {
    await this.findById(id, orgId); // ownership check
    return this.prisma.templateVersion.findMany({
      where: { templateId: id },
      orderBy: { version: "desc" },
    });
  }

  async delete(id: string, orgId: string) {
    await this.findById(id, orgId);
    await this.prisma.template.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  // Validate template syntax without saving
  validateSyntax(content: string, knownVariables?: string[]) {
    const varSet = knownVariables ? new Set(knownVariables) : null;
    return this.engine.validate(content, varSet);
  }

  // Render a preview against sample data — used by the dashboard editor
  preview(dto: PreviewTemplateDto) {
    return this.engine.render(
      {
        content: dto.content,
        titleTemplate: dto.titleTemplate,
        descriptionTemplate: dto.descriptionTemplate,
        slugTemplate: dto.slugTemplate,
      },
      {
        data: dto.sampleData,
        aiContent: {},  // no AI in preview
        seo: {},
        schema: { schemas: {} },
        images: { images: {} },
      },
      dto.baseUrl ?? "https://example.com"
    );
  }

  // Extract variable names from template content — called on save
  // to auto-populate TemplateVariable records
  extractVariables(content: string) {
    return this.engine.extractMetadata(content);
  }
}
