-- KYC passport now also requires the LAST page (Banzami ADR-020). Adds the
-- LAST_PAGE evidence side. Additive + idempotent; sandbox first. Non-destructive.

ALTER TABLE kyc_evidence DROP CONSTRAINT IF EXISTS kyc_evidence_side_check;
ALTER TABLE kyc_evidence ADD CONSTRAINT kyc_evidence_side_check
    CHECK (side IN ('FRONT','BACK','MAIN_PAGE','LAST_PAGE','SELFIE'));
