-- Application Settlement (Banzami ADR-021 / BANZA ADR-039) — increment 4.
--
-- The deferred, application-initiated settlement of accumulated NET value to a
-- beneficiary after a business event (campaign close, delivery, sale, period
-- end). DISTINCT from the per-payment Operator Fee (operator_fees, 0071): this
-- happens later, over value already net of the operator fee, and any fee it
-- carries (the APPLICATION fee) belongs to the application/platform, not the
-- operator.
--
-- On COMPLETED it writes its OWN balanced ledger postings (ADR-002, append-only)
-- and never touches the earlier payment postings or the operator fee. The
-- application fee amount is resolved by the Pricing Engine (core/pricing); this
-- table stores only the resolved minor-unit result + an immutable snapshot —
-- never a rule or a percentage. No DOA-specific column; DOA is one future caller.

CREATE TABLE IF NOT EXISTS app_settlements (
    id                         UUID         PRIMARY KEY,                 -- engine-supplied
    owner_ref                  TEXT         NOT NULL,                    -- opaque app/aggregate ref (e.g. campaign id)
    application_id             TEXT,                                     -- optional app identity

    -- ledger accounts the postings move between -------------------------
    source_account_id          UUID         NOT NULL,                    -- app/campaign available; debited gross
    beneficiary_account_id     UUID         NOT NULL,                    -- credited net
    application_fee_account_id UUID,                                     -- credited the app fee; NULL if no fee

    -- amounts (integer minor units; never float) -----------------------
    gross_amount_minor         BIGINT       NOT NULL CHECK (gross_amount_minor > 0),
    application_fee_minor      BIGINT       NOT NULL DEFAULT 0 CHECK (application_fee_minor >= 0),
    net_amount_minor           BIGINT       NOT NULL CHECK (net_amount_minor >= 0),
    currency                   TEXT         NOT NULL,

    -- pricing references + immutable snapshot (audit) ------------------
    business_category          TEXT,
    pricing_profile            TEXT,
    fee_policy_ref             TEXT,
    pricing_rule_id            UUID,                                     -- NULL when no rule matched (zero fee)
    pricing_rule_version       INTEGER,
    engine_version             INTEGER      NOT NULL,
    pricing_snapshot_json      JSONB        NOT NULL,

    status                     TEXT         NOT NULL DEFAULT 'CREATED'
                                            CHECK (status IN ('CREATED','PENDING','COMPLETED','FAILED','CANCELLED')),
    settlement_posting_id      UUID,                                     -- net posting (on COMPLETED)
    fee_posting_id             UUID,                                     -- fee posting (on COMPLETED, if fee > 0)

    environment                TEXT         NOT NULL DEFAULT 'LIVE' CHECK (environment IN ('LIVE','SANDBOX')),
    idempotency_key            TEXT         NOT NULL UNIQUE,             -- exactly-once create + posting key root
    metadata                   JSONB        NOT NULL DEFAULT '{}',
    version                    INTEGER      NOT NULL DEFAULT 1,

    created_at                 TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    completed_at               TIMESTAMPTZ,
    cancelled_at               TIMESTAMPTZ,
    failed_at                  TIMESTAMPTZ,
    failure_reason             TEXT,

    -- defense in depth: the money identity always holds -----------------
    CONSTRAINT app_settlements_balance   CHECK (gross_amount_minor = net_amount_minor + application_fee_minor),
    CONSTRAINT app_settlements_fee_bound  CHECK (application_fee_minor <= gross_amount_minor)
);

CREATE INDEX IF NOT EXISTS idx_app_settlements_owner
    ON app_settlements (owner_ref, environment, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_settlements_status
    ON app_settlements (status, environment);

COMMENT ON TABLE app_settlements IS
    'Banzami ADR-021 Application Settlement: deferred app->beneficiary settlement of accumulated NET value. Own balanced postings (append-only); application fee resolved by the Pricing Engine (never a rule/percentage here). Immutable once COMPLETED; corrections only via reversal postings.';
COMMENT ON COLUMN app_settlements.gross_amount_minor IS
    'Accumulated net-of-operator-fee value being settled. application fee is computed on THIS, net = gross - application fee.';
COMMENT ON COLUMN app_settlements.application_fee_minor IS
    'The application/platform fee (distinct from the operator fee). Integer minor units; never float; may be 0.';
