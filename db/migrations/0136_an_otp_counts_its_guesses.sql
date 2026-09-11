-- A consumer onboarding OTP counted no guesses: core compared every submitted
-- code, for as long as the session lived, and only the per-IP limits in front
-- of it stood between a caller and the code. Each verification now claims an
-- attempt atomically before the comparison; the fifth spends the code.
ALTER TABLE consumer_onboarding
    ADD COLUMN otp_attempts INT NOT NULL DEFAULT 0 CHECK (otp_attempts >= 0);
