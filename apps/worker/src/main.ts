import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";
import { WorkerModule } from "./worker.module";

async function bootstrap() {
  const logger = new Logger("Worker");

  // No HTTP adapter — this process only processes queue jobs
  // Using NestFactory.createApplicationContext() skips the HTTP layer entirely
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    logger:
      process.env.NODE_ENV === "production"
        ? ["error", "warn", "log"]
        : ["error", "warn", "log", "debug"],
  });

  // Graceful shutdown — finish processing current jobs before exiting
  process.on("SIGTERM", async () => {
    logger.log("SIGTERM received — shutting down gracefully");
    await app.close();
    process.exit(0);
  });

  process.on("SIGINT", async () => {
    logger.log("SIGINT received — shutting down gracefully");
    await app.close();
    process.exit(0);
  });

  logger.log("Worker started — listening for queue jobs");
}

bootstrap();
