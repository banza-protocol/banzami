-- Forward-only, idempotent repair for drifted 0047_refunds_source_aware
-- (BANZA ADR-030 typed refund source). 0047 was recorded applied without its
-- DDL executing on some environments. Re-applies the intent idempotently.
--
-- Token: keeps 'TRANSACTION' as the persisted value; canonical ACQUIRING_PAYMENT
-- normalization is deferred pending a BANZA clarification (not migrated here).
-- Additive; never edits history/checksums.

ALTER TABLE refunds
    ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'TRANSACTION'
        CHECK (source_type IN ('TRANSACTION', 'WALLET_PAYMENT'));

ALTER TABLE refunds ADD COLUMN IF NOT EXISTS source_id UUID;

UPDATE refunds SET source_id = transaction_id
 WHERE source_id IS NULL AND transaction_id IS NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM refunds WHERE source_id IS NULL) THEN
        ALTER TABLE refunds ALTER COLUMN source_id SET NOT NULL;
    END IF;
END $$;

ALTER TABLE refunds ALTER COLUMN transaction_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_refunds_source ON refunds (source_type, source_id);
