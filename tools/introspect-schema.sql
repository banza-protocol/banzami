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
-- AUTHORITATIVE VISIBILITY (COLLECTIONS-PROTOCOL-AND-PRODUCT-001): this reads
-- `pg_catalog` (pg_class/pg_attribute/pg_namespace), NOT the SQL-standard
-- `information_schema.tables`/`columns`. `information_schema` is
-- PRIVILEGE-FILTERED — it only lists objects the CONNECTING ROLE owns or holds a
-- privilege on — so a table owned by another role (e.g. business_receive_points is
-- owned by sbadmin, while the migration login runs as bl_schema_owner) is silently
-- omitted, producing a FALSE "missing table" drift on a schema that is actually
-- correct. `pg_catalog` is world-readable to every role and lists ALL relations
-- regardless of ownership, so the detector observes the true physical schema and
-- still fails closed on a genuinely-absent object (it simply is not in pg_class).
--
-- Naming: `public` objects stay UNQUALIFIED (backward-compatible with the existing
-- manifest); every other schema is emitted SCHEMA-QUALIFIED ("developer.foo",
-- "developer.foo.col", "account_identity.bar_idx") so cross-schema name
-- collisions (e.g. developer.audit_events vs account_identity.audit_events) are
-- unambiguous. To add another service-owned schema, extend the three IN (...) lists.
-- relkind IN ('r','p') = ordinary + partitioned tables (what information_schema
-- reported as BASE TABLE), excluding views/sequences/indexes/foreign tables.
SELECT json_build_object(
  'tables', (
    SELECT COALESCE(json_agg(q ORDER BY q), '[]'::json)
    FROM (
      SELECT CASE WHEN n.nspname = 'public'
                  THEN c.relname
                  ELSE n.nspname || '.' || c.relname END AS q
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname IN ('public', 'developer', 'account_identity')
        AND c.relkind IN ('r', 'p')
    ) s
  ),
  'columns', (
    SELECT COALESCE(json_object_agg(k, n), '{}'::json)
    FROM (
      SELECT (CASE WHEN ns.nspname = 'public'
                   THEN c.relname
                   ELSE ns.nspname || '.' || c.relname END) || '.' || a.attname AS k,
             (NOT a.attnotnull) AS n
      FROM pg_catalog.pg_attribute a
      JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
      JOIN pg_catalog.pg_namespace ns ON ns.oid = c.relnamespace
      WHERE ns.nspname IN ('public', 'developer', 'account_identity')
        AND c.relkind IN ('r', 'p')
        AND a.attnum > 0
        AND NOT a.attisdropped
    ) s
  ),
  'indexes', (
    SELECT COALESCE(json_agg(q ORDER BY q), '[]'::json)
    FROM (
      -- pg_indexes is a pg_catalog view (already ownership-agnostic).
      SELECT CASE WHEN schemaname = 'public'
                  THEN indexname
                  ELSE schemaname || '.' || indexname END AS q
      FROM pg_catalog.pg_indexes
      WHERE schemaname IN ('public', 'developer', 'account_identity')
    ) s
  )
);
