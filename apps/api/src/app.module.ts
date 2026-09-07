import { Module, NestModule, MiddlewareConsumer } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { BullModule } from "@nestjs/bull";
import { APP_GUARD, APP_FILTER, APP_INTERCEPTOR } from "@nestjs/core";

import { validateConfig } from "./config/config.schema";
import { DatabaseModule } from "./modules/database/database.module";
import { AuthModule } from "./modules/auth/auth.module";
import { ProjectsModule } from "./modules/projects/projects.module";
import { TemplatesModule } from "./modules/templates/templates.module";
import { PagesModule } from "./modules/pages/pages.module";
import { DataSourcesModule } from "./modules/data-sources/data-sources.module";
import { AiModule } from "./modules/ai/ai.module";
import { SeoModule } from "./modules/seo/seo.module";
import { LinkingModule } from "./modules/linking/linking.module";
import { PublishModule } from "./modules/publish/publish.module";
import { HealthModule } from "./modules/health/health.module";
import { RateLimitMiddleware } from "./common/middleware/rate-limit.middleware";
import { SecurityModule } from "./common/security/security.module";
import { AuditModule } from "./modules/audit/audit.module";
import { BillingModule } from "./modules/billing/billing.module";
import { GenerationRunsModule } from "./modules/generation-runs/generation-runs.module";
import { ExportModule } from "./modules/export/export.module";
import { TenantIsolationGuard } from "./common/guards/tenant-isolation.guard";
import { ApiKeyGuard } from "./common/guards/api-key.guard";

import { JwtAuthGuard } from "./common/guards/jwt-auth.guard";
import { RolesGuard } from "./common/guards/roles.guard";
import { GlobalExceptionFilter } from "./common/filters/global-exception.filter";
import { ResponseInterceptor } from "./common/interceptors/response.interceptor";
import { LoggingInterceptor } from "./common/interceptors/logging.interceptor";

@Module({
  imports: [
    // Config loaded first — all other modules depend on it
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateConfig,
      envFilePath: ".env",
    }),

    // Rate limiting: 100 requests per 60 seconds per IP by default
    // Override per-route with @Throttle(limit, ttl)
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),

    // Bull queue broker — Redis connection shared across all queues
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

    // Core infrastructure
    DatabaseModule,

    // Feature modules
    AuthModule,
    ProjectsModule,
    TemplatesModule,
    PagesModule,
    DataSourcesModule,
    AiModule,
    SeoModule,
    LinkingModule,
    PublishModule,
    HealthModule,
    SecurityModule,
    AuditModule,
    BillingModule,
    GenerationRunsModule,
    ExportModule,
  ],
  providers: [
    // Global JWT guard — every route requires auth unless @Public()
    // Must run BEFORE TenantIsolationGuard so request.user is populated
    { provide: APP_GUARD, useClass: JwtAuthGuard },

    // Global API key guard — checks X-API-Key header
    { provide: APP_GUARD, useClass: ApiKeyGuard },

    // Global tenant isolation guard — depends on request.user.orgId from JWT
    { provide: APP_GUARD, useClass: TenantIsolationGuard },

    // Global rate limiting guard — applies to every route
    { provide: APP_GUARD, useClass: ThrottlerGuard },

    // Global RBAC guard — checks @Roles() decorator
    { provide: APP_GUARD, useClass: RolesGuard },

    // Global exception filter — consistent error responses
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },

    // Global response wrapper — { success: true, data: ... }
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },

    // Global request logger
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Apply org-based rate limiting to all API routes
    // Skips unauthenticated requests (handled by JWT guard)
    consumer
      .apply(RateLimitMiddleware)
      .exclude("/api/v1/health")
      .forRoutes("*");
  }
}
