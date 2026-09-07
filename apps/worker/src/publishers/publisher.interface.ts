// =============================================================================
// PUBLISHER INTERFACE
//
// Every publish target (WordPress, Static HTML, Webhook) implements this.
// The processor calls publisher.publish() — doesn't care which target.
//
// Why this abstraction?
// Adding a new publish target = implement this interface + register in processor.
// Zero changes to existing code.
// =============================================================================

export interface PageToPublish {
  id: string;
  slug: string;
  title: string;
  description: string;
  content: string;          // rendered HTML
  canonicalUrl: string;
  focusKeyword: string | null;
  schemaMarkups: Array<{ type: string; data: Record<string, unknown> }>;
  dataRow: Record<string, string>;
}

export interface PublishResult {
  pageId: string;
  success: boolean;
  publishedUrl?: string;
  error?: string;
}

export interface Publisher {
  // Publish a single page — returns result with success/error
  publish(page: PageToPublish, config: Record<string, unknown>): Promise<PublishResult>;

  // Validate config before starting a job — called at job creation time
  validateConfig(config: Record<string, unknown>): string | null; // null = valid, string = error message
}
