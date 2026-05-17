-- Seed: grant the CONSUMER verification badge to the fm65 account.
-- fm65 is the platform founder account and is verified by default.
-- No-op if the handle does not yet exist (safe to run before first login).

UPDATE consumers
SET    verification_badge = 'CONSUMER',
       updated_at         = now()
WHERE  handle = 'fm65';
