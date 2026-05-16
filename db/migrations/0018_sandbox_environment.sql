-- Sandbox / live environment isolation
--
-- Every financial record is tagged with the environment in which it was created.
-- LIVE records represent real money; SANDBOX records are fully simulated.
-- The two sets MUST NEVER mix: a SANDBOX API key cannot read or write LIVE data
-- and vice-versa. Enforcement happens at the API-gateway middleware layer via
-- the environment claim embedded in every JWT.
--
-- All existing rows default to LIVE for zero-downtime backward compatibility.

-- API keys: the key prefix (bz_live_ / bz_test_) encodes the environment, but
-- we also store it explicitly so queries can filter without string parsing.
ALTER TABLE api_keys
    ADD COLUMN environment TEXT NOT NULL DEFAULT 'LIVE'
        CHECK (environment IN ('LIVE', 'SANDBOX'));

-- Partial index: dashboard key listing filtered by environment.
CREATE INDEX api_keys_environment_idx ON api_keys (merchant_id, environment);

-- Transactions: prevent sandbox transactions from appearing in live reports.
ALTER TABLE transactions
    ADD COLUMN environment TEXT NOT NULL DEFAULT 'LIVE'
        CHECK (environment IN ('LIVE', 'SANDBOX'));

CREATE INDEX transactions_environment_idx ON transactions (merchant_id, environment);

-- Webhook endpoints: sandbox webhooks must only fire for sandbox events.
ALTER TABLE webhook_endpoints
    ADD COLUMN environment TEXT NOT NULL DEFAULT 'LIVE'
        CHECK (environment IN ('LIVE', 'SANDBOX'));

-- QR codes: a sandbox QR must never trigger a live payment.
ALTER TABLE qr_codes
    ADD COLUMN environment TEXT NOT NULL DEFAULT 'LIVE'
        CHECK (environment IN ('LIVE', 'SANDBOX'));

-- Payment links: sandbox links are for integration testing only.
ALTER TABLE payment_links
    ADD COLUMN environment TEXT NOT NULL DEFAULT 'LIVE'
        CHECK (environment IN ('LIVE', 'SANDBOX'));

-- Payouts: sandbox payouts must never reach real banking rails.
ALTER TABLE payouts
    ADD COLUMN environment TEXT NOT NULL DEFAULT 'LIVE'
        CHECK (environment IN ('LIVE', 'SANDBOX'));

-- Transfers: P2P transfers are scoped to the originating environment.
ALTER TABLE transfers
    ADD COLUMN environment TEXT NOT NULL DEFAULT 'LIVE'
        CHECK (environment IN ('LIVE', 'SANDBOX'));
