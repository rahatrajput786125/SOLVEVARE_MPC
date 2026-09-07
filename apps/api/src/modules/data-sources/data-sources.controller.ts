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
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { join, extname } from "path";
import { mkdirSync } from "fs";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { DataSourcesService } from "./data-sources.service";
import { CreateDataSourceDto, UpdateColumnMapDto } from "./dto/data-source.dto";
import { OrgId, Roles } from "../../common/decorators";
import { PaginationPipe } from "../../common/pipes/pagination.pipe";
import { UserRole, PaginationParams } from "@mpc/shared";

const UPLOADS_DIR = join(process.cwd(), "uploads");
mkdirSync(UPLOADS_DIR, { recursive: true });

@ApiTags("data-sources")
@ApiBearerAuth()
@Controller("projects/:projectId/data-sources")
export class DataSourcesController {
  constructor(private service: DataSourcesService) {}

  @Get()
  findAll(
    @Param("projectId") projectId: string,
    @OrgId() orgId: string,
    @Query(PaginationPipe) params: PaginationParams
  ) {
    return this.service.findAll(orgId, projectId, params);
  }

  @Get("imports/:importId/status")
  @ApiOperation({ summary: "Get import progress" })
  getImportStatus(@Param("importId") importId: string, @OrgId() orgId: string) {
    return this.service.getImportStatus(orgId, importId);
  }

  @Patch("column-map")
  @Roles(UserRole.ORG_MEMBER)
  @ApiOperation({ summary: "Update CSV column → variable mapping" })
  updateColumnMap(@Body() dto: UpdateColumnMapDto, @OrgId() orgId: string) {
    return this.service.updateColumnMap(orgId, dto);
  }

  @Get(":id")
  findOne(@Param("id") id: string, @OrgId() orgId: string) {
    return this.service.findById(id, orgId);
  }

  @Post()
  @Roles(UserRole.ORG_MEMBER)
  create(
    @Param("projectId") projectId: string,
    @Body() dto: CreateDataSourceDto,
    @OrgId() orgId: string
  ) {
    return this.service.create(orgId, projectId, dto);
  }

  @Post(":id/upload")
  @Roles(UserRole.ORG_MEMBER)
  @ApiOperation({ summary: "Upload CSV/Excel file directly" })
  @UseInterceptors(
    FileInterceptor("file", {
      storage: diskStorage({
        destination: UPLOADS_DIR,
        filename: (_req, file, cb) => {
          cb(null, `${Date.now()}-${Math.round(Math.random() * 1e6)}${extname(file.originalname)}`);
        },
      }),
      limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
      fileFilter: (_req, file, cb) => {
        const allowed = [".csv", ".xlsx", ".xls"];
        const ext = extname(file.originalname).toLowerCase();
        cb(allowed.includes(ext) ? null : new BadRequestException("Only CSV and Excel files are supported"), allowed.includes(ext));
      },
    })
  )
  uploadFile(
    @Param("projectId") _projectId: string,
    @Param("id") id: string,
    @UploadedFile() file: Express.Multer.File,
    @OrgId() orgId: string
  ) {
    if (!file) throw new BadRequestException("No file uploaded");
    return this.service.handleDirectUpload(orgId, id, file);
  }

  @Delete(":id")
  @Roles(UserRole.ORG_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param("id") id: string, @OrgId() orgId: string) {
    return this.service.delete(id, orgId);
  }
}
