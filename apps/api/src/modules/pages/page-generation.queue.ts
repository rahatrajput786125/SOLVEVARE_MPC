import { InjectQueue } from "@nestjs/bull";
import { Injectable } from "@nestjs/common";
import { Queue } from "bull";
import { QUEUE_NAMES, PageGenerationChunkPayload, QUEUE_OPTIONS } from "@mpc/queue";

export const PAGE_GENERATION_QUEUE = QUEUE_NAMES.PAGE_GENERATION;
export const CHUNK_SIZE = 500; // smaller chunks = more parallelism on MongoDB standalone

@Injectable()
export class PageGenerationQueue {
  constructor(
    @InjectQueue(PAGE_GENERATION_QUEUE)
    private readonly queue: Queue<PageGenerationChunkPayload>
  ) {}

  // Split totalRows into 1000-row chunks and enqueue all in one Redis pipeline.
  // Each job carries only slice indices — no row data in Redis payload.
  // jobId is stable (chunk:runId:chunkIndex) — re-enqueueing the same chunk
  // is idempotent: Bull ignores the add if the jobId already exists.
  async enqueueChunks(
    generationJobId: string,
    orgId: string,
    projectId: string,
    templateId: string,
    dataSourceId: string,
    filePath: string,
    totalRows: number
  ): Promise<number> {
    const totalChunks = Math.ceil(totalRows / CHUNK_SIZE);

    const jobs = Array.from({ length: totalChunks }, (_, i) => ({
      name: "process-chunk",
      data: {
        generationJobId,
        orgId,
        projectId,
        templateId,
        dataSourceId,
        filePath,
        startIndex: i * CHUNK_SIZE,
        endIndex: Math.min((i + 1) * CHUNK_SIZE, totalRows),
        chunkIndex: i,
        totalChunks,
      } as PageGenerationChunkPayload,
      opts: {
        // 3 attempts with exponential backoff — handles transient DB/disk errors
        attempts: 3,
        backoff: { type: "exponential" as const, delay: 2000 },
        removeOnComplete: 50,
        removeOnFail: 200,
        // Stable ID — prevents duplicate processing on retry/recovery
        jobId: `chunk:${generationJobId}:${i}`,
      },
    }));

    await this.queue.addBulk(jobs);
    return totalChunks;
  }

  async getJobCounts() {
    return this.queue.getJobCounts();
  }
}
