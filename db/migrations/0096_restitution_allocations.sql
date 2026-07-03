-- Shared source-scoped restitution ceiling (Banzami ADR-034 restitution model).
--
-- The single authoritative aggregate for the combined refund + dispute (+ future
-- reversal) ceiling required by BANZA disputes.md §52: total restitution against
-- one captured source MUST NOT exceed the captured amount. `refunds` stay refunds
-- and `disputes` stay disputes — this table is INTERNAL financial accounting state
-- and is never exposed as a refund or dispute through any operator API.
--
-- Synchronous, SUCCEEDED-only: a row exists ONLY for a committed balanced posting.
-- There is no PENDING/FAILED workflow state — a rejected/failed operation rolls
-- back and leaves no row. Idempotency is SOURCE-SCOPED.

CREATE TABLE restitution_allocations (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Typed source (ADR-030). 'TRANSACTION' is the compatible persisted token for
    -- an acquiring payment (canonical ACQUIRING_PAYMENT normalization deferred to
    -- a BANZA clarification). 'TRANSFER' is never a valid source.
    source_type      TEXT        NOT NULL CHECK (source_type IN ('TRANSACTION', 'WALLET_PAYMENT')),
    source_id        UUID        NOT NULL,
    origin           TEXT        NOT NULL CHECK (origin IN ('REFUND', 'DISPUTE', 'REVERSAL')),
    -- The originating refund / dispute / reversal object id (polymorphic; no FK).
    origin_id        UUID        NOT NULL,
    amount_minor     BIGINT      NOT NULL CHECK (amount_minor > 0),
    currency         TEXT        NOT NULL,
    idempotency_key  TEXT        NOT NULL,
    -- The balanced double-entry posting that moved the value.
    posting_id       UUID        NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- One allocation per originating object.
    CONSTRAINT restitution_alloc_origin_unique UNIQUE (origin, origin_id),
    -- Source-aware idempotency (Banzami ADR-034): a replay is scoped to the source.
    CONSTRAINT restitution_alloc_idem_unique   UNIQUE (source_type, source_id, origin, idempotency_key)
);

-- The ceiling aggregate is summed by typed source.
CREATE INDEX idx_restitution_alloc_source ON restitution_allocations (source_type, source_id);

COMMENT ON TABLE restitution_allocations IS
    'Internal shared source-scoped restitution ceiling (refunds + disputes + reversals). Never exposed publicly as a refund or dispute.';
