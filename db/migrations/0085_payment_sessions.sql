-- 0085: Payment Sessions (BANZA ADR-043 · Banzami ADR-030).
--
-- A Payment Session is the operator's single financial entry object: it binds a
-- destination wallet_account and provisions one or more INTERFACES (a payment link
-- and, for fixed-amount sessions, a dynamic QR) that all credit the SAME account.
-- The session is a thin aggregate over the existing primitives (payment_links,
-- qr_codes, ADR-042 wallet_accounts); it stores no balance. Payment always resolves
-- against the session's destination — link and QR are interfaces, not separate flows.

CREATE TABLE IF NOT EXISTS payment_sessions (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id       UUID        NOT NULL,
    wallet_id         UUID        NOT NULL REFERENCES wallets(id),
    -- The segregated destination account (ADR-042). Every interface credits this.
    wallet_account_id UUID        NOT NULL REFERENCES wallet_accounts(id),
    currency          CHAR(3)     NOT NULL,
    amount_minor      BIGINT      CHECK (amount_minor IS NULL OR amount_minor > 0),
    purpose           TEXT        NOT NULL DEFAULT 'GENERIC',
    reference_type    TEXT,
    reference_id      TEXT,
    status            TEXT        NOT NULL DEFAULT 'ACTIVE'
                                  CHECK (status IN ('CREATED','ACTIVE','PAID','PARTIALLY_PAID','EXPIRED','CANCELLED','FAILED')),
    -- Interface artifacts (ids into the existing primitives). Nullable: an operator
    -- MAY provision a subset, provided every one resolves to this session.
    payment_link_id   UUID        REFERENCES payment_links(id),
    qr_code_id        UUID        REFERENCES qr_codes(id),
    deep_link         TEXT,
    public_url        TEXT,
    expires_at        TIMESTAMPTZ,
    metadata          JSONB       NOT NULL DEFAULT '{}'::jsonb,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payment_sessions_merchant_idx
    ON payment_sessions (merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payment_sessions_wallet_account_idx
    ON payment_sessions (wallet_account_id);

-- Idempotency: one session per (merchant, purpose, reference) when a reference is
-- set — re-creating returns the same session (e.g. one session per DOA campaign).
CREATE UNIQUE INDEX IF NOT EXISTS payment_sessions_reference_uidx
    ON payment_sessions (merchant_id, purpose, reference_type, reference_id)
    WHERE reference_id IS NOT NULL;

COMMENT ON TABLE payment_sessions IS
    'BANZA ADR-043 Payment Session: a PaymentIntent presented through interfaces (link + QR) that all credit one wallet_account. Stores no balance.';
