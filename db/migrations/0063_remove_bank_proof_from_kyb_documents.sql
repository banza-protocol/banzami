-- 0063_remove_bank_proof_from_kyb_documents.sql
-- Tighten the KYB document_type CHECK so BANK_PROOF can never be stored.
--
-- Product decision: the Business application requires exactly three company
-- documents — BUSINESS_REGISTRATION, TAX_ID, REPRESENTATIVE_ID. Banking details
-- belong to a later payout-configuration phase, so BANK_PROOF was removed from
-- the website, the gateway allow-list and the admin UI. This migration removes
-- it from the database CHECK as well. OTHER is kept (the gateway still accepts it
-- and BANZADMIN labels it "Outro" for exceptional cases).
--
-- Safety / idempotency:
--   * If the documents table does NOT exist yet (0054 not applied), this is a
--     no-op — the current 0054 already excludes BANK_PROOF, so a fresh install
--     never gets it.
--   * If any BANK_PROOF rows exist, the migration ABORTS without touching the
--     constraint (never destroy or silently orphan documents — relocate them
--     first, then re-run).
--   * Re-runnable: it drops whatever CHECK currently governs document_type and
--     recreates the canonical one.
--
-- Additive/safe. Not applied yet — apply only after go-ahead.
-- NOTE: the documents table is created by 0054, which must be applied before KYB
-- uploads (R2) can work. Apply 0054 (already excludes BANK_PROOF) and this 0063
-- together as part of enabling document storage.

DO $$
DECLARE
    cname text;
    bank_rows bigint;
BEGIN
    IF to_regclass('public.merchant_application_documents') IS NULL THEN
        RAISE NOTICE '0063: merchant_application_documents does not exist — nothing to tighten (0054 already excludes BANK_PROOF).';
        RETURN;
    END IF;

    SELECT count(*) INTO bank_rows
      FROM merchant_application_documents
     WHERE document_type = 'BANK_PROOF';
    IF bank_rows > 0 THEN
        RAISE EXCEPTION '0063: % BANK_PROOF row(s) present — relocate/migrate them before tightening the constraint (aborting, no data touched).', bank_rows;
    END IF;

    -- Drop the existing document_type CHECK (whatever it is named) and recreate
    -- the canonical one without BANK_PROOF.
    SELECT conname INTO cname
      FROM pg_constraint
     WHERE conrelid = 'public.merchant_application_documents'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%document_type%';
    IF cname IS NOT NULL THEN
        EXECUTE format('ALTER TABLE merchant_application_documents DROP CONSTRAINT %I', cname);
    END IF;

    ALTER TABLE merchant_application_documents
        ADD CONSTRAINT merchant_application_documents_document_type_check
        CHECK (document_type IN ('BUSINESS_REGISTRATION', 'TAX_ID', 'REPRESENTATIVE_ID', 'OTHER'));

    RAISE NOTICE '0063: document_type CHECK tightened — BANK_PROOF removed.';
END $$;
