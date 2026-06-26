-- 0054_merchant_application_documents.sql
-- KYB documents for Business onboarding applications (Merchant Lifecycle,
-- Track 3). Files are stored in private object storage (Cloudflare R2,
-- S3-compatible); the DB holds ONLY the bucket + storage_key + metadata.
-- It never stores a public URL nor a signed URL — those are minted on demand
-- and are short-lived.
--
-- Additive + idempotent. Sandbox first. Non-destructive. Soft-delete only.
--
-- NOTE: not applied yet. Apply to sandbox ONLY after R2 is provisioned and the
-- KYB_STORAGE_* env vars are set on the gateway.

CREATE TABLE IF NOT EXISTS merchant_application_documents (
    id                 UUID        PRIMARY KEY,
    application_id     UUID        NOT NULL REFERENCES merchant_applications(id) ON DELETE CASCADE,
    merchant_id        UUID,                       -- set on approval (links to created merchant)
    document_type      TEXT        NOT NULL
                       CHECK (document_type IN (
                         'BUSINESS_REGISTRATION', 'TAX_ID', 'REPRESENTATIVE_ID',
                         'OTHER')),
    original_filename  TEXT        NOT NULL,
    storage_bucket     TEXT        NOT NULL,
    storage_key        TEXT        NOT NULL UNIQUE,  -- never returned to any client
    mime_type          TEXT        NOT NULL,
    size_bytes         BIGINT      NOT NULL,
    checksum_sha256    TEXT,
    status             TEXT        NOT NULL DEFAULT 'PENDING_UPLOAD'
                       CHECK (status IN ('PENDING_UPLOAD', 'UPLOADED', 'ACCEPTED', 'REJECTED', 'DELETED')),
    uploaded_by        TEXT,                       -- 'applicant' | admin actor
    uploaded_at        TIMESTAMPTZ,
    confirmed_at       TIMESTAMPTZ,
    reviewed_by        TEXT,
    reviewed_at        TIMESTAMPTZ,
    rejection_reason   TEXT,
    deleted_at         TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mch_app_docs_application
    ON merchant_application_documents (application_id, created_at);

-- Enforce "one active file per (application, document_type)" at the DB level:
-- only rows that are not soft-deleted count. A new upload soft-deletes the
-- previous one (handled in the service), so this partial unique index is the
-- belt-and-braces guarantee.
CREATE UNIQUE INDEX IF NOT EXISTS uq_mch_app_docs_active_type
    ON merchant_application_documents (application_id, document_type)
    WHERE deleted_at IS NULL;
