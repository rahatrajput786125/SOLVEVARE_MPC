import {
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
  IsArray,
  ValidateNested,
  IsBoolean,
  IsObject,
} from "class-validator";
import { Type } from "class-transformer";

export class TemplateVariableDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsString()
  @IsOptional()
  type?: string; // text | number | url | image | ai

  @IsBoolean()
  @IsOptional()
  required?: boolean;

  @IsString()
  @IsOptional()
  defaultValue?: string;

  @IsString()
  @IsOptional()
  description?: string;
}

export class CreateTemplateDto {
  @IsString()
  @IsOptional()
  projectId?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @IsString()
  @IsOptional()
  headContent?: string;

  @IsString()
  @IsOptional()
  content?: string;

  @IsString()
  @IsOptional()
  titleTemplate?: string;

  @IsString()
  @IsOptional()
  descriptionTemplate?: string;

  @IsString()
  @IsOptional()
  slugTemplate?: string;

  @IsObject()
  @IsOptional()
  schemaTemplate?: Record<string, unknown>;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TemplateVariableDto)
  @IsOptional()
  variables?: TemplateVariableDto[];
}

export class UpdateTemplateDto {
  @IsString()
  @IsOptional()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @IsString()
  @IsOptional()
  headContent?: string;

  @IsString()
  @IsOptional()
  content?: string;

  @IsString()
  @IsOptional()
  titleTemplate?: string;

  @IsString()
  @IsOptional()
  descriptionTemplate?: string;

  @IsString()
  @IsOptional()
  slugTemplate?: string;

  @IsObject()
  @IsOptional()
  schemaTemplate?: Record<string, unknown>;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TemplateVariableDto)
  @IsOptional()
  variables?: TemplateVariableDto[];
}
