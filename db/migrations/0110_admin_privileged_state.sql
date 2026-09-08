-- Make ACTIVE mean what it claims for a privileged operator.
--
-- Until now `status` answered "has this person set a password?", and whether a
-- second factor existed was a separate fact in admin_mfa. So the first operator
-- sat at ACTIVE with a password and no factor, and the only thing standing
-- between that and a privileged session was a check inside the login handler.
--
-- That check is correct and it is not the same as the state saying so. A status
-- whose meaning depends on a row in another table is a status a reader will get
-- wrong: an export, a support query, a dashboard counting "active admins", or
-- the next person to write an authorisation branch.
--
-- The lifecycle is now explicit, and each state names what is missing:
--
--   INVITED                    -- identity exists, no credential
--   MFA_ENROLMENT_REQUIRED     -- password set, no confirmed factor
--   MFA_RECOVERY_ACK_REQUIRED  -- factor confirmed, recovery codes not acknowledged
--   ACTIVE                     -- password + factor + codes + acknowledgement
--   SUSPENDED                  -- disabled
--
-- The spelling ENROLMENT matches the value the login endpoint already returns in
-- its `next` field, so the wire contract and the column agree.

ALTER TABLE admin_users DROP CONSTRAINT IF EXISTS admin_users_status_check;
ALTER TABLE admin_users ADD CONSTRAINT admin_users_status_check
  CHECK (status IN ('INVITED', 'MFA_ENROLMENT_REQUIRED', 'MFA_RECOVERY_ACK_REQUIRED', 'ACTIVE', 'SUSPENDED'));

-- Backfill. Any operator currently ACTIVE without a CONFIRMED factor was never
-- fully enrolled; it only looked that way. Moving them to
-- MFA_ENROLMENT_REQUIRED changes no permission — login already refused them a
-- session — it makes the row say what was already true.
--
-- Deliberately every role, not only SUPER_ADMIN: an OPERATIONS account with no
-- factor is in the same half-finished state, and a status that means one thing
-- for one role and another for the next is the defect being fixed.
UPDATE admin_users u
   SET status = 'MFA_ENROLMENT_REQUIRED'
 WHERE u.status = 'ACTIVE'
   AND NOT EXISTS (
     SELECT 1 FROM admin_mfa m
      WHERE m.admin_user_id = u.id
        AND m.confirmed_at IS NOT NULL
   );

-- An operator with a confirmed factor but no acknowledged recovery codes is
-- likewise mid-lifecycle. There is no acknowledgement column: acknowledgement is
-- what turns the state to ACTIVE, so anyone holding a confirmed factor today has
-- necessarily been through it under the old flow.
COMMENT ON COLUMN admin_users.status IS
  'INVITED | MFA_ENROLMENT_REQUIRED | MFA_RECOVERY_ACK_REQUIRED | ACTIVE | SUSPENDED. '
  'ACTIVE means password AND confirmed second factor AND acknowledged recovery codes — '
  'never merely "has a password".';
