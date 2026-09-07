-- =============================================================================
-- Migration: 001_init_extensions
-- Purpose: Set up PostgreSQL extensions, RLS, FTS indexes, and partitioning
-- Run AFTER prisma migrate (which creates the base tables)
-- =============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";   -- uuid_generate_v4()
CREATE EXTENSION IF NOT EXISTS "pg_trgm";     -- trigram indexes for LIKE search
CREATE EXTENSION IF NOT EXISTS "pgcrypto";    -- gen_random_bytes for tokens

-- =============================================================================
-- ROW LEVEL SECURITY
-- Enforces tenant isolation at the DB layer — a safety net on top of
-- application-layer org_id filtering. Even if a bug bypasses app logic,
-- RLS prevents cross-tenant data leaks.
-- =============================================================================

ALTER TABLE generated_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Policy: app connects as 'app_user' role, current_setting carries org_id
-- Set via: SET LOCAL app.current_org_id = '<uuid>' at start of each request

CREATE POLICY tenant_isolation ON generated_pages
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

CREATE POLICY tenant_isolation ON templates
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

CREATE POLICY tenant_isolation ON projects
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

CREATE POLICY tenant_isolation ON ai_generations
  USING (org_id = current_setting('app.current_org_id', true)::uuid);

-- =============================================================================
-- FULL-TEXT SEARCH
-- GIN index on tsvector for fast full-text search on page title + slug.
-- pg_trgm GIN index for ILIKE/fuzzy search (handles partial matches).
-- =============================================================================

-- Full-text search vector on generated_pages
ALTER TABLE generated_pages
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(slug, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'C')
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_pages_search
  ON generated_pages USING GIN(search_vector);

-- Trigram index for fuzzy/partial search on title
CREATE INDEX IF NOT EXISTS idx_pages_title_trgm
  ON generated_pages USING GIN(title gin_trgm_ops);

-- Trigram index for slug autocomplete
CREATE INDEX IF NOT EXISTS idx_pages_slug_trgm
  ON generated_pages USING GIN(slug gin_trgm_ops);

-- =============================================================================
-- PARTIAL INDEXES
-- Only index rows that match a condition — much smaller, much faster.
-- =============================================================================

-- Only index active (non-deleted) pages — most queries filter deletedAt IS NULL
CREATE INDEX IF NOT EXISTS idx_pages_active
  ON generated_pages(org_id, project_id, status)
  WHERE deleted_at IS NULL;

-- Only index published pages for sitemap generation
CREATE INDEX IF NOT EXISTS idx_pages_published
  ON generated_pages(project_id, published_at)
  WHERE status = 'PUBLISHED' AND deleted_at IS NULL;

-- Only index pending/processing jobs for queue polling
CREATE INDEX IF NOT EXISTS idx_publish_jobs_active
  ON publish_jobs(org_id, created_at)
  WHERE status IN ('QUEUED', 'PROCESSING');

-- =============================================================================
-- USAGE RECORDS — upsert function
-- Called by the application to increment usage counters atomically.
-- Using a function prevents race conditions from concurrent workers.
-- =============================================================================

CREATE OR REPLACE FUNCTION increment_usage(
  p_org_id   UUID,
  p_metric   TEXT,
  p_value    INT DEFAULT 1
) RETURNS VOID AS $$
BEGIN
  INSERT INTO usage_records (id, org_id, metric, value, date, created_at, updated_at)
  VALUES (
    uuid_generate_v4(),
    p_org_id,
    p_metric,
    p_value,
    CURRENT_DATE,
    NOW(),
    NOW()
  )
  ON CONFLICT (org_id, metric, date)
  DO UPDATE SET
    value      = usage_records.value + EXCLUDED.value,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- GENERATED PAGES — monthly range partitioning
-- Partitioning keeps query performance stable as the table grows to millions.
-- Each monthly partition is a separate physical table — queries that filter
-- by created_at only scan the relevant partition(s).
--
-- NOTE: Prisma manages the parent table schema. We manage partitions manually.
-- In production, use pg_partman to auto-create future partitions.
-- =============================================================================

-- Convert generated_pages to a partitioned table (run on fresh DB only)
-- In production with existing data, use pg_partman's partition migration tools.

-- Example: create 2025 partitions
-- CREATE TABLE generated_pages_2025_01 PARTITION OF generated_pages
--   FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
-- CREATE TABLE generated_pages_2025_02 PARTITION OF generated_pages
--   FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');
-- ... (automate with pg_partman in production)

-- =============================================================================
-- AUDIT LOG — append-only enforcement
-- Revoke UPDATE and DELETE on audit_logs from the app user role.
-- Only INSERT is allowed — immutable audit trail.
-- =============================================================================

-- REVOKE UPDATE, DELETE ON audit_logs FROM app_user;
-- (Uncomment after creating the app_user role in production)
