-- A factor replacement keeps the old factor until the new one is proven.
--
-- Replacing an authenticator used to overwrite the confirmed secret and set
-- confirmed_at back to NULL. Until the operator confirmed the new app, the
-- account behaved as if it had never enrolled: a login with the password alone
-- was handed an enrolment token, and enrolment, confirmation and acknowledgement
-- ended in a full session — for a SUPER_ADMIN too. An operator who started a
-- replacement and closed the tab left the console one password away from anyone.
--
-- The new seed now waits here. The confirmed secret keeps guarding every login,
-- and it is swapped for the pending one only when a code from the new
-- authenticator verifies. Additive: existing rows keep working unchanged.

ALTER TABLE admin_mfa
  ADD COLUMN IF NOT EXISTS pending_secret_encrypted text,
  ADD COLUMN IF NOT EXISTS pending_started_at       timestamptz;

COMMENT ON COLUMN admin_mfa.pending_secret_encrypted IS
  'Replacement seed awaiting its first code. Never gates a login; replaces secret_encrypted only when confirmed.';
