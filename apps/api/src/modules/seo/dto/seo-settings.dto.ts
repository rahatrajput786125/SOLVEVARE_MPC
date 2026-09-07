import {
  IsString,
  IsOptional,
  IsBoolean,
  IsArray,
  IsUrl,
  ValidateNested,
  IsEnum,
} from "class-validator";
import { Type } from "class-transformer";

export class HreflangLocaleDto {
  @IsString()
  lang: string;

  @IsUrl()
  baseUrl: string;
}

export class UpdateSeoSettingsDto {
  // Site-wide settings stored in project.settings.seo

  @IsString()
  @IsOptional()
  siteName?: string;

  @IsUrl()
  @IsOptional()
  baseUrl?: string;

  @IsString()
  @IsOptional()
  twitterSite?: string;   // @handle

  @IsUrl()
  @IsOptional()
  defaultOgImage?: string;

  // Robots.txt settings
  @IsBoolean()
  @IsOptional()
  blockAiBots?: boolean;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  additionalDisallowPaths?: string[];

  // Hreflang locales for multi-region projects
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HreflangLocaleDto)
  @IsOptional()
  hreflangLocales?: HreflangLocaleDto[];

  // Default robots meta for all pages
  @IsBoolean()
  @IsOptional()
  defaultNoIndex?: boolean;

  @IsBoolean()
  @IsOptional()
  defaultNoFollow?: boolean;
}

export class UpdatePageSeoDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  focusKeyword?: string;

  @IsBoolean()
  @IsOptional()
  noIndex?: boolean;

  @IsBoolean()
  @IsOptional()
  noFollow?: boolean;

  @IsUrl()
  @IsOptional()
  ogImage?: string;

  @IsEnum(["website", "article", "product"])
  @IsOptional()
  ogType?: "website" | "article" | "product";
}
