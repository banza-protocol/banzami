-- A developer workspace could be created and never ended. There was no rename,
-- no leave and no close: the only statuses were ACTIVE and SUSPENDED, and
-- SUSPENDED is an operator action against a workspace, not an owner's decision
-- about their own. A developer who made a workspace by mistake — or finished
-- with one — had no way to say so, so every abandoned workspace stayed in their
-- switcher for ever, indistinguishable from the one they work in.
--
-- ARCHIVED is the owner's end state. It is archive and not delete on purpose:
-- developer.audit_events records what happened in a workspace and is
-- append-only, and a workspace's projects may hold financial bindings whose
-- history must survive. Nothing about "close my workspace" justifies destroying
-- the record of what was done in it, so the product says "Arquivar" and means
-- it.
ALTER TABLE developer.dev_workspaces
    DROP CONSTRAINT IF EXISTS dev_workspaces_status_check;

ALTER TABLE developer.dev_workspaces
    ADD CONSTRAINT dev_workspaces_status_check
    CHECK (status IN ('ACTIVE', 'SUSPENDED', 'ARCHIVED'));
