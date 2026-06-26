-- 0059_admin_operator_invite.sql
-- Finalise the operator invitation flow: an operator starts INVITED (no
-- password) and becomes ACTIVE only after setting their own password via an
-- INVITE link. Adds the INVITED status + invited_at/activated_at.
--
-- Reuses the existing admin_password_reset_tokens table (purpose INVITE |
-- PASSWORD_RESET) — no new token table. Additive + idempotent. Not applied yet.

ALTER TABLE admin_users DROP CONSTRAINT IF EXISTS admin_users_status_check;
ALTER TABLE admin_users ADD CONSTRAINT admin_users_status_check
  CHECK (status IN ('INVITED', 'ACTIVE', 'SUSPENDED'));

ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS invited_at   TIMESTAMPTZ;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ;

-- Existing operators already have a password → treat them as activated.
UPDATE admin_users
   SET activated_at = COALESCE(activated_at, password_set_at, created_at)
 WHERE password_hash IS NOT NULL AND activated_at IS NULL;
