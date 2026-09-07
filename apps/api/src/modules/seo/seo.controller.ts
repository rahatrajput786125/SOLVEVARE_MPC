import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  Res,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { Response } from "express";
import { SeoService } from "./seo.service";
import { UpdateSeoSettingsDto, UpdatePageSeoDto } from "./dto/seo-settings.dto";
import { OrgId, Roles } from "../../common/decorators";
import { UserRole } from "@mpc/shared";

@ApiTags("seo")
@ApiBearerAuth()
@Controller("seo")
export class SeoController {
  constructor(private readonly seoService: SeoService) {}

  // ── Project SEO settings ───────────────────────────────────────────────────

  @Patch("projects/:projectId/settings")
  @Roles(UserRole.ORG_ADMIN)
  updateSettings(
    @Param("projectId") projectId: string,
    @Body() dto: UpdateSeoSettingsDto,
    @OrgId() orgId: string
  ) {
    return this.seoService.updateProjectSeoSettings(projectId, orgId, dto);
  }

  // ── robots.txt ─────────────────────────────────────────────────────────────

  // Generate and store robots.txt — returns the content
  @Post("projects/:projectId/robots")
  @Roles(UserRole.ORG_ADMIN)
  generateRobots(
    @Param("projectId") projectId: string,
    @OrgId() orgId: string
  ) {
    return this.seoService.generateAndStoreRobotsTxt(projectId, orgId);
  }

  // ── Meta tag preview ───────────────────────────────────────────────────────

  // Preview meta tags for a page in different formats
  // format=json (default) | html | nextjs
  @Get("pages/:pageId/meta")
  getPageMeta(
    @Param("pageId") pageId: string,
    @Query("format") format: "html" | "nextjs" | "json" = "json",
    @OrgId() orgId: string
  ) {
    return this.seoService.getPageMetaPreview(pageId, orgId, format);
  }

  // ── Per-page SEO overrides ─────────────────────────────────────────────────

  @Patch("pages/:pageId")
  updatePageSeo(
    @Param("pageId") pageId: string,
    @Body() dto: UpdatePageSeoDto,
    @OrgId() orgId: string
  ) {
    return this.seoService.updatePageSeo(pageId, orgId, dto);
  }

  // ── Schema markup ──────────────────────────────────────────────────────────

  @Get("pages/:pageId/schemas")
  getPageSchemas(
    @Param("pageId") pageId: string,
    @OrgId() orgId: string
  ) {
    return this.seoService.getPageSchemas(pageId, orgId);
  }

  // ── SEO audit ──────────────────────────────────────────────────────────────

  @Get("projects/:projectId/audit")
  getAudit(
    @Param("projectId") projectId: string,
    @OrgId() orgId: string
  ) {
    return this.seoService.getProjectSeoAudit(projectId, orgId);
  }

  // ── Sitemap trigger ────────────────────────────────────────────────────────

  // Enqueue a sitemap regeneration job
  // Called after publish batch completes or manually from dashboard
  @Post("projects/:projectId/sitemap/regenerate")
  @Roles(UserRole.ORG_ADMIN)
  regenerateSitemap(
    @Param("projectId") projectId: string,
    @OrgId() orgId: string
  ) {
    return this.seoService.enqueueSitemapRegeneration(projectId, orgId);
  }
}
