import { Processor, Process } from "@nestjs/bull";
import { Logger } from "@nestjs/common";
import { Job } from "bull";
import { PrismaClient } from "@prisma/client";
import { QUEUE_NAMES, SitemapJobPayload } from "@mpc/queue";
import { SitemapGeneratorService } from "../services/sitemap-generator.service";
import { InternalLinkingService } from "../services/internal-linking.service";

// =============================================================================
// SITEMAP PROCESSOR
//
// Triggered after every publish batch completes.
// Regenerates the sitemap and uploads to S3.
// Concurrency: 1 — only one sitemap generation per project at a time.
// Multiple concurrent sitemap jobs for the same project would produce
// race conditions in S3 uploads.
// =============================================================================

@Processor(QUEUE_NAMES.SITEMAP)
export class SitemapProcessor {
  private readonly logger = new Logger(SitemapProcessor.name);

  constructor(
    private readonly prisma: PrismaClient,
    private readonly sitemapGenerator: SitemapGeneratorService,
    private readonly internalLinking: InternalLinkingService
  ) {}

  @Process({ name: "generate-sitemap", concurrency: 1 })
  async generateSitemap(job: Job<SitemapJobPayload>): Promise<void> {
    const { orgId, projectId } = job.data;

    this.logger.log(`Generating sitemap for project ${projectId}`);

    // Get project base URL from settings
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { settings: true },
    });

    const settings = (project?.settings as Record<string, string>) ?? {};
    const baseUrl = settings.baseUrl ?? "https://example.com";

    // Generate sitemap files
    const files = await this.sitemapGenerator.generate(projectId, orgId, baseUrl);

    // Upload each file to S3
    for (const file of files) {
      const s3Key = `sitemaps/${orgId}/${projectId}/${file.filename}`;
      await this.uploadToS3(s3Key, file.xml);
    }

    // Find the primary sitemap file (index or single)
    const primaryFile = files.find(
      (f) => f.filename === "sitemap-index.xml" || f.filename === "sitemap.xml"
    );

    if (primaryFile) {
      const primaryKey = `sitemaps/${orgId}/${projectId}/${primaryFile.filename}`;
      const publicUrl = `${baseUrl}/sitemaps/${primaryFile.filename}`;

      // Upsert sitemap record
      await this.prisma.sitemap.upsert({
        where: { projectId },
        create: {
          orgId,
          projectId,
          fileKey: primaryKey,
          publicUrl,
          pageCount: primaryFile.pageCount,
        },
        update: {
          fileKey: primaryKey,
          publicUrl,
          pageCount: primaryFile.pageCount,
          generatedAt: new Date(),
        },
      });
    }

    this.logger.log(
      `Sitemap generated for project ${projectId}: ${files.length} file(s)`
    );
  }

  // Handle link rebuild job — triggered from API
  @Process({ name: "rebuild-links", concurrency: 1 })
  async rebuildLinks(job: Job<SitemapJobPayload>): Promise<void> {
    const { orgId, projectId } = job.data;
    this.logger.log(`Rebuilding internal links for project ${projectId}`);
    await this.internalLinking.rebuildProjectLinks(projectId, orgId);
    this.logger.log(`Link rebuild complete for project ${projectId}`);
  }

  // Overridden in the concrete module with actual S3 service
  protected async uploadToS3(key: string, content: string): Promise<void> {
    throw new Error(`uploadToS3 not implemented — key: ${key}`);
  }
}
