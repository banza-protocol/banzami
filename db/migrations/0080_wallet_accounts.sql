-- 0080: Wallet Accounts — segregated accounts within a wallet (BANZA ADR-042).
--
-- A wallet (one per merchant+currency) may hold N purpose-tagged accounts, each
-- backed by its own ledger account with an isolated balance. PRIMARY is the
-- wallet's existing available account; CAMPAIGN/ESCROW/… are new ledger accounts.
-- Ledger postings already reference ledger_accounts(id) (ADR-002), so this adds a
-- mapping + lifecycle on top — it moves NO money and changes NO posting logic.
-- Backward compatible: flows that don't name an account use PRIMARY.

CREATE TABLE wallet_accounts (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id      UUID        NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
    -- The segregated ledger account that holds this account's available balance.
    account_id     UUID        NOT NULL REFERENCES ledger_accounts(id) ON DELETE RESTRICT,
    merchant_id    UUID        NOT NULL,   -- owner (denormalised for ownership checks)
    currency       CHAR(3)     NOT NULL,
    purpose        TEXT        NOT NULL
                   CHECK (purpose IN ('PRIMARY','CAMPAIGN','PROJECT','EVENT','STORE','ESCROW','RESERVE','SETTLEMENT','CUSTOM')),
    -- Optional opaque external aggregate reference (e.g. a campaign id).
    reference_type TEXT,
    reference_id   TEXT,
    label          TEXT,
    status         TEXT        NOT NULL DEFAULT 'ACTIVE'
                   CHECK (status IN ('ACTIVE','INACTIVE','SETTLED','CLOSED')),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- One wallet_account per ledger account.
    UNIQUE (account_id)
);

-- Exactly one PRIMARY account per wallet (mandatory + unique — ADR-042).
CREATE UNIQUE INDEX wallet_accounts_primary_uidx
    ON wallet_accounts (wallet_id) WHERE purpose = 'PRIMARY';

-- One account per (wallet, purpose, external reference) — a campaign can't get two.
CREATE UNIQUE INDEX wallet_accounts_ref_uidx
    ON wallet_accounts (wallet_id, purpose, reference_type, reference_id)
    WHERE reference_id IS NOT NULL;

CREATE INDEX wallet_accounts_lookup_idx
    ON wallet_accounts (reference_type, reference_id) WHERE reference_id IS NOT NULL;
CREATE INDEX wallet_accounts_wallet_idx ON wallet_accounts (wallet_id);

-- Backfill: every existing merchant wallet gains a PRIMARY account that ADOPTS its
-- current available account (no balance moves — the account_id already holds the
-- money). Idempotent.
INSERT INTO wallet_accounts (wallet_id, account_id, merchant_id, currency, purpose, label)
SELECT w.id, w.available_account_id, w.merchant_id, w.currency, 'PRIMARY', 'Primary'
  FROM wallets w
 WHERE w.available_account_id IS NOT NULL
ON CONFLICT (account_id) DO NOTHING;
