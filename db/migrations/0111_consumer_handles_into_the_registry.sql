-- 0114: consumer handles belong in the one namespace parties are routed through.
--
-- `handle_registry` is the routing table every @banza lookup goes through:
-- parties/resolve reads it and nothing else. Migration 0051 backfilled consumer
-- handles into it, which settles what the design intends — one namespace holding
-- CONSUMER, MERCHANT, APPLICATION and reserved SYSTEM names together.
--
-- That backfill was one-time, and no ongoing write was ever added. Every consumer
-- onboarded since has had a handle in `consumers.handle` that the router cannot
-- see. In the Sandbox that was all 27 of them: @fm65 shows an ACTIVE AOA wallet
-- holding 10 000 Kz in the Consumer app, while an application settlement naming
-- @fm65 answered "beneficiary_banza_name has no active wallet in this currency"
-- — because the resolver never found the handle, let alone the wallet. No
-- consumer could be named as a settlement beneficiary.
--
-- The onboarding path now registers the handle inside the same transaction as the
-- identity. This repairs the identities created while it did not.
--
-- Deterministic and idempotent: it inserts exactly what the live path now writes,
-- claims nothing already registered to another owner, and can be re-run.
INSERT INTO handle_registry (handle, owner_type, owner_id, created_at)
SELECT lower(c.handle), 'CONSUMER', c.id, now()
  FROM consumers c
 WHERE c.handle IS NOT NULL
   AND c.handle <> ''
ON CONFLICT (handle) DO NOTHING;

-- A consumer handle outside the registry is invisible to every @banza lookup, and
-- lets another party type claim a name someone already answers to. Uniqueness is
-- enforced by handle_registry's primary key, so it can only do that job for the
-- identities actually in it.
-- The invariant is OWNERSHIP, not mere presence.
--
-- A first version asked only whether the handle appeared in the registry. A
-- consumer whose handle is registered to a DIFFERENT party passes that test
-- while being exactly the dangerous case: the name resolves, to someone else.
-- ON CONFLICT DO NOTHING above leaves precisely that state behind, so the check
-- has to ask who owns the row.
DO $$
DECLARE broken bigint;
BEGIN
    SELECT count(*) INTO broken
      FROM consumers c
      LEFT JOIN handle_registry h ON h.handle = lower(c.handle)
     WHERE c.handle IS NOT NULL AND c.handle <> ''
       AND (h.handle IS NULL OR h.owner_type <> 'CONSUMER' OR h.owner_id IS DISTINCT FROM c.id);
    IF broken > 0 THEN
        RAISE EXCEPTION
            '% consumer handle(s) are absent from handle_registry or registered to another owner — they are unreachable as a payment party, or resolve to somebody else', broken;
    END IF;
END $$;
