import {
  IsEnum, IsString, IsOptional, IsArray,
  IsUrl, IsBoolean, IsNumber,
  ValidateNested, IsObject,
} from "class-validator";
import { Type } from "class-transformer";

export enum PublishTargetDto {
  WORDPRESS = "WORDPRESS",
  STATIC_HTML = "STATIC_HTML",
  WEBHOOK = "WEBHOOK",
}

// WordPress-specific config
export class WordPressConfigDto {
  @IsUrl() siteUrl: string;
  @IsString() username: string;
  @IsString() appPassword: string;
  @IsString() @IsOptional() postType?: string;
  @IsString() @IsOptional() postStatus?: string;
  @IsNumber() @IsOptional() parentPageId?: number;
}

// Static HTML config
export class StaticHtmlConfigDto {
  @IsString() @IsOptional() siteName?: string;
  @IsUrl() @IsOptional() defaultOgImage?: string;
  @IsString() @IsOptional() twitterSite?: string;
}

// Webhook config
export class WebhookConfigDto {
  @IsUrl() url: string;
  @IsString() @IsOptional() secret?: string;
  @IsObject() @IsOptional() headers?: Record<string, string>;
  @IsBoolean() @IsOptional() includeContent?: boolean;
  @IsBoolean() @IsOptional() includeSchema?: boolean;
}

export class CreatePublishJobDto {
  @IsEnum(PublishTargetDto)
  target: PublishTargetDto;

  // Target-specific config — validated based on target type
  @IsObject()
  config: Record<string, unknown>;

  // Optional: publish only specific pages. If empty → publish all GENERATED pages
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  pageIds?: string[];

  // Filter by status — default: GENERATED
  @IsString()
  @IsOptional()
  pageStatus?: string;
}
