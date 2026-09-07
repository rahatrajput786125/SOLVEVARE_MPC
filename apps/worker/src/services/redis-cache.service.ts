import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";

@Injectable()
export class RedisCacheService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisCacheService.name);
  private readonly client: Redis;
  private available = false;

  constructor(private readonly config: ConfigService) {
    const redisUrl = this.config.get<string>("REDIS_URL");

    this.client = new Redis(redisUrl!, {
      maxRetriesPerRequest: 0,       // don't retry individual commands
      enableReadyCheck: false,
      lazyConnect: true,             // don't connect on instantiation
      retryStrategy: (times: number) => {
        // Back off up to 30s, but stop logging after first failure
        return Math.min(times * 500, 30000);
      },
    });

    this.client.on("connect", () => {
      this.available = true;
      this.logger.log("Redis connected");
    });

    this.client.on("ready", () => {
      this.available = true;
    });

    this.client.on("close", () => {
      this.available = false;
    });

    this.client.on("error", () => {
      // Only log once when transitioning from available → unavailable
      if (this.available) {
        this.logger.warn("Redis unavailable — cache disabled, worker continues without it");
        this.available = false;
      }
    });

    // Attempt connection but don't block startup
    this.client.connect().catch(() => {
      this.logger.warn("Redis not reachable at startup — cache disabled");
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit().catch(() => null);
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.available) return null;
    try {
      const value = await this.client.get(key);
      if (!value) return null;
      try { return JSON.parse(value) as T; } catch { return value as unknown as T; }
    } catch {
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    if (!this.available) return;
    try {
      const serialized = typeof value === "string" ? value : JSON.stringify(value);
      if (ttlSeconds) {
        await this.client.setex(key, ttlSeconds, serialized);
      } else {
        await this.client.set(key, serialized);
      }
    } catch {
      // no-op
    }
  }

  async del(key: string): Promise<void> {
    if (!this.available) return;
    try { await this.client.del(key); } catch { /* no-op */ }
  }

  async exists(key: string): Promise<boolean> {
    if (!this.available) return false;
    try { return (await this.client.exists(key)) === 1; } catch { return false; }
  }

  async incr(key: string, ttlSeconds?: number): Promise<number> {
    if (!this.available) return 0;
    try {
      const value = await this.client.incr(key);
      if (value === 1 && ttlSeconds) await this.client.expire(key, ttlSeconds);
      return value;
    } catch { return 0; }
  }

  async ttl(key: string): Promise<number> {
    if (!this.available) return -2;
    try { return await this.client.ttl(key); } catch { return -2; }
  }

  async delPattern(pattern: string): Promise<number> {
    if (!this.available) return 0;
    try {
      const keys = await this.client.keys(pattern);
      if (keys.length === 0) return 0;
      return this.client.del(...keys);
    } catch { return 0; }
  }

  async getAiCache(cacheKey: string): Promise<string | null> {
    if (!this.available) return null;
    try { return await this.client.get(`ai:${cacheKey}`); } catch { return null; }
  }

  async setAiCache(cacheKey: string, content: string): Promise<void> {
    if (!this.available) return;
    try { await this.client.setex(`ai:${cacheKey}`, 7 * 24 * 3600, content); } catch { /* no-op */ }
  }

  async checkRateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
    if (!this.available) return true; // allow all requests when Redis is down
    try {
      const count = await this.incr(`rl:${key}`, windowSeconds);
      return count <= limit;
    } catch { return true; }
  }

  getRawClient(): Redis {
    return this.client;
  }
}
