-- Wallet-native merchant payments — the first-class payment object required by
-- BANZA ADR-030. A wallet-native merchant payment (e.g. a consumer scanning a
-- merchant QR) settles as a wallet transfer, but the transfer alone does not
-- distinguish a merchant payment from a P2P transfer. This object makes a
-- merchant payment a typed, refundable source: refunds will reference it via
-- source_type=WALLET_PAYMENT (a later step). P2P transfers DO NOT get a row here.
--
-- This migration only introduces the object; refund wiring is out of scope.

CREATE TABLE wallet_payments (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    -- The wallet transfer that settled this payment (consumer → merchant wallet).
    transfer_id     UUID         NOT NULL,
    merchant_id     UUID         NOT NULL,
    -- The paying consumer (the wallet to credit on a future wallet-native refund).
    consumer_id     UUID         NOT NULL,
    qr_code_id      UUID,
    payment_link_id UUID,
    amount_minor    BIGINT       NOT NULL CHECK (amount_minor > 0),
    currency        TEXT         NOT NULL CHECK (currency <> ''),
    status          TEXT         NOT NULL DEFAULT 'COMPLETED'
                                 CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED', 'CANCELLED', 'REVERSED')),
    -- Correlation anchor for the whole scan→pay flow (the payment idempotency key).
    trace_id        TEXT         NOT NULL,
    environment     TEXT         NOT NULL DEFAULT 'LIVE'
                                 CHECK (environment IN ('LIVE', 'SANDBOX')),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),

    -- One wallet payment per settling transfer — makes recording idempotent.
    CONSTRAINT wallet_payments_transfer_unique UNIQUE (transfer_id)
);

CREATE INDEX idx_wallet_payments_merchant    ON wallet_payments (merchant_id, created_at DESC);
CREATE INDEX idx_wallet_payments_consumer    ON wallet_payments (consumer_id, created_at DESC);
CREATE INDEX idx_wallet_payments_qr          ON wallet_payments (qr_code_id) WHERE qr_code_id IS NOT NULL;
CREATE INDEX idx_wallet_payments_status      ON wallet_payments (status);
CREATE INDEX idx_wallet_payments_environment ON wallet_payments (environment);
