-- A Business application can describe a Business that already exists.
--
-- Every approval used to mean "provision a new Business Account": a merchant, a
-- wallet, the handle, a login. A Business that was provisioned some other way
-- first — an operator setup, a Developer Project's financial owner, a
-- pre-launch consolidation — had no way into the application lifecycle at all:
-- its handle was taken, so the public form refused it, and an approval would
-- have created a second owner beside the first.
--
-- Two facts make the difference explicit:
--
--   claims_existing_business  the applicant says the requested @handle is
--                             theirs already. No handle hold is taken (the handle
--                             stays with its owner); the application can only be
--                             resolved by an operator LINKING it to that owner.
--   resolution                how an APPROVED application was resolved:
--                             PROVISIONED_NEW (a new Business Account was
--                             provisioned) or LINKED_EXISTING (the application's
--                             institutional and KYB truth was attached to an
--                             existing Business Account; nothing was created, no
--                             handle moved, no Project was rebound).
--
-- Existing APPROVED rows were all provisioned new; they are recorded as such.

-- submit_idempotency_key: the public form sends one key per form session, so a
-- double click or a network retry returns the SAME application instead of a
-- second one (or a confusing "handle pending"). Stored as a SHA-256 hash: the
-- application id is what grants access to its documents, and a replay must only
-- ever return it to the client that already holds the key.
ALTER TABLE merchant_applications
    ADD COLUMN submit_idempotency_key TEXT UNIQUE,
    ADD COLUMN claims_existing_business BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN resolution TEXT
        CHECK (resolution IS NULL OR resolution IN ('PROVISIONED_NEW', 'LINKED_EXISTING'));

UPDATE merchant_applications SET resolution = 'PROVISIONED_NEW'
 WHERE status = 'APPROVED' AND created_merchant_id IS NOT NULL AND resolution IS NULL;

-- An approved application names how it was resolved.
ALTER TABLE merchant_applications
    ADD CONSTRAINT merchant_applications_approved_has_resolution
    CHECK (status <> 'APPROVED' OR resolution IS NOT NULL);
