-- Merchant KYB business profile (Batch 2A, vendor-agnostic prep).
--
-- Persists the business facts a KYB flow must collect regardless of the chosen
-- identity vendor — today these are passed to verify_merchant and then lost.
--
-- COLLECTION ONLY. This table does NOT verify the NIF, the registry, or any
-- identity; production verification depends on an external vendor (not yet
-- selected). KYB/payout gating is unchanged — it continues to read
-- merchant_compliance.kyb_status, not this profile.
--
-- representative_consumer_id is only a LINK to the representative's Consumer-KYC
-- path (KYC-002); it does not duplicate that identity here.

CREATE TABLE merchant_kyb_profile (
    merchant_id                UUID        PRIMARY KEY REFERENCES merchants(id),
    legal_name                 TEXT,
    tax_id                     TEXT,        -- NIF (business-level; not verified here)
    registration_number        TEXT,        -- company registry (not verified here)
    business_activity          TEXT,
    is_sole_trader             BOOLEAN     NOT NULL DEFAULT false,
    representative_consumer_id UUID,         -- link to the rep's Consumer KYC (KYC-002)
    created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);
