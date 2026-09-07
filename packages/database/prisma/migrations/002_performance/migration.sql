-- =============================================================================
-- MIGRATION 002: PERFORMANCE OPTIMIZATIONS
--
-- Adds:
--   1. Composite + partial indexes for common query patterns
--   2. GIN index for JSONB dataRow queries (internal linking)
--   3. Full-text search + trigram indexes on title/slug
--   4. increment_usage() atomic function (called by workers)
--   5. get_monthly_usage() helper for plan limit checks
-- =============================================================================

-- ── generated_pages indexes ───────────────────────────────────────────────────

-- Dashboard: pages for project ordered by SEO score
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pages_project_score
  ON generated_pages (project_id, seo_score DESC NULLS LAST)
  WHERE deleted_at IS NULL;

-- Publish queue: find all GENERATED pages for a project
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pages_project_status
  ON generated_pages (project_id, status)
  WHERE deleted_at IS NULL;

-- Sitemap: find all PUBLISHED pages ordered by updated_at
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pages_project_published
  ON generated_pages (project_id, updated_at DESC)
  WHERE status = 'PUBLISHED' AND deleted_at IS NULL;

-- Internal linking: WHERE data_row @> '{"service": "plumber"}'
-- GIN is optimal for JSONB containment queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pages_data_row_gin
  ON generated_pages USING GIN (data_row jsonb_path_ops);

-- Full-text search on title + slug
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pages_fts
  ON generated_pages USING GIN (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(slug, ''))
  );

-- Trigram indexes for ILIKE search (e.g. WHERE title ILIKE '%plumber%')
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pages_title_trgm
  ON generated_pages USING GIN (title gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pages_slug_trgm
  ON generated_pages USING GIN (slug gin_trgm_ops);

-- ── ai_generations indexes ────────────────────────────────────────────────────

-- Cost reporting: total tokens by org in date range
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ai_gen_org_date
  ON ai_generations (org_id, created_at DESC);

-- Cache lookup: has this prompt been generated before?
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ai_gen_cache_key
  ON ai_generations (cache_key)
  WHERE cache_key IS NOT NULL;

-- ── internal_links indexes ────────────────────────────────────────────────────

-- Orphan detection: pages with no inbound links
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_links_target
  ON internal_links (target_page_id);

-- Link graph traversal
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_links_source_project
  ON internal_links (source_page_id, project_id);

-- ── usage_records index ───────────────────────────────────────────────────────

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_usage_org_metric_date
  ON usage_records (org_id, metric, date DESC);

-- ── audit_logs index ──────────────────────────────────────────────────────────

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_org_created
  ON audit_logs (org_id, created_at DESC);

-- ── increment_usage() — atomic upsert function ────────────────────────────────
-- Called by workers after each page generation / AI call.
-- INSERT ... ON CONFLICT ensures atomicity across concurrent workers.

CREATE OR REPLACE FUNCTION increment_usage(
  p_org_id  UUID,
  p_metric  TEXT,
  p_amount  INTEGER DEFAULT 1
) RETURNS VOID AS $$
BEGIN
  INSERT INTO usage_records (org_id, metric, value, date, created_at, updated_at)
  VALUES (p_org_id, p_metric, p_amount, CURRENT_DATE, NOW(), NOW())
  ON CONFLICT (org_id, metric, date)
  DO UPDATE SET
    value      = usage_records.value + EXCLUDED.value,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- ── get_monthly_usage() — plan limit check ────────────────────────────────────

CREATE OR REPLACE FUNCTION get_monthly_usage(
  p_org_id UUID,
  p_metric TEXT
) RETURNS INTEGER AS $$
  SELECT COALESCE(SUM(value), 0)::INTEGER
  FROM usage_records
  WHERE org_id    = p_org_id
    AND metric    = p_metric
    AND date     >= date_trunc('month', CURRENT_DATE)
    AND date      < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month';
$$ LANGUAGE sql STABLE;
