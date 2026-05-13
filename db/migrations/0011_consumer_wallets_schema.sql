-- Consumer wallet schema — double-entry ledger-backed wallets for end-users.
-- Each wallet is backed by two LIABILITY ledger accounts (available + reserved).
-- Balance is never stored here — always derived from ledger_entries. (CLAUDE.md §2.1)

CREATE TABLE consumer_wallets (
    id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    consumer_id          UUID        NOT NULL REFERENCES consumer_identities(id),
    currency             CHAR(3)     NOT NULL,
    status               TEXT        NOT NULL DEFAULT 'ACTIVE'
                                     CHECK (status IN ('ACTIVE', 'SUSPENDED', 'CLOSED')),
    available_account_id UUID        NOT NULL REFERENCES ledger_accounts(id),
    reserved_account_id  UUID        NOT NULL REFERENCES ledger_accounts(id),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  consumer_wallets                      IS 'Consumer money containers. Balance is always derived from ledger_entries.';
COMMENT ON COLUMN consumer_wallets.available_account_id IS 'LIABILITY account — spendable funds.';
COMMENT ON COLUMN consumer_wallets.reserved_account_id  IS 'LIABILITY account — funds held for in-flight outbound operations.';

-- Enforce one active wallet per consumer per currency.
CREATE UNIQUE INDEX consumer_wallets_consumer_currency_idx
    ON consumer_wallets (consumer_id, currency)
    WHERE status != 'CLOSED';

CREATE INDEX consumer_wallets_consumer_idx ON consumer_wallets (consumer_id);
