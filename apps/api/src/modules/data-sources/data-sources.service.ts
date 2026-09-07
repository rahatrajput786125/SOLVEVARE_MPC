import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { CsvImportService } from "./csv-import.service";
import { CreateDataSourceDto, UpdateColumnMapDto } from "./dto/data-source.dto";
import { ImportStatus, PaginationParams } from "@mpc/shared";

@Injectable()
export class DataSourcesService {
  constructor(
    private prisma: PrismaService,
    private csvImport: CsvImportService
  ) {}

  async findAll(orgId: string, projectId: string, params: PaginationParams) {
    const { page, limit } = params;
    const skip = (page - 1) * limit;

    const where = { orgId, projectId, OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] };
    const [total, items] = await Promise.all([
      this.prisma.dataSource.count({ where }),
      this.prisma.dataSource.findMany({
        where, skip, take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          _count: { select: { imports: true } },
          imports: {
            orderBy: { createdAt: "desc" }, take: 1,
            select: { status: true, totalRows: true, processedRows: true, createdAt: true },
          },
        },
      }),
    ]);

    return { items, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findById(id: string, orgId: string) {
    const ds = await this.prisma.dataSource.findFirst({
      where: { id, orgId, OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] },
      include: { imports: { orderBy: { createdAt: "desc" }, take: 5 } },
    });
    if (!ds) throw new NotFoundException("Data source not found");
    return ds;
  }

  async create(orgId: string, projectId: string, dto: CreateDataSourceDto) {
    return this.prisma.dataSource.create({
      data: { orgId, projectId, name: dto.name, type: dto.type, sourceUrl: dto.sourceUrl },
    });
  }

  async handleDirectUpload(orgId: string, dataSourceId: string, file: Express.Multer.File) {
    if (!file) throw new BadRequestException("No file uploaded");

    const ext = file.originalname.split(".").pop()?.toLowerCase() ?? "csv";
    if (!["csv", "xlsx", "xls"].includes(ext)) {
      throw new BadRequestException("Only CSV and Excel files are supported");
    }

    const fileKey = file.path;

    const [importRecord] = await Promise.all([
      this.prisma.csvImport.create({
        data: { orgId, dataSourceId, fileKey, status: ImportStatus.PROCESSING, startedAt: new Date() },
      }),
      this.prisma.dataSource.update({
        where: { id: dataSourceId },
        data: { sourceUrl: fileKey },
      }),
    ]);

    // Process in background — no Redis needed
    this.csvImport.processAsync(importRecord.id, dataSourceId, orgId, fileKey);

    return { importId: importRecord.id, message: "Upload successful, import started" };
  }

  async updateColumnMap(orgId: string, dto: UpdateColumnMapDto) {
    await this.findById(dto.dataSourceId, orgId);
    return this.prisma.dataSource.update({
      where: { id: dto.dataSourceId },
      data: { columnMap: dto.columnMap },
    });
  }

  async getImportStatus(orgId: string, importId: string) {
    const record = await this.prisma.csvImport.findFirst({ where: { id: importId, orgId } });
    if (!record) throw new NotFoundException("Import not found");
    const progress = record.totalRows > 0
      ? Math.round((record.processedRows / record.totalRows) * 100)
      : 0;
    return { ...record, progress };
  }

  async delete(id: string, orgId: string) {
    await this.findById(id, orgId);
    await this.prisma.dataSource.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}
