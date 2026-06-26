-- 0057_admin_operator_management.sql
-- Operator management for BANZADMIN: a SUPER_ADMIN can create operators without
-- a password (they set it via a reset link). Makes password_hash nullable and
-- adds provenance + password_set_at.
--
-- Additive + idempotent. Not applied yet.

ALTER TABLE admin_users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS password_set_at TIMESTAMPTZ;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS created_by      TEXT;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS updated_by      TEXT;

-- Backfill: existing operators already have a password.
UPDATE admin_users SET password_set_at = COALESCE(password_set_at, created_at)
 WHERE password_hash IS NOT NULL AND password_set_at IS NULL;
