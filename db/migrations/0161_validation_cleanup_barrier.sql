-- 0161 — Banzami Validation Studio: the cleanup barrier.
--
-- BANZAMI-SANDBOX-FULL-VALIDATION-001 Phase D, VD-009.
--
-- FULL's no-cleanup upper bound on funded value is 56 950 000 minor against a
-- shared Sandbox cap of 50 000 000, and a start gate that must also survive a
-- failed run plus one retry needs 113 900 000. FULL is therefore feasible ONLY
-- because cleanup works. That is not a number to adjust: it is a dependency
-- that was invisible for as long as cleanup was something harnesses did by
-- convention and nothing verified.
--
-- This migration makes the dependency representable, so the runner can enforce
-- it and the Studio can show it:
--
--   1. A JOURNEY HAS TWO RESULTS. `outcome` stays the terminal verdict — a
--      PASSED journey is one that both worked AND left nothing behind. The
--      functional half is recorded separately, so FUNCTIONAL PASS + CLEANUP
--      FAIL is a state the record can express instead of a judgement call made
--      at the moment of writing. It is not a clean PASS, and now it cannot be
--      mistaken for one after the fact.
--
--   2. RESOURCES ARE OWNED, NEVER RECOGNISED. Every disposable thing a journey
--      creates is claimed here against the run and the journey that created it.
--      The first synthetic audit of this Sandbox classified `fm65`, `priscila`,
--      `oxfannio` and `qatester15` as UNKNOWN — real people's accounts holding
--      6 763 380 minor, matching every naming pattern a leaked fixture does. A
--      sweep by pattern would have destroyed them. Ownership is declared at
--      creation or it does not exist.
--
--   3. NULL MEANS "BEFORE THE BARRIER", NOT "CLEAN". Rows written by runs that
--      predate this migration are left NULL rather than backfilled. Filling
--      them from today's values would assert something about the past that
--      nothing observed — the same reason BZV-20260918-0001 still reads
--      "provenance not captured" instead of being tidied up.
--
-- Additive only: every column is nullable or defaulted, no existing row is
-- rewritten, and a runner that does not know about these columns keeps working.
-- Reversible: see the DOWN section at the end.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. A journey's two results
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE validation_run_journeys
    ADD COLUMN IF NOT EXISTS functional_result TEXT
        CHECK (functional_result IN ('PASSED','FAILED','UNAVAILABLE')),
    -- VERIFIED      the journey declared its residue and it was measured as nil
    -- NOT_REQUIRED  the journey creates nothing disposable (registry-declared)
    -- UNDECLARED    it created something and reported no residue: not a pass
    -- FAILED        residue remained, or the measurement itself failed
    -- NOT_REACHED   the run stopped before this journey's cleanup phase
    ADD COLUMN IF NOT EXISTS cleanup_result TEXT
        CHECK (cleanup_result IN ('VERIFIED','NOT_REQUIRED','UNDECLARED','FAILED','NOT_REACHED')),
    ADD COLUMN IF NOT EXISTS cleanup_detail TEXT,
    ADD COLUMN IF NOT EXISTS cleanup_verified_at TIMESTAMPTZ;

COMMENT ON COLUMN validation_run_journeys.functional_result IS
    'Did the journey''s assertions hold? NULL for runs that predate 0161.';
COMMENT ON COLUMN validation_run_journeys.cleanup_result IS
    'Did it leave the Sandbox as it found it? UNDECLARED is not a pass.';

-- A journey cannot be terminally PASSED while its cleanup is known to have
-- failed. Enforced here rather than in the executor, because the executor is
-- the thing most likely to be edited in a hurry during a failing run.
ALTER TABLE validation_run_journeys
    DROP CONSTRAINT IF EXISTS validation_run_journeys_clean_pass;
ALTER TABLE validation_run_journeys
    ADD CONSTRAINT validation_run_journeys_clean_pass CHECK (
        outcome <> 'PASSED'
        OR cleanup_result IS NULL                     -- pre-0161 rows
        OR cleanup_result IN ('VERIFIED','NOT_REQUIRED')
    );

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. The resource ledger
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS validation_run_resources (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id           UUID        NOT NULL REFERENCES validation_runs(id) ON DELETE CASCADE,
    journey_id       TEXT        NOT NULL,
    -- What kind of thing this is, so a cleanup verifier knows how to look for
    -- it. Extending this list is a migration, deliberately: a resource class
    -- nothing knows how to verify must not be silently accepted as clean.
    resource_class   TEXT        NOT NULL
                     CHECK (resource_class IN (
                         'CONSUMER_IDENTITY','BUSINESS','MERCHANT_APPLICATION',
                         'WALLET_FUNDING','DEVELOPER_WORKSPACE','DEVELOPER_PROJECT',
                         'API_KEY','TEST_PAYER','PAYMENT_LINK','CHARGE',
                         'WEBHOOK_ENDPOINT','EXTERNAL_RAIL_STATE')),
    -- The identifier the creating journey used. Opaque here on purpose: this
    -- table records WHO owns it, not how to recognise it.
    resource_ref     TEXT        NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    cleanup_required BOOLEAN     NOT NULL,
    cleanup_state    TEXT        NOT NULL DEFAULT 'PENDING'
                     CHECK (cleanup_state IN ('PENDING','RETIRED','VERIFIED_ABSENT','FAILED','NOT_REQUIRED')),
    cleanup_evidence TEXT,
    cleaned_at       TIMESTAMPTZ,
    UNIQUE (run_id, journey_id, resource_class, resource_ref)
);

CREATE INDEX IF NOT EXISTS validation_run_resources_open
    ON validation_run_resources (run_id, cleanup_state)
    WHERE cleanup_required AND cleanup_state NOT IN ('RETIRED','VERIFIED_ABSENT','NOT_REQUIRED');

COMMENT ON TABLE validation_run_resources IS
    'Disposable things a Validation Run created, claimed by the journey that '
    'created them. Ownership is declared at creation; it is never inferred '
    'from a name, a prefix or a timestamp.';

-- A resource that does not require cleanup cannot be in a cleanup state that
-- implies one was attempted and failed.
ALTER TABLE validation_run_resources
    DROP CONSTRAINT IF EXISTS validation_run_resources_state_agrees;
ALTER TABLE validation_run_resources
    ADD CONSTRAINT validation_run_resources_state_agrees CHECK (
        cleanup_required OR cleanup_state = 'NOT_REQUIRED'
    );

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- DOWN (manual; this file is applied forward by the migration runner)
-- ─────────────────────────────────────────────────────────────────────────────
--
--   BEGIN;
--   DROP TABLE IF EXISTS validation_run_resources;
--   ALTER TABLE validation_run_journeys
--       DROP CONSTRAINT IF EXISTS validation_run_journeys_clean_pass,
--       DROP COLUMN IF EXISTS cleanup_verified_at,
--       DROP COLUMN IF EXISTS cleanup_detail,
--       DROP COLUMN IF EXISTS cleanup_result,
--       DROP COLUMN IF EXISTS functional_result;
--   COMMIT;
--
-- Dropping these loses the cleanup record of any run executed under 0161. The
-- runs themselves, their evidence and their event history are untouched.
