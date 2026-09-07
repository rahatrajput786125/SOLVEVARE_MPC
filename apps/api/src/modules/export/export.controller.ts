import {
  Controller, Post, Get, Param, Query, Res, HttpCode, HttpStatus,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { Response } from "express";
import { ExportService } from "./export.service";
import { OrgId } from "../../common/decorators";

@ApiTags("export")
@ApiBearerAuth()
@Controller("projects/:projectId/export")
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  // POST /projects/:projectId/export — trigger export, returns exportJobId
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  createExport(
    @Param("projectId") projectId: string,
    @OrgId() orgId: string,
    @Query("templateId") templateId?: string
  ) {
    return this.exportService.createExport(projectId, orgId, templateId);
  }

  // GET /projects/:projectId/export/:exportJobId/status — poll progress
  @Get(":exportJobId/status")
  getStatus(
    @Param("exportJobId") exportJobId: string,
    @OrgId() orgId: string
  ) {
    return this.exportService.getStatus(exportJobId, orgId);
  }

  // GET /projects/:projectId/export/:exportJobId/report — export-report.json
  @Get(":exportJobId/report")
  getReport(
    @Param("exportJobId") exportJobId: string,
    @OrgId() orgId: string
  ) {
    return this.exportService.getReport(exportJobId, orgId);
  }

  // GET /projects/:projectId/export/:exportJobId/download — streams ZIP
  @Get(":exportJobId/download")
  async download(
    @Param("exportJobId") exportJobId: string,
    @OrgId() orgId: string,
    @Res() res: Response
  ) {
    await this.exportService.streamZip(exportJobId, orgId, res);
  }
}
