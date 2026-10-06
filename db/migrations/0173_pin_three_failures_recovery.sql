-- Simplify the Consumer PIN brute-force policy: three trusted failures require
-- PIN recovery. No temporary lock, no 3+3 escalation.
--
-- Previous policy (0132 + 0170): 3 wrong PINs → a 1-minute credential lock, then
-- a further 3 within a window → PIN_RECOVERY_REQUIRED. New policy: on a TRUSTED
-- device, the 1st/2nd/3rd wrong PIN takes failed_attempts to 1/2/3; the 3rd sets
-- PIN_RECOVERY_REQUIRED immediately (persistent, recovery-only). There is no
-- temporary lock and no second sequence.
--
-- This removes the two columns that only ever served the lock/3+3 machinery on
-- the Consumer credential:
--   * locked_until (0132) — the 1-minute temporary lock.
--   * lock_count   (0170) — how many locks had been applied in the window.
-- Kept: failed_attempts (the 0/1/2/3 counter), last_failed_at (bounds the
-- counter-reset window), pin_recovery_required_at (the persistent recovery state).
--
-- Consumer lifecycle is untouched: this is credential state only; consumers.status
-- stays ACTIVE. The untrusted-source anti-DoS throttle (consumer_login_source_throttle)
-- is unchanged. The Business credential (merchant_app_credentials) keeps its own
-- separate locked_until model and is NOT affected by this migration.
--
-- Applies cleanly on a fresh DB (the columns exist by 0170). No data backfill
-- needed; the Sandbox is reset.

ALTER TABLE public_api_credentials DROP COLUMN IF EXISTS locked_until;
ALTER TABLE public_api_credentials DROP COLUMN IF EXISTS lock_count;
