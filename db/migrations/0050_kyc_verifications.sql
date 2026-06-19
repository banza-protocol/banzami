-- Internal, provider-agnostic KYC/KYB verification tracking (Batch 2A).
--
-- Tracks verification ATTEMPTS internally. This is NOT a real vendor
-- integration: provider is SIMULATED today (development-only) and provider_ref is
-- only populated once a real vendor (not yet selected) returns a reference. No
-- document data is stored here — only references and status.
--
-- subject_type excludes BENEFICIAL_OWNER (deferred to Batch 2B).

CREATE TABLE kyc_verifications (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_type TEXT        NOT NULL CHECK (subject_type IN (
                     'CONSUMER', 'MERCHANT_REPRESENTATIVE', 'MERCHANT'
                 )),
    subject_id   UUID        NOT NULL,
    provider     TEXT        NOT NULL,        -- SIMULATED | EXTERNAL | <future>
    provider_ref TEXT,                        -- vendor reference (null until real verification)
    status       TEXT        NOT NULL DEFAULT 'PENDING' CHECK (status IN (
                     'PENDING', 'APPROVED', 'REJECTED', 'MANUAL_REVIEW', 'EXPIRED'
                 )),
    level        TEXT,                         -- KYC level granted (for CONSUMER)
    reason       TEXT,
    error_code   TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    decided_at   TIMESTAMPTZ
);

-- Idempotency: one record per (provider, provider_ref) when a reference exists.
CREATE UNIQUE INDEX uq_kyc_verifications_provider_ref
    ON kyc_verifications (provider, provider_ref) WHERE provider_ref IS NOT NULL;

CREATE INDEX idx_kyc_verifications_subject ON kyc_verifications (subject_type, subject_id);
CREATE INDEX idx_kyc_verifications_status  ON kyc_verifications (status);
CREATE INDEX idx_kyc_verifications_provider ON kyc_verifications (provider);
CREATE INDEX idx_kyc_verifications_created ON kyc_verifications (created_at);
