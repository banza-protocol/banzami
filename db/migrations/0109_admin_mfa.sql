-- BANZADMIN multi-factor authentication.
--
-- A privileged operator must not reach a full session with a password alone.
-- Everything BANZADMIN can do — approve KYB, price a customer, suspend a
-- business — is done on behalf of the operator, and a password is a single
-- reusable secret that leaves copies wherever it is typed.
--
-- Two tables rather than columns on admin_users: an operator's factors have
-- their own lifecycle (enrolled, confirmed, reset) and their own audit, and a
-- recovery code is a row that gets consumed, not a field that gets edited.

CREATE TABLE IF NOT EXISTS admin_mfa (
  admin_user_id  uuid PRIMARY KEY REFERENCES admin_users(id) ON DELETE CASCADE,

  -- The TOTP shared secret, encrypted at rest with the same construction the
  -- gateway uses for webhook secrets. Never returned by any read path: it is
  -- shown once, at enrolment, from the value held in memory.
  secret_encrypted text NOT NULL,

  -- Enrolment is not complete until the operator proves they hold the secret.
  -- Until confirmed_at is set the factor does not gate anything, so a half-
  -- finished enrolment can never lock somebody out of their own account.
  confirmed_at   timestamptz,

  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  -- The last accepted TOTP step. A code is valid for a window, and without
  -- this the same code works twice inside it — which is the whole of a replay
  -- against a one-time password.
  last_step      bigint
);

CREATE TABLE IF NOT EXISTS admin_mfa_recovery_codes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id  uuid NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,

  -- Hashed, like a password. A recovery code is a credential that bypasses the
  -- second factor; a database read must not yield one.
  code_hash      text NOT NULL,

  used_at        timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_mfa_recovery_codes_user
  ON admin_mfa_recovery_codes (admin_user_id) WHERE used_at IS NULL;
