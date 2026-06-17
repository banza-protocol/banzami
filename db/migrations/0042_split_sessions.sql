-- P2P-002 — Split payments (divisão de conta)
--
-- A split session represents a group total to be collected from multiple
-- payers. Each payer settles a portion via a normal wallet transfer to the
-- owner (reusing the audited transfer engine); the contribution is recorded
-- and the session's running paid total is updated under a row lock so the
-- collected amount can never exceed the total (no over-collection).

CREATE TABLE split_sessions (
    id            UUID        PRIMARY KEY,
    -- Recipient of the collected funds: a consumer_id (CONSUMER) or a merchant
    -- wallet UUID (MERCHANT) — same addressing the transfer engine accepts.
    owner_id      UUID        NOT NULL,
    owner_type    TEXT        NOT NULL CHECK (owner_type IN ('CONSUMER', 'MERCHANT')),
    currency      TEXT        NOT NULL,
    total_minor   BIGINT      NOT NULL CHECK (total_minor > 0),
    paid_minor    BIGINT      NOT NULL DEFAULT 0 CHECK (paid_minor >= 0 AND paid_minor <= total_minor),
    status        TEXT        NOT NULL DEFAULT 'OPEN'
                              CHECK (status IN ('OPEN', 'COMPLETE', 'CANCELLED')),
    reference     TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at  TIMESTAMPTZ
);

CREATE TABLE split_contributions (
    id            UUID        PRIMARY KEY,
    session_id    UUID        NOT NULL REFERENCES split_sessions(id),
    payer_id      UUID        NOT NULL,
    amount_minor  BIGINT      NOT NULL CHECK (amount_minor > 0),
    -- The settled wallet transfer that backs this contribution.
    transfer_id   UUID,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX split_contributions_session_idx ON split_contributions (session_id, created_at);
CREATE INDEX split_sessions_owner_idx        ON split_sessions (owner_id, status);

COMMENT ON TABLE  split_sessions       IS 'P2P-002: group total collected from multiple payers (split payments).';
COMMENT ON COLUMN split_sessions.paid_minor IS 'Running total of settled contributions; CHECK enforces it never exceeds total_minor.';
COMMENT ON TABLE  split_contributions IS 'Individual payer contributions to a split session, each backed by a wallet transfer.';
