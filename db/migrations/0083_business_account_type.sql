-- 0083: operator taxonomy — classify a Business Account (ADR-028).
--
-- An app that receives money via Banzami must be a validated Business Account.
-- This operator-only field tags WHAT KIND of business account it is. It is NOT a
-- BANZA protocol concept and never leaves the operator. Default 'MERCHANT' keeps
-- every existing merchant a plain merchant (backward-compatible).

ALTER TABLE merchants
    ADD COLUMN IF NOT EXISTS business_account_type TEXT NOT NULL DEFAULT 'MERCHANT'
        CHECK (business_account_type IN
            ('MERCHANT', 'APPLICATION', 'PLATFORM', 'NGO', 'MARKETPLACE', 'DELIVERY', 'OTHER'));

COMMENT ON COLUMN merchants.business_account_type IS
    'ADR-028 operator taxonomy: MERCHANT (default) | APPLICATION | PLATFORM | NGO | MARKETPLACE | DELIVERY | OTHER. Not a protocol field.';

-- The onboarding applicant DECLARES the intended type; KYB review confirms it and
-- it is copied onto the merchant at approval. Nullable: legacy applications have none.
ALTER TABLE merchant_applications
    ADD COLUMN IF NOT EXISTS business_account_type TEXT
        CHECK (business_account_type IS NULL OR business_account_type IN
            ('MERCHANT', 'APPLICATION', 'PLATFORM', 'NGO', 'MARKETPLACE', 'DELIVERY', 'OTHER'));

COMMENT ON COLUMN merchant_applications.business_account_type IS
    'ADR-028: business account type declared by the applicant; confirmed at KYB and copied to merchants.business_account_type on approval.';
