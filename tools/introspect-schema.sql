-- Emit the live physical schema as one JSON object for the drift detector.
-- Usage: psql -tAc "$(cat introspect.sql)" <dburl> > inventory.json
-- Read-only.
--
-- Covers every ACTIVE service-owned schema (Banzami ADR-047 / RT04B §1):
--   * public           — Core financial engine (core-api)
--   * developer        — Developer Platform + external key/binding authority (developer-api)
--   * account_identity — Developer Console account identity (developer-api)
-- The developer.* + account_identity.* schemas are part of the EXTERNAL
-- authorization authority (ADR-046/047) and MUST be verified like the financial
-- core — a missing migration there must fail the rollout gate, not slip through
-- because drift only looked at `public`.
--
-- Naming: `public` objects stay UNQUALIFIED (backward-compatible with the existing
-- manifest); every other schema is emitted SCHEMA-QUALIFIED ("developer.foo",
-- "developer.foo.col", "account_identity.bar_idx") so cross-schema name
-- collisions (e.g. developer.audit_events vs account_identity.audit_events) are
-- unambiguous. To add another service-owned schema, extend the three IN (...) lists.
SELECT json_build_object(
  'tables', (
    SELECT COALESCE(json_agg(q ORDER BY q), '[]'::json)
    FROM (
      SELECT CASE WHEN table_schema = 'public'
                  THEN table_name
                  ELSE table_schema || '.' || table_name END AS q
      FROM information_schema.tables
      WHERE table_schema IN ('public', 'developer', 'account_identity')
        AND table_type = 'BASE TABLE'
    ) s
  ),
  'columns', (
    SELECT COALESCE(json_object_agg(k, n), '{}'::json)
    FROM (
      SELECT (CASE WHEN table_schema = 'public'
                   THEN table_name
                   ELSE table_schema || '.' || table_name END) || '.' || column_name AS k,
             (is_nullable = 'YES') AS n
      FROM information_schema.columns
      WHERE table_schema IN ('public', 'developer', 'account_identity')
    ) s
  ),
  'indexes', (
    SELECT COALESCE(json_agg(q ORDER BY q), '[]'::json)
    FROM (
      SELECT CASE WHEN schemaname = 'public'
                  THEN indexname
                  ELSE schemaname || '.' || indexname END AS q
      FROM pg_indexes
      WHERE schemaname IN ('public', 'developer', 'account_identity')
    ) s
  )
);
