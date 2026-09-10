-- 0121_business_onboarding_surfaces.sql
-- One Business identity, several onboarding surfaces, one KYB review.
--
-- A Business application used to have exactly one way in: the public form at
-- banzami.com/comerciantes/candidatura. A developer whose Project needed to
-- receive money was sent there too, and nothing connected the Business that
-- came out of the review to the Project that asked for it. This migration
-- lets the same application — same fields, same documents, same operator
-- review, same approval — start from a Developer Project, and lets an
-- existing Business be connected to a Project without being onboarded twice.
--
--   origin        where the application was started: STANDALONE_BUSINESS (the
--                 public form) or DEVELOPER_PROJECT (a Project's Financial
--                 Setup). Context for the reviewer and the applicant; it does
--                 not change what is verified or who approves.
--   project_id    the Developer Project that asked, when origin is
--                 DEVELOPER_PROJECT. Approval binds that Project to the
--                 Business it provisions (ADR-047/ADR-055), as one of the
--                 recorded provisioning steps.
--   INFORMATION_REQUIRED
--                 the reviewer needs something before deciding: a clearer
--                 document, a missing one. The applicant sees the request,
--                 corrects, and resubmits. Not a rejection.
--
-- business_link_codes: how a Business proves, from its own signed-in session,
-- that it consents to a Project using it. The Business App issues a short-lived
-- single-use code; the Project's owner enters it in the Console. No handle,
-- id or email is ever enough on its own — typing @doa proves nothing.

ALTER TABLE merchant_applications
    ADD COLUMN IF NOT EXISTS origin TEXT,
    ADD COLUMN IF NOT EXISTS project_id UUID,
    ADD COLUMN IF NOT EXISTS submitted_by_user_id UUID,
    ADD COLUMN IF NOT EXISTS information_request TEXT,
    ADD COLUMN IF NOT EXISTS information_requested_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS provisioning_project_bound BOOLEAN NOT NULL DEFAULT false;

-- Every application that exists came through the public form.
UPDATE merchant_applications SET origin = 'STANDALONE_BUSINESS' WHERE origin IS NULL;

-- The default exists only for the rollout window: the Gateway that is running
-- when this migration lands does not name an origin yet. Once every writer
-- names one, a follow-up migration removes it, so a writer that forgets is
-- refused rather than silently filed as the public form (the 0114/0116 lesson).
ALTER TABLE merchant_applications
    ALTER COLUMN origin SET DEFAULT 'STANDALONE_BUSINESS',
    ALTER COLUMN origin SET NOT NULL,
    ADD CONSTRAINT merchant_applications_origin_check
        CHECK (origin IN ('STANDALONE_BUSINESS', 'DEVELOPER_PROJECT')),
    ADD CONSTRAINT merchant_applications_project_origin_coherent
        CHECK ((origin = 'DEVELOPER_PROJECT') = (project_id IS NOT NULL)),
    ADD CONSTRAINT merchant_applications_information_request_coherent
        CHECK (status <> 'INFORMATION_REQUIRED' OR information_request IS NOT NULL);

ALTER TABLE merchant_applications DROP CONSTRAINT IF EXISTS merchant_applications_status_check;
ALTER TABLE merchant_applications ADD CONSTRAINT merchant_applications_status_check
    CHECK (status IN ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'INFORMATION_REQUIRED',
                      'APPROVED', 'REJECTED', 'CANCELLED', 'PROVISIONING_FAILED'));

-- A Project has at most one application in progress.
CREATE UNIQUE INDEX IF NOT EXISTS uq_merchant_applications_open_per_project
    ON merchant_applications (project_id)
    WHERE project_id IS NOT NULL
      AND status IN ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'INFORMATION_REQUIRED', 'PROVISIONING_FAILED');

CREATE INDEX IF NOT EXISTS idx_merchant_applications_origin
    ON merchant_applications (origin, status, created_at);

CREATE TABLE IF NOT EXISTS business_link_codes (
    id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id          UUID        NOT NULL REFERENCES merchants (id),
    environment          TEXT        NOT NULL CHECK (environment IN ('SANDBOX', 'LIVE')),
    -- SHA-256 of the code. The code itself exists only on the Business's screen.
    code_hash            TEXT        NOT NULL UNIQUE,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at           TIMESTAMPTZ NOT NULL,
    redeemed_at          TIMESTAMPTZ,
    redeemed_project_id  UUID,
    CONSTRAINT business_link_codes_expiry_after_creation CHECK (expires_at > created_at),
    CONSTRAINT business_link_codes_redemption_coherent
        CHECK ((redeemed_at IS NULL) = (redeemed_project_id IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_business_link_codes_merchant
    ON business_link_codes (merchant_id, created_at DESC);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bl_app_runtime') THEN
        GRANT SELECT, INSERT, UPDATE ON TABLE business_link_codes TO bl_app_runtime;
    END IF;
END
$$;
