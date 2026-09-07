import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  ParseIntPipe,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { LinkGraphService } from "./link-graph.service";
import { OrgId, Roles } from "../../common/decorators";
import { UserRole } from "@mpc/shared";

@ApiTags("linking")
@ApiBearerAuth()
@Controller("linking")
export class LinkingController {
  constructor(private readonly linkGraphService: LinkGraphService) {}

  // Link stats for a single page — used in page detail view
  @Get("pages/:pageId/stats")
  getPageStats(
    @Param("pageId") pageId: string,
    @OrgId() orgId: string
  ) {
    return this.linkGraphService.getPageLinkStats(pageId, orgId);
  }

  // Project-level link graph overview — used in dashboard
  @Get("projects/:projectId/overview")
  getOverview(
    @Param("projectId") projectId: string,
    @OrgId() orgId: string
  ) {
    return this.linkGraphService.getProjectLinkOverview(projectId, orgId);
  }

  // Orphan pages — pages with no inbound links
  @Get("projects/:projectId/orphans")
  getOrphans(
    @Param("projectId") projectId: string,
    @Query("limit") limit: string,
    @OrgId() orgId: string
  ) {
    return this.linkGraphService.getOrphanPages(
      projectId,
      orgId,
      limit ? parseInt(limit, 10) : 50
    );
  }

  // Trigger full link rebuild for a project
  @Post("projects/:projectId/rebuild")
  @Roles(UserRole.ORG_ADMIN)
  triggerRebuild(
    @Param("projectId") projectId: string,
    @OrgId() orgId: string
  ) {
    return this.linkGraphService.triggerLinkRebuild(projectId, orgId);
  }

  // Trigger PageRank calculation — heavy operation, runs async
  @Post("projects/:projectId/pagerank")
  @Roles(UserRole.ORG_ADMIN)
  calculatePageRank(
    @Param("projectId") projectId: string,
    @OrgId() orgId: string
  ) {
    // Fire and forget — returns immediately, runs in background
    this.linkGraphService.calculatePageRank(projectId, orgId).catch(() => {});
    return { started: true, message: "PageRank calculation started" };
  }
}
