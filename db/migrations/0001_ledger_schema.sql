-- Ledger schema — double-entry accounting foundation
-- All monetary state for Banzami flows through these three tables.
-- Entries are append-only and immutable. Corrections use reversal postings.
-- (CLAUDE.md §10.1)

-- ---------------------------------------------------------------------------
-- Chart of accounts
-- ---------------------------------------------------------------------------
CREATE TABLE ledger_accounts (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    account_type TEXT        NOT NULL
                             CHECK (account_type IN ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE')),
    name         TEXT        NOT NULL,
    currency     CHAR(3)     NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  ledger_accounts              IS 'Nodes in the chart of accounts. Immutable after creation.';
COMMENT ON COLUMN ledger_accounts.account_type IS 'ASSET/EXPENSE have a normal debit balance; LIABILITY/EQUITY/REVENUE have a normal credit balance.';
COMMENT ON COLUMN ledger_accounts.currency     IS 'ISO 4217 code. All entries against this account must use this currency.';

-- ---------------------------------------------------------------------------
-- Journal entries (the atomic unit of the ledger)
-- ---------------------------------------------------------------------------
CREATE TABLE ledger_postings (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    description     TEXT        NOT NULL,
    -- Unique caller-supplied key for exactly-once semantics. (CLAUDE.md §8.3)
    idempotency_key TEXT        NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT ledger_postings_idempotency_key_unique UNIQUE (idempotency_key)
);

COMMENT ON TABLE  ledger_postings                 IS 'A balanced journal entry: the atomic unit of the ledger. Never modified after insert.';
COMMENT ON COLUMN ledger_postings.idempotency_key IS 'Globally unique. Re-posting the same key returns the existing row instead of creating a duplicate.';

-- ---------------------------------------------------------------------------
-- Debit / credit lines
-- ---------------------------------------------------------------------------
CREATE TABLE ledger_entries (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    posting_id   UUID        NOT NULL REFERENCES ledger_postings(id),
    account_id   UUID        NOT NULL REFERENCES ledger_accounts(id),
    entry_type   TEXT        NOT NULL CHECK (entry_type IN ('DEBIT', 'CREDIT')),
    -- Always positive. Direction is encoded in entry_type.
    amount_minor BIGINT      NOT NULL CHECK (amount_minor > 0),
    currency     CHAR(3)     NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  ledger_entries              IS 'Individual debit/credit lines. Append-only and immutable.';
COMMENT ON COLUMN ledger_entries.amount_minor IS 'Always positive. Signed value is: +amount_minor for DEBIT, -amount_minor for CREDIT.';

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

-- Primary balance query: sum entries for a given account
CREATE INDEX idx_ledger_entries_account_id
    ON ledger_entries (account_id);

-- Join from posting to its entries
CREATE INDEX idx_ledger_entries_posting_id
    ON ledger_entries (posting_id);

-- Time-range balance queries (e.g. balance as of a given date)
CREATE INDEX idx_ledger_entries_account_created
    ON ledger_entries (account_id, created_at DESC);

-- Audit and reconciliation scans ordered by time
CREATE INDEX idx_ledger_entries_created_at
    ON ledger_entries (created_at DESC);

CREATE INDEX idx_ledger_postings_created_at
    ON ledger_postings (created_at DESC);
