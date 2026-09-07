// Queue names as constants — prevents typos across producer/consumer
export const QUEUE_NAMES = {
  CSV_IMPORT: "csv-import",
  PAGE_GENERATION: "page-generation",
  AI_CONTENT: "ai-content",
  PUBLISH: "publish",
  SITEMAP: "sitemap",
  WEBHOOK: "webhook",
  EMAIL: "email",
  EXPORT: "export",
} as const;

// ── Job Payload Types ─────────────────────────────────────────────────────────
// Typed payloads prevent runtime errors when workers read job data.
// Both the API (enqueue) and worker (process) import these types.

export interface CsvImportJobPayload {
  importId: string;
  orgId: string;
  dataSourceId: string;
  fileKey: string;       // S3 key of uploaded file
  chunkIndex: number;    // which chunk this job processes
  totalChunks: number;
}

export interface PageGenerationChunkPayload {
  generationJobId: string;          // FK → GenerationJob.id
  orgId: string;
  projectId: string;
  templateId: string;
  dataSourceId: string;
  filePath: string;                 // absolute path to CSV/Excel on disk
  startIndex: number;               // inclusive row index (0-based)
  endIndex: number;                 // exclusive row index
  chunkIndex: number;               // 0-based chunk number
  totalChunks: number;
}

export interface AiContentJobPayload {
  orgId: string;
  pageId: string;
  placeholder: string;   // which {{ai:xxx}} to fill
  prompt: string;
  provider: "OPENAI" | "ANTHROPIC" | "GEMINI";
  model: string;
  cacheKey: string;
}

export interface PublishJobPayload {
  orgId: string;
  projectId: string;
  publishJobId: string;
  pageIds: string[];     // batch of page IDs to publish
  target: string;
  config: Record<string, unknown>;
}

export interface SitemapJobPayload {
  orgId: string;
  projectId: string;
}

export interface ExportJobPayload {
  exportJobId: string;
  orgId: string;
  projectId: string;
  templateId?: string;  // optional: export only one template's pages
}

export interface WebhookJobPayload {
  webhookId: string;
  deliveryId: string;
  url: string;
  event: string;
  payload: Record<string, unknown>;
  secret: string;
  attempt: number;
}

// Default BullMQ job options per queue — tuned for each concern
export const QUEUE_OPTIONS = {
  [QUEUE_NAMES.CSV_IMPORT]: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
  [QUEUE_NAMES.PAGE_GENERATION]: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: 50,
    removeOnFail: 200,
  },
  [QUEUE_NAMES.AI_CONTENT]: {
    attempts: 5,                              // AI APIs are flaky — more retries
    backoff: { type: "exponential", delay: 3000 },
    removeOnComplete: 50,
    removeOnFail: 200,
  },
  [QUEUE_NAMES.PUBLISH]: {
    attempts: 3,
    backoff: { type: "exponential", delay: 10000 },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
  [QUEUE_NAMES.SITEMAP]: {
    attempts: 3,
    backoff: { type: "fixed", delay: 5000 },
    removeOnComplete: 10,
    removeOnFail: 50,
  },
  [QUEUE_NAMES.EXPORT]: {
    attempts: 2,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 20,
    removeOnFail: 50,
  },
  [QUEUE_NAMES.WEBHOOK]: {
    attempts: 5,
    backoff: { type: "exponential", delay: 1000 },
    removeOnComplete: 200,
    removeOnFail: 1000,
  },
} as const;
