-- Forward-only, idempotent repair for drifted 0043_risk_flag_resolution.
-- Adds the review-outcome column + open-queue index that 0043 declared but which
-- never executed on drifted environments. Additive; never edits history/checksums.

ALTER TABLE risk_flags
    ADD COLUMN IF NOT EXISTS resolution TEXT
        CHECK (resolution IN ('APPROVED', 'REJECTED'));

COMMENT ON COLUMN risk_flags.resolution IS
    'Review outcome set when an operator resolves the flag: APPROVED (legitimate) or REJECTED (confirmed suspicious). NULL while the flag is open.';

CREATE INDEX IF NOT EXISTS risk_flags_open_idx
    ON risk_flags (resolved, created_at DESC);
