-- Emit the live physical schema as one JSON object for the drift detector.
-- Usage: psql -tAc "$(cat introspect.sql)" <dburl> > inventory.json
-- Read-only. Covers public schema (extend WHERE clauses for other schemas).
SELECT json_build_object(
  'tables', (
    SELECT COALESCE(json_agg(table_name ORDER BY table_name), '[]'::json)
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  ),
  'columns', (
    SELECT COALESCE(json_object_agg(table_name || '.' || column_name, (is_nullable = 'YES')), '{}'::json)
    FROM information_schema.columns
    WHERE table_schema = 'public'
  ),
  'indexes', (
    SELECT COALESCE(json_agg(indexname ORDER BY indexname), '[]'::json)
    FROM pg_indexes
    WHERE schemaname = 'public'
  )
);
