import axios from "axios";
import { createHmac } from "crypto";
import { Publisher, PageToPublish, PublishResult } from "./publisher.interface";

// =============================================================================
// WEBHOOK PUBLISHER
//
// Sends page data as a JSON POST to any HTTP endpoint.
// Used for:
//   - Headless CMS ingestion (Contentful, Sanity, Strapi)
//   - Custom backend integrations
//   - Zapier/Make.com webhooks
//   - Any system that accepts HTTP POST
//
// Security: every request is signed with HMAC-SHA256.
// The receiving server can verify the signature to confirm the request
// came from MPC and wasn't tampered with.
//
// Signature header: X-MPC-Signature: sha256=<hex>
// Verification: HMAC-SHA256(secret, JSON.stringify(payload))
//
// Retry: 3 attempts with exponential backoff.
// Non-2xx responses are treated as failures and retried.
// =============================================================================

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RETRIES = 3;

export interface WebhookConfig {
  url: string;
  secret?: string;          // HMAC signing secret
  headers?: Record<string, string>; // custom headers (e.g. Authorization)
  // What to include in the payload
  includeContent?: boolean; // default: true — include full HTML content
  includeSchema?: boolean;  // default: true — include JSON-LD schemas
}

export class WebhookPublisher implements Publisher {
  validateConfig(config: Record<string, unknown>): string | null {
    const c = config as Partial<WebhookConfig>;
    if (!c.url) return "url is required";
    try { new URL(c.url); } catch { return "url must be a valid URL"; }
    return null;
  }

  async publish(page: PageToPublish, config: Record<string, unknown>): Promise<PublishResult> {
    const cfg = config as unknown as WebhookConfig;

    const payload = this.buildPayload(page, cfg);
    const body = JSON.stringify(payload);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-MPC-Event": "page.published",
      "X-MPC-Page-Id": page.id,
      ...(cfg.headers ?? {}),
    };

    // Sign the payload if secret is provided
    if (cfg.secret) {
      const signature = createHmac("sha256", cfg.secret)
        .update(body)
        .digest("hex");
      headers["X-MPC-Signature"] = `sha256=${signature}`;
    }

    let lastError = "";

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const res = await axios.post(cfg.url, body, {
          headers,
          timeout: REQUEST_TIMEOUT_MS,
          // Accept any 2xx as success
          validateStatus: (status) => status >= 200 && status < 300,
        });

        // Use Location header or response body as published URL if provided
        const publishedUrl =
          res.headers["location"] ??
          (res.data as Record<string, string>)?.url ??
          (res.data as Record<string, string>)?.permalink ??
          cfg.url;

        return { pageId: page.id, success: true, publishedUrl };
      } catch (err) {
        lastError = err instanceof Error ? err.message : "Request failed";

        if (axios.isAxiosError(err)) {
          const status = err.response?.status;
          // Don't retry on client errors (4xx) — they won't succeed on retry
          if (status && status >= 400 && status < 500) {
            return {
              pageId: page.id,
              success: false,
              error: `HTTP ${status}: ${JSON.stringify(err.response?.data)}`,
            };
          }
        }

        if (attempt < MAX_RETRIES) {
          await this.sleep(Math.pow(2, attempt) * 1000);
        }
      }
    }

    return { pageId: page.id, success: false, error: lastError };
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private buildPayload(page: PageToPublish, cfg: WebhookConfig): Record<string, unknown> {
    return {
      id: page.id,
      slug: page.slug,
      title: page.title,
      description: page.description,
      canonicalUrl: page.canonicalUrl,
      focusKeyword: page.focusKeyword,
      dataRow: page.dataRow,
      ...(cfg.includeContent !== false && { content: page.content }),
      ...(cfg.includeSchema !== false && { schemas: page.schemaMarkups }),
      publishedAt: new Date().toISOString(),
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}
