import {
  IsString,
  IsOptional,
  IsArray,
  IsEnum,
} from "class-validator";
import { PageStatus } from "@mpc/shared";

export class GeneratePagesDto {
  @IsString()
  templateId: string;

  @IsString()
  dataSourceId: string;
}

export class FilterPagesDto {
  @IsEnum(PageStatus)
  @IsOptional()
  status?: PageStatus;

  @IsString()
  @IsOptional()
  templateId?: string;

  @IsString()
  @IsOptional()
  search?: string;

  // Pagination params - these are handled by PaginationPipe but need to be allowed in DTO
  @IsOptional()
  page?: number;

  @IsOptional()
  limit?: number;
}

export class BulkDeletePagesDto {
  @IsArray()
  @IsString({ each: true })
  ids: string[];
}
