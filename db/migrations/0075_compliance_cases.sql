-- Compliance Operations Console — unified case index (Banzami ADR-023).
--
-- A single operational index over every compliance workitem (merchant
-- applications, KYB merchants, KYC consumers, failed settlements, and future
-- dispute/fraud/risk/AML reviews). It does NOT duplicate financial or document
-- data — it is a thin index that points back to the owning entity. Rows are
-- SYNCED idempotently from existing source tables via a unique source_key, so the
-- operator works on CASES, not modules. UX/operational state only: no financial
-- truth, no storage keys, no signed URLs.

CREATE TABLE IF NOT EXISTS compliance_cases (
    id            UUID         PRIMARY KEY,
    environment   TEXT         NOT NULL,                     -- LIVE | SANDBOX
    case_type     TEXT         NOT NULL,                     -- MERCHANT_APPLICATION | KYB_MERCHANT | KYC_CONSUMER | DISPUTE | SETTLEMENT_FAILURE | MANUAL_REVIEW | FRAUD_REVIEW | RISK_ALERT | AML_REVIEW
    entity_type   TEXT         NOT NULL,                     -- merchant | consumer | merchant_application | app_settlement | ...
    entity_id     TEXT         NOT NULL,
    entity_name   TEXT,
    entity_handle TEXT,
    status        TEXT         NOT NULL DEFAULT 'UNASSIGNED', -- UNASSIGNED | ASSIGNED | ESCALATED | RESOLVED
    priority      TEXT         NOT NULL DEFAULT 'NORMAL',     -- LOW | NORMAL | HIGH | CRITICAL
    risk_level    TEXT         NOT NULL DEFAULT 'LOW',        -- LOW | MEDIUM | HIGH | CRITICAL

    assigned_operator_id   UUID REFERENCES admin_users(id),
    assigned_operator_name TEXT,

    source_key    TEXT         NOT NULL,                     -- idempotent sync key (unique)
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    last_activity TIMESTAMPTZ  NOT NULL DEFAULT now(),       -- drives SLA / sorting
    resolved_at   TIMESTAMPTZ,
    metadata      JSONB        NOT NULL DEFAULT '{}'::jsonb,

    CONSTRAINT compliance_cases_status_check   CHECK (status   IN ('UNASSIGNED','ASSIGNED','ESCALATED','RESOLVED')),
    CONSTRAINT compliance_cases_priority_check CHECK (priority IN ('LOW','NORMAL','HIGH','CRITICAL')),
    CONSTRAINT compliance_cases_risk_check     CHECK (risk_level IN ('LOW','MEDIUM','HIGH','CRITICAL'))
);

-- One case per source workitem (idempotent sync).
CREATE UNIQUE INDEX IF NOT EXISTS compliance_cases_source_key_idx
    ON compliance_cases (source_key);

-- Inbox read path: by environment, open-first, newest activity first.
CREATE INDEX IF NOT EXISTS compliance_cases_inbox_idx
    ON compliance_cases (environment, status, last_activity DESC);

-- Filter/sort helpers.
CREATE INDEX IF NOT EXISTS compliance_cases_type_idx     ON compliance_cases (environment, case_type);
CREATE INDEX IF NOT EXISTS compliance_cases_assignee_idx ON compliance_cases (assigned_operator_id);

-- Free-text search across the denormalized identity fields (name/handle/id).
CREATE INDEX IF NOT EXISTS compliance_cases_search_idx
    ON compliance_cases USING gin (
        to_tsvector('simple',
            coalesce(entity_name,'') || ' ' || coalesce(entity_handle,'') || ' ' || coalesce(entity_id,''))
    );

-- Internal operator notes on a case (never sent to the customer).
CREATE TABLE IF NOT EXISTS compliance_case_notes (
    id          UUID        PRIMARY KEY,
    case_id     UUID        NOT NULL REFERENCES compliance_cases(id) ON DELETE CASCADE,
    author_id   UUID        REFERENCES admin_users(id),
    author_name TEXT,
    body        TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS compliance_case_notes_case_idx
    ON compliance_case_notes (case_id, created_at);

COMMENT ON TABLE compliance_cases IS
    'Unified compliance case index (ADR-023). Synced idempotently from source tables via source_key; operational state only, no financial truth.';
