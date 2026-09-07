import { Controller, Get, Query, Param } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { AuditService } from "./audit.service";
import { OrgId, Roles } from "../../common/decorators";
import { UserRole, AuditAction } from "@mpc/shared";

@ApiTags("audit")
@ApiBearerAuth()
@Controller("audit")
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  // Get audit logs for the org — admin only
  @Get("logs")
  @Roles(UserRole.ORG_ADMIN)
  getLogs(
    @OrgId() orgId: string,
    @Query("resource") resource?: string,
    @Query("resourceId") resourceId?: string,
    @Query("userId") userId?: string,
    @Query("action") action?: AuditAction,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string
  ) {
    return this.auditService.getLogs(orgId, {
      resource,
      resourceId,
      userId,
      action,
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
    });
  }

  // Get audit logs for a specific resource
  @Get("resources/:resource/:resourceId")
  @Roles(UserRole.ORG_ADMIN)
  getResourceLogs(
    @Param("resource") resource: string,
    @Param("resourceId") resourceId: string,
    @OrgId() orgId: string
  ) {
    return this.auditService.getLogs(orgId, { resource, resourceId });
  }
}
