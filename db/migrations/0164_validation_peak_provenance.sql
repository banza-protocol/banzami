-- 0164 — the peak, and enough of its provenance to re-derive it.
--
-- Banzami Validation Studio (BANZAMI-SANDBOX-FULL-VALIDATION-001, Phase B4).
--
-- 0163 records what a journey's attributable peak WAS. It cannot say whether
-- the ownership set that produced it was complete, and those are different
-- claims: S23-RAIL-001 declared a project and a consumer, every entry
-- resolved, and 1 200 000 minor sat in a test payer nobody had handed over.
-- A resolvable manifest produced a number that was missing its largest
-- component, and 0163 had no column in which that could have been said.
--
-- So completeness and resolution are recorded SEPARATELY from the peak, and
-- the peak carries where it happened. A figure nobody can reconstruct without
-- re-running the journey is a claim, not evidence.
--
-- Additive. No column is dropped, no meaning is changed, and nothing existing
-- is overloaded: exposure_verdict keeps saying exactly what it said in 0163.
--
-- DOWN (documented, not automated — this is an acceptance-evidence table):
--   ALTER TABLE validation_run_journeys
--     DROP COLUMN ownership_completeness,
--     DROP COLUMN ownership_completeness_detail,
--     DROP COLUMN financial_account_count,
--     DROP COLUMN peak_transaction_ref,
--     DROP COLUMN peak_observed_at,
--     DROP COLUMN peak_event_ordering,
--     DROP COLUMN measurement_model;
--   ALTER TABLE validation_run_journeys DROP CONSTRAINT validation_exposure_needs_complete_ownership;
--   ALTER TABLE validation_run_journeys DROP CONSTRAINT validation_completeness_vocabulary;
--   ALTER TABLE validation_run_journeys DROP CONSTRAINT validation_peak_ordering_vocabulary;

BEGIN;

ALTER TABLE validation_run_journeys
  -- Was the manifest COMPLETE, not merely resolvable? Asked of the database,
  -- because a manifest cannot testify to what it omits.
  ADD COLUMN IF NOT EXISTS ownership_completeness        text,
  ADD COLUMN IF NOT EXISTS ownership_completeness_detail text,
  -- How many canonical accounts the owned set resolved to. Distinct from
  -- exposure_resource_count, which counts ownership RECORDS: two records
  -- aliasing one wallet are one account, and conflating them is how a peak
  -- doubles.
  ADD COLUMN IF NOT EXISTS financial_account_count       integer,
  -- Where the peak happened, so it can be re-derived from the ledger without
  -- re-running anything.
  ADD COLUMN IF NOT EXISTS peak_transaction_ref          text,
  ADD COLUMN IF NOT EXISTS peak_observed_at              timestamptz,
  -- DETERMINISTIC or AMBIGUOUS. Distinct postings sharing an instant with no
  -- authoritative sequence make the peak depend on an order the reader chose,
  -- and a number like that must not be quoted as evidence.
  ADD COLUMN IF NOT EXISTS peak_event_ordering           text,
  -- Which model produced the figure. A peak measured under the pre-B4 model
  -- and one measured under it are not comparable, and a run that does not say
  -- which it used invites them to be compared anyway.
  ADD COLUMN IF NOT EXISTS measurement_model             text;

-- Vocabulary, so an unrecognised value cannot be written and later read as if
-- it meant something.
ALTER TABLE validation_run_journeys
  DROP CONSTRAINT IF EXISTS validation_completeness_vocabulary;
ALTER TABLE validation_run_journeys
  ADD CONSTRAINT validation_completeness_vocabulary
  CHECK (ownership_completeness IS NULL
         OR ownership_completeness IN ('VERIFIED', 'INCOMPLETE', 'UNKNOWN'));

ALTER TABLE validation_run_journeys
  DROP CONSTRAINT IF EXISTS validation_peak_ordering_vocabulary;
ALTER TABLE validation_run_journeys
  ADD CONSTRAINT validation_peak_ordering_vocabulary
  CHECK (peak_event_ordering IS NULL
         OR peak_event_ordering IN ('DETERMINISTIC', 'AMBIGUOUS'));

-- THE INVARIANT THIS MIGRATION EXISTS FOR.
--
-- An exposure verdict of VERIFIED asserts that the journey stayed inside its
-- declared bound. That assertion is only available when the set it was
-- measured over was complete and the ordering was not something the reader
-- picked. Either gap and the honest verdict is UNKNOWN.
--
-- Written as a CHECK rather than left to the executor because the executor is
-- what was wrong: BZV-20260920-0001 recorded VERIFIED for journeys whose
-- ownership had never been established at all.
ALTER TABLE validation_run_journeys
  DROP CONSTRAINT IF EXISTS validation_exposure_needs_complete_ownership;
ALTER TABLE validation_run_journeys
  ADD CONSTRAINT validation_exposure_needs_complete_ownership
  CHECK (
    exposure_verdict IS DISTINCT FROM 'VERIFIED'
    OR ownership_completeness IS NULL          -- pre-0164 rows keep their meaning
    OR (ownership_completeness = 'VERIFIED'
        AND (peak_event_ordering IS NULL OR peak_event_ordering = 'DETERMINISTIC'))
  );

COMMIT;
