#!/usr/bin/env bash
# COLLECTIONS-PROTOCOL-AND-PRODUCT-001 Part B §23-26 — LIVE FOUNDATION disposable E2E.
#
# Proves the ENTIRE governed Live process against a THROWAWAY Live-shaped Postgres
# (env LIVE_DISPOSABLE, db banzami_live_shaped) on the local cluster — never a real
# environment. Every governance gate is enforced; the migration chain 0001..0159 is
# applied through the sanctioned runner; Collections schema + Financial-Live-gate
# independence + rollback model are verified; the substrate is dropped at the end.
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

# Immutable migration identity for this proof.
REV="$(cd "$REPO_ROOT" && git rev-parse HEAD)"
MIG="$(cat $(ls "$REPO_ROOT"/db/migrations/*.sql | sort) | shasum -a 256 | awk '{print $1}')"
EXE="sha256:$(printf '%s' "$MIG" | shasum -a256 | awk '{print $1}')"   # disposable executor stand-in
SVC="core-api api-gateway public-api developer-api"
WORK="$(mktemp -d)"; APPROVALS="$WORK/approvals"; KEYRING="$WORK/keyring"; RCPT="$WORK/receipts"
mkdir -p "$APPROVALS" "$RCPT"; umask 077
printf 'ops-alice=%s\nops-bob=%s\n' "$(openssl rand -hex 16)" "$(openssl rand -hex 16)" > "$KEYRING"

echo "════════════ LIVE FOUNDATION DISPOSABLE E2E ════════════"
echo "  env=$ENVN db=$DB rev=${REV:0:12} mig=${MIG:0:12}"

echo "== 0) fresh disposable substrate =="
psql "$ADMIN_URL" -q -c "DROP DATABASE IF EXISTS $DB;" >/dev/null
psql "$ADMIN_URL" -q -c "CREATE DATABASE $DB;" >/dev/null
ok "disposable_substrate_created" "$DB"

echo "== 1) GATE: unknown environment -> refuse =="
if bash "$CTL" apply --env NOPE --admin-url "$ADMIN_URL" --disposable >/dev/null 2>&1; then no "unknown_env_refused" "accepted"; else ok "unknown_env_refused"; fi

echo "== 2) GATE: unprovisioned without --disposable -> refuse =="
if bash "$CTL" apply --env "$ENVN" --admin-url "$ADMIN_URL" --window-open --approvals-dir "$APPROVALS" --keyring "$KEYRING" --rev "$REV" --mig "$MIG" --exec "$EXE" --svc "$SVC" >/dev/null 2>&1; then no "unprovisioned_refused" "accepted a non-disposable apply"; else ok "unprovisioned_refused"; fi

echo "== 3) GATE: maintenance window CLOSED -> refuse =="
bash "$DC" approve "$APPROVALS" "$KEYRING" ops-alice "$DB" "$ENVN" "$REV" "$MIG" "$EXE" "$SVC" 3600 >/dev/null
bash "$DC" approve "$APPROVALS" "$KEYRING" ops-bob   "$DB" "$ENVN" "$REV" "$MIG" "$EXE" "$SVC" 3600 >/dev/null
if bash "$CTL" apply --env "$ENVN" --admin-url "$ADMIN_URL" --disposable --approvals-dir "$APPROVALS" --keyring "$KEYRING" --rev "$REV" --mig "$MIG" --exec "$EXE" --svc "$SVC" >/dev/null 2>&1; then no "window_closed_refused" "applied outside window"; else ok "window_closed_refused"; fi

echo "== 4) GATE: quorum not met (remove approvals) -> refuse =="
rm -f "$APPROVALS"/approval.*
if bash "$CTL" apply --env "$ENVN" --admin-url "$ADMIN_URL" --disposable --window-open --approvals-dir "$APPROVALS" --keyring "$KEYRING" --rev "$REV" --mig "$MIG" --exec "$EXE" --svc "$SVC" >/dev/null 2>&1; then no "no_quorum_refused" "applied without approvals"; else ok "no_quorum_refused"; fi

echo "== 5) GATE: single approval -> refuse =="
bash "$DC" approve "$APPROVALS" "$KEYRING" ops-alice "$DB" "$ENVN" "$REV" "$MIG" "$EXE" "$SVC" 3600 >/dev/null
if bash "$CTL" apply --env "$ENVN" --admin-url "$ADMIN_URL" --disposable --window-open --approvals-dir "$APPROVALS" --keyring "$KEYRING" --rev "$REV" --mig "$MIG" --exec "$EXE" --svc "$SVC" >/dev/null 2>&1; then no "single_approval_refused" "applied with one approver"; else ok "single_approval_refused"; fi

echo "== 6) APPLY: two distinct approvals + open window + disposable -> migrate 0001..0159 =="
bash "$DC" approve "$APPROVALS" "$KEYRING" ops-bob "$DB" "$ENVN" "$REV" "$MIG" "$EXE" "$SVC" 3600 >/dev/null
APPLY_OUT="$(bash "$CTL" apply --env "$ENVN" --admin-url "$ADMIN_URL" --disposable --window-open --approvals-dir "$APPROVALS" --keyring "$KEYRING" --rev "$REV" --mig "$MIG" --exec "$EXE" --svc "$SVC" --receipt-dir "$RCPT" 2>&1)"
echo "$APPLY_OUT" | sed 's/^/    /'
echo "$APPLY_OUT" | grep -q "LIVE_MIGRATION_APPLY_OK" && ok "governed_apply_ok" || no "governed_apply_ok" "apply failed"

echo "== 7) VERIFY: head + ownership + role model =="
HEAD="$(psql "$TARGET_URL" -tAc 'SELECT max(version) FROM _sqlx_migrations' 2>/dev/null)"
FILES="$(ls "$REPO_ROOT"/db/migrations/*.sql | wc -l | tr -d ' ')"
APPLIED="$(psql "$TARGET_URL" -tAc 'SELECT count(*) FROM _sqlx_migrations' 2>/dev/null)"
echo "  head=$HEAD applied=$APPLIED files=$FILES"
[ "$HEAD" = "159" ] && [ "$APPLIED" = "$FILES" ] && ok "migration_chain_complete" "head=159, $APPLIED/$FILES" || no "migration_chain_complete" "head=$HEAD applied=$APPLIED files=$FILES"
OWNER_OK="$(psql "$TARGET_URL" -tAc "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relowner<>'bl_schema_owner'::regrole")"
[ "$OWNER_OK" = "0" ] && ok "authority_ownership" "all tables owned by bl_schema_owner" || no "authority_ownership" "$OWNER_OK foreign-owned"
SO_LOGIN="$(psql "$TARGET_URL" -tAc "SELECT rolcanlogin FROM pg_roles WHERE rolname='bl_schema_owner'")"
[ "$SO_LOGIN" = "f" ] && ok "schema_owner_nologin" || no "schema_owner_nologin" "login=$SO_LOGIN"

echo "== 8) COLLECTIONS LIVE-SHAPED SCHEMA (§24) =="
SCHEMA="$(psql "$TARGET_URL" -tAc "SELECT
  (to_regclass('public.collections') IS NOT NULL) AND
  (to_regclass('public.payment_intents') IS NOT NULL) AND
  (to_regclass('public.collection_shares') IS NOT NULL) AND
  EXISTS(SELECT 1 FROM pg_indexes WHERE indexname='collections_idem_scope') AND
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='collections' AND column_name='request_fingerprint')")"
[ "$SCHEMA" = "t" ] && ok "collections_live_shaped_schema" "collections+payment_intents+collection_shares+0159 idem index+request_fingerprint" || no "collections_live_shaped_schema" "missing objects"
# 0159 recorded
IDEM159="$(psql "$TARGET_URL" -tAc "SELECT EXISTS(SELECT 1 FROM _sqlx_migrations WHERE version=159 AND success)")"
[ "$IDEM159" = "t" ] && ok "migration_0159_recorded" || no "migration_0159_recorded" "0159 not recorded"

echo "== 9) FINANCIAL-LIVE GATE INDEPENDENCE (§25) =="
GATE="$(jq -r ".environments.\"$ENVN\".financial_live_gate.state" "$ENVJ")"
FC="$(jq -r ".environments.LIVE.financial_live_gate.fail_closed" "$ENVJ")"
# Deploying the Collections schema did NOT and cannot flip the platform gate.
[ "$GATE" = "NOT_READY" ] && [ "$FC" = "true" ] && ok "financial_live_gate_independent" "Collections schema present, gate still NOT_READY/fail-closed" || no "financial_live_gate_independent" "gate=$GATE fail_closed=$FC"

echo "== 10) RECEIPT DURABILITY (§22) =="
RS="$(grep -E '^state=' "$RCPT/migration.receipt" 2>/dev/null | cut -d= -f2)"
[ "$RS" = "present_and_verified" ] && ok "migration_receipt_durable" "MIGRATION_RECEIPT_STATE=PRESENT_AND_VERIFIED" || no "migration_receipt_durable" "receipt state=$RS"
# approvals are single-use: re-verify must now FAIL (consumed)
if bash "$DC" verify "$APPROVALS" "$KEYRING" "$DB" "$ENVN" "$REV" "$MIG" "$EXE" "$SVC" 2 >/dev/null 2>&1; then no "authorization_consumed" "approvals still valid after apply"; else ok "authorization_consumed" "AUTHORIZATION_RECORD_STATE=CONSUMED"; fi

echo "== 11) ROLLBACK MODEL (§26): additive, never DROP ledger/history =="
# The canonical Collections rollback is app/config; the schema is additive and stays.
# The ONLY schema objects a 0159 rollback may remove are its own additive index+column;
# it must NEVER DROP or DELETE ledger/financial history. Prove such a rollback touches
# ONLY collections_idem_scope + request_fingerprint and leaves ledger tables intact.
LEDGER_BEFORE="$(psql "$TARGET_URL" -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('ledger_accounts','ledger_postings','ledger_entries','wallets','transfers')")"
psql "$TARGET_URL" -v ON_ERROR_STOP=1 -q >/dev/null <<'SQL'
-- additive rollback of 0159 ONLY (idempotent); never a data/ledger drop
DROP INDEX IF EXISTS collections_idem_scope;
ALTER TABLE collections DROP COLUMN IF EXISTS request_fingerprint;
SQL
LEDGER_AFTER="$(psql "$TARGET_URL" -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('ledger_accounts','ledger_postings','ledger_entries','wallets','transfers')")"
IDX_GONE="$(psql "$TARGET_URL" -tAc "SELECT NOT EXISTS(SELECT 1 FROM pg_indexes WHERE indexname='collections_idem_scope')")"
[ "$LEDGER_BEFORE" = "$LEDGER_AFTER" ] && [ "$LEDGER_BEFORE" = "5" ] && [ "$IDX_GONE" = "t" ] \
  && ok "rollback_additive_ledger_intact" "0159 index/column removed; 5/5 ledger tables intact" \
  || no "rollback_additive_ledger_intact" "before=$LEDGER_BEFORE after=$LEDGER_AFTER idx_gone=$IDX_GONE"

echo
echo "LIVE_FOUNDATION_DISPOSABLE_E2E: pass=$pass fail=$fail"
[ "$fail" -eq 0 ] && echo "RESULT: PASS" || { echo "RESULT: FAIL"; exit 1; }
