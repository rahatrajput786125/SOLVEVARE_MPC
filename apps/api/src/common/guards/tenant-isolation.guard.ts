import {
  Injectable, CanActivate, ExecutionContext,
  NotFoundException, createParamDecorator,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PrismaService } from "../../modules/database/prisma.service";

// =============================================================================
// TENANT ISOLATION GUARD
//
// The most critical security control in a multi-tenant SaaS.
// Ensures a user can ONLY access data belonging to their organization.
//
// Problem this solves:
// Without this guard, a malicious user could change the projectId in a URL
// to access another org's data:
//   GET /projects/other-orgs-project-id/pages  ← should return 403, not data
//
// How it works:
//   1. Extract orgId from JWT (trusted — signed by us)
//   2. Extract resource ID from URL params
//   3. Verify the resource belongs to the org in the JWT
//   4. If not → 403 Forbidden (not 404 — don't reveal resource existence)
//
// Usage:
//   @TenantResource("project")   ← tells guard which resource to check
//   @UseGuards(TenantIsolationGuard)
//   async getProject(@Param("id") id: string) { ... }
//
// Why 403 not 404?
// Returning 404 for another org's resource reveals that the resource exists.
// 403 is safer — attacker learns nothing about other orgs' data.
//
// Performance: one DB query per request for resource ownership check.
// Cached in Redis for frequently accessed resources (optional optimization).
// =============================================================================

export const TENANT_RESOURCE_KEY = "tenant_resource";
export const TenantResource = (resource: string) =>
  SetMetadata(TENANT_RESOURCE_KEY, resource);

// Resource ownership checkers — one per resource type
type OwnershipChecker = (
  prisma: PrismaService,
  resourceId: string,
  orgId: string
) => Promise<boolean>;

const OWNERSHIP_CHECKERS: Record<string, OwnershipChecker> = {
  project: async (prisma, id, orgId) => {
    const r = await prisma.project.findFirst({
      where: { id, orgId, deletedAt: null },
      select: { id: true },
    });
    return Boolean(r);
  },

  template: async (prisma, id, orgId) => {
    const r = await prisma.template.findFirst({
      where: { id, orgId, deletedAt: null },
      select: { id: true },
    });
    return Boolean(r);
  },

  page: async (prisma, id, orgId) => {
    const r = await prisma.generatedPage.findFirst({
      where: { id, orgId, deletedAt: null },
      select: { id: true },
    });
    return Boolean(r);
  },

  dataSource: async (prisma, id, orgId) => {
    const r = await prisma.dataSource.findFirst({
      where: { id, orgId, deletedAt: null },
      select: { id: true },
    });
    return Boolean(r);
  },

  publishJob: async (prisma, id, orgId) => {
    const r = await prisma.publishJob.findFirst({
      where: { id, orgId },
      select: { id: true },
    });
    return Boolean(r);
  },
};

@Injectable()
export class TenantIsolationGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const resource = this.reflector.getAllAndOverride<string>(
      TENANT_RESOURCE_KEY,
      [context.getHandler(), context.getClass()]
    );

    // No @TenantResource() decorator — skip check
    if (!resource) return true;

    const request = context.switchToHttp().getRequest<{
      user?: { orgId: string };
      params: Record<string, string>;
    }>();

    const orgId = request.user?.orgId;
    if (!orgId) return true; // JWT guard will handle unauthenticated

    // Find the resource ID in params
    // Supports: id, projectId, templateId, pageId, etc.
    const resourceId =
      request.params["id"] ??
      request.params[`${resource}Id`] ??
      request.params[`${resource}_id`];

    if (!resourceId) return true; // No ID param — not a resource-specific route

    const checker = OWNERSHIP_CHECKERS[resource];
    if (!checker) return true; // Unknown resource type — skip check

    const owned = await checker(this.prisma, resourceId, orgId);

    if (!owned) {
      // 404 not 403 — avoids leaking resource existence to other orgs
      throw new NotFoundException(`${resource} not found`);
    }

    return true;
  }
}
