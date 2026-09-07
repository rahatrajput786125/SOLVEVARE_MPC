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
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { ProjectsService } from "./projects.service";
import { CreateProjectDto, UpdateProjectDto } from "./dto/project.dto";
import { GetUser, OrgId, Roles } from "../../common/decorators";
import { PaginationPipe } from "../../common/pipes/pagination.pipe";
import { UserRole } from "@mpc/shared";
import { JwtPayload, PaginationParams } from "@mpc/shared";

@ApiTags("projects")
@ApiBearerAuth()
@Controller("projects")
export class ProjectsController {
  constructor(private projectsService: ProjectsService) {}

  @Get()
  @ApiOperation({ summary: "List all projects for the authenticated org" })
  findAll(
    @OrgId() orgId: string,
    @Query(PaginationPipe) params: PaginationParams
  ) {
    return this.projectsService.findAll(orgId, params);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get a single project by ID" })
  findOne(
    @Param("id") id: string,
    @OrgId() orgId: string
  ) {
    return this.projectsService.findById(id, orgId);
  }

  @Post()
  @Roles(UserRole.ORG_MEMBER) // viewer cannot create
  @ApiOperation({ summary: "Create a new project" })
  create(
    @Body() dto: CreateProjectDto,
    @OrgId() orgId: string,
    @GetUser() user: JwtPayload
  ) {
    return this.projectsService.create(orgId, user.sub, dto);
  }

  @Patch(":id")
  @Roles(UserRole.ORG_MEMBER)
  @ApiOperation({ summary: "Update a project" })
  update(
    @Param("id") id: string,
    @Body() dto: UpdateProjectDto,
    @OrgId() orgId: string,
    @GetUser() user: JwtPayload
  ) {
    return this.projectsService.update(id, orgId, user.sub, dto);
  }

  @Delete(":id")
  @Roles(UserRole.ORG_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Soft delete a project" })
  delete(
    @Param("id") id: string,
    @OrgId() orgId: string,
    @GetUser() user: JwtPayload
  ) {
    return this.projectsService.delete(id, orgId, user.sub);
  }
}
