import { Injectable, Logger } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

// =============================================================================
// TEMPLATE CACHE SERVICE
//
// Problem solved: 10 concurrent chunks all cache-miss on same template at once
// → 10 simultaneous DB queries → connection pool exhaustion → "Template not found"
//
// Fix: Request coalescing via in-flight Map.
// If a fetch for templateId is already running, new callers await the same
// Promise instead of firing a duplicate DB query.
// =============================================================================

export interface CachedTemplate {
  id: string;
  content: string;
  headContent: string | null;
  titleTemplate: string;
  descriptionTemplate: string;
  slugTemplate: string;
  schemaTemplate: unknown;
  variables: Array<{ name: string; type: string; required: boolean; defaultValue: string | null }>;
  cachedAt: number;
}

const CACHE_TTL_MS  = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 100;
const MAX_RETRIES    = 3;
const RETRY_DELAY_MS = 500;

@Injectable()
export class TemplateCacheService {
  private readonly logger = new Logger(TemplateCacheService.name);
  private readonly cache    = new Map<string, CachedTemplate>();
  // In-flight: templateId → Promise of the DB fetch currently running
  private readonly inFlight = new Map<string, Promise<CachedTemplate>>();

  constructor(private readonly prisma: PrismaClient) {}

  async get(templateId: string): Promise<CachedTemplate> {
    // ── 1. Cache hit ────────────────────────────────────────────────────────
    const cached = this.cache.get(templateId);
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
      // Move to end (LRU)
      this.cache.delete(templateId);
      this.cache.set(templateId, cached);
      return cached;
    }

    // ── 2. Already fetching — coalesce ─────────────────────────────────────
    const existing = this.inFlight.get(templateId);
    if (existing) {
      this.logger.debug(`Template ${templateId} — coalesced onto in-flight fetch`);
      return existing;
    }

    // ── 3. Start new fetch, register in-flight ─────────────────────────────
    const fetchPromise = this.loadWithRetry(templateId).finally(() => {
      this.inFlight.delete(templateId);
    });

    this.inFlight.set(templateId, fetchPromise);
    return fetchPromise;
  }

  invalidate(templateId: string): void {
    this.cache.delete(templateId);
    this.logger.debug(`Template cache invalidated: ${templateId}`);
  }

  invalidateAll(): void {
    this.cache.clear();
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private async loadWithRetry(templateId: string): Promise<CachedTemplate> {
    let lastError: Error = new Error("Unknown error");

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await this.load(templateId);
      } catch (err) {
        lastError = err as Error;
        const isNotFound = lastError.message.includes("not found");

        // Don't retry if template genuinely doesn't exist
        if (isNotFound) throw lastError;

        this.logger.warn(
          `Template ${templateId} fetch attempt ${attempt}/${MAX_RETRIES} failed: ${lastError.message}`
        );

        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_DELAY_MS * attempt); // 500ms, 1000ms
        }
      }
    }

    throw lastError;
  }

  private async load(templateId: string): Promise<CachedTemplate> {
    const template = await this.prisma.template.findUnique({
      where: { id: templateId },
      include: { variables: true },
    });

    if (!template) {
      throw new Error(`Template ${templateId} not found`);
    }

    const entry: CachedTemplate = {
      id:                  template.id,
      content:             template.content,
      headContent:         (template as any).headContent ?? null,
      titleTemplate:       template.titleTemplate,
      descriptionTemplate: template.descriptionTemplate,
      slugTemplate:        template.slugTemplate,
      schemaTemplate:      template.schemaTemplate,
      variables: template.variables.map((v) => ({
        name:         v.name,
        type:         v.type,
        required:     v.required,
        defaultValue: v.defaultValue,
      })),
      cachedAt: Date.now(),
    };

    // LRU eviction
    if (this.cache.size >= MAX_CACHE_SIZE) {
      const oldest = this.cache.keys().next().value;
      if (oldest) {
        this.cache.delete(oldest as string);
        this.logger.debug(`LRU eviction: ${oldest as string}`);
      }
    }

    this.cache.set(templateId, entry);
    this.logger.debug(`Template loaded into cache: ${templateId}`);
    return entry;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
