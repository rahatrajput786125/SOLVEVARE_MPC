import { Injectable, NestMiddleware, HttpException, HttpStatus } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";
import Redis from "ioredis";
import { ConfigService } from "@nestjs/config";

// =============================================================================
// REDIS RATE LIMIT MIDDLEWARE
//
// Two-layer rate limiting strategy:
//   Layer 1 (Nginx): IP-based limits — blocks bots and DDoS at the edge
//   Layer 2 (This):  Org-based limits — enforces per-tenant fair use
//
// Why org-based limits?
// IP limits don't work for SaaS — a large org might have 50 users on the
// same corporate IP. Org-based limits are fair and predictable.
//
// Limits by plan:
//   FREE:       60 req/min
//   STARTER:    300 req/min
//   GROWTH:     1000 req/min
//   BUSINESS:   3000 req/min
//   ENTERPRISE: unlimited
//
// Implementation: sliding window counter in Redis.
// Key: rate_limit:{orgId}:{window_minute}
// TTL: 2 minutes (covers current + previous window)
// =============================================================================

const PLAN_LIMITS: Record<string, number> = {
  FREE: 60,
  STARTER: 300,
  GROWTH: 1000,
  BUSINESS: 3000,
  ENTERPRISE: Infinity,
};

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  private readonly redis: Redis;

  constructor(private readonly config: ConfigService) {
    this.redis = new Redis(config.get<string>("REDIS_URL")!, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
    });
  }

  async use(req: Request & { user?: { orgId: string; role?: string } }, res: Response, next: NextFunction): Promise<void> {
    // Skip if no user context (unauthenticated — JwtAuthGuard handles that)
    if (!req.user?.orgId) {
      next();
      return;
    }

    const { orgId } = req.user;
    // plan is not in the JWT payload — default to FREE limits
    // ENTERPRISE orgs can be whitelisted via env if needed
    const limit = PLAN_LIMITS["FREE"];

    // Enterprise = unlimited
    if (limit === Infinity) {
      next();
      return;
    }

    // Sliding window: key per org per minute
    const window = Math.floor(Date.now() / 60_000);
    const key = `rl:org:${orgId}:${window}`;

    try {
      const count = await this.redis.incr(key);

      // Set TTL on first request in this window
      if (count === 1) {
        await this.redis.expire(key, 120); // 2 min TTL
      }

      // Set rate limit headers (like GitHub API)
      res.setHeader("X-RateLimit-Limit", limit);
      res.setHeader("X-RateLimit-Remaining", Math.max(0, limit - count));
      res.setHeader("X-RateLimit-Reset", (window + 1) * 60);

      if (count > limit) {
        throw new HttpException(
          {
            success: false,
            error: `Rate limit exceeded. Your plan allows ${limit} requests/minute.`,
            retryAfter: (window + 1) * 60 - Math.floor(Date.now() / 1000),
          },
          HttpStatus.TOO_MANY_REQUESTS
        );
      }
    } catch (err) {
      // If Redis is down, fail open (don't block requests)
      if (!(err instanceof HttpException)) {
        next();
        return;
      }
      throw err;
    }

    next();
  }
}
