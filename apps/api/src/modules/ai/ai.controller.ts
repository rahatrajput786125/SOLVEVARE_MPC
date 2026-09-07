import {
  Controller,
  Get,
  Patch,
  Body,
  Param,
  Query,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { AiService } from "./ai.service";
import { UpdateAiSettingsDto } from "./dto/ai-settings.dto";
import { OrgId, Roles } from "../../common/decorators";
import { PaginationPipe } from "../../common/pipes/pagination.pipe";
import { UserRole, PaginationParams } from "@mpc/shared";

@ApiTags("ai")
@ApiBearerAuth()
@Controller("ai")
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Get("usage")
  getUsageStats(
    @OrgId() orgId: string,
    @Query("days") days?: string
  ) {
    return this.aiService.getUsageStats(orgId, days ? parseInt(days, 10) : 30);
  }

  @Get("generations")
  listGenerations(
    @OrgId() orgId: string,
    @Query(PaginationPipe) params: PaginationParams
  ) {
    return this.aiService.listGenerations(orgId, params);
  }

  @Get("pages/:pageId/generations")
  getPageGenerations(
    @Param("pageId") pageId: string,
    @OrgId() orgId: string
  ) {
    return this.aiService.getPageGenerations(pageId, orgId);
  }

  @Patch("projects/:projectId/settings")
  @Roles(UserRole.ORG_ADMIN)
  updateSettings(
    @Param("projectId") projectId: string,
    @Body() dto: UpdateAiSettingsDto,
    @OrgId() orgId: string
  ) {
    return this.aiService.updateProjectAiSettings(projectId, orgId, dto);
  }
}
