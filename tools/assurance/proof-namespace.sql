-- proof-namespace.sql — read-only: is every BZM-shaped value a proof?
--
--   SQL=/tmp/proof-namespace.sql /tmp/sbq.sh -At      (on the Sandbox VM)
--
-- "BZM-…" is the public proof namespace: a person who sees one expects it to
-- verify at banzami.com/r/<it>. Any text column in the service schemas holding
-- a BZM-shaped value that is NOT a stored proof reference is a receipt that
-- promises verification it cannot deliver (or an identifier dressed as one).
--
--   BZM_SHAPED_NON_PROOF_VALUES   must be 0
--   BZM_SHAPED_BY_COLUMN          where they are, if any
-- Pure SELECTs; per-column counts through query_to_xml.

WITH cols AS (
  SELECT c.table_schema, c.table_name, c.column_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
   WHERE c.table_schema IN ('public', 'developer', 'account_identity')
     AND c.data_type IN ('text', 'character varying')
     AND NOT (c.table_schema = 'public' AND c.table_name = 'transaction_proofs' AND c.column_name = 'proof_reference')
     AND c.table_name NOT LIKE '\_sqlx%'),
hits AS (
  SELECT table_schema || '.' || table_name || '.' || column_name AS col,
         (xpath('/row/n/text()', query_to_xml(format(
            'SELECT count(*) AS n FROM %I.%I x WHERE x.%I ~ ''BZM-[0-9A-Z]{4}-[0-9A-Z]{4}''
               AND NOT EXISTS (SELECT 1 FROM public.transaction_proofs p
                                WHERE x.%I LIKE ''%%'' || p.proof_reference || ''%%'')',
            table_schema, table_name, column_name, column_name), false, true, '')))[1]::text::bigint AS n
    FROM cols)
SELECT 'BZM_SHAPED_NON_PROOF_VALUES', coalesce(sum(n), 0)::text FROM hits
UNION ALL
SELECT 'BZM_SHAPED_BY_COLUMN', coalesce(string_agg(col || '=' || n, ',' ORDER BY col), '') FROM hits WHERE n > 0;
