-- Transaction Proofs — public receipt verification (BANZA ADR-040, Banzami impl).
--
-- The receipt is not the proof. The proof is this immutable, publicly verifiable
-- record. A receipt's QR points to banzami.com/r/<proof_reference>, which resolves
-- to a public verification page/API backed by this table. The proof_reference is a
-- RANDOM, non-enumerable public reference (not derivable from the transaction id).
-- One proof per transaction (idempotent). Reversals move status to REVERSED — a
-- proof is never deleted or destructively rewritten.

CREATE TABLE IF NOT EXISTS transaction_proofs (
    id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    proof_reference    TEXT        NOT NULL UNIQUE,          -- e.g. BZM-XXXX-XXXX (random)
    transaction_id     TEXT        NOT NULL,                 -- operator transaction reference
    transfer_id        TEXT,
    payment_intent_id  TEXT,
    environment        TEXT        NOT NULL DEFAULT 'LIVE',  -- LIVE | SANDBOX

    payer_subject_type TEXT,
    payer_subject_id   TEXT,
    payer_display_name TEXT,
    payer_handle       TEXT,
    payee_subject_type TEXT,
    payee_subject_id   TEXT,
    payee_display_name TEXT,
    payee_handle       TEXT,

    amount_minor       BIGINT      NOT NULL,
    currency           TEXT        NOT NULL,
    status             TEXT        NOT NULL DEFAULT 'CONFIRMED',
    description        TEXT,
    method             TEXT,
    ledger_reference   TEXT,

    proof_hash             TEXT,
    signature_key_id       TEXT,
    signature_algorithm    TEXT,
    signature_value        TEXT,

    verification_count INTEGER     NOT NULL DEFAULT 0,
    issued_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    confirmed_at       TIMESTAMPTZ,
    reversed_at        TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT transaction_proofs_status_check
        CHECK (status IN ('PENDING','CONFIRMED','FAILED','REVERSED','CANCELLED','EXPIRED'))
);

-- One proof per transaction (idempotent generation).
CREATE UNIQUE INDEX IF NOT EXISTS transaction_proofs_txn_idx
    ON transaction_proofs (transaction_id, environment);

-- Public verification events. Never stores a raw IP — only salted hashes.
CREATE TABLE IF NOT EXISTS transaction_proof_verifications (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    proof_id        UUID        NOT NULL REFERENCES transaction_proofs(id) ON DELETE CASCADE,
    verified_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    ip_hash         TEXT,
    user_agent_hash TEXT,
    country         TEXT,
    result          TEXT        NOT NULL DEFAULT 'VERIFIED',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS transaction_proof_verifications_proof_idx
    ON transaction_proof_verifications (proof_id, verified_at DESC);

COMMENT ON TABLE transaction_proofs IS
    'Public transaction proofs (BANZA ADR-040). Immutable; reversals → REVERSED, never deleted. proof_reference is random/non-enumerable; receipt QR points to the public verification page.';
