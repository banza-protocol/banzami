-- 0052_merchant_applications.sql
-- Business onboarding applications (Merchant Lifecycle, Track 1).
--
-- A merchant cannot freely create a @negócio in the app. The official flow is:
--   apply on banzami.com/comerciantes/candidatura → admin review → approval.
-- The desired @negócio is reserved in handle_registry at submission time
-- (owner_type=APPLICATION, reserved_until = now()+30d). On approval it becomes
-- MERCHANT; on reject/cancel/expiry it is released. handle_registry remains the
-- single global source of truth for handle uniqueness.
--
-- Additive + idempotent. Sandbox first. Non-destructive.

-- ---------------------------------------------------------------------------
-- handle_registry: allow APPLICATION-scoped, time-boxed reservations.
-- ---------------------------------------------------------------------------
ALTER TABLE handle_registry DROP CONSTRAINT IF EXISTS handle_registry_owner_type_check;
ALTER TABLE handle_registry
  ADD CONSTRAINT handle_registry_owner_type_check
  CHECK (owner_type IN ('CONSUMER', 'MERCHANT', 'SYSTEM', 'APPLICATION'));

ALTER TABLE handle_registry ADD COLUMN IF NOT EXISTS reserved_until TIMESTAMPTZ;

-- ---------------------------------------------------------------------------
-- merchant_applications: one Business onboarding request.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS merchant_applications (
    id                   UUID        PRIMARY KEY,
    status               TEXT        NOT NULL DEFAULT 'SUBMITTED'
                         CHECK (status IN ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED')),
    environment          TEXT        NOT NULL DEFAULT 'LIVE'
                         CHECK (environment IN ('LIVE', 'SANDBOX')),
    desired_handle       TEXT        NOT NULL,
    business_name        TEXT        NOT NULL,
    category             TEXT,
    email                TEXT        NOT NULL,
    phone                TEXT,
    nif                  TEXT,
    country              TEXT,
    city                 TEXT,
    address              TEXT,
    legal_representative TEXT,
    business_activity    TEXT,
    estimated_volume     TEXT,
    terms_accepted_at    TIMESTAMPTZ,
    admin_notes          TEXT,                 -- internal only, never emailed
    merchant_message     TEXT,                 -- shown/emailed to the applicant
    reviewed_by          TEXT,
    reviewed_at          TIMESTAMPTZ,
    created_merchant_id  UUID,                 -- set on approval
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_merchant_applications_status ON merchant_applications (status, created_at);
CREATE INDEX IF NOT EXISTS idx_merchant_applications_handle ON merchant_applications (desired_handle);
CREATE INDEX IF NOT EXISTS idx_merchant_applications_email  ON merchant_applications (email);
