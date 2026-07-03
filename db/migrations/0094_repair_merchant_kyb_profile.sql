-- Forward-only, idempotent repair for drifted 0049_merchant_kyb_profile.
-- COLLECTION ONLY — no verification; KYB/payout gating is unchanged.
-- Additive; never edits history/checksums.

CREATE TABLE IF NOT EXISTS merchant_kyb_profile (
    merchant_id                UUID        PRIMARY KEY REFERENCES merchants(id),
    legal_name                 TEXT,
    tax_id                     TEXT,
    registration_number        TEXT,
    business_activity          TEXT,
    is_sole_trader             BOOLEAN     NOT NULL DEFAULT false,
    representative_consumer_id UUID,
    created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);
