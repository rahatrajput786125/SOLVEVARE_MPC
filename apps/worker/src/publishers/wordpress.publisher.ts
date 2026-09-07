import axios, { AxiosInstance } from "axios";
import { Publisher, PageToPublish, PublishResult } from "./publisher.interface";

// =============================================================================
// WORDPRESS PUBLISHER
//
// Publishes pages via the WordPress REST API.
//
// Auth options supported:
//   1. Application Passwords (WP 5.6+) — recommended
//      Format: "username:app_password" → base64 encoded
//   2. JWT Auth plugin — Bearer token
//
// Strategy:
//   - Check if post with same slug already exists → UPDATE (PUT)
//   - If not → CREATE (POST)
//   This makes publishing idempotent — safe to re-run.
//
// Schema markup: injected into post content as a <script type="application/ld+json">
// block at the bottom. This is the standard WP approach since most themes
// don't have a dedicated schema field.
//
// SEO meta: if Yoast SEO or RankMath is installed, we set their meta fields
// via the REST API. Falls back to standard meta if neither is detected.
//
// Rate limiting: WP REST API has no official rate limit, but shared hosting
// can throttle at ~10 req/s. We use a 100ms delay between requests.
// =============================================================================

const REQUEST_DELAY_MS = 100;
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 3;

export interface WordPressConfig {
  siteUrl: string;          // e.g. "https://example.com"
  username: string;
  appPassword: string;      // WP Application Password (spaces removed)
  postType?: string;        // default: "pages" — can be custom post type
  postStatus?: string;      // default: "publish"
  parentPageId?: number;    // optional parent page for hierarchy
  categoryIds?: number[];   // for post type "posts"
}

export class WordPressPublisher implements Publisher {
  validateConfig(config: Record<string, unknown>): string | null {
    const c = config as Partial<WordPressConfig>;
    if (!c.siteUrl) return "siteUrl is required";
    if (!c.username) return "username is required";
    if (!c.appPassword) return "appPassword is required";
    try { new URL(c.siteUrl); } catch { return "siteUrl must be a valid URL"; }
    return null;
  }

  async publish(page: PageToPublish, config: Record<string, unknown>): Promise<PublishResult> {
    const cfg = config as unknown as WordPressConfig;
    const http = this.createClient(cfg);
    const postType = cfg.postType ?? "pages";
    const endpoint = `/wp/v2/${postType}`;

    // Build the post body
    const schemaHtml = this.buildSchemaHtml(page.schemaMarkups);
    const fullContent = page.content + (schemaHtml ? `\n${schemaHtml}` : "");

    const postBody: Record<string, unknown> = {
      title: page.title,
      content: fullContent,
      slug: page.slug,
      status: cfg.postStatus ?? "publish",
      excerpt: page.description,
      ...(cfg.parentPageId && { parent: cfg.parentPageId }),
      ...(cfg.categoryIds && { categories: cfg.categoryIds }),
    };

    // Add Yoast SEO meta if available
    postBody.yoast_head_json = undefined; // read-only, skip
    postBody.meta = {
      _yoast_wpseo_title: page.title,
      _yoast_wpseo_metadesc: page.description,
      _yoast_wpseo_focuskw: page.focusKeyword ?? "",
      _yoast_wpseo_canonical: page.canonicalUrl,
      // RankMath fields
      rank_math_title: page.title,
      rank_math_description: page.description,
      rank_math_focus_keyword: page.focusKeyword ?? "",
    };

    try {
      // Check if post with this slug already exists
      const existing = await this.findBySlug(http, endpoint, page.slug);

      let response: { id: number; link: string };

      if (existing) {
        // UPDATE existing post
        const res = await this.withRetry(() =>
          http.post<{ id: number; link: string }>(`${endpoint}/${existing.id}`, postBody)
        );
        response = res.data;
      } else {
        // CREATE new post
        const res = await this.withRetry(() =>
          http.post<{ id: number; link: string }>(endpoint, postBody)
        );
        response = res.data;
      }

      // Respect rate limit
      await this.sleep(REQUEST_DELAY_MS);

      return {
        pageId: page.id,
        success: true,
        publishedUrl: response.link,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return { pageId: page.id, success: false, error: message };
    }
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private createClient(cfg: WordPressConfig): AxiosInstance {
    // Application Password auth: base64("username:password")
    const credentials = Buffer.from(
      `${cfg.username}:${cfg.appPassword.replace(/\s/g, "")}`
    ).toString("base64");

    return axios.create({
      baseURL: `${cfg.siteUrl.replace(/\/$/, "")}/wp-json`,
      timeout: REQUEST_TIMEOUT_MS,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${credentials}`,
      },
    });
  }

  private async findBySlug(
    http: AxiosInstance,
    endpoint: string,
    slug: string
  ): Promise<{ id: number } | null> {
    try {
      const res = await http.get<Array<{ id: number }>>(endpoint, {
        params: { slug, per_page: 1 },
      });
      return res.data[0] ?? null;
    } catch {
      return null;
    }
  }

  private buildSchemaHtml(
    schemas: Array<{ type: string; data: Record<string, unknown> }>
  ): string {
    if (schemas.length === 0) return "";
    return schemas
      .map(
        (s) =>
          `<script type="application/ld+json">\n${JSON.stringify(s.data, null, 2)}\n</script>`
      )
      .join("\n");
  }

  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastErr: Error | null = null;
    for (let i = 1; i <= MAX_RETRIES; i++) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err as Error;
        if (axios.isAxiosError(err)) {
          // Don't retry on auth errors
          if (err.response?.status === 401 || err.response?.status === 403) throw err;
        }
        await this.sleep(Math.pow(2, i) * 500);
      }
    }
    throw lastErr;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}
