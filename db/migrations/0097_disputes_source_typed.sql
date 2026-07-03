-- Source-typed disputes + recorded restitution outcome (Banzami ADR-034).
--
-- BANZA disputes.md §41-43 requires a dispute to reference a typed payment source
-- (like refunds, ADR-030), so dispute restitution flows through the same
-- source-scoped restitution ceiling as refunds. Existing disputes are acquiring
-- (transaction) disputes; backfill accordingly.
--
-- restitution_amount_minor / restitution_reason record the operator dispute-outcome
-- policy: a dispute can be WON_BY_CONSUMER with zero or partial restitution when
-- prior refunds already made the consumer whole. Idempotent/additive.

ALTER TABLE disputes
    ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'TRANSACTION'
        CHECK (source_type IN ('TRANSACTION', 'WALLET_PAYMENT'));

ALTER TABLE disputes ADD COLUMN IF NOT EXISTS source_id UUID;

-- Every existing dispute is an acquiring/transaction dispute.
UPDATE disputes SET source_id = transaction_id WHERE source_id IS NULL;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM disputes WHERE source_id IS NULL) THEN
        ALTER TABLE disputes ALTER COLUMN source_id SET NOT NULL;
    END IF;
END $$;

-- The actual restitution granted on resolution (may be 0 or partial) + reason code.
ALTER TABLE disputes ADD COLUMN IF NOT EXISTS restitution_amount_minor BIGINT;
ALTER TABLE disputes ADD COLUMN IF NOT EXISTS restitution_reason       TEXT;

CREATE INDEX IF NOT EXISTS idx_disputes_source ON disputes (source_type, source_id);
