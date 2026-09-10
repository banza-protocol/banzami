-- environment-assurance.sql — read-only: does every environment-scoped row say
-- which environment it belongs to, and can a writer still leave it out?
--
--   SQL=/tmp/environment-assurance.sql /tmp/sbq.sh -At      (on the Sandbox VM)
--
-- Covers every `environment` column in the service-owned schemas (public,
-- developer, account_identity). Pure SELECTs — it runs in a read-only
-- transaction; per-table counts go through query_to_xml.
--
--   ENVIRONMENT_COLUMNS                 how many columns are checked
--   ENVIRONMENT_COLUMNS_WITH_DEFAULT    a default lets a writer omit it (0 required)
--   ENVIRONMENT_COLUMNS_LIVE_DEFAULT    the fail-open kind: DEFAULT 'LIVE' (0 required)
--   ENVIRONMENT_COLUMNS_NULLABLE        a NULL is an omission (0 required)
--   ENVIRONMENT_ROWS_NONCANONICAL       a value other than SANDBOX / LIVE (0 required;
--                                       platform_settings may also say GLOBAL)
--   SANDBOX_STACK_ROWS_LABELLED_LIVE    on the Sandbox stack, every LIVE row is a
--                                       mislabel (0 required)
-- An omitted environment fails exactly when the column is NOT NULL with no
-- default — the second and fourth lines establish that for every column.

WITH cols AS (
  SELECT c.table_schema, c.table_name, c.column_default, c.is_nullable
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
   WHERE c.column_name = 'environment'
     AND c.table_schema IN ('public', 'developer', 'account_identity'))
SELECT k, v FROM (
  SELECT 1 AS o, 'ENVIRONMENT_COLUMNS' AS k, count(*)::text AS v FROM cols
  UNION ALL SELECT 2, 'ENVIRONMENT_COLUMNS_WITH_DEFAULT', count(*)::text FROM cols WHERE column_default IS NOT NULL
  UNION ALL SELECT 3, 'ENVIRONMENT_COLUMNS_LIVE_DEFAULT', count(*)::text FROM cols WHERE column_default ILIKE '%LIVE%'
  UNION ALL SELECT 4, 'ENVIRONMENT_COLUMNS_NULLABLE', count(*)::text FROM cols WHERE is_nullable = 'YES'
  UNION ALL SELECT 5, 'ENVIRONMENT_COLUMNS_WITH_DEFAULT_LIST',
                   coalesce(string_agg(table_schema || '.' || table_name, ',' ORDER BY table_name), '')
              FROM cols WHERE column_default IS NOT NULL
  UNION ALL SELECT 6, 'ENVIRONMENT_COLUMNS_NULLABLE_LIST',
                   coalesce(string_agg(table_schema || '.' || table_name, ',' ORDER BY table_name), '')
              FROM cols WHERE is_nullable = 'YES'
) x ORDER BY o;

WITH cols AS (
  SELECT c.table_schema, c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
   WHERE c.column_name = 'environment'
     AND c.table_schema IN ('public', 'developer', 'account_identity')),
rows AS (
  SELECT table_schema || '.' || table_name AS tbl,
         (xpath('/row/n/text()', query_to_xml(format(
            'SELECT count(*) AS n FROM %I.%I WHERE environment IS NULL OR environment::text NOT IN (''SANDBOX'',''LIVE''%s)',
            table_schema, table_name,
            -- platform mode is one setting for the whole platform: GLOBAL is its scope.
            CASE WHEN table_schema = 'public' AND table_name = 'platform_settings' THEN ',''GLOBAL''' ELSE '' END),
            false, true, '')))[1]::text::bigint AS noncanonical,
         (xpath('/row/n/text()', query_to_xml(format(
            'SELECT count(*) AS n FROM %I.%I WHERE environment::text = ''LIVE''',
            table_schema, table_name), false, true, '')))[1]::text::bigint AS live
    FROM cols)
SELECT k, v FROM (
  SELECT 1 AS o, 'ENVIRONMENT_ROWS_NONCANONICAL' AS k, coalesce(sum(noncanonical), 0)::text AS v FROM rows
  UNION ALL SELECT 2, 'SANDBOX_STACK_ROWS_LABELLED_LIVE', coalesce(sum(live), 0)::text FROM rows
  UNION ALL SELECT 3, 'ROWS_LABELLED_LIVE_BY_TABLE', coalesce(string_agg(tbl || '=' || live, ',' ORDER BY tbl), '') FROM rows WHERE live > 0
  UNION ALL SELECT 4, 'NONCANONICAL_BY_TABLE', coalesce(string_agg(tbl || '=' || noncanonical, ',' ORDER BY tbl), '') FROM rows WHERE noncanonical > 0
) x ORDER BY o;
