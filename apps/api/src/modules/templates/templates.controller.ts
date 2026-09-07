import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { TemplatesService } from "./templates.service";
import { CreateTemplateDto, UpdateTemplateDto } from "./dto/template.dto";
import { PreviewTemplateDto } from "./dto/preview.dto";
import { GetUser, OrgId, Roles } from "../../common/decorators";
import { PaginationPipe } from "../../common/pipes/pagination.pipe";
import { UserRole } from "@mpc/shared";
import { JwtPayload, PaginationParams } from "@mpc/shared";

@ApiTags("templates")
@ApiBearerAuth()
@Controller("projects/:projectId/templates")
export class TemplatesController {
  constructor(private templatesService: TemplatesService) {}

  @Get()
  findAll(
    @Param("projectId") projectId: string,
    @OrgId() orgId: string,
    @Query(PaginationPipe) params: PaginationParams
  ) {
    return this.templatesService.findAll(orgId, projectId, params);
  }

  @Get(":id")
  findOne(
    @Param("id") id: string,
    @OrgId() orgId: string
  ) {
    return this.templatesService.findById(id, orgId);
  }

  @Get(":id/versions")
  getVersions(
    @Param("id") id: string,
    @OrgId() orgId: string
  ) {
    return this.templatesService.getVersions(id, orgId);
  }

  @Post()
  @Roles(UserRole.ORG_MEMBER)
  create(
    @Param("projectId") projectId: string,
    @Body() dto: CreateTemplateDto,
    @OrgId() orgId: string
  ) {
    // Inject projectId from URL param into DTO
    return this.templatesService.create(orgId, { ...dto, projectId });
  }

  @Patch(":id")
  @Roles(UserRole.ORG_MEMBER)
  update(
    @Param("id") id: string,
    @Body() dto: UpdateTemplateDto,
    @OrgId() orgId: string
  ) {
    return this.templatesService.update(id, orgId, dto);
  }

  @Delete(":id")
  @Roles(UserRole.ORG_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(
    @Param("id") id: string,
    @OrgId() orgId: string
  ) {
    return this.templatesService.delete(id, orgId);
  }

  // POST /projects/:projectId/templates/preview
  // Renders a template against sample data without saving
  // Used by the live editor in the dashboard
  @Post("preview")
  @HttpCode(HttpStatus.OK)
  preview(@Body() dto: PreviewTemplateDto) {
    return this.templatesService.preview(dto);
  }

  // POST /projects/:projectId/templates/validate
  // Validates template syntax and returns errors + extracted variables
  @Post("validate")
  @HttpCode(HttpStatus.OK)
  validate(@Body() dto: { content: string; knownVariables?: string[] }) {
    return this.templatesService.validateSyntax(dto.content, dto.knownVariables);
  }
}
