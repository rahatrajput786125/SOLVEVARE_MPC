import {
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
  IsObject,
} from "class-validator";

export class CreateProjectDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @IsObject()
  @IsOptional()
  settings?: Record<string, unknown>;
}

export class UpdateProjectDto {
  @IsString()
  @IsOptional()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @IsObject()
  @IsOptional()
  settings?: Record<string, unknown>;
}
