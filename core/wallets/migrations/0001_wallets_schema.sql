-- Wallet domain schema
--
-- Wallets store NO balance columns — all monetary state is derived from ledger entries.
-- The available_account_id and reserved_account_id reference ledger_accounts;
-- balance queries join against ledger_entries through those account IDs.
--
-- Constraint: one wallet per merchant per currency (UNIQUE on merchant_id, currency).

CREATE TABLE wallets (
    id                   UUID        PRIMARY KEY,
    merchant_id          UUID        NOT NULL,
    currency             TEXT        NOT NULL,
    status               TEXT        NOT NULL DEFAULT 'ACTIVE'
                             CHECK (status IN ('ACTIVE', 'SUSPENDED', 'CLOSED')),
    -- The two backing ledger accounts provisioned at wallet creation.
    available_account_id UUID        NOT NULL REFERENCES ledger_accounts(id),
    reserved_account_id  UUID        NOT NULL REFERENCES ledger_accounts(id),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Enforce one wallet per currency per merchant.
    UNIQUE (merchant_id, currency)
);

CREATE INDEX wallets_merchant_id_idx ON wallets (merchant_id);
