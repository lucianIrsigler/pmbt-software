-- Custom migration: extensions needed by later migrations.
-- pg_trgm powers fast "contains" search on client names (client_name_trgm_idx).
CREATE EXTENSION IF NOT EXISTS pg_trgm;
