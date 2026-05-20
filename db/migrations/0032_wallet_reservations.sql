-- Wallet reservation table — operational record of fund reservations.
--
-- Each row tracks one reserve operation (DR available / CR reserved posting)
-- and its lifecycle: ACTIVE → RELEASED or ACTIVE → COMMITTED.
--
-- Architecture note (ADR-017 §4):
--   The ledger is the financial source of truth. This table is an operational
--   index that enables efficient reserve/release/commit without scanning all
--   ledger entries. Both must remain consistent — the reservation insert and
--   the ledger posting always happen in the same DB transaction.
--
-- Invariants enforced here:
--   INV-WALLET-003: reserve/release symmetry — each reservation has one
--                   corresponding posting; release/commit create reversal postings.
--   No negative balance is possible — the balance check happens inside the
--   same TX that inserts the reservation (SELECT ... FOR UPDATE on the wallet row).

CREATE TABLE wallet_reservations (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

    wallet_id           UUID        NOT NULL REFERENCES consumer_wallets(id),

    -- Amount reserved, always positive.
    amount_minor        BIGINT      NOT NULL CHECK (amount_minor > 0),
    currency            CHAR(3)     NOT NULL,

    -- Human-readable context for the reservation (e.g. "QR payment qr_xxx").
    reason              TEXT        NOT NULL,

    -- Lifecycle: ACTIVE until released or committed.
    status              TEXT        NOT NULL DEFAULT 'ACTIVE'
                                    CHECK (status IN ('ACTIVE', 'RELEASED', 'COMMITTED')),

    -- The ledger posting that created this reservation (DR available / CR reserved).
    -- Used for audit linkage and reconciliation.
    reserve_posting_id  UUID        NOT NULL REFERENCES ledger_postings(id),

    -- Caller-supplied idempotency key. Guarantees exactly-once reservation.
    idempotency_key     TEXT        NOT NULL UNIQUE,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    released_at         TIMESTAMPTZ,
    committed_at        TIMESTAMPTZ
);

COMMENT ON TABLE wallet_reservations IS
    'Operational index for active and completed fund reservations. '
    'The ledger postings are the financial source of truth; this table enables '
    'efficient reserve/release/commit without scanning all ledger_entries.';

COMMENT ON COLUMN wallet_reservations.reserve_posting_id IS
    'Ledger posting (DR available / CR reserved) that created this reservation. '
    'Release and commit operations create additional postings linked via this ID.';

COMMENT ON COLUMN wallet_reservations.idempotency_key IS
    'Exactly-once guarantee: submitting the same key returns the existing reservation.';

-- Fast lookup of ACTIVE reservations per wallet.
CREATE INDEX wallet_reservations_wallet_active_idx
    ON wallet_reservations (wallet_id)
    WHERE status = 'ACTIVE';

-- Full wallet + status index for lifecycle queries.
CREATE INDEX wallet_reservations_wallet_status_idx
    ON wallet_reservations (wallet_id, status);
