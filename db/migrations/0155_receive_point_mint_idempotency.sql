-- 0155 — Idempotency ledger for receive-point session mints (ADR-065).
--
-- A payer minting a session from a receive point sends an idempotency key. The
-- key is scoped to the PAYER (two unrelated payers choosing "abc" never collide),
-- and bound to the semantic request via a fingerprint (slug+amount+currency) so a
-- reused key with a different amount is a deterministic conflict, never a silent
-- wrong-amount replay.
--
-- Crash consistency is delegated to the EXISTING canonical boundary: core creates
-- one Payment Session per (merchant, purpose, reference) (core/api payment_sessions).
-- The mint passes a deterministic reference derived from (payer, key), so a retry
-- after a crash — before OR after the downstream session was created — re-runs the
-- create and core returns the SAME session. No duplicate, no unbounded wait.
--
-- This table is not financial state and has no ledger effect; it maps a scoped
-- idempotency key to its request fingerprint and the session that was minted.
--
-- Additive and reversible: DROP TABLE business_receive_point_mints.

CREATE TABLE IF NOT EXISTS business_receive_point_mints (
    id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    -- The authenticated payer the key belongs to (scope) — never global.
    payer_id           TEXT        NOT NULL,
    idempotency_key    TEXT        NOT NULL,
    receive_point_slug TEXT        NOT NULL,
    -- Hash of the semantic request (slug|amount|currency): a reused key with a
    -- different request is rejected rather than replayed.
    request_fingerprint TEXT       NOT NULL,
    state              TEXT        NOT NULL DEFAULT 'PENDING'
                                     CHECK (state IN ('PENDING','SUCCEEDED','FAILED')),
    -- Set when SUCCEEDED; the session core returned for this mint.
    session_id         TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One idempotent operation per (payer, key): cross-payer keys never collide.
CREATE UNIQUE INDEX IF NOT EXISTS uq_business_receive_point_mints_scope
    ON business_receive_point_mints (payer_id, idempotency_key);
