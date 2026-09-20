-- 0163 — Banzami Validation Studio: what a journey's OWN resources held.
--
-- BANZAMI-SANDBOX-FULL-VALIDATION-001 Phase D.
--
-- 0162 sampled aggregate funded value, which protects the shared 50 000 000
-- cap. It cannot validate a journey's declaration: this Sandbox also carries
-- DOA's production traffic, so the aggregate moves for reasons that have
-- nothing to do with the journey being measured, and a journey must never look
-- under-declared because somebody else was paid.
--
-- Two numbers, deliberately:
--
--   GLOBAL        the aggregate, in validation_run_funds_samples
--   ATTRIBUTABLE  the maximum the journey's OWN resources held AT ONCE
--
-- The attributable figure comes from the ledger trajectory of the resources a
-- harness handed over, not from a final balance and not from a sum of maxima:
--
--   S05-LNK-002 is granted 1 000 000 and spends 350 000. Its final balance is
--   650 000, so a final-balance reading would pass a declaration of 700 000
--   that the journey actually breached.
--
--   A journey with two fixtures that each peak at 1 000 000 an hour apart
--   never held 2 000 000. Summing maxima invents concurrency the cap never saw.
--
-- The declaration stays a PRE-EXECUTION bound. A measurement validates it; it
-- never redefines it. Raising a declaration to match what was observed turns an
-- upper bound into a record of the past, and the next run inherits no limit.
--
-- Additive: nullable columns only, nothing rewritten. Reversible below.

BEGIN;

ALTER TABLE validation_run_journeys
    ADD COLUMN IF NOT EXISTS declared_peak_minor BIGINT,
    ADD COLUMN IF NOT EXISTS actual_attributable_peak_minor BIGINT,
    -- VERIFIED       measured, and within the declared bound
    -- UNDER_DECLARED measured, and above it — a planner defect, not a product one
    -- UNKNOWN        ownership or measurement unavailable. Fails closed: for a
    --                funding-capable journey this blocks acceptance readiness,
    --                because "we could not tell" is not "it was fine".
    ADD COLUMN IF NOT EXISTS exposure_verdict TEXT
        CHECK (exposure_verdict IN ('VERIFIED', 'UNDER_DECLARED', 'UNKNOWN')),
    ADD COLUMN IF NOT EXISTS exposure_detail TEXT,
    -- How the figure was arrived at, so nobody has to trust it on faith.
    ADD COLUMN IF NOT EXISTS exposure_resource_count INT,
    ADD COLUMN IF NOT EXISTS exposure_event_count INT,
    ADD COLUMN IF NOT EXISTS exposure_measured_at TIMESTAMPTZ;

COMMENT ON COLUMN validation_run_journeys.actual_attributable_peak_minor IS
    'Maximum value held SIMULTANEOUSLY by this journey''s own resources, from '
    'their ledger trajectory. Not the final balance, and not the sum of each '
    'resource''s maximum.';

-- A measured verdict must carry the numbers it was measured from.
ALTER TABLE validation_run_journeys
    DROP CONSTRAINT IF EXISTS validation_run_journeys_exposure_shape;
ALTER TABLE validation_run_journeys
    ADD CONSTRAINT validation_run_journeys_exposure_shape CHECK (
        exposure_verdict IS NULL
        OR exposure_verdict = 'UNKNOWN'
        OR (actual_attributable_peak_minor IS NOT NULL
            AND declared_peak_minor IS NOT NULL
            AND exposure_measured_at IS NOT NULL)
    );

-- …and a VERIFIED verdict must actually be within its bound. The executor
-- computes this, and the database refuses to record the contradiction.
ALTER TABLE validation_run_journeys
    DROP CONSTRAINT IF EXISTS validation_run_journeys_exposure_verified_is_within;
ALTER TABLE validation_run_journeys
    ADD CONSTRAINT validation_run_journeys_exposure_verified_is_within CHECK (
        exposure_verdict IS DISTINCT FROM 'VERIFIED'
        OR actual_attributable_peak_minor <= declared_peak_minor
    );

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- DOWN (manual)
-- ─────────────────────────────────────────────────────────────────────────────
--
--   BEGIN;
--   ALTER TABLE validation_run_journeys
--       DROP CONSTRAINT IF EXISTS validation_run_journeys_exposure_verified_is_within,
--       DROP CONSTRAINT IF EXISTS validation_run_journeys_exposure_shape,
--       DROP COLUMN IF EXISTS exposure_measured_at,
--       DROP COLUMN IF EXISTS exposure_event_count,
--       DROP COLUMN IF EXISTS exposure_resource_count,
--       DROP COLUMN IF EXISTS exposure_detail,
--       DROP COLUMN IF EXISTS exposure_verdict,
--       DROP COLUMN IF EXISTS actual_attributable_peak_minor,
--       DROP COLUMN IF EXISTS declared_peak_minor;
--   COMMIT;
