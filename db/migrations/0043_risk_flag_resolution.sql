-- RSK-002 — complete the suspicious-transaction review workflow.
--
-- risk_flags already carried resolved / resolved_at / resolved_by, but nothing
-- recorded the review *outcome*. Add a resolution column so an operator can
-- explicitly approve or reject a flag, giving a full audit trail and letting
-- resolution time be derived as (resolved_at - created_at).

ALTER TABLE risk_flags
    ADD COLUMN resolution TEXT
        CHECK (resolution IN ('APPROVED', 'REJECTED'));

COMMENT ON COLUMN risk_flags.resolution IS
    'Review outcome set when an operator resolves the flag: APPROVED (legitimate) or REJECTED (confirmed suspicious). NULL while the flag is open.';

-- Open flags are the operator review queue; index for that hot path.
CREATE INDEX IF NOT EXISTS risk_flags_open_idx
    ON risk_flags (resolved, created_at DESC);
