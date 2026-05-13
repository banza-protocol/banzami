-- Migration 0008: Compliance schema
-- KYB/KYC/AML records for merchants and customers.
-- merchant_compliance uses merchant_id as PK (one record per merchant).
-- customer_compliance uses customer_id as PK (one record per customer).

CREATE TABLE merchant_compliance (
    merchant_id UUID        PRIMARY KEY,
    kyb_status  TEXT        NOT NULL DEFAULT 'PENDING' CHECK (kyb_status IN (
                    'PENDING', 'APPROVED', 'REJECTED', 'UNDER_REVIEW', 'SUSPENDED'
                )),
    aml_status  TEXT        NOT NULL DEFAULT 'PENDING' CHECK (aml_status IN (
                    'PENDING', 'APPROVED', 'REJECTED', 'UNDER_REVIEW', 'SUSPENDED'
                )),
    reviewed_at TIMESTAMPTZ,
    notes       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE customer_compliance (
    customer_id UUID        PRIMARY KEY,
    kyc_level   TEXT        NOT NULL DEFAULT 'NONE' CHECK (kyc_level IN (
                    'NONE', 'BASIC', 'ENHANCED', 'FULL'
                )),
    status      TEXT        NOT NULL DEFAULT 'PENDING' CHECK (status IN (
                    'PENDING', 'APPROVED', 'REJECTED', 'UNDER_REVIEW', 'SUSPENDED'
                )),
    reviewed_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Used by compliance dashboard to find all merchants under AML review.
CREATE INDEX merchant_compliance_kyb_status_idx ON merchant_compliance (kyb_status)
    WHERE kyb_status != 'APPROVED';
CREATE INDEX merchant_compliance_aml_status_idx ON merchant_compliance (aml_status)
    WHERE aml_status != 'APPROVED';

-- Used by transaction validation to quickly gate blocked customers.
CREATE INDEX customer_compliance_level_idx ON customer_compliance (kyc_level)
    WHERE kyc_level = 'NONE';
