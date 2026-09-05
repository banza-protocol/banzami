-- Transferências — internal transfer between two wallet accounts of the SAME
-- financial owner (Banzami ADR-052).
--
-- The first Developer Transferências capability is deliberately the smallest
-- coherent one: money moves between two child accounts a single bound owner
-- already holds. A campaign can move funds to another campaign of the same
-- organisation; nothing crosses an owner boundary.
--
-- This is NOT a payout, NOT an application settlement, and NOT a consumer P2P
-- transfer. Those move value OUT of the owner and each has its own authority
-- contract. Recording them in one table would invite exactly the conflation the
-- product decision exists to avoid, so this table holds only same-owner internal
-- movements.
--
-- The generic merchant transfer routes withdrawn for security (RA-053, RA-057)
-- are not resurrected here: this surface cannot name a counterparty outside the
-- caller's own owner, because both endpoints are validated against the same
-- wallet.

CREATE TABLE IF NOT EXISTS wallet_account_transfers (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id         UUID        NOT NULL REFERENCES merchants(id),
    wallet_id           UUID        NOT NULL REFERENCES wallets(id),
    source_account_id   UUID        NOT NULL REFERENCES wallet_accounts(id),
    dest_account_id     UUID        NOT NULL REFERENCES wallet_accounts(id),
    amount_minor        BIGINT      NOT NULL CHECK (amount_minor > 0),
    currency            TEXT        NOT NULL,
    status              TEXT        NOT NULL DEFAULT 'COMPLETED',
    description         TEXT,
    ledger_posting_id   UUID        NOT NULL REFERENCES ledger_postings(id),
    idempotency_key     TEXT        NOT NULL,
    environment         TEXT        NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- A transfer never has the same account on both sides. Enforced here as well
    -- as in the handler so a future caller cannot post a self-transfer that
    -- balances to nothing and looks like a real movement in the history.
    CONSTRAINT wallet_account_transfers_distinct_accounts
        CHECK (source_account_id <> dest_account_id)
);

-- Idempotency is scoped per merchant: two owners may legitimately choose the
-- same key, and one must not be able to probe or replay the other's transfer by
-- guessing it.
CREATE UNIQUE INDEX IF NOT EXISTS wallet_account_transfers_idem_uidx
    ON wallet_account_transfers (merchant_id, idempotency_key);

CREATE INDEX IF NOT EXISTS wallet_account_transfers_merchant_idx
    ON wallet_account_transfers (merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS wallet_account_transfers_source_idx
    ON wallet_account_transfers (source_account_id);
