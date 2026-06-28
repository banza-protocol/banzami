-- Consumer Identity Verification (KYC) — Banzami ADR-020.
-- First official operator KYC. Files NEVER live in the DB: document/selfie images
-- go to Cloudflare R2; the DB holds only references (storage_key, mime, sha256,
-- size). KYC is operator policy (BANZA ADR-038) — the protocol defines none of
-- this. No change to ledger/transfers/settlement/collections.
--
-- Additive + idempotent. Apply to sandbox first. Non-destructive.
-- NOTE: kyc_evidence requires the consumer-KYC R2 bucket + KYC_STORAGE_* env on
-- public-api before uploads work.

-- ── KycCase — one verification attempt for a subject ────────────────────────
CREATE TABLE IF NOT EXISTS kyc_cases (
    id            UUID         PRIMARY KEY,
    operator_id   TEXT         NOT NULL,
    subject_type  TEXT         NOT NULL DEFAULT 'CONSUMER'
                               CHECK (subject_type IN ('CONSUMER','MERCHANT_PERSON','BUSINESS_OWNER')),
    subject_id    UUID         NOT NULL,                       -- consumer id (ownership key)
    status        TEXT         NOT NULL DEFAULT 'DRAFT'
                               CHECK (status IN ('DRAFT','WAITING_DOCUMENTS','DOCUMENTS_RECEIVED',
                                                 'UNDER_REVIEW','APPROVED','REJECTED','NEEDS_MORE_INFO',
                                                 'EXPIRED','CANCELLED','FAILED')),
    reason_code   TEXT,                                         -- set on REJECTED / NEEDS_MORE_INFO
    environment   TEXT         NOT NULL DEFAULT 'LIVE' CHECK (environment IN ('LIVE','SANDBOX')),
    idempotency_key VARCHAR(255) UNIQUE,
    expires_at    TIMESTAMPTZ,
    submitted_at  TIMESTAMPTZ,
    reviewed_at   TIMESTAMPTZ,
    metadata      JSONB        NOT NULL DEFAULT '{}',
    version       INTEGER      NOT NULL DEFAULT 1,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_kyc_cases_subject ON kyc_cases (subject_id, environment, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_kyc_cases_status  ON kyc_cases (status) WHERE status NOT IN ('APPROVED','REJECTED','EXPIRED','CANCELLED','FAILED');

-- ── KycDocument — a document presented in a case ────────────────────────────
CREATE TABLE IF NOT EXISTS kyc_documents (
    id             UUID        PRIMARY KEY,
    case_id        UUID        NOT NULL REFERENCES kyc_cases(id) ON DELETE CASCADE,
    document_type  TEXT        NOT NULL
                               CHECK (document_type IN ('IDENTITY_CARD','PASSPORT','RESIDENCE_PERMIT','DRIVING_LICENSE')),
    country        TEXT,
    status         TEXT        NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','COMPLETE')),
    extracted_data JSONB,                                       -- OCR (future); never required
    metadata       JSONB       NOT NULL DEFAULT '{}',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_kyc_documents_case ON kyc_documents (case_id);

-- ── KycEvidence — one uploaded artifact (never holds the bytes) ──────────────
CREATE TABLE IF NOT EXISTS kyc_evidence (
    id             UUID        PRIMARY KEY,
    case_id        UUID        NOT NULL REFERENCES kyc_cases(id) ON DELETE CASCADE,
    document_id    UUID        REFERENCES kyc_documents(id) ON DELETE CASCADE,  -- NULL for selfie
    evidence_type  TEXT        NOT NULL
                               CHECK (evidence_type IN ('DOCUMENT_IMAGE','SELFIE','LIVENESS_VIDEO','PROOF_OF_ADDRESS')),
    side           TEXT        CHECK (side IN ('FRONT','BACK','MAIN_PAGE','SELFIE')),
    storage_bucket TEXT        NOT NULL,
    storage_key    TEXT        NOT NULL UNIQUE,                 -- never returned to any client or logged
    mime_type      TEXT        NOT NULL,
    sha256         TEXT,
    size_bytes     BIGINT,
    status         TEXT        NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','UPLOADED','FAILED')),
    environment    TEXT        NOT NULL DEFAULT 'LIVE' CHECK (environment IN ('LIVE','SANDBOX')),
    captured_at    TIMESTAMPTZ,
    uploaded_at    TIMESTAMPTZ,
    retention_until TIMESTAMPTZ,
    metadata       JSONB       NOT NULL DEFAULT '{}',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_kyc_evidence_case ON kyc_evidence (case_id);

-- ── KycReview — an operator decision on a case ──────────────────────────────
CREATE TABLE IF NOT EXISTS kyc_reviews (
    id            UUID         PRIMARY KEY,
    case_id       UUID         NOT NULL REFERENCES kyc_cases(id) ON DELETE CASCADE,
    reviewer_type TEXT         NOT NULL CHECK (reviewer_type IN ('SYSTEM','HUMAN','VENDOR')),
    reviewer_id   TEXT,                                         -- admin actor id (no PII)
    decision      TEXT         NOT NULL CHECK (decision IN ('APPROVED','REJECTED','NEEDS_MORE_INFO')),
    reason_code   TEXT,                                         -- required for REJECTED / NEEDS_MORE_INFO
    granted_level TEXT         CHECK (granted_level IN ('BASIC','ENHANCED','FULL')),  -- operator-decided
    notes         TEXT,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_kyc_reviews_case ON kyc_reviews (case_id, created_at);

-- ── KycEvent — operator-internal transactional outbox (NOT merchant webhooks) ─
-- KYC events are operator-internal/audit (BANZA ADR-038: not protocol events).
-- Written in the same transaction as the state change; idempotency-keyed.
CREATE TABLE IF NOT EXISTS kyc_events (
    id              UUID         PRIMARY KEY,
    case_id         UUID         NOT NULL REFERENCES kyc_cases(id) ON DELETE CASCADE,
    event_type      TEXT         NOT NULL,                      -- kyc.case.created, kyc.approved, ...
    payload         JSONB        NOT NULL DEFAULT '{}',         -- no PII, no storage_key, no signed URL
    idempotency_key VARCHAR(255) NOT NULL UNIQUE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    dispatched_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_kyc_events_case ON kyc_events (case_id, created_at);
CREATE INDEX IF NOT EXISTS idx_kyc_events_undispatched ON kyc_events (created_at) WHERE dispatched_at IS NULL;

COMMENT ON TABLE kyc_cases IS 'Banzami ADR-020 KYC case. Operator-owned (BANZA ADR-038). The granted KYC level is an OUTCOME of review, never chosen by the user.';
COMMENT ON COLUMN kyc_evidence.storage_key IS 'R2 object key — never returned to clients, never logged.';
