import {
  IsString,
  IsEnum,
  IsOptional,
  IsObject,
  IsUrl,
  MaxLength,
} from "class-validator";
import { DataSourceType } from "@mpc/shared";

export class CreateDataSourceDto {
  @IsString()
  @MaxLength(100)
  name: string;

  @IsEnum(DataSourceType)
  type: DataSourceType;

  @IsString()
  @IsOptional()
  sourceUrl?: string; // Google Sheets URL or API endpoint
}

export class UpdateColumnMapDto {
  @IsString()
  dataSourceId: string;

  // Maps CSV headers to template variable names
  // e.g. { "City Name": "city", "Service Type": "service" }
  @IsObject()
  columnMap: Record<string, string>;
}

export class TriggerImportDto {
  @IsString()
  dataSourceId: string;
}

export class PreviewDataSourceDto {
  @IsString()
  dataSourceId: string;
}
