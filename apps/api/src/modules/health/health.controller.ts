import { Controller, Get } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { InjectQueue } from "@nestjs/bull";
import { Queue } from "bull";
import { QUEUE_NAMES } from "@mpc/queue";
import { Public } from "../../common/decorators";

// =============================================================================
// HEALTH CONTROLLER
//
// GET /api/v1/health — used by:
//   - Docker HEALTHCHECK
//   - AWS ALB target group health checks
//   - ECS task health checks
//   - Kubernetes liveness/readiness probes
//
// Returns 200 if all critical dependencies are healthy.
// Returns 503 if any dependency is down.
//
// Checks:
//   - PostgreSQL: simple SELECT 1 query
//   - Redis: PING command
//   - Queue: check Bull queue is connected
//
// Response time target: < 100ms
// This endpoint is called every 30s by the load balancer.
// =============================================================================

@Controller("health")
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_NAMES.PAGE_GENERATION)
    private readonly queue: Queue
  ) {}

  @Get()
  @Public()
  async check() {
    const checks = await Promise.allSettled([
      this.checkDatabase(),
      this.checkRedis(),
    ]);

    const db = checks[0];
    const redis = checks[1];

    const healthy =
      db.status === "fulfilled" && redis.status === "fulfilled";

    const result = {
      status: healthy ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      checks: {
        database: db.status === "fulfilled" ? "ok" : "error",
        redis: redis.status === "fulfilled" ? "ok" : "error",
      },
    };

    // Return 503 if unhealthy — load balancer will stop routing traffic
    if (!healthy) {
      throw Object.assign(new Error("Service degraded"), {
        status: 503,
        response: result,
      });
    }

    return result;
  }

  private async checkDatabase(): Promise<void> {
    await this.prisma.user.findFirst();
  }

  private async checkRedis(): Promise<void> {
    const client = (this.queue as unknown as { client: { ping: () => Promise<string> } }).client;
    await client.ping();
  }
}
