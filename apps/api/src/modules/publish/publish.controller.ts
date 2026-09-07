import {
  Controller, Post, Get, Delete,
  Param, Body,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { PublishService } from "./publish.service";
import { CreatePublishJobDto } from "./dto/publish.dto";
import { OrgId, Roles } from "../../common/decorators";
import { UserRole } from "@mpc/shared";

@ApiTags("publish")
@ApiBearerAuth()
@Controller("publish")
export class PublishController {
  constructor(private readonly publishService: PublishService) {}

  // Create a new publish job for a project
  @Post("projects/:projectId")
  @Roles(UserRole.ORG_MEMBER)
  createJob(
    @Param("projectId") projectId: string,
    @Body() dto: CreatePublishJobDto,
    @OrgId() orgId: string
  ) {
    return this.publishService.createJob(projectId, orgId, dto);
  }

  // List all publish jobs for a project
  @Get("projects/:projectId/jobs")
  listJobs(
    @Param("projectId") projectId: string,
    @OrgId() orgId: string
  ) {
    return this.publishService.listJobs(projectId, orgId);
  }

  // Get a specific publish job status + progress
  @Get("jobs/:jobId")
  getJob(
    @Param("jobId") jobId: string,
    @OrgId() orgId: string
  ) {
    return this.publishService.getJob(jobId, orgId);
  }

  // Cancel an in-progress publish job
  @Delete("jobs/:jobId")
  @Roles(UserRole.ORG_ADMIN)
  cancelJob(
    @Param("jobId") jobId: string,
    @OrgId() orgId: string
  ) {
    return this.publishService.cancelJob(jobId, orgId);
  }
}
