import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { PagesService } from "./pages.service";
import { GenerationStatsService } from "./generation-stats.service";
import { PageGenerationService } from "./page-generation.service";
import { GeneratePagesDto, FilterPagesDto, BulkDeletePagesDto } from "./dto/pages.dto";
import { OrgId } from "../../common/decorators";
import { PaginationPipe } from "../../common/pipes/pagination.pipe";
import { PaginationParams } from "@mpc/shared";

@ApiTags("pages")
@ApiBearerAuth()
@Controller("projects/:projectId/pages")
export class PagesController {
  constructor(
    private pagesService: PagesService,
    private statsService: GenerationStatsService,
    private generationService: PageGenerationService
  ) {}

  // ── All static routes MUST appear before @Get(":id") ──────────────────────

  @Get()
  findAll(
    @Param("projectId") projectId: string,
    @OrgId() orgId: string,
    @Query(PaginationPipe) params: PaginationParams,
    @Query() filters: FilterPagesDto
  ) {
    return this.pagesService.findAll(orgId, projectId, params, filters);
  }

  @Get("stats")
  getStats(
    @Param("projectId") projectId: string,
    @OrgId() orgId: string
  ) {
    return this.statsService.getStats(orgId, projectId);
  }

  @Get("recent")
  getRecent(
    @Param("projectId") projectId: string,
    @OrgId() orgId: string
  ) {
    return this.statsService.getRecentActivity(orgId, projectId, 10);
  }

  @Get("by-template")
  getTemplateGroups(
    @Param("projectId") projectId: string,
    @OrgId() orgId: string
  ) {
    return this.pagesService.getTemplateGroups(orgId, projectId);
  }

  @Get("template/:templateId")
  findByTemplate(
    @Param("projectId") projectId: string,
    @Param("templateId") templateId: string,
    @OrgId() orgId: string,
    @Query(PaginationPipe) params: PaginationParams,
    @Query() filters: FilterPagesDto
  ) {
    return this.pagesService.findByTemplate(orgId, projectId, templateId, params, filters);
  }

  @Post("apply-canonicals")
  @HttpCode(HttpStatus.OK)
  applyCanonicals(
    @Param("projectId") projectId: string,
    @OrgId() orgId: string
  ) {
    return this.pagesService.applyCanonicalUrls(orgId, projectId);
  }

  // POST /generate — strict throttle: 5 requests per 60 s per IP to prevent queue abuse
  @Post("generate")
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  generate(
    @Param("projectId") projectId: string,
    @Body() dto: GeneratePagesDto,
    @OrgId() orgId: string
  ) {
    return this.generationService.enqueueGeneration(orgId, projectId, dto);
  }

  @Get("generation-jobs/:jobId/progress")
  getGenerationProgress(
    @Param("jobId") jobId: string,
    @OrgId() orgId: string
  ) {
    return this.generationService.getJobProgress(jobId, orgId);
  }

  @Delete("bulk")
  @HttpCode(HttpStatus.OK)
  bulkDelete(@Body() dto: BulkDeletePagesDto, @OrgId() orgId: string) {
    return this.pagesService.bulkDelete(orgId, dto.ids);
  }

  @Delete("cleanup-drafts")
  @HttpCode(HttpStatus.OK)
  cleanupEmptyDrafts(
    @Param("projectId") projectId: string,
    @OrgId() orgId: string
  ) {
    return this.pagesService.deleteEmptyDraftPages(orgId, projectId);
  }

  @Delete("template/:templateId")
  @HttpCode(HttpStatus.OK)
  deleteByTemplate(
    @Param("projectId") projectId: string,
    @Param("templateId") templateId: string,
    @OrgId() orgId: string
  ) {
    return this.pagesService.deleteByTemplate(orgId, projectId, templateId);
  }

  // ── Dynamic :id route MUST be last ────────────────────────────────────────
  // ParseObjectIdPipe-style guard: reject anything that isn't a 24-char hex ObjectId
  // so static routes that somehow fall through here get a clean 400, not a Prisma crash.

  @Get(":id")
  findOne(
    @Param("id") id: string,
    @OrgId() orgId: string
  ) {
    if (!/^[a-f\d]{24}$/i.test(id)) {
      throw new NotFoundException(`Page not found`);
    }
    return this.pagesService.findById(id, orgId);
  }
}
