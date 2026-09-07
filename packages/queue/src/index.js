"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QUEUE_OPTIONS = exports.QUEUE_NAMES = void 0;
// Queue names as constants — prevents typos across producer/consumer
exports.QUEUE_NAMES = {
    CSV_IMPORT: "csv-import",
    PAGE_GENERATION: "page-generation",
    AI_CONTENT: "ai-content",
    PUBLISH: "publish",
    SITEMAP: "sitemap",
    WEBHOOK: "webhook",
    EMAIL: "email",
    EXPORT: "export",
};
// Default BullMQ job options per queue — tuned for each concern
exports.QUEUE_OPTIONS = {
    [exports.QUEUE_NAMES.CSV_IMPORT]: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 500,
    },
    [exports.QUEUE_NAMES.PAGE_GENERATION]: {
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: 50,
        removeOnFail: 200,
    },
    [exports.QUEUE_NAMES.AI_CONTENT]: {
        attempts: 5, // AI APIs are flaky — more retries
        backoff: { type: "exponential", delay: 3000 },
        removeOnComplete: 50,
        removeOnFail: 200,
    },
    [exports.QUEUE_NAMES.PUBLISH]: {
        attempts: 3,
        backoff: { type: "exponential", delay: 10000 },
        removeOnComplete: 100,
        removeOnFail: 500,
    },
    [exports.QUEUE_NAMES.SITEMAP]: {
        attempts: 3,
        backoff: { type: "fixed", delay: 5000 },
        removeOnComplete: 10,
        removeOnFail: 50,
    },
    [exports.QUEUE_NAMES.EXPORT]: {
        attempts: 2,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: 20,
        removeOnFail: 50,
    },
    [exports.QUEUE_NAMES.WEBHOOK]: {
        attempts: 5,
        backoff: { type: "exponential", delay: 1000 },
        removeOnComplete: 200,
        removeOnFail: 1000,
    },
};
//# sourceMappingURL=index.js.map