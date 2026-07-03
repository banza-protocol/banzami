-- Forward-only, idempotent repair for drifted 0050_kyc_verifications.
-- Internal, provider-agnostic verification tracking (provider SIMULATED today;
-- no document data stored). Additive; never edits history/checksums.

CREATE TABLE IF NOT EXISTS kyc_verifications (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_type TEXT        NOT NULL CHECK (subject_type IN (
                     'CONSUMER', 'MERCHANT_REPRESENTATIVE', 'MERCHANT'
                 )),
    subject_id   UUID        NOT NULL,
    provider     TEXT        NOT NULL,
    provider_ref TEXT,
    status       TEXT        NOT NULL DEFAULT 'PENDING' CHECK (status IN (
                     'PENDING', 'APPROVED', 'REJECTED', 'MANUAL_REVIEW', 'EXPIRED'
                 )),
    level        TEXT,
    reason       TEXT,
    error_code   TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    decided_at   TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_kyc_verifications_provider_ref
    ON kyc_verifications (provider, provider_ref) WHERE provider_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_kyc_verifications_subject  ON kyc_verifications (subject_type, subject_id);
CREATE INDEX IF NOT EXISTS idx_kyc_verifications_status   ON kyc_verifications (status);
CREATE INDEX IF NOT EXISTS idx_kyc_verifications_provider ON kyc_verifications (provider);
CREATE INDEX IF NOT EXISTS idx_kyc_verifications_created  ON kyc_verifications (created_at);
