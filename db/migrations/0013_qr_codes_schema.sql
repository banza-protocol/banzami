-- QR code schema — static and dynamic payment QR codes.
-- The scannable payload is generated on demand from these records, never stored.

CREATE TABLE qr_codes (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    -- UUID of the payment recipient (consumer or merchant).
    owner_id     UUID        NOT NULL,
    owner_type   TEXT        NOT NULL CHECK (owner_type IN ('CONSUMER', 'MERCHANT')),
    qr_type      TEXT        NOT NULL CHECK (qr_type    IN ('STATIC', 'DYNAMIC')),
    currency     CHAR(3)     NOT NULL,
    -- Null for static QR (payer chooses amount); required for dynamic QR.
    amount_minor BIGINT      CHECK (amount_minor > 0),
    status       TEXT        NOT NULL DEFAULT 'ACTIVE'
                             CHECK (status IN ('ACTIVE', 'EXPIRED', 'USED')),
    -- Null for static QR (never expires).
    expires_at   TIMESTAMPTZ,
    used_at      TIMESTAMPTZ,
    -- Optional opaque merchant / consumer reference (e.g. order ID, invoice number).
    reference    TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT qr_codes_dynamic_requires_amount
        CHECK (qr_type = 'STATIC' OR amount_minor IS NOT NULL),
    CONSTRAINT qr_codes_dynamic_requires_expiry
        CHECK (qr_type = 'STATIC' OR expires_at IS NOT NULL)
);

COMMENT ON TABLE  qr_codes           IS 'Static (reusable) and dynamic (one-time) QR payment codes.';
COMMENT ON COLUMN qr_codes.owner_id  IS 'Consumer or merchant UUID — determines where funds go.';
COMMENT ON COLUMN qr_codes.expires_at IS 'Dynamic QR codes must have an expiry; static codes do not.';

CREATE INDEX qr_codes_owner_idx  ON qr_codes (owner_id, status);
CREATE INDEX qr_codes_active_idx ON qr_codes (status, expires_at)
    WHERE status = 'ACTIVE';
