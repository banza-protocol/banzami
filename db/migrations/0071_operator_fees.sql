-- Operator Fee on PaymentIntent/transaction fulfilment (Banzami ADR-021 /
-- BANZA ADR-039) — increment 3.
--
-- The operator's per-payment infrastructure charge, realized as ONE balanced
-- leg of the capture posting (ADR-002): the payee is credited the NET, the
-- operator-fee REVENUE account the fee, the source debited the GROSS — one
-- posting, append-only, never mutated.
--
-- The fee AMOUNT is resolved by the operator Pricing Engine (core/pricing). This
-- table stores only the resolved minor-unit result + the references + an
-- immutable audit snapshot — never a rule or a percentage (those live ONLY in
-- pricing_rules, migration 0070). Nothing here is a protocol concept; the
-- protocol carries only references + the resolved fee.
--
-- INTERNAL: never returned by a public/payer-facing API. The payer always sees
-- the gross amount; the operator fee is invisible to payer and app.

-- 1. Pricing references on the fulfilment unit (the transaction). NULL =
--    unpriced -> the engine resolves a zero fee, so existing flows are unchanged
--    until a category is set. References only — never a price.
ALTER TABLE transactions
    ADD COLUMN IF NOT EXISTS business_category TEXT,
    ADD COLUMN IF NOT EXISTS pricing_profile   TEXT,
    ADD COLUMN IF NOT EXISTS fee_policy_ref    TEXT;

COMMENT ON COLUMN transactions.business_category IS
    'BANZA ADR-039 BusinessCategory reference (never a price). Drives operator fee resolution at capture.';

-- 2. operator_fees — one immutable record per fulfilled transaction.
CREATE TABLE IF NOT EXISTS operator_fees (
    id                   UUID         PRIMARY KEY,                  -- engine-supplied
    transaction_id       UUID         NOT NULL REFERENCES transactions(id),
    payment_intent_id    UUID,                                     -- future PaymentIntent (ADR-037) linkage
    source_transfer_id   UUID,                                     -- Transfer produced by fulfilment, if any
    posting_id           UUID         NOT NULL,                    -- ledger posting (ADR-002) carrying the fee leg
    amount_minor         BIGINT       NOT NULL CHECK (amount_minor >= 0),  -- resolved fee; integer minor units; may be 0
    currency             TEXT         NOT NULL,

    -- references that produced the fee (audit) ---------------------------
    business_category    TEXT,
    pricing_profile      TEXT,
    fee_policy_ref       TEXT,
    pricing_rule_id      UUID,                                     -- NULL when no rule matched (zero fee)
    pricing_rule_version INTEGER,
    engine_version       INTEGER      NOT NULL,
    snapshot_json        JSONB        NOT NULL,                    -- immutable FeeSnapshot; full reproducibility

    status               TEXT         NOT NULL DEFAULT 'APPLIED'
                                      CHECK (status IN ('APPLIED')),  -- terminal; corrected only by a reversal posting
    environment          TEXT         NOT NULL DEFAULT 'LIVE' CHECK (environment IN ('LIVE','SANDBOX')),
    idempotency_key      TEXT         NOT NULL,                    -- = '<tx idem>:capture' (the posting key)
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    settled_at           TIMESTAMPTZ,

    -- exactly one operator fee per fulfilled transaction ------------------
    CONSTRAINT operator_fees_one_per_tx UNIQUE (transaction_id),
    CONSTRAINT operator_fees_idem       UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_operator_fees_posting
    ON operator_fees (posting_id);
CREATE INDEX IF NOT EXISTS idx_operator_fees_env_created
    ON operator_fees (environment, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_operator_fees_rule
    ON operator_fees (pricing_rule_id);

COMMENT ON TABLE operator_fees IS
    'Banzami ADR-021 Operator Fee: one immutable record per fulfilled transaction. Stores the resolved fee_minor + an immutable pricing snapshot. Never a rule/percentage (those live in pricing_rules). INTERNAL: never exposed to payer or any public API. Append-only; corrected only by a reversal posting.';
COMMENT ON COLUMN operator_fees.snapshot_json IS
    'Immutable FeeSnapshot (core/pricing): rule id+version, components applied, engine_version, as_of. Makes any fee re-derivable forever.';
COMMENT ON COLUMN operator_fees.amount_minor IS
    'Resolved operator fee in integer minor units. Never float. May be 0 (NGO/GOVERNMENT/unpriced).';
