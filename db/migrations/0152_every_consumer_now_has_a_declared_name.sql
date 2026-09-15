-- 0152 — The declared-name guarantee is scoped to ACTIVE (supported) consumers.
--
-- ACCOUNT-ONBOARDING-NAME-001 · Sandbox current-state clean-slate. Migration
-- 0151 added `consumers_display_name_present` as an UNCONDITIONAL NOT VALID
-- CHECK (every row must have a name), deferring the scan so pre-enforcement rows
-- were not retro-failed.
--
-- Reality after the clean-slate retirement: every ACTIVE consumer has a declared
-- name (0 nameless active — proven by tools/check-consumer-residue.mjs), but
-- retired consumers created before enforcement are legitimately nameless: they
-- are SUSPENDED synthetic accounts we deliberately do NOT fake-backfill (§6/§70).
-- An unconditional VALIDATE would therefore fail on those historical retired
-- rows — which is not a defect but the point (we never invented names for them).
--
-- The supported guarantee is: every ACTIVE (current, supported) consumer carries
-- a declared name; retired rows are tolerated as immutable history. This
-- migration replaces the unconditional constraint with an ACTIVE-scoped one and
-- validates it immediately — it holds today (0 ACTIVE rows violate it), so from
-- here the database itself guarantees that no consumer can be ACTIVE without a
-- declared name (a nameless INSERT, or an UPDATE blanking an active name, fails),
-- while a retired nameless row stays as it is. This supersedes 0151's constraint;
-- 0151 is not edited in place.
--
-- PRECONDITION (holds after the clean-slate; enforced by the residue gate):
--   SELECT count(*) FROM consumers WHERE status='ACTIVE'
--     AND (display_name IS NULL OR btrim(display_name)='');  -- = 0
--
-- Reversible: DROP CONSTRAINT consumers_active_display_name_present.

ALTER TABLE consumers DROP CONSTRAINT IF EXISTS consumers_display_name_present;

ALTER TABLE consumers
    ADD CONSTRAINT consumers_active_display_name_present
    CHECK (status <> 'ACTIVE' OR (display_name IS NOT NULL AND btrim(display_name) <> ''));
