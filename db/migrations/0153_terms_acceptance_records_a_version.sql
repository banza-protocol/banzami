-- 0153 — A Terms acceptance records WHICH version was accepted (not just when).
--
-- TERMS-INFRASTRUCTURE-CONSISTENCY-001. merchant_applications already records
-- `terms_accepted_at` (WHEN the applicant checked the box). It does not record
-- WHICH Terms version that was — because, today, there is no published Terms
-- document: the canonical Terms are still DRAFT (banzami.com/termos is a noindex
-- placeholder; the human-approved body/version/effective-date are pending).
--
-- This migration adds the forward-compatible column that will hold the accepted
-- version once a document is published. It fabricates nothing:
--
--     terms_version = the published version in effect when the box was checked.
--
-- Semantics fixed here:
--   * NULL terms_version  = an UNVERSIONED, pre-release acknowledgement. It is
--     NOT acceptance of the future published Terms. Every row written while the
--     document is DRAFT has terms_version NULL, on purpose.
--   * non-NULL terms_version = acceptance of that specific published version.
--
-- No backfill. Existing pre-release rows (terms_accepted_at set, from Sandbox
-- registrations) are NOT assigned any version — assigning one would fabricate
-- consent to a document that did not exist when they submitted. They stay NULL
-- and are treated as pre-release acknowledgements, never as published-Terms
-- acceptance.
--
-- Terms acceptance carries NO financial authority. It lives on the application
-- record, never in the ledger; who receives money is resolved in Core, not here.
--
-- Reversible: ALTER TABLE merchant_applications DROP COLUMN terms_version.

ALTER TABLE merchant_applications
    ADD COLUMN IF NOT EXISTS terms_version TEXT;

COMMENT ON COLUMN merchant_applications.terms_version IS
    'Published Terms version accepted (NULL = unversioned pre-release acknowledgement, not published-Terms acceptance). TERMS-INFRASTRUCTURE-CONSISTENCY-001.';
