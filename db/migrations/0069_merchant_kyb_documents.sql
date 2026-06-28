-- Merchant-authenticated KYB documents (Banzami operator policy — KYB).
--
-- The onboarding APPLICATION (website /comerciantes/candidatura) keeps its own
-- documents in `merchant_application_documents` (historical, application-scoped).
-- After approval, the merchant maintains its business documents HERE, scoped by
-- merchant_id, with a real lifecycle (status, expiry, rejection reason, versions).
-- Files live in the KYB R2 buckets; the DB holds only references. Never mixed
-- with KYC consumer storage. Additive + idempotent; sandbox first.

CREATE TABLE IF NOT EXISTS merchant_kyb_documents (
    id                      UUID        PRIMARY KEY,
    merchant_id             UUID        NOT NULL,
    document_type           TEXT        NOT NULL
                            CHECK (document_type IN ('COMMERCIAL_REGISTRATION','COMPANY_TAX_ID','REPRESENTATIVE_ID')),
    status                  TEXT        NOT NULL DEFAULT 'PENDING_UPLOAD'
                            CHECK (status IN ('PENDING_UPLOAD','PENDING_REVIEW','VALID','REJECTED','EXPIRED','REPLACED')),
    storage_bucket          TEXT,
    storage_key             TEXT        UNIQUE,        -- never returned to any client / logged
    mime_type               TEXT,
    sha256                  TEXT,
    size_bytes              BIGINT,
    original_filename       TEXT,
    environment             TEXT        NOT NULL DEFAULT 'LIVE' CHECK (environment IN ('LIVE','SANDBOX')),
    submitted_at            TIMESTAMPTZ,               -- set on complete (PENDING_REVIEW)
    reviewed_at             TIMESTAMPTZ,
    reviewed_by             TEXT,                      -- admin actor id (no PII)
    valid_until             TIMESTAMPTZ,               -- optional expiry; EXPIRED never deletes the row
    rejection_reason        TEXT,                      -- required on REJECTED
    replaced_by_document_id UUID,                      -- set when a newer accepted doc supersedes this one
    metadata                JSONB       NOT NULL DEFAULT '{}',
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- "current" document per (merchant, type) = most recent non-REPLACED row.
CREATE INDEX IF NOT EXISTS idx_mkyb_docs_current
    ON merchant_kyb_documents (merchant_id, document_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mkyb_docs_review
    ON merchant_kyb_documents (status) WHERE status = 'PENDING_REVIEW';

-- Operator-internal outbox for KYB document events (not merchant webhooks, not
-- protocol events). Written in the same tx as the state change; idempotency-keyed.
CREATE TABLE IF NOT EXISTS merchant_kyb_events (
    id              UUID         PRIMARY KEY,
    merchant_id     UUID         NOT NULL,
    document_id     UUID,
    event_type      TEXT         NOT NULL,            -- merchant.kyb.document.*, merchant.kyb.verified, ...
    payload         JSONB        NOT NULL DEFAULT '{}',  -- no PII, no storage_key, no signed URL
    idempotency_key VARCHAR(255) NOT NULL UNIQUE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    dispatched_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_mkyb_events_merchant ON merchant_kyb_events (merchant_id, created_at);

COMMENT ON TABLE merchant_kyb_documents IS 'Banzami merchant-authenticated KYB documents (operator policy). Files in KYB R2; DB holds references only.';
COMMENT ON COLUMN merchant_kyb_documents.storage_key IS 'R2 object key — never returned to clients, never logged.';
