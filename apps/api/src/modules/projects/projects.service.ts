import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { ProjectsRepository } from "./projects.repository";
import { CreateProjectDto, UpdateProjectDto } from "./dto/project.dto";
import { PLAN_LIMITS, PaginationParams, AuditAction, OrgPlan, ProjectStatus } from "@mpc/shared";

@Injectable()
export class ProjectsService {
  constructor(
    private repo: ProjectsRepository,
    private prisma: PrismaService
  ) {}

  async findAll(orgId: string, params: PaginationParams) {
    const { items, total } = await this.repo.findAll(orgId, params);
    return {
      items,
      meta: {
        total,
        page: params.page,
        limit: params.limit,
        totalPages: Math.ceil(total / params.limit),
      },
    };
  }

  async findById(id: string, orgId: string) {
    const project = await this.repo.findById(id, orgId);
    if (!project) throw new NotFoundException("Project not found");
    return project;
  }

  async create(orgId: string, userId: string, dto: CreateProjectDto) {
    // Enforce plan limits before creating
    await this.enforcePlanLimit(orgId);

    const project = await this.repo.create(orgId, dto);

    // Fire-and-forget audit log — don't block the response
    this.writeAuditLog(orgId, userId, AuditAction.CREATE, "project", project.id, null, project);

    return project;
  }

  async update(id: string, orgId: string, userId: string, dto: UpdateProjectDto) {
    const existing = await this.findById(id, orgId);
    const updated = await this.repo.update(id, orgId, dto);

    this.writeAuditLog(orgId, userId, AuditAction.UPDATE, "project", id, existing, updated);

    return updated;
  }

  async delete(id: string, orgId: string, userId: string) {
    await this.findById(id, orgId); // throws 404 if not found or wrong org
    await this.repo.softDelete(id);

    this.writeAuditLog(orgId, userId, AuditAction.DELETE, "project", id, null, null);
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private async enforcePlanLimit(orgId: string): Promise<void> {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { plan: true },
    });

    if (!org) return; // org not found, let other guards handle it
    const limit = PLAN_LIMITS[org.plan as OrgPlan]?.maxProjects ?? Infinity;
    if (limit === Infinity) return;

    const count = await this.prisma.project.count({
      where: { orgId, deletedAt: null },
    });

    if (count >= limit) {
      throw new ForbiddenException(
        `Your plan allows a maximum of ${limit} projects. Upgrade to create more.`
      );
    }
  }

  private writeAuditLog(
    orgId: string,
    userId: string,
    action: AuditAction,
    resource: string,
    resourceId: string,
    before: unknown,
    after: unknown
  ): void {
    this.prisma.auditLog
      .create({
        data: {
          orgId,
          userId,
          action,
          resource,
          resourceId,
          before: before ? (before as object) : undefined,
          after: after ? (after as object) : undefined,
        },
      })
      .catch(() => {}); // Never let audit logging break the main flow
  }
}
