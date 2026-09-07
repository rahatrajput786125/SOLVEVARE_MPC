import { NestFactory, Reflector } from "@nestjs/core";
import { ValidationPipe, VersioningType } from "@nestjs/common";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { ConfigService } from "@nestjs/config";
import helmet from "helmet";
import * as express from "express";
import { createBullBoard } from "@bull-board/api";
import { BullAdapter } from "@bull-board/api/bullAdapter";
import { ExpressAdapter } from "@bull-board/express";
import { getQueueToken } from "@nestjs/bull";
import { QUEUE_NAMES } from "@mpc/queue";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const compression = require("compression");
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // rawBody: true — required for Stripe webhook signature verification
    // Stripe needs the raw unparsed body to verify HMAC signature
    rawBody: true,
    // Structured JSON logs in production — parseable by CloudWatch/Datadog
    logger: process.env.NODE_ENV === "production"
      ? ["error", "warn", "log"]
      : ["error", "warn", "log", "debug", "verbose"],
  });

  const config = app.get(ConfigService);

  // Increase body size limit for large template content
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ limit: "10mb", extended: true }));

  // Security headers — prevents clickjacking, XSS, MIME sniffing
  app.use(helmet());

  // Gzip compression — reduces response size by ~70% for JSON payloads
  app.use(compression());

  // CORS — allow requests from frontend AND swagger UI (localhost:4000)
  app.enableCors({
    origin: [config.get<string>("FRONTEND_URL")!, "http://localhost:4000", "http://127.0.0.1:4000"],
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  });

  // URL versioning: /api/v1/projects, /api/v2/projects
  // Allows breaking changes without breaking existing clients
  app.setGlobalPrefix("api");
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: "1",
  });

  // Global validation pipe:
  // - whitelist: strips unknown properties (prevents mass assignment)
  // - forbidNonWhitelisted: throws 400 if unknown props sent
  // - transform: auto-converts strings to numbers/booleans per DTO types
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    })
  );

  // Swagger API docs — only in non-production
  if (config.get("NODE_ENV") !== "production") {
    const swaggerConfig = new DocumentBuilder()
      .setTitle("MPC SaaS API")
      .setDescription("Mass Page Creator — Programmatic SEO Platform")
      .setVersion("1.0")
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup("api/docs", app, document);
  }

  // ── Queue monitoring dashboard (bull-board) ──────────────────────────
  // Mounted at /admin/queues
  // Security:
  //   - DASHBOARD_ENABLED=false disables the route entirely (default in prod)
  //   - Authorization: Bearer <QUEUE_DASHBOARD_TOKEN> required when enabled
  //   - DASHBOARD_IP_ALLOWLIST=127.0.0.1,10.0.0.0/8 restricts by IP (optional)
  const dashboardEnabled = config.get<string>("DASHBOARD_ENABLED") !== "false";

  if (dashboardEnabled) {
    const boardAdapter = new ExpressAdapter();
    boardAdapter.setBasePath("/admin/queues");

    const registeredQueues = [
      QUEUE_NAMES.PAGE_GENERATION,
      QUEUE_NAMES.SITEMAP,
      QUEUE_NAMES.PUBLISH,
      QUEUE_NAMES.EXPORT,
    ];

    const queues: BullAdapter[] = [];
    for (const name of registeredQueues) {
      try {
        const queue = app.get(getQueueToken(name));
        queues.push(new BullAdapter(queue));
      } catch {
        continue;
      }
    }

    createBullBoard({ queues, serverAdapter: boardAdapter });

    const dashboardToken = config.get<string>("QUEUE_DASHBOARD_TOKEN");
    const rawAllowlist = config.get<string>("DASHBOARD_IP_ALLOWLIST") ?? "";
    const ipAllowlist = rawAllowlist
      .split(",")
      .map((ip) => ip.trim())
      .filter(Boolean);

    app.use("/admin/queues", (req: any, res: any, next: () => void) => {
      // ── IP allowlist check ─────────────────────────────────────────────
      if (ipAllowlist.length > 0) {
        const clientIp: string =
          (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ??
          req.socket?.remoteAddress ??
          "";
        if (!ipAllowlist.includes(clientIp)) {
          res.status(403).json({ error: "Forbidden" });
          return;
        }
      }

      // ── Bearer token check ─────────────────────────────────────────────
      if (config.get("NODE_ENV") === "production") {
        if (!dashboardToken) {
          // Token not configured — refuse all access in production
          res.status(503).json({ error: "Dashboard not available" });
          return;
        }
        const authHeader: string = req.headers["authorization"] ?? "";
        const provided = authHeader.startsWith("Bearer ")
          ? authHeader.slice(7)
          : null;
        if (!provided || provided !== dashboardToken) {
          res.status(401).json({ error: "Unauthorized" });
          return;
        }
      }

      next();
    }, boardAdapter.getRouter());
  }

  const port = config.get<number>("PORT") ?? 4000;
  await app.listen(port);

  console.log(`API running on http://localhost:${port}/api/v1`);
  console.log(`Swagger docs: http://localhost:${port}/api/docs`);
}

bootstrap();
