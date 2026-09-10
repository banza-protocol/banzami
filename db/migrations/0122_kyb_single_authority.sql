-- 0122_kyb_single_authority.sql
-- One KYB authority: merchant_compliance.kyb_status.
--
-- A Business's verification was answered in two places that never met:
--   merchant_compliance.kyb_status  — what every gate reads: payouts, settlement
--                                     readiness, the fee-destination check, the
--                                     Business App's KYB status, BANZADMIN;
--   merchants.verified              — "an admin-assigned blue badge", written by
--                                     a route no screen calls, read by Business
--                                     App sign-in and handle lookup.
-- They disagreed. @doa's canonical Business has kyb_status APPROVED and
-- verified = false, so the badge said one thing and readiness another.
--
-- merchants.verified stays — sign-in and lookup read it — but it is no longer a
-- decision. It is a projection of the KYB decision, kept by the database:
--   * backfilled from merchant_compliance now;
--   * rewritten whenever a KYB status is written;
--   * recomputed from merchant_compliance on any write to merchants.verified,
--     so no writer can make the two disagree again.

UPDATE merchants m
   SET verified = EXISTS (SELECT 1 FROM merchant_compliance c
                           WHERE c.merchant_id = m.id AND c.kyb_status = 'APPROVED')
 WHERE m.verified IS DISTINCT FROM EXISTS (SELECT 1 FROM merchant_compliance c
                                            WHERE c.merchant_id = m.id AND c.kyb_status = 'APPROVED');

-- A KYB decision rewrites the projection.
CREATE OR REPLACE FUNCTION merchant_verified_follows_kyb() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    UPDATE merchants SET verified = (NEW.kyb_status = 'APPROVED')
     WHERE id = NEW.merchant_id AND verified IS DISTINCT FROM (NEW.kyb_status = 'APPROVED');
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS merchant_compliance_projects_verified ON merchant_compliance;
CREATE TRIGGER merchant_compliance_projects_verified
    AFTER INSERT OR UPDATE OF kyb_status ON merchant_compliance
    FOR EACH ROW EXECUTE FUNCTION merchant_verified_follows_kyb();

-- A write to the projection is answered by the authority, not by the writer.
CREATE OR REPLACE FUNCTION merchant_verified_is_a_projection() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    NEW.verified := EXISTS (SELECT 1 FROM merchant_compliance c
                             WHERE c.merchant_id = NEW.id AND c.kyb_status = 'APPROVED');
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS merchants_verified_projection ON merchants;
CREATE TRIGGER merchants_verified_projection
    BEFORE INSERT OR UPDATE OF verified ON merchants
    FOR EACH ROW EXECUTE FUNCTION merchant_verified_is_a_projection();
