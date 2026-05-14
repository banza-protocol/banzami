-- P2P transfer schema — records of instant wallet-to-wallet transfers.
-- Every COMPLETED transfer corresponds to a balanced ledger_posting. (CLAUDE.md §10.1)

CREATE TABLE transfers (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key   TEXT        NOT NULL,
    sender_id         UUID        NOT NULL REFERENCES consumers(id),
    recipient_id      UUID        NOT NULL REFERENCES consumers(id),
    amount_minor      BIGINT      NOT NULL CHECK (amount_minor > 0),
    currency          CHAR(3)     NOT NULL,
    status            TEXT        NOT NULL DEFAULT 'PENDING'
                                  CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED', 'REVERSED')),
    description       TEXT,
    failure_reason    TEXT,
    -- Set when status = COMPLETED. References the balancing ledger_posting.
    ledger_posting_id UUID        REFERENCES ledger_postings(id),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT transfers_idempotency_key_key UNIQUE (idempotency_key),
    CONSTRAINT transfers_no_self_transfer    CHECK  (sender_id != recipient_id)
);

COMMENT ON TABLE  transfers                   IS 'Immutable record of every attempted P2P transfer.';
COMMENT ON COLUMN transfers.ledger_posting_id IS 'Null until the transfer is COMPLETED; references the balancing double-entry posting.';

CREATE INDEX transfers_sender_idx    ON transfers (sender_id,    created_at DESC);
CREATE INDEX transfers_recipient_idx ON transfers (recipient_id, created_at DESC);
CREATE INDEX transfers_status_idx    ON transfers (status);
