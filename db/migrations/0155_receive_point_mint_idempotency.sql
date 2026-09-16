-- 0155 — Idempotency ledger for receive-point session mints (ADR-065).
--
-- A payer minting a session from a receive point sends an idempotency key. Two
-- deliveries of the SAME intentional payment (a retry, a double tap) must yield
-- ONE Payment Session, while two DIFFERENT intentional payments (different keys)
-- each get a fresh session. The mint reserves the key here BEFORE creating any
-- session, so a race cannot create two sessions for one key.
--
-- This table is not financial state and has no ledger effect; it only maps an
-- idempotency key to the session that was minted for it.
--
-- Additive and reversible: DROP TABLE business_receive_point_mints.

CREATE TABLE IF NOT EXISTS business_receive_point_mints (
    id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key    TEXT        NOT NULL,
    receive_point_slug TEXT        NOT NULL,
    -- Filled by the winner after the session is created; NULL during the brief
    -- reserve→create window (a concurrent loser waits for it).
    session_id         TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_business_receive_point_mints_key
    ON business_receive_point_mints (idempotency_key);
