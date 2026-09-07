import { Injectable, Logger } from "@nestjs/common";
import { statfs } from "fs/promises";
import { getPagesRoot } from "./html-file.store";

// Average compressed HTML page size estimate in bytes (~50 KB per page)
const BYTES_PER_PAGE = 50 * 1024;
// Minimum free buffer to keep on disk beyond estimated generation size (500 MB)
const MIN_BUFFER_BYTES = 500 * 1024 * 1024;

@Injectable()
export class DiskSpaceService {
  private readonly logger = new Logger(DiskSpaceService.name);

  /**
   * Throws if disk space is insufficient for generating `pageCount` pages.
   * Called before a GenerationRun is enqueued.
   */
  async assertSufficientSpace(pageCount: number): Promise<void> {
    const estimatedBytes = pageCount * BYTES_PER_PAGE;
    const available = await this.getAvailableBytes();

    this.logger.debug(
      `Disk check: available=${mb(available)} MB  estimated=${mb(estimatedBytes)} MB  pages=${pageCount}`
    );

    if (available < estimatedBytes + MIN_BUFFER_BYTES) {
      throw new InsufficientDiskSpaceError(available, estimatedBytes);
    }
  }

  async getAvailableBytes(): Promise<number> {
    try {
      const root = getPagesRoot();
      const stats = await statfs(root);
      return stats.bavail * stats.bsize;
    } catch (err) {
      // If we can't stat (e.g. root not yet created), treat as sufficient
      // to avoid blocking generation on a missing directory.
      this.logger.warn(`statfs failed — skipping disk check: ${(err as Error).message}`);
      return Infinity;
    }
  }
}

export class InsufficientDiskSpaceError extends Error {
  constructor(availableBytes: number, estimatedBytes: number) {
    super(
      `Insufficient disk space. Available: ${mb(availableBytes)} MB, ` +
      `Required: ${mb(estimatedBytes + MIN_BUFFER_BYTES)} MB`
    );
    this.name = "InsufficientDiskSpaceError";
  }
}

function mb(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(1);
}
