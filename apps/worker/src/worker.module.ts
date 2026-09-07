import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { BullModule } from "@nestjs/bull";
import { QUEUE_NAMES } from "@mpc/queue";

// Processors
import { CsvImportProcessor } from "./processors/csv-import.processor";
import { PageGenerationProcessor } from "./processors/page-generation.processor";
import { SitemapProcessor } from "./processors/sitemap.processor";
import { AiContentProcessor } from "./processors/ai-content.processor";
import { PublishProcessor } from "./processors/publish.processor";
import { ExportProcessor } from "./processors/export.processor";

// Services
import { TemplateCacheService } from "./services/template-cache.service";
import { SchemaMarkupGenerator } from "./services/schema-markup.generator";
import { InternalLinkingService } from "./services/internal-linking.service";
import { SitemapGeneratorService } from "./services/sitemap-generator.service";
import { RedisCacheService } from "./services/redis-cache.service";
import { JobRecoveryService } from "./services/job-recovery.service";
import { CleanupService } from "./services/cleanup.service";
import { DiskSpaceService } from "./services/disk-space.service";

import { PrismaClient } from "@prisma/client";

// =============================================================================
// WORKER MODULE
//
// Tuned for 1M+ page generation:
//   - PAGE_GENERATION queue: limiter 500 jobs/5s → prevents Redis overload
//   - AI_CONTENT queue: limiter 50 jobs/1s → respects OpenAI rate limits
//   - JobRecoveryService: on startup, re-enqueues stale PROCESSING chunks
// =============================================================================

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ".env" }),
    ScheduleModule.forRoot(),

    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        redis: config.get<string>("REDIS_URL"),
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 500,
        },
      }),
    }),

    // ── Per-queue Redis throttling ─────────────────────────────────────────
    // limiter.max  = max jobs processed in limiter.duration ms (cluster-wide)
    // limiter.bounceBack = true → delayed instead of rejected when over limit
    BullModule.registerQueue(
      { name: QUEUE_NAMES.CSV_IMPORT },
      {
        name: QUEUE_NAMES.PAGE_GENERATION,
        limiter: { max: 2000, duration: 5000, bounceBack: true },
      },
      {
        name: QUEUE_NAMES.AI_CONTENT,
        // 50 AI calls/sec across all workers — stays within OpenAI tier-1 limits
        // bounceBack: true prevents silent drops when the AI queue bursts.
        limiter: { max: 50, duration: 1000, bounceBack: true },
      },
      { name: QUEUE_NAMES.PUBLISH },
      { name: QUEUE_NAMES.SITEMAP },
      { name: QUEUE_NAMES.WEBHOOK },
      { name: QUEUE_NAMES.EXPORT }
    ),
  ],
  providers: [
    {
      provide: PrismaClient,
      useFactory: () => {
        const client = new PrismaClient({
          log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
        });
        client.$connect();
        return client;
      },
    },

    // Services
    TemplateCacheService,
    SchemaMarkupGenerator,
    InternalLinkingService,
    SitemapGeneratorService,
    RedisCacheService,
    JobRecoveryService,
    CleanupService,
    DiskSpaceService,

    // Processors
    CsvImportProcessor,
    PageGenerationProcessor,
    SitemapProcessor,
    AiContentProcessor,
    PublishProcessor,
    ExportProcessor,
  ],
})
export class WorkerModule {}
