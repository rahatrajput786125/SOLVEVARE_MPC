-- Enable extensions required by the schema
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- pg_trgm: enables trigram-based full-text search on title/slug columns
-- uuid-ossp: enables uuid_generate_v4() for primary keys
