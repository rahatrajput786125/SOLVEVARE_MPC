import { IsString, IsObject, IsOptional } from "class-validator";

export class PreviewTemplateDto {
  @IsString()
  content: string;

  @IsString()
  titleTemplate: string;

  @IsString()
  descriptionTemplate: string;

  @IsString()
  slugTemplate: string;

  // Sample data row for preview rendering
  @IsObject()
  sampleData: Record<string, string>;

  @IsString()
  @IsOptional()
  baseUrl?: string;
}
