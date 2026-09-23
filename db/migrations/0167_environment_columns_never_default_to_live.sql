-- 0167 — An `environment` column must never default to LIVE (fail-closed).
--
-- The financial-assurance gate (tools/assurance/sandbox-financial-assurance.sql,
-- LIVE_DEFAULTED_ENVIRONMENT_COLUMNS) requires that no `environment` column
-- carries a DEFAULT of 'LIVE': a row must state its environment explicitly, so a
-- Sandbox row can never silently become LIVE because a column was omitted.
--
-- Three Collections-era tables shipped with `environment text NOT NULL DEFAULT
-- 'LIVE'`. Every writer already supplies the column explicitly (core/collections
-- repository inserts list `environment` in every statement), so dropping the
-- default changes no behaviour — it only removes the dangerous fallback and
-- makes the column mandatory in fact as it already is in practice.
--
-- Reversible: re-add `DEFAULT 'LIVE'` on each column (not recommended).

ALTER TABLE collections        ALTER COLUMN environment DROP DEFAULT;
ALTER TABLE payment_intents    ALTER COLUMN environment DROP DEFAULT;
ALTER TABLE collection_shares  ALTER COLUMN environment DROP DEFAULT;
