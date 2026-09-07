export declare const QUEUE_NAMES: {
    readonly CSV_IMPORT: "csv-import";
    readonly PAGE_GENERATION: "page-generation";
    readonly AI_CONTENT: "ai-content";
    readonly PUBLISH: "publish";
    readonly SITEMAP: "sitemap";
    readonly WEBHOOK: "webhook";
    readonly EMAIL: "email";
    readonly EXPORT: "export";
};
export interface CsvImportJobPayload {
    importId: string;
    orgId: string;
    dataSourceId: string;
    fileKey: string;
    chunkIndex: number;
    totalChunks: number;
}
export interface PageGenerationChunkPayload {
    generationJobId: string;
    orgId: string;
    projectId: string;
    templateId: string;
    dataSourceId: string;
    filePath: string;
    startIndex: number;
    endIndex: number;
    chunkIndex: number;
    totalChunks: number;
}
export interface AiContentJobPayload {
    orgId: string;
    pageId: string;
    placeholder: string;
    prompt: string;
    provider: "OPENAI" | "ANTHROPIC" | "GEMINI";
    model: string;
    cacheKey: string;
}
export interface PublishJobPayload {
    orgId: string;
    projectId: string;
    publishJobId: string;
    pageIds: string[];
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
    templateId?: string;
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
export declare const QUEUE_OPTIONS: {
    readonly "csv-import": {
        readonly attempts: 3;
        readonly backoff: {
            readonly type: "exponential";
            readonly delay: 5000;
        };
        readonly removeOnComplete: 100;
        readonly removeOnFail: 500;
    };
    readonly "page-generation": {
        readonly attempts: 3;
        readonly backoff: {
            readonly type: "exponential";
            readonly delay: 2000;
        };
        readonly removeOnComplete: 50;
        readonly removeOnFail: 200;
    };
    readonly "ai-content": {
        readonly attempts: 5;
        readonly backoff: {
            readonly type: "exponential";
            readonly delay: 3000;
        };
        readonly removeOnComplete: 50;
        readonly removeOnFail: 200;
    };
    readonly publish: {
        readonly attempts: 3;
        readonly backoff: {
            readonly type: "exponential";
            readonly delay: 10000;
        };
        readonly removeOnComplete: 100;
        readonly removeOnFail: 500;
    };
    readonly sitemap: {
        readonly attempts: 3;
        readonly backoff: {
            readonly type: "fixed";
            readonly delay: 5000;
        };
        readonly removeOnComplete: 10;
        readonly removeOnFail: 50;
    };
    readonly export: {
        readonly attempts: 2;
        readonly backoff: {
            readonly type: "exponential";
            readonly delay: 5000;
        };
        readonly removeOnComplete: 20;
        readonly removeOnFail: 50;
    };
    readonly webhook: {
        readonly attempts: 5;
        readonly backoff: {
            readonly type: "exponential";
            readonly delay: 1000;
        };
        readonly removeOnComplete: 200;
        readonly removeOnFail: 1000;
    };
};
//# sourceMappingURL=index.d.ts.map