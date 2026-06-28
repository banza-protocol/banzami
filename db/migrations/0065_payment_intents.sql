-- PaymentIntent (BANZA ADR-037) — operator-side payment-initiation primitive.
-- Payment Links / QR / Payment Requests are SURFACES of a PaymentIntent. A
-- PaymentIntent NEVER holds or moves money; fulfilment produces exactly one
-- Transfer that posts to the Ledger. Status/surface mirror
-- contracts/payment-intents/payment-intent.schema.json in ~/banza.

CREATE TABLE IF NOT EXISTS payment_intents (
    id               UUID         PRIMARY KEY,
    operator_id      TEXT         NOT NULL,
    merchant_id      UUID         NOT NULL,
    payee_wallet_id  UUID         NOT NULL,
    amount_minor     BIGINT       CHECK (amount_minor IS NULL OR amount_minor > 0),  -- NULL = open amount
    currency         TEXT         NOT NULL DEFAULT 'AOA',
    surface          TEXT         NOT NULL CHECK (surface IN ('LINK','QR','REQUEST')),
    surface_ref      TEXT,                                          -- concrete artifact id (slug, qr_id, pr_id)
    status           TEXT         NOT NULL DEFAULT 'CREATED'
                                  CHECK (status IN ('CREATED','REQUESTED','PAID','EXPIRED','CANCELLED','FAILED')),
    transfer_id      UUID,                                          -- Transfer that fulfilled it (causation_id == this id)
    environment      TEXT         NOT NULL DEFAULT 'LIVE' CHECK (environment IN ('LIVE','SANDBOX')),
    idempotency_key  VARCHAR(255) UNIQUE,
    expires_at       TIMESTAMPTZ,
    metadata         JSONB        NOT NULL DEFAULT '{}',
    version          INTEGER      NOT NULL DEFAULT 1,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_intents_merchant
    ON payment_intents (merchant_id, environment, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_intents_surface_ref
    ON payment_intents (surface, surface_ref);

COMMENT ON TABLE payment_intents IS
    'BANZA ADR-037 PaymentIntent: canonical payment-initiation primitive. Holds no money; PaymentIntent -> Transfer -> Ledger. Payment Links/QR/Payment Requests are surfaces of it.';
