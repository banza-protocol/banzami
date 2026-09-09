-- 0112: a pre-launch handle consolidation, with every precondition enforced.
--
-- Two Sandbox merchants exist for the same real-world application. The
-- historical one holds @doa and was bound to an early Developer Project; the
-- canonical one is the SEALED binding of Project Doa-Sandbox and holds a
-- generated handle. The application's configured platform-fee destination is
-- @doa, and an application fee must land in the caller's OWN account, so the
-- integration could never settle.
--
-- Rebinding the sealed Project was rejected: a sealed binding is immutable
-- (ADR-055) and must not move to recover a preferred name. The handle moves
-- instead, once the historical owner holds no authority at all.
--
-- This is a one-time, pre-launch data correction. It contains no rule that
-- runtime code consults: nothing in the platform branches on "doa", on a project
-- name, or on a merchant id. What it does contain is every invariant that makes
-- the move safe, each fail-closed.
--
-- Idempotent: re-running after a successful move is a no-op, because the
-- preconditions are expressed against the state the move produces.

DO $$
DECLARE
    v_handle        CONSTANT text := 'doa';
    v_from_owner    uuid;
    v_to_owner      uuid;
    v_owner_type    text;
    v_balance       bigint;
    v_entries       bigint;
    v_active_bind   bigint;
    v_active_keys   bigint;
    v_active_hooks  bigint;
    v_obligations   bigint;
BEGIN
    SELECT owner_id, owner_type INTO v_from_owner, v_owner_type
      FROM handle_registry WHERE handle = v_handle;

    -- The canonical target: the owner of the SEALED binding whose project already
    -- carries this application. Resolved from the binding, never hardcoded, so
    -- the migration cannot be pointed at the wrong account by editing a literal.
    SELECT b.merchant_id INTO v_to_owner
      FROM developer.dev_project_sandbox_binding b
      JOIN developer.dev_projects p ON p.id = b.project_id
     WHERE b.state = 'ACTIVE'
       AND b.artifact_created = true
       AND lower(p.name) = 'doa-sandbox';

    IF v_to_owner IS NULL THEN
        RAISE NOTICE '0112: no sealed Doa-Sandbox binding on this database — nothing to consolidate';
        RETURN;
    END IF;

    -- Already done. The move is its own idempotency check.
    IF v_from_owner = v_to_owner THEN
        RAISE NOTICE '0112: @% already belongs to the canonical owner', v_handle;
        RETURN;
    END IF;

    IF v_from_owner IS NULL THEN
        RAISE NOTICE '0112: @% is unregistered on this database — nothing to move', v_handle;
        RETURN;
    END IF;

    -- FAIL-CLOSED PRECONDITIONS.
    --
    -- A handle is how money finds a party. Moving one out from under an owner
    -- that still holds authority, or still holds value, would be a hijack
    -- whatever the intent — so each condition below refuses rather than warns.

    IF v_owner_type <> 'MERCHANT' THEN
        RAISE EXCEPTION '0112: @% is owned by a % — this consolidation is defined only between merchants', v_handle, v_owner_type;
    END IF;

    SELECT COALESCE(SUM(CASE e.entry_type WHEN 'CREDIT' THEN e.amount_minor ELSE -e.amount_minor END), 0),
           count(e.id)
      INTO v_balance, v_entries
      FROM ledger_entries e
     WHERE e.account_id IN (
        SELECT available_account_id FROM wallets WHERE merchant_id = v_from_owner
        UNION SELECT reserved_account_id FROM wallets WHERE merchant_id = v_from_owner
        UNION SELECT wa.account_id FROM wallet_accounts wa
                JOIN wallets w ON w.id = wa.wallet_id WHERE w.merchant_id = v_from_owner);

    IF v_balance <> 0 OR v_entries <> 0 THEN
        RAISE EXCEPTION '0112: the current owner of @% has financial history (balance %, % entries) — a handle with money behind it is not pre-launch scaffolding', v_handle, v_balance, v_entries;
    END IF;

    SELECT count(*) INTO v_obligations FROM (
        SELECT 1 FROM transactions   WHERE merchant_id = v_from_owner
        UNION ALL SELECT 1 FROM settlements   WHERE merchant_id = v_from_owner
        UNION ALL SELECT 1 FROM payouts       WHERE merchant_id = v_from_owner
        UNION ALL SELECT 1 FROM refunds       WHERE merchant_id = v_from_owner
        UNION ALL SELECT 1 FROM payment_links WHERE merchant_id = v_from_owner
    ) o;
    IF v_obligations <> 0 THEN
        RAISE EXCEPTION '0112: the current owner of @% has % outstanding financial object(s)', v_handle, v_obligations;
    END IF;

    SELECT count(*) INTO v_active_bind
      FROM developer.dev_project_sandbox_binding
     WHERE merchant_id = v_from_owner AND state = 'ACTIVE';
    IF v_active_bind <> 0 THEN
        RAISE EXCEPTION '0112: the current owner of @% still holds % ACTIVE Project binding(s) — retire the project first', v_handle, v_active_bind;
    END IF;

    SELECT count(*) INTO v_active_keys
      FROM api_keys WHERE merchant_id = v_from_owner AND revoked_at IS NULL;
    IF v_active_keys <> 0 THEN
        RAISE EXCEPTION '0112: the current owner of @% still holds % unrevoked API credential(s)', v_handle, v_active_keys;
    END IF;

    SELECT count(*) INTO v_active_hooks
      FROM webhook_endpoints WHERE merchant_id = v_from_owner AND active;
    IF v_active_hooks <> 0 THEN
        RAISE EXCEPTION '0112: the current owner of @% still has % active webhook endpoint(s)', v_handle, v_active_hooks;
    END IF;

    -- THE MOVE. One statement, so there is no interval in which two owners hold
    -- the name and none in which nobody does.
    UPDATE handle_registry SET owner_id = v_to_owner WHERE handle = v_handle;

    -- The generated handle the canonical owner carried is retired, not left
    -- beside the real one: two active names for one financial identity is an
    -- alias, and aliases are not a product here. It is reserved rather than
    -- deleted so it can never be re-issued to somebody else and quietly inherit
    -- this owner's history.
    UPDATE handle_registry
       SET owner_type = 'SYSTEM', owner_id = NULL,
           reserved_reason = 'retired: generated handle superseded by @' || v_handle
     WHERE owner_id = v_to_owner AND handle <> v_handle;

    -- merchant_profiles is the optional public-profile layer, not the routing
    -- namespace — but a stale copy pointing at the old owner would contradict the
    -- resolver, and one of them would be wrong wherever it was read.
    UPDATE merchant_profiles SET handle = NULL
     WHERE merchant_id = v_from_owner AND handle = v_handle;

    RAISE NOTICE '0112: @% consolidated from % to %', v_handle, v_from_owner, v_to_owner;
END $$;
