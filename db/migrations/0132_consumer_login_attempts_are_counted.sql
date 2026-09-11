-- A consumer's PIN login is limited per account, not only per IP.
--
-- public_api_credentials had no failure counter: the only brake on guessing a
-- consumer's six-digit PIN was 10 attempts a minute per IP, per public-api
-- instance — and the token it yields moves money (POST /v1/transfers asks for no
-- PIN). A per-IP limit is spent by rotating addresses; an account's own limit is
-- not (A9-01). Each attempt is now claimed on the account before the PIN is
-- compared: five, then a lock of fifteen minutes, reset by a correct PIN.
-- Additive: every existing credential starts with no failures and no lock.

ALTER TABLE public_api_credentials
  ADD COLUMN IF NOT EXISTS failed_attempts integer     NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  ADD COLUMN IF NOT EXISTS locked_until    timestamptz;
