-- Rollback — 2026-06-30 migration-governance change
-- =================================================
-- Reverts the LIVE changes made when adopting sqlx migration tracking:
--   1. the operator tables added to LIVE (refunds/disputes/payment_requests), and
--   2. the _sqlx_migrations tracking table backfill.
--
-- After this, LIVE returns to its pre-change state (the schema captured in
-- /srv/banzami/backups/banzami_schema_20260630.sql, which already includes the
-- 0078 KYB FK from the prior audit sprint). Order drops child tables before
-- parents; CASCADE is belt-and-braces.
--
-- Apply: psql "$LIVE_DATABASE_URL" -v ON_ERROR_STOP=1 -f this_file.sql
-- Verified: restored on a scratch copy and diffed byte-identical to the backup
-- (see the rollback test in the delivery report).

BEGIN;

DROP TABLE IF EXISTS dispute_evidence CASCADE;
DROP TABLE IF EXISTS disputes         CASCADE;
DROP TABLE IF EXISTS refund_events    CASCADE;
DROP TABLE IF EXISTS refunds          CASCADE;
DROP TABLE IF EXISTS payment_requests CASCADE;

-- Remove tracking adoption (returns the DB to "untracked", its pre-change state).
DROP TABLE IF EXISTS _sqlx_migrations;

COMMIT;
