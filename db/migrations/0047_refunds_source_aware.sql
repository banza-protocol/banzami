-- Source-aware refunds (BANZA ADR-030). A refund must reference a typed payment
-- source, never a generic transfer:
--   source_type = TRANSACTION    → acquiring payment   (refund credits transit)
--   source_type = WALLET_PAYMENT → wallet-native sale  (refund credits the payer)
--
-- Backward compatible: existing acquiring refunds are backfilled as TRANSACTION
-- with source_id = transaction_id. transaction_id becomes nullable because a
-- wallet-native refund has no acquiring transaction.

ALTER TABLE refunds
    ADD COLUMN source_type TEXT NOT NULL DEFAULT 'TRANSACTION'
        CHECK (source_type IN ('TRANSACTION', 'WALLET_PAYMENT'));

ALTER TABLE refunds ADD COLUMN source_id UUID;

-- Backfill existing rows: every prior refund was an acquiring/transaction refund.
UPDATE refunds SET source_id = transaction_id WHERE source_id IS NULL;

ALTER TABLE refunds ALTER COLUMN source_id SET NOT NULL;

-- A wallet-native refund has no acquiring transaction.
ALTER TABLE refunds ALTER COLUMN transaction_id DROP NOT NULL;

-- Refund aggregation (the over-refund ceiling) is scoped by typed source.
CREATE INDEX idx_refunds_source ON refunds (source_type, source_id);
