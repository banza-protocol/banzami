-- Consumer credential store for the public-api service.
--
-- This table is owned exclusively by public-api and stores bcrypt-hashed PINs.
-- Financial data (wallets, balances, transfers) lives in the Rust core — this
-- table only exists to answer "who owns this handle and what is their PIN hash".

CREATE TABLE IF NOT EXISTS public_api_credentials (
    consumer_id UUID        NOT NULL REFERENCES consumers (id),
    handle      VARCHAR(30) NOT NULL,
    pin_hash    TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (consumer_id),
    UNIQUE      (handle)
);

-- Fast lookup by handle at login time.
CREATE INDEX IF NOT EXISTS idx_pub_creds_handle ON public_api_credentials (handle);
