-- 0162 — Banzami Validation Studio: what a plan row IS, and why it did not run.
--
-- BANZAMI-SANDBOX-FULL-VALIDATION-001 Phase D.
--
-- BZV-20260919-0003 materialised 39 rows for a profile everybody calls "38
-- journeys". The 39th is the placeholder that lets a suite with no executable
-- journey still appear in the run's own account of itself — S20, blocked for
-- an architectural reason. Nothing in the schema said so, so every consumer
-- had to guess from `harness IS NULL` or from an id ending in NOT-PROVEN, and
-- the dashboard reported "9 / 39" with a footnote because inferring 38 would
-- have baked that guess into the surface people trust most.
--
-- The same run also recorded 30 journeys it never started as SKIPPED, while
-- the executor counted them as UNAVAILABLE. Neither word was right. They were
-- not skipped by policy and their adapters were fine — the run stopped at a
-- cleanup barrier before reaching them. "Could not be exercised" and "was
-- never attempted" are different facts and deserve different words.
--
--   1. RECORD_KIND IS DECLARED. JOURNEY or CONTROL, written by the planner
--      that knows which it made. Never inferred from a null column or a name.
--
--   2. NOT_REACHED IS A REAL OUTCOME. Not SKIPPED wearing a functional_result
--      of UNAVAILABLE, which is two fields conspiring to mean a third thing.
--
--   3. FUNDS ARE SAMPLED IN PHASES. The peak tracker read once per loop, at
--      the top, so the rise caused by the LAST executed journey was never
--      sampled: BZV-20260919-0003 reported actual_peak 0 while leaving
--      +2 000 000. A peak below the residual it is supposed to bound is not a
--      small error, it is an instrument reading zero while the needle moves.
--
--   4. HISTORY STAYS UNCERTAIN. Rows written before this migration keep
--      record_kind NULL. They could be classified by the same inference this
--      migration exists to abolish; doing that would make the old rows look
--      more certain than they are. NULL reads as LEGACY, which is true.
--
-- Additive: every column is nullable or defaulted, no existing row is
-- rewritten, and the outcome CHECK only ever gains a value. Reversible: see
-- the DOWN section at the end.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. What kind of record this is
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE validation_run_journeys
    ADD COLUMN IF NOT EXISTS record_kind TEXT
        CHECK (record_kind IN ('JOURNEY', 'CONTROL')),
    -- Why a CONTROL record exists. Carried on the row so a reader of the run
    -- does not need the registry to understand what it is looking at.
    ADD COLUMN IF NOT EXISTS control_classification TEXT
        CHECK (control_classification IN ('NOT_PROVEN')),
    ADD COLUMN IF NOT EXISTS control_reason TEXT
        CHECK (control_reason IN ('SAFETY', 'SECURITY_POLICY', 'EXTERNAL', 'TOOLING', 'ARCHITECTURAL'));

COMMENT ON COLUMN validation_run_journeys.record_kind IS
    'JOURNEY or CONTROL, declared by the planner. NULL means the row predates '
    '0162 — LEGACY, not "probably a journey".';

-- A CONTROL record must say why it is one; a JOURNEY must not pretend to be.
ALTER TABLE validation_run_journeys
    DROP CONSTRAINT IF EXISTS validation_run_journeys_control_shape;
ALTER TABLE validation_run_journeys
    ADD CONSTRAINT validation_run_journeys_control_shape CHECK (
        record_kind IS NULL                                   -- pre-0162 rows
        OR (record_kind = 'CONTROL'
            AND control_classification IS NOT NULL
            AND control_reason IS NOT NULL)
        OR (record_kind = 'JOURNEY'
            AND control_classification IS NULL
            AND control_reason IS NULL)
    );

-- A control record is not executable, so it can never have run.
ALTER TABLE validation_run_journeys
    DROP CONSTRAINT IF EXISTS validation_run_journeys_control_never_executes;
ALTER TABLE validation_run_journeys
    ADD CONSTRAINT validation_run_journeys_control_never_executes CHECK (
        record_kind IS DISTINCT FROM 'CONTROL'
        OR outcome NOT IN ('PASSED', 'FAILED', 'OBSERVED', 'ASSERTED')
    );

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Why it did not run
-- ─────────────────────────────────────────────────────────────────────────────
--
--   PASSED / FAILED  the journey ran
--   NOT_REACHED      executable, never started — the run stopped earlier
--   UNAVAILABLE      the adapter or dependency could not be exercised
--   SKIPPED          a deliberate policy skip, and nothing else

ALTER TABLE validation_run_journeys
    DROP CONSTRAINT IF EXISTS validation_run_journeys_outcome_check;
ALTER TABLE validation_run_journeys
    ADD CONSTRAINT validation_run_journeys_outcome_check CHECK (
        outcome IN ('PLANNED', 'OBSERVED', 'ASSERTED',
                    'PASSED', 'FAILED', 'NOT_REACHED', 'SKIPPED', 'UNAVAILABLE')
    );

COMMENT ON COLUMN validation_run_journeys.outcome IS
    'Terminal state of the record. NOT_REACHED means executable but never '
    'started; UNAVAILABLE means it could not be exercised; SKIPPED means '
    'policy chose not to. They are not interchangeable.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Funded exposure, sampled where it changes
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS validation_run_funds_samples (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id      UUID        NOT NULL REFERENCES validation_runs(id) ON DELETE CASCADE,
    -- NULL for the run-level phases; required for the per-journey ones.
    journey_id  TEXT,
    phase       TEXT        NOT NULL
                CHECK (phase IN ('BASELINE', 'PRE_JOURNEY', 'POST_FUNCTIONAL',
                                 'POST_CLEANUP', 'RUN_TERMINAL')),
    used_minor                BIGINT NOT NULL,
    delta_from_baseline_minor BIGINT NOT NULL,
    observed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE validation_run_funds_samples
    DROP CONSTRAINT IF EXISTS validation_run_funds_samples_journey_shape;
ALTER TABLE validation_run_funds_samples
    ADD CONSTRAINT validation_run_funds_samples_journey_shape CHECK (
        (phase IN ('BASELINE', 'RUN_TERMINAL') AND journey_id IS NULL)
        OR (phase IN ('PRE_JOURNEY', 'POST_FUNCTIONAL', 'POST_CLEANUP') AND journey_id IS NOT NULL)
    );

CREATE INDEX IF NOT EXISTS validation_run_funds_samples_run
    ON validation_run_funds_samples (run_id, observed_at);

COMMENT ON TABLE validation_run_funds_samples IS
    'Aggregate funded exposure, sampled per phase. ACTUAL_PEAK is the maximum '
    'delta_from_baseline_minor across these rows — not a single reading taken '
    'once per loop, which is how a run reported peak 0 beside a +2 000 000 '
    'residual.';

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- DOWN (manual; this file is applied forward by the migration runner)
-- ─────────────────────────────────────────────────────────────────────────────
--
--   BEGIN;
--   DROP TABLE IF EXISTS validation_run_funds_samples;
--   ALTER TABLE validation_run_journeys
--       DROP CONSTRAINT IF EXISTS validation_run_journeys_control_never_executes,
--       DROP CONSTRAINT IF EXISTS validation_run_journeys_control_shape,
--       DROP COLUMN IF EXISTS control_reason,
--       DROP COLUMN IF EXISTS control_classification,
--       DROP COLUMN IF EXISTS record_kind;
--   ALTER TABLE validation_run_journeys
--       DROP CONSTRAINT IF EXISTS validation_run_journeys_outcome_check;
--   ALTER TABLE validation_run_journeys
--       ADD CONSTRAINT validation_run_journeys_outcome_check CHECK (
--           outcome IN ('PLANNED','OBSERVED','ASSERTED','PASSED','FAILED','SKIPPED','UNAVAILABLE'));
--   COMMIT;
--
-- Narrowing the outcome CHECK will fail if any row is already NOT_REACHED.
-- That is correct: the down path must not silently discard the distinction it
-- is removing. Reclassify those rows deliberately first.
