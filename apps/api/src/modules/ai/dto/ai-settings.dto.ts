import { IsString, IsOptional, IsEnum, IsNumber, Min, Max, IsObject } from "class-validator";

export enum AiModelOption {
  GPT_4O = "gpt-4o",
  GPT_4O_MINI = "gpt-4o-mini",
  GPT_35_TURBO = "gpt-3.5-turbo",
  CLAUDE_3_5_SONNET = "claude-3-5-sonnet-20241022",
  CLAUDE_3_HAIKU = "claude-3-haiku-20240307",
  GEMINI_15_FLASH = "gemini-1.5-flash",
}

export class UpdateAiSettingsDto {
  @IsEnum(AiModelOption)
  @IsOptional()
  defaultModel?: AiModelOption;

  @IsNumber()
  @Min(0)
  @Max(2)
  @IsOptional()
  temperature?: number;

  @IsNumber()
  @Min(100)
  @Max(4000)
  @IsOptional()
  maxTokens?: number;

  // Custom prompt overrides per placeholder
  // e.g. { "faq": "Write 5 FAQs about {{service}} in {{city}}..." }
  @IsObject()
  @IsOptional()
  promptOverrides?: Record<string, string>;

  // Which placeholders to generate AI content for
  @IsOptional()
  enabledPlaceholders?: string[];
}
