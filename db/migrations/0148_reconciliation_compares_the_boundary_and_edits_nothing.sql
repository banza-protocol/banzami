-- 0148 — Reconciliation compares the boundary, and edits nothing.
--
-- MONEY-MODEL-001 (ADR-063). Value enters and leaves Banzami only across an
-- external rail: a hosted payment or deposit an acquirer confirmed, a withdrawal a
-- bank executed, an acquirer settling what it held to the backing account. Each
-- has a Banzami operation and, eventually, external evidence. A boundary
-- reconciliation run compares the two by reference and classifies every
-- difference (core/reconciliation/src/boundary.rs):
--
--   MATCHED · AMOUNT_MISMATCH · CURRENCY_MISMATCH · MISSING_EXTERNAL ·
--   MISSING_INTERNAL · DUPLICATE_EXTERNAL · PENDING · REQUIRES_REVIEW
--
-- These tables are the report, not financial state: nothing here moves value,
-- and nothing that reads them corrects the ledger. A run is identified by its
-- period and the digest of its inputs — the evidence and the state of the
-- operations it was compared with — so reconciling the same thing twice is one
-- run, and a late confirmation that changed an operation is a new one.

CREATE TABLE IF NOT EXISTS boundary_reconciliation_runs (
    id                 UUID        PRIMARY KEY,
    period_start       TIMESTAMPTZ NOT NULL,
    period_end         TIMESTAMPTZ NOT NULL,
    inputs_digest      TEXT        NOT NULL,
    evidence_lines     BIGINT      NOT NULL,
    counts             JSONB       NOT NULL,
    unreconciled_amount_minor BIGINT NOT NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT boundary_reconciliation_runs_period CHECK (period_end > period_start),
    CONSTRAINT boundary_reconciliation_runs_once UNIQUE (period_start, period_end, inputs_digest)
);

CREATE TABLE IF NOT EXISTS boundary_reconciliation_items (
    id                      BIGSERIAL   PRIMARY KEY,
    run_id                  UUID        NOT NULL REFERENCES boundary_reconciliation_runs (id),
    outcome                 TEXT        NOT NULL CHECK (outcome IN (
                                'MATCHED', 'AMOUNT_MISMATCH', 'CURRENCY_MISMATCH', 'MISSING_EXTERNAL',
                                'MISSING_INTERNAL', 'DUPLICATE_EXTERNAL', 'PENDING', 'REQUIRES_REVIEW')),
    kind                    TEXT        NOT NULL CHECK (kind IN ('CASH_IN', 'CASH_OUT', 'ACQUIRER_SETTLEMENT')),
    operation_id            UUID,
    external_ref            TEXT        NOT NULL,
    internal_amount_minor   BIGINT,
    external_amount_minor   BIGINT,
    currency                TEXT        NOT NULL,
    difference_amount_minor BIGINT      NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_boundary_reconciliation_items_run
    ON boundary_reconciliation_items (run_id);
CREATE INDEX IF NOT EXISTS idx_boundary_reconciliation_items_open
    ON boundary_reconciliation_items (outcome) WHERE outcome NOT IN ('MATCHED', 'PENDING');

COMMENT ON TABLE boundary_reconciliation_runs IS
    'MONEY-MODEL-001: one comparison of the boundary operations of a period with external evidence. Evidence, never financial state.';
COMMENT ON TABLE boundary_reconciliation_items IS
    'MONEY-MODEL-001: one classified difference (or match) between a boundary operation and external evidence.';
