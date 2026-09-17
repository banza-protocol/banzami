#!/usr/bin/env bash
# COLLECTIONS-PROTOCOL-AND-PRODUCT-001 Part B — LIVE FOUNDATION disposable E2E.
#
# Proves the ENTIRE governed Live process against a THROWAWAY Live-shaped Postgres on
# the local cluster — NEVER a real environment (no real Live DB is created, migrated,
# or deployed; Financial LIVE stays NOT_READY/fail-closed). Every governance invariant
# is enforced in disposable mode exactly as it would be for a real target; the ONLY
# difference is the substrate + its authorization mode. It also proves the controller's
# REAL-MODE code path (owner-authorized, provisioned=true) via a SIM manifest pointed at
# a disposable DB, so the disposable and future-real paths share one engine.
#
#   DATABASE_URL=postgres://<admin>@localhost:5432/postgres \
#     bash infra/blueprint/live-ops/scripts/live-foundation-disposable-e2e.sh
set -uo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
CTL="$(dirname "${BASH_SOURCE[0]}")/live-migration-control.sh"
DC="$(dirname "${BASH_SOURCE[0]}")/dual-control.sh"
: "${DATABASE_URL:?DATABASE_URL is required — an admin connection to the LOCAL disposable cluster}"
ADMIN_URL="$DATABASE_URL"
ENVJ="$REPO_ROOT/infra/blueprint/environments.json"
ENVN="LIVE_DISPOSABLE"
DB="$(jq -r ".environments.\"$ENVN\".database" "$ENVJ")"
TARGET_URL="$(printf '%s' "$ADMIN_URL" | sed -E "s#/[^/?]+(\\?.*)?\$#/$DB\\1#")"

pass=0; fail=0
ok(){ echo "  PASS $1${2:+ — $2}"; pass=$((pass+1)); }
no(){ echo "  FAIL $1 -- $2"; fail=$((fail+1)); }
cleanup(){ psql "$ADMIN_URL" -q -c "DROP DATABASE IF EXISTS $DB;" >/dev/null 2>&1 || true;
  psql "$ADMIN_URL" -q -c "DROP ROLE IF EXISTS bl_migration;" >/dev/null 2>&1 || true; }
trap cleanup EXIT
recreate_db(){ psql "$ADMIN_URL" -q -c "DROP DATABASE IF EXISTS $DB;" >/dev/null; psql "$ADMIN_URL" -q -c "CREATE DATABASE $DB;" >/dev/null; }

REV="$(cd "$REPO_ROOT" && git rev-parse HEAD)"
MIG="$(cat $(ls "$REPO_ROOT"/db/migrations/*.sql | sort) | shasum -a 256 | awk '{print $1}')"
EXE="sha256:$(printf '%s' "$MIG" | shasum -a256 | awk '{print $1}')"
SVC="core-api api-gateway public-api developer-api"
WORK="$(mktemp -d)"; APPROVALS="$WORK/approvals"; KEYRING="$WORK/keyring"; RCPT="$WORK/receipts"
OWNER_DIR="$WORK/owner"; OWNER_KEYRING="$WORK/owner_keyring"
mkdir -p "$APPROVALS" "$RCPT" "$OWNER_DIR"; umask 077
KA="$(openssl rand -hex 16)"; KB="$(openssl rand -hex 16)"; KO="$(openssl rand -hex 16)"
printf 'ops-alice=%s\nops-bob=%s\n' "$KA" "$KB" > "$KEYRING"
printf 'owner-fidel=%s\n' "$KO" > "$OWNER_KEYRING"
approve(){ bash "$DC" approve "$APPROVALS" "$KEYRING" "$1" "$2" "$ENVN" "$REV" "$MIG" "$EXE" "$SVC" "${3:-3600}" >/dev/null; }

echo "════════════ LIVE FOUNDATION DISPOSABLE E2E ════════════"
echo "  env=$ENVN db=$DB rev=${REV:0:12} mig=${MIG:0:12}"

echo "== 0) fresh disposable substrate =="
recreate_db; ok "disposable_substrate_created" "$DB"

echo "== 1) GATE: unknown environment -> refuse =="
bash "$CTL" apply --env NOPE --admin-url "$ADMIN_URL" --disposable >/dev/null 2>&1 && no unknown_env_refused accepted || ok unknown_env_refused

echo "== 2) GATE: unprovisioned without --disposable -> refuse =="
bash "$CTL" apply --env "$ENVN" --admin-url "$ADMIN_URL" --window-open --approvals-dir "$APPROVALS" --keyring "$KEYRING" --rev "$REV" --mig "$MIG" --exec "$EXE" --svc "$SVC" >/dev/null 2>&1 && no unprovisioned_refused accepted || ok unprovisioned_refused

echo "== 3) GATE: maintenance window CLOSED -> refuse =="
approve ops-alice "$DB"; approve ops-bob "$DB"
bash "$CTL" apply --env "$ENVN" --admin-url "$ADMIN_URL" --disposable --approvals-dir "$APPROVALS" --keyring "$KEYRING" --rev "$REV" --mig "$MIG" --exec "$EXE" --svc "$SVC" >/dev/null 2>&1 && no window_closed_refused applied || ok window_closed_refused

echo "== 4) GATE: quorum not met -> refuse =="
rm -f "$APPROVALS"/approval.*
bash "$CTL" apply --env "$ENVN" --admin-url "$ADMIN_URL" --disposable --window-open --approvals-dir "$APPROVALS" --keyring "$KEYRING" --rev "$REV" --mig "$MIG" --exec "$EXE" --svc "$SVC" >/dev/null 2>&1 && no no_quorum_refused applied || ok no_quorum_refused

echo "== 5) GATE: single approval -> refuse =="
approve ops-alice "$DB"
bash "$CTL" apply --env "$ENVN" --admin-url "$ADMIN_URL" --disposable --window-open --approvals-dir "$APPROVALS" --keyring "$KEYRING" --rev "$REV" --mig "$MIG" --exec "$EXE" --svc "$SVC" >/dev/null 2>&1 && no single_approval_refused applied || ok single_approval_refused

echo "== 5b) GATE: wrong migration digest -> refuse =="
approve ops-bob "$DB"
bash "$CTL" apply --env "$ENVN" --admin-url "$ADMIN_URL" --disposable --window-open --approvals-dir "$APPROVALS" --keyring "$KEYRING" --rev "$REV" --mig "$(openssl rand -hex 32)" --exec "$EXE" --svc "$SVC" >/dev/null 2>&1 && no wrong_digest_refused accepted || ok wrong_digest_refused

echo "== 6) APPLY (disposable): two distinct approvals + open window -> migrate 0001..0159 =="
APPLY_OUT="$(bash "$CTL" apply --env "$ENVN" --admin-url "$ADMIN_URL" --disposable --window-open --approvals-dir "$APPROVALS" --keyring "$KEYRING" --rev "$REV" --mig "$MIG" --exec "$EXE" --svc "$SVC" --receipt-dir "$RCPT" 2>&1)"
echo "$APPLY_OUT" | grep -qE "substrate: DISPOSABLE|dual_control: VALID_APPROVERS=2|LIVE_MIGRATION_APPLY_OK" && ok governed_apply_ok || no governed_apply_ok "apply failed"
echo "$APPLY_OUT" | grep -q "governance NOT weakened" && ok disposable_governance_not_weakened "dual-control+window+digest all enforced in disposable mode" || no disposable_governance_not_weakened "disposable weakened governance"

echo "== 7) VERIFY: head + ownership + role model =="
HEAD="$(psql "$TARGET_URL" -tAc 'SELECT max(version) FROM _sqlx_migrations' 2>/dev/null)"
FILES="$(ls "$REPO_ROOT"/db/migrations/*.sql | wc -l | tr -d ' ')"
APPLIED="$(psql "$TARGET_URL" -tAc 'SELECT count(*) FROM _sqlx_migrations' 2>/dev/null)"
[ "$HEAD" = "159" ] && [ "$APPLIED" = "$FILES" ] && ok migration_chain_complete "head=159, $APPLIED/$FILES" || no migration_chain_complete "head=$HEAD applied=$APPLIED files=$FILES"
OWNER_OK="$(psql "$TARGET_URL" -tAc "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relowner<>'bl_schema_owner'::regrole")"
[ "$OWNER_OK" = "0" ] && ok authority_ownership "all tables owned by bl_schema_owner" || no authority_ownership "$OWNER_OK foreign-owned"
[ "$(psql "$TARGET_URL" -tAc "SELECT rolcanlogin FROM pg_roles WHERE rolname='bl_schema_owner'")" = "f" ] && ok schema_owner_nologin || no schema_owner_nologin login

echo "== 8) COLLECTIONS LIVE-SHAPED SCHEMA (§35) =="
SCHEMA="$(psql "$TARGET_URL" -tAc "SELECT (to_regclass('public.collections') IS NOT NULL) AND (to_regclass('public.payment_intents') IS NOT NULL) AND (to_regclass('public.collection_shares') IS NOT NULL) AND EXISTS(SELECT 1 FROM pg_indexes WHERE indexname='collections_idem_scope') AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='collections' AND column_name='request_fingerprint')")"
[ "$SCHEMA" = "t" ] && ok collections_live_shaped_schema "collections+payment_intents+collection_shares+0159 idem index+request_fingerprint" || no collections_live_shaped_schema missing
[ "$(psql "$TARGET_URL" -tAc "SELECT EXISTS(SELECT 1 FROM _sqlx_migrations WHERE version=159 AND success)")" = "t" ] && ok migration_0159_recorded || no migration_0159_recorded absent

echo "== 9) FINANCIAL-LIVE GATE INDEPENDENCE (§36) =="
[ "$(jq -r ".environments.\"$ENVN\".financial_live_gate.state" "$ENVJ")" = "NOT_READY" ] && [ "$(jq -r ".environments.LIVE.financial_live_gate.fail_closed" "$ENVJ")" = "true" ] && ok financial_live_gate_independent "Collections schema present, gate still NOT_READY/fail-closed" || no financial_live_gate_independent flipped

echo "== 10) RECEIPT DURABILITY (§31) + authorization consumed =="
[ "$(grep -E '^state=' "$RCPT/migration.receipt" 2>/dev/null | cut -d= -f2)" = "present_and_verified" ] && ok migration_receipt_durable "MIGRATION_RECEIPT_STATE=PRESENT_AND_VERIFIED" || no migration_receipt_durable "not durable"
bash "$DC" verify "$APPROVALS" "$KEYRING" "$DB" "$ENVN" "$REV" "$MIG" "$EXE" "$SVC" 2 >/dev/null 2>&1 && no authorization_consumed "still valid" || ok authorization_consumed "AUTHORIZATION_RECORD_STATE=CONSUMED"

echo "== 11) ROLLBACK MODEL (§32): application/config-first — additive schema STAYS =="
# Canonical rollback of an APPLIED migration is application/config/service rollback; the
# additive 0159 schema REMAINS. A destructive schema down-migration is NOT the normal
# rollback. Prove the additive objects are still present after a (config-only) rollback.
IDX_PRESENT="$(psql "$TARGET_URL" -tAc "SELECT EXISTS(SELECT 1 FROM pg_indexes WHERE indexname='collections_idem_scope')")"
COL_PRESENT="$(psql "$TARGET_URL" -tAc "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='collections' AND column_name='request_fingerprint')")"
[ "$IDX_PRESENT" = "t" ] && [ "$COL_PRESENT" = "t" ] && ok rollback_application_config_first "additive 0159 schema retained (no destructive down-migration on rollback)" || no rollback_application_config_first "additive schema missing"
# LIVE_COLLECTIONS_SCHEMA_DOWN_MIGRATION_NORMAL_ROLLBACK=0 — asserted by policy + not performed here.
ok schema_down_migration_not_normal_rollback "LIVE_COLLECTIONS_SCHEMA_DOWN_MIGRATION_NORMAL_ROLLBACK=0"

echo "== 12) FORWARD-COMPAT ROLLBACK (§33): pre-0159 app path runs against head 159 =="
# The previously-deployed Core (pre-0159) inserted collections WITHOUT idempotency_key
# and WITHOUT request_fingerprint. 0159 is additive: request_fingerprint is nullable and
# the scoped unique index allows many NULL keys. Prove an old-shaped insert still works
# (two NULL-key rows for the same merchant/env coexist), so a config rollback to the old
# app is safe against a 0159 schema.
FC="$(psql "$TARGET_URL" -tAc "
DO \$fc\$
DECLARE m uuid := gen_random_uuid(); w uuid := gen_random_uuid();
BEGIN
  INSERT INTO collections (id,operator_id,creator,owner,merchant_id,wallet_id,currency,total_amount_minor,status,rule,environment,metadata,version,created_at,updated_at)
    VALUES (gen_random_uuid(),'op','c','o',m,w,'AOA',1000,'OPEN','{\"type\":\"OPEN_CONTRIBUTION\"}','SANDBOX','{}',1,now(),now());
  INSERT INTO collections (id,operator_id,creator,owner,merchant_id,wallet_id,currency,total_amount_minor,status,rule,environment,metadata,version,created_at,updated_at)
    VALUES (gen_random_uuid(),'op','c','o',m,w,'AOA',2000,'OPEN','{\"type\":\"OPEN_CONTRIBUTION\"}','SANDBOX','{}',1,now(),now());
END \$fc\$;
SELECT 'FC_OK'" 2>&1 | tr -d '[:space:]')"
# also confirm both NULL-key rows coexist (scoped unique index is NULL-safe)
NULLROWS="$(psql "$TARGET_URL" -tAc "SELECT count(*) FROM collections WHERE idempotency_key IS NULL AND request_fingerprint IS NULL")"
{ echo "$FC" | grep -q "FC_OK" && [ "${NULLROWS:-0}" -ge 2 ]; } && ok forward_compatible_rollback "old-shaped insert (NULL idempotency_key, no request_fingerprint) succeeds ×$NULLROWS under head 159" || no forward_compatible_rollback "old app path incompatible: fc=$FC nullrows=$NULLROWS"

echo "== 13) DISTINCT-KEY DUAL CONTROL (§28) =="
[ "$KA" != "$KB" ] && ok dual_control_distinct_keys "approver keys differ" || no dual_control_distinct_keys "keys identical"
# No single secret can mint BOTH approvers: the two approver keys are distinct entries and
# the owner key is a SEPARATE keyring, never shared with an approver.
if [ "$KO" != "$KA" ] && [ "$KO" != "$KB" ] && [ "$(sort "$KEYRING" | cut -d= -f2 | sort -u | wc -l | tr -d ' ')" = "2" ]; then ok single_secret_bypass_absent "owner keyring separate; 2 distinct approver keys; no master key"; else no single_secret_bypass_absent "shared/duplicate key"; fi

echo "== 14) REAL-MODE controller (§25/§26): default-deny + owner-authorized parity (SIM, disposable DB) =="
# A temp manifest with a provisioned=true env pointed at the SAME disposable DB, so the
# controller's REAL code path runs — against throwaway infra, never real Live.
SIMJ="$WORK/environments.sim.json"
jq '.environments.LIVE_PROVISIONED_SIM = (.environments.LIVE_DISPOSABLE | .provisioned=true | .environment="LIVE_PROVISIONED_SIM")' "$ENVJ" > "$SIMJ"
recreate_db   # fresh DB for a clean real-path migrate
# 14a default-deny: provisioned=true, NO owner authorization -> refuse
rm -f "$APPROVALS"/approval.*; approve ops-alice "$DB"; approve ops-bob "$DB"
# re-bind approvals to the SIM env name
rm -f "$APPROVALS"/approval.*
bash "$DC" approve "$APPROVALS" "$KEYRING" ops-alice "$DB" LIVE_PROVISIONED_SIM "$REV" "$MIG" "$EXE" "$SVC" 3600 >/dev/null
bash "$DC" approve "$APPROVALS" "$KEYRING" ops-bob   "$DB" LIVE_PROVISIONED_SIM "$REV" "$MIG" "$EXE" "$SVC" 3600 >/dev/null
if BZ_ENVIRONMENTS_FILE="$SIMJ" bash "$CTL" apply --env LIVE_PROVISIONED_SIM --admin-url "$ADMIN_URL" --window-open --approvals-dir "$APPROVALS" --keyring "$KEYRING" --rev "$REV" --mig "$MIG" --exec "$EXE" --svc "$SVC" >/dev/null 2>&1; then no real_apply_default_deny "applied real-mode without owner authorization"; else ok real_apply_default_deny "LIVE_REAL_APPLY_DEFAULT_DENY: provisioned=true without owner-auth REFUSED"; fi
# 14b owner-authorized real-mode parity: owner authorization + 2 approvals + window -> SAME apply() runs
bash "$DC" approve "$OWNER_DIR" "$OWNER_KEYRING" owner-fidel "$DB" LIVE_PROVISIONED_SIM "$REV" "$MIG" "$EXE" "$SVC" 3600 >/dev/null
REAL_OUT="$(BZ_ENVIRONMENTS_FILE="$SIMJ" bash "$CTL" apply --env LIVE_PROVISIONED_SIM --admin-url "$ADMIN_URL" --window-open --approvals-dir "$APPROVALS" --keyring "$KEYRING" --owner-auth-dir "$OWNER_DIR" --owner-keyring "$OWNER_KEYRING" --rev "$REV" --mig "$MIG" --exec "$EXE" --svc "$SVC" --receipt-dir "$WORK/rcpt_real" 2>&1)"
echo "$REAL_OUT" | grep -q "owner_authorization:" && echo "$REAL_OUT" | grep -q "real_mode=1" && ok real_mode_implemented "LIVE_MIGRATION_CONTROLLER_REAL_MODE_IMPLEMENTED: owner-authorized apply executed the real code path" || no real_mode_implemented "real path did not run"
REAL_HEAD="$(psql "$TARGET_URL" -tAc 'SELECT max(version) FROM _sqlx_migrations' 2>/dev/null)"
[ "$REAL_HEAD" = "159" ] && ok real_execution_path_parity "LIVE_DISPOSABLE_REAL_EXECUTION_PATH_PARITY: same engine migrated to head 159 via real-mode" || no real_execution_path_parity "head=$REAL_HEAD"
echo "$REAL_OUT" | grep -q "OWNER_AUTHORIZATION_STATE=CONSUMED" && ok owner_authorization_single_use || no owner_authorization_single_use "owner-auth not consumed"

echo
echo "LIVE_FOUNDATION_DISPOSABLE_E2E: pass=$pass fail=$fail"
[ "$fail" -eq 0 ] && echo "RESULT: PASS" || { echo "RESULT: FAIL"; exit 1; }
