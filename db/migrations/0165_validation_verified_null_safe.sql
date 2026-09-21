-- 0165 — a CHECK that evaluates to NULL does not reject anything.
--
-- Banzami Validation Studio (BANZAMI-SANDBOX-FULL-VALIDATION-001, Phase B4).
--
-- 0164 replaced an explicitly NULL-permissive predicate with one written to
-- require both prerequisites positively:
--
--   exposure_verdict IS DISTINCT FROM 'VERIFIED'
--   OR (ownership_completeness = 'VERIFIED'
--       AND peak_event_ordering  = 'DETERMINISTIC')
--
-- It reads as a demand for proof and is not one. In SQL a CHECK constraint
-- passes when its expression is NULL, and `NULL = 'VERIFIED'` is NULL, not
-- false. So a row with exposure_verdict='VERIFIED' and both prerequisites NULL
-- evaluates to `false OR NULL` = NULL, and is ACCEPTED — the exact state the
-- constraint exists to forbid, reached by the exact route the rewrite was
-- supposed to close.
--
-- Reading the constraint text would not have found this. The behavioural
-- proofs did, on the first run after 0164 applied: cases B and D (an explicit
-- INCOMPLETE, an explicit AMBIGUOUS) were rejected correctly, while C and E
-- (the same verdict with NULLs) were accepted.
--
-- Forward-only, as the rollout gate requires: 0164 is applied and is history.
-- IS NOT DISTINCT FROM returns false rather than NULL when one side is NULL,
-- so the predicate is now two-valued and a missing prerequisite fails.
--
-- Additive and non-destructive: one constraint replaced by a stricter one on
-- the same table. No column changes, no data touched, no backfill.
--
-- DOWN (documented, not automated):
--   ALTER TABLE validation_run_journeys
--     DROP CONSTRAINT validation_exposure_needs_complete_ownership;
--   -- then re-add 0164's weaker form if the model is ever rolled back

BEGIN;

ALTER TABLE validation_run_journeys
  DROP CONSTRAINT IF EXISTS validation_exposure_needs_complete_ownership;

ALTER TABLE validation_run_journeys
  ADD CONSTRAINT validation_exposure_needs_complete_ownership
  CHECK (
    exposure_verdict IS DISTINCT FROM 'VERIFIED'
    OR (ownership_completeness IS NOT DISTINCT FROM 'VERIFIED'
        AND peak_event_ordering IS NOT DISTINCT FROM 'DETERMINISTIC')
  ) NOT VALID;

COMMIT;
