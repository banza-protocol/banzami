-- 0060_admin_token_version.sql
-- Session revocation for operator accounts.
--
-- Each admin JWT carries the operator's token_version. The auth middleware
-- compares the JWT's token_version with the row's current value on every
-- request; a mismatch is a hard 401. Incrementing token_version therefore
-- invalidates every outstanding session for that operator immediately —
-- used on change-password, password reset/invite completion, suspend,
-- activate, delete and the explicit "terminate all sessions" action.
--
-- Additive + idempotent. Not applied yet — apply only after go-ahead.

ALTER TABLE admin_users
    ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 1;
