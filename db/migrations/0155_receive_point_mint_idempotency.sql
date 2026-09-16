-- 0155 — Idempotency ledger for receive-point session mints (ADR-065).
--
-- A payer minting a session from a receive point sends an idempotency key, scoped
-- to the PAYER (two unrelated payers choosing "abc" never collide) and bound to
-- the semantic request via a fingerprint (slug+amount+currency): a reused key with
-- a different amount is a deterministic conflict, never a silent wrong-amount
-- replay.
--
-- Crash consistency does NOT depend on waiting. It rests on two persisted facts:
--   * core_reference — a random, opaque, ≥128-bit token generated ONCE at
--     reservation and reused by every retry. Core creates one Payment Session per
--     (merchant, purpose, reference) (DB-enforced partial unique index, 0085), so
--     a retry that re-runs create with the SAME core_reference converges on the
--     same session — recovering whether the crash was before OR after the session
--     was created. The reference derives from NO user/client material.
--   * an atomic lease (owner_token + lease_until): exactly one worker owns a
--     PENDING reservation at a time; a stale lease is reclaimed by a single winner
--     (UPDATE ... WHERE state=PENDING AND lease_until < now() RETURNING), and only
--     the current owner may record success (CAS on owner_token), so a slow
--     original worker returning after a reclaim cannot corrupt state.
--
-- Not financial state; zero ledger effect. Additive/reversible: DROP TABLE.

CREATE TABLE IF NOT EXISTS business_receive_point_mints (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    payer_id            TEXT        NOT NULL,
    idempotency_key     TEXT        NOT NULL,
    receive_point_slug  TEXT        NOT NULL,
    request_fingerprint TEXT        NOT NULL,
    -- Random opaque reference passed to core; stable for all retries of this op.
    core_reference      TEXT        NOT NULL,
    state               TEXT        NOT NULL DEFAULT 'PENDING'
                                      CHECK (state IN ('PENDING','SUCCEEDED','FAILED')),
    -- Atomic lease ownership.
    owner_token         UUID        NOT NULL,
    lease_until         TIMESTAMPTZ NOT NULL,
    session_id          TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One idempotent operation per (payer, key): cross-payer keys never collide.
CREATE UNIQUE INDEX IF NOT EXISTS uq_business_receive_point_mints_scope
    ON business_receive_point_mints (payer_id, idempotency_key);

-- The random reference is globally unique (defence in depth).
CREATE UNIQUE INDEX IF NOT EXISTS uq_business_receive_point_mints_core_reference
    ON business_receive_point_mints (core_reference);
