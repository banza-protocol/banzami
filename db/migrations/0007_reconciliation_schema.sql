-- Migration 0007: Reconciliation schema
-- Persists the output of reconciliation runs for audit trails and compliance.

CREATE TABLE reconciliation_runs (
    id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    total_checked           BIGINT      NOT NULL DEFAULT 0,
    matched                 BIGINT      NOT NULL DEFAULT 0,
    missing_external        BIGINT      NOT NULL DEFAULT 0,
    missing_internal        BIGINT      NOT NULL DEFAULT 0,
    amount_mismatches       BIGINT      NOT NULL DEFAULT 0,
    total_discrepancy_minor BIGINT      NOT NULL DEFAULT 0,
    generated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE reconciliation_records (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id            UUID        NOT NULL REFERENCES reconciliation_runs (id),
    settlement_id     UUID,
    transaction_id    UUID,
    external_ref      TEXT,
    internal_minor    BIGINT,
    external_minor    BIGINT,
    currency          CHAR(3)     NOT NULL,
    status            TEXT        NOT NULL CHECK (status IN (
                          'MATCHED', 'MISSING_EXTERNAL', 'MISSING_INTERNAL', 'AMOUNT_MISMATCH'
                      )),
    discrepancy_minor BIGINT      NOT NULL DEFAULT 0,
    reconciled_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX recon_records_run_id_idx    ON reconciliation_records (run_id);
CREATE INDEX recon_records_status_idx    ON reconciliation_records (status) WHERE status != 'MATCHED';
CREATE INDEX recon_runs_generated_at_idx ON reconciliation_runs (generated_at DESC);
