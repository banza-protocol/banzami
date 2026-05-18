-- Migration 0026: Acquiring-specific reconciliation tables
--
-- acquiring_reconciliation_runs — one row per daily run comparing
--     acquiring_callbacks against ledger_postings.
-- acquiring_reconciliation_items — one row per acquiring_callback inspected.

CREATE TABLE acquiring_reconciliation_runs (
    id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    -- ISO date of the settlement day being reconciled (e.g. '2026-05-18')
    reconciliation_date     DATE        NOT NULL,
    status                  TEXT        NOT NULL DEFAULT 'RUNNING'
                                CHECK (status IN ('RUNNING', 'COMPLETED', 'FAILED')),
    total_callbacks         BIGINT      NOT NULL DEFAULT 0,
    matched                 BIGINT      NOT NULL DEFAULT 0,
    -- Callback received but no ledger posting found
    missing_posting         BIGINT      NOT NULL DEFAULT 0,
    -- Ledger posting exists but amount differs from callback
    amount_mismatch         BIGINT      NOT NULL DEFAULT 0,
    -- Callbacks processed more than once (idempotency_key collision after DO NOTHING)
    duplicate_callbacks     BIGINT      NOT NULL DEFAULT 0,
    total_discrepancy_minor BIGINT      NOT NULL DEFAULT 0,
    started_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at            TIMESTAMPTZ,
    error_message           TEXT,
    UNIQUE (reconciliation_date)   -- one completed run per day
);

CREATE INDEX acq_recon_runs_date_idx   ON acquiring_reconciliation_runs (reconciliation_date DESC);
CREATE INDEX acq_recon_runs_status_idx ON acquiring_reconciliation_runs (status) WHERE status != 'COMPLETED';

CREATE TABLE acquiring_reconciliation_items (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id              UUID        NOT NULL REFERENCES acquiring_reconciliation_runs (id) ON DELETE CASCADE,
    -- The acquiring_callbacks row being inspected
    callback_id         UUID        NOT NULL,
    acquiring_payment_id UUID,
    external_ref        TEXT        NOT NULL,
    -- Amount reported in the callback (minor units)
    callback_amount_minor BIGINT,
    -- Amount actually posted to the ledger (minor units)
    ledger_amount_minor   BIGINT,
    currency            CHAR(3)     NOT NULL DEFAULT 'AOA',
    status              TEXT        NOT NULL CHECK (status IN (
                            'MATCHED',
                            'MISSING_POSTING',
                            'AMOUNT_MISMATCH',
                            'DUPLICATE'
                        )),
    discrepancy_minor   BIGINT      NOT NULL DEFAULT 0,
    notes               TEXT,
    reconciled_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX acq_recon_items_run_idx      ON acquiring_reconciliation_items (run_id);
CREATE INDEX acq_recon_items_status_idx   ON acquiring_reconciliation_items (status) WHERE status != 'MATCHED';
CREATE INDEX acq_recon_items_callback_idx ON acquiring_reconciliation_items (callback_id);
