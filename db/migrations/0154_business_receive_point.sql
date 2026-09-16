-- 0154 — Business Receive Point: a stable public receive identity per Business.
--
-- ADR-065 (BUSINESS-RECEIVE-POINT-001). A Business needs a persistent, printable
-- receive QR — "here is my Banzami QR, you can pay me". A Business @banza is not
-- a Consumer P2P destination (Core rule, unchanged) and the withdrawn /v1/qr/static
-- rail (RA-053) is not revived. Instead a Receive Point is a stable public
-- payment-entry identity: scanning it resolves the Business and the payer mints a
-- FRESH Payment Session per payment. "The QR is persistent; the session is not."
--
-- This object is NOT financial state: it is not a wallet, ledger account, payment
-- session, Project or credential. Creating/disabling/resolving it has ZERO ledger
-- effect — only the minted Payment Session reaches Core. The public_slug is an
-- opaque, unguessable public id (issued by the operator, ≥128 bits); it carries no
-- internal id and is public, not a secret.
--
-- Invariants enforced here:
--   * public_slug is globally unique and never reused;
--   * at most ONE ACTIVE receive point per (merchant, environment) — a partial
--     unique index, so a merchant can hold historical DISABLED/RETIRED rows but
--     only one live receive identity;
--   * merchant_id has FK integrity to merchants.
-- Provisioning is idempotent and race-safe by relying on these unique indexes
-- (INSERT ... ON CONFLICT DO NOTHING on the active partial index).
--
-- Additive and reversible: DROP TABLE business_receive_points.

CREATE TABLE IF NOT EXISTS business_receive_points (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id   UUID        NOT NULL REFERENCES merchants(id),
    public_slug   TEXT        NOT NULL,
    status        TEXT        NOT NULL DEFAULT 'ACTIVE'
                                CHECK (status IN ('ACTIVE','DISABLED','RETIRED')),
    environment   TEXT        NOT NULL CHECK (environment IN ('SANDBOX','LIVE')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    disabled_at   TIMESTAMPTZ
);

-- The public identity: globally unique, never reused.
CREATE UNIQUE INDEX IF NOT EXISTS uq_business_receive_points_slug
    ON business_receive_points (public_slug);

-- One live receive identity per Business per environment; history is allowed.
CREATE UNIQUE INDEX IF NOT EXISTS uq_business_receive_points_one_active
    ON business_receive_points (merchant_id, environment)
    WHERE status = 'ACTIVE';

COMMENT ON TABLE business_receive_points IS
    'ADR-065 stable public Business receive identity; mints a fresh Payment Session per payment. Not financial state; zero ledger effect.';
