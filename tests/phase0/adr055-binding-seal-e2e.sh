#!/usr/bin/env bash
# ADR-055 — the binding seal, proven against the deployed Sandbox.
#
# A Developer project resolves its payee through its ACTIVE binding. The binding
# is correctable while it is only a statement of intent, and fixed once it has
# been used: the moment a payer-facing payment artifact exists under it, the
# payee it names can never change, because changing it would reattribute money
# that has already been promised to someone.
#
# What this proves, in the order the lifecycle happens:
#
#   1. a fresh project binds, unsealed
#   2. the operator corrects that binding before any artifact — allowed
#   3. the first payer-facing artifact seals the binding
#   4. the same correction, attempted after the seal — refused
#   5. the database refuses it too, with the service guard bypassed entirely
#   6. two concurrent first artifacts leave exactly one sealed binding
#
# Step 5 matters on its own. The service guard is an UPDATE with
# `WHERE artifact_created = false`; if that were the only defence, anything
# reaching the database another way — a migration, a console, a future code path
# — would walk straight past it. The trigger is what makes the rule a property
# of the data rather than of one function.
#
# Runs ON the Sandbox VM: it needs the internal key (a docker secret) and the
# database, neither of which leaves the host.
#
# Usage (on the VM):  bash adr055-binding-seal-e2e.sh
set -uo pipefail

PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  ✓ $1"; }
bad()  { FAIL=$((FAIL+1)); echo "  ✗ $1"; }
step() { echo; echo "$1"; }

DEV=$(docker ps --format '{{.Names}}' | grep developer-api | head -1)
PG=$(docker ps --format '{{.Names}}' | grep '23807-postgres' | head -1)
# The gateway is a sibling container: inside developer-api, localhost is
# developer-api. Resolved by container name on the shared compose network —
# the short service alias is not registered here.
GWC=$(docker ps --format '{{.Names}}' | grep api-gateway | head -1)
GW="http://$GWC:8080"
[ -n "$DEV" ] && [ -n "$PG" ] && [ -n "$GWC" ] || { echo "developer-api, postgres or api-gateway container not found"; exit 2; }

IK=$(docker exec "$DEV" sh -c 'cat /run/secrets/developer_internal_key')
DBURL=$(docker exec "$DEV" sh -c 'cat /run/secrets/db_url')
ACTOR=11111111-2222-4333-8444-555555555555

# @doa's payee, and two wallet accounts under it. The seal is about which payee
# a project resolves to, so A and B differ by account: a real correction, and
# one that cannot move money outside the same owner.
MERCHANT=050b68c2-221a-45a7-b801-35fd75cd9185
WALLET=010b4702-cb45-421a-9186-ea0d5323d8a6

sql() { docker exec -e U="$DBURL" "$PG" sh -c 'psql "$U" -tAc "'"$1"'"' 2>&1 | tr -d '\r'; }
dev() { # dev METHOD PATH [BODY]
  local m="$1" p="$2" b="${3:-}"
  if [ -n "$b" ]; then
    printf '%s' "$b" | docker exec -i -e IK="$IK" "$DEV" sh -c \
      "curl -s -w '\n%{http_code}' -X $m 'http://localhost:8086$p' -H \"X-Internal-Key: \$IK\" -H 'Content-Type: application/json' --data @-"
  else
    docker exec -e IK="$IK" "$DEV" sh -c \
      "curl -s -w '\n%{http_code}' -X $m 'http://localhost:8086$p' -H \"X-Internal-Key: \$IK\""
  fi
}
code() { echo "$1" | tail -1; }
body() { echo "$1" | sed '$d'; }
# Pull one string field out of a JSON body. Deliberately narrow: an earlier
# version used a greedy sed that returned the whole document when the field was
# absent, and the whole document then travelled onward as a "uuid".
jget() {
  echo "$1" | grep -oE "\"$2\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" | head -1 \
    | sed -E "s/.*:[[:space:]]*\"([^\"]*)\"/\\1/"
}
# A uuid, or nothing. Anything else is a bug in the caller, not an id.
uuid_or_die() {
  case "$1" in
    [0-9a-f]*-[0-9a-f]*-[0-9a-f]*-[0-9a-f]*-[0-9a-f]*) printf '%s' "$1" ;;
    *) echo "expected a uuid, got: $(printf '%s' "$1" | head -c 120)" >&2; exit 1 ;;
  esac
}

ACCOUNTS=$(sql "select id from wallet_accounts where wallet_id='$WALLET' and status='ACTIVE' order by created_at limit 2")
ACC_A=$(echo "$ACCOUNTS" | sed -n 1p)
ACC_B=$(echo "$ACCOUNTS" | sed -n 2p)
[ -n "$ACC_A" ] && [ -n "$ACC_B" ] || { echo "need two active wallet accounts under $WALLET"; exit 2; }

echo "ADR-055 binding seal — deployed Sandbox"
echo "  payee   $MERCHANT"
echo "  account A $ACC_A"
echo "  account B $ACC_B"

# ── 1. a fresh project ────────────────────────────────────────────────────────
step "1 — a fresh project binds, unsealed"
R=$(dev POST /internal/v1/fixture-projects "{\"name\":\"adr055-$(date +%s)\",\"created_by\":\"$ACTOR\"}")
[ "$(code "$R")" = "201" ] || { bad "fixture project: $(code "$R") $(body "$R" | head -c 200)"; exit 1; }
PROJ=$(uuid_or_die "$(jget "$(body "$R")" project_id)")
ok "project $PROJ"

R=$(dev POST "/internal/v1/projects/$PROJ/binding" \
  "{\"merchant_id\":\"$MERCHANT\",\"wallet_id\":\"$WALLET\",\"wallet_account_id\":\"$ACC_A\",\"actor_user_id\":\"$ACTOR\"}")
[ "$(code "$R")" = "201" ] || [ "$(code "$R")" = "200" ] \
  && ok "bound to account A" || bad "bind A: $(code "$R") $(body "$R" | head -c 200)"

SEALED=$(sql "select artifact_created from developer.dev_project_sandbox_binding where project_id='$PROJ' and state='ACTIVE'")
[ "$SEALED" = "f" ] && ok "binding is unsealed" || bad "a fresh binding is already sealed ($SEALED)"

# ── 2. correction before any artifact ─────────────────────────────────────────
step "2 — the operator corrects the binding, before any artifact"
R=$(dev POST "/internal/v1/projects/$PROJ/binding" \
  "{\"merchant_id\":\"$MERCHANT\",\"wallet_id\":\"$WALLET\",\"wallet_account_id\":\"$ACC_B\",\"actor_user_id\":\"$ACTOR\",\"supersede\":true}")
C=$(code "$R")
{ [ "$C" = "200" ] || [ "$C" = "201" ]; } && ok "rebind A→B allowed while unsealed" \
  || bad "rebind A→B refused before any artifact: $C $(body "$R" | head -c 200)"

NOW=$(sql "select wallet_account_id from developer.dev_project_sandbox_binding where project_id='$PROJ' and state='ACTIVE'")
[ "$NOW" = "$ACC_B" ] && ok "the project now resolves to account B" || bad "still resolves to $NOW"

# ── 3. the first payer-facing artifact ────────────────────────────────────────
step "3 — the first payer-facing artifact seals the binding"
R=$(dev POST "/internal/v1/projects/$PROJ/fixture-keys" \
  "{\"name\":\"adr055-probe\",\"kind\":\"SECRET\",\"created_by\":\"$ACTOR\",\"scopes\":[\"identity:read\",\"payment_sessions:read\",\"payment_sessions:write\"]}")
[ "$(code "$R")" = "201" ] || { bad "fixture key: $(code "$R") $(body "$R" | head -c 200)"; exit 1; }
KEY=$(jget "$(body "$R")" secret)
KEYID=$(uuid_or_die "$(jget "$(body "$R")" id)")
ok "key minted with payment_sessions:write"

gw() { docker exec -e K="$KEY" "$DEV" sh -c \
  "curl -s -w '\n%{http_code}' -X POST '$GW/v1/business/payment-sessions' -H \"Authorization: Bearer \$K\" -H 'Content-Type: application/json' -d '$1'"; }
R=$(gw '{"amount":150000,"currency":"AOA","description":"adr055 seal probe"}')
C=$(code "$R")
{ [ "$C" = "200" ] || [ "$C" = "201" ]; } && ok "payment session created ($C)" \
  || bad "payment session: $C $(body "$R" | head -c 240)"

SEALED=$(sql "select artifact_created from developer.dev_project_sandbox_binding where project_id='$PROJ' and state='ACTIVE'")
[ "$SEALED" = "t" ] && ok "the binding sealed on the first artifact" || bad "binding not sealed after an artifact ($SEALED)"

# ── 4. the same correction, after the seal ────────────────────────────────────
step "4 — the same correction, attempted after the seal"
R=$(dev POST "/internal/v1/projects/$PROJ/binding" \
  "{\"merchant_id\":\"$MERCHANT\",\"wallet_id\":\"$WALLET\",\"wallet_account_id\":\"$ACC_A\",\"actor_user_id\":\"$ACTOR\",\"supersede\":true}")
C=$(code "$R")
{ [ "$C" = "409" ] || [ "$C" = "403" ]; } && ok "rebind B→A refused after the seal ($C)" \
  || bad "a sealed binding was rebound: $C $(body "$R" | head -c 240)"

STILL=$(sql "select wallet_account_id from developer.dev_project_sandbox_binding where project_id='$PROJ' and state='ACTIVE'")
[ "$STILL" = "$ACC_B" ] && ok "the payee did not move" || bad "the payee moved to $STILL"

# ── 5. the database refuses it too ────────────────────────────────────────────
step "5 — the same change, straight at the database, with no service in the way"
OUT=$(sql "update developer.dev_project_sandbox_binding set wallet_account_id='$ACC_A' where project_id='$PROJ' and state='ACTIVE'")
echo "$OUT" | grep -qiE 'error|sealed|cannot|refus' && ok "the trigger refused a direct UPDATE" \
  || bad "a direct UPDATE was accepted: ${OUT:-<no error>}"

OUT=$(sql "delete from developer.dev_project_sandbox_binding where project_id='$PROJ' and state='ACTIVE'")
echo "$OUT" | grep -qiE 'error|sealed|cannot|refus' && ok "the trigger refused a direct DELETE" \
  || bad "a sealed binding was deleted: ${OUT:-<no error>}"

# Compared field by field. Concatenating them meant comparing against a
# rendering of a boolean, and psql renders it 't' in one query shape and 'true'
# in another — a failure that says nothing about the binding.
AFTER_ACC=$(sql "select wallet_account_id from developer.dev_project_sandbox_binding where project_id='$PROJ' and state='ACTIVE'")
AFTER_SEAL=$(sql "select artifact_created from developer.dev_project_sandbox_binding where project_id='$PROJ' and state='ACTIVE'")
{ [ "$AFTER_ACC" = "$ACC_B" ] && [ "$AFTER_SEAL" = "t" ]; } \
  && ok "the binding is exactly as it was" \
  || bad "the binding is now account=$AFTER_ACC sealed=$AFTER_SEAL"

# ── 6. concurrency ────────────────────────────────────────────────────────────
step "6 — two artifacts at once leave one sealed binding"
R=$(dev POST /internal/v1/fixture-projects "{\"name\":\"adr055-race-$(date +%s)\",\"created_by\":\"$ACTOR\"}")
PROJ2=$(uuid_or_die "$(jget "$(body "$R")" project_id)")
dev POST "/internal/v1/projects/$PROJ2/binding" \
  "{\"merchant_id\":\"$MERCHANT\",\"wallet_id\":\"$WALLET\",\"wallet_account_id\":\"$ACC_A\",\"actor_user_id\":\"$ACTOR\"}" >/dev/null
R=$(dev POST "/internal/v1/projects/$PROJ2/fixture-keys" \
  "{\"name\":\"adr055-race\",\"kind\":\"SECRET\",\"created_by\":\"$ACTOR\",\"scopes\":[\"identity:read\",\"payment_sessions:read\",\"payment_sessions:write\"]}")
KEY2=$(jget "$(body "$R")" secret)
KEYID2=$(uuid_or_die "$(jget "$(body "$R")" id)")

docker exec -e K="$KEY2" "$DEV" sh -c \
  "for i in 1 2 3 4 5; do curl -s -o /dev/null -X POST '$GW/v1/business/payment-sessions' -H \"Authorization: Bearer \$K\" -H 'Content-Type: application/json' -d '{\"amount\":100000,\"currency\":\"AOA\",\"description\":\"race\"}' & done; wait" >/dev/null 2>&1

ACTIVE_N=$(sql "select count(*) from developer.dev_project_sandbox_binding where project_id='$PROJ2' and state='ACTIVE'")
SEALED2=$(sql "select artifact_created from developer.dev_project_sandbox_binding where project_id='$PROJ2' and state='ACTIVE'")
[ "$ACTIVE_N" = "1" ] && ok "exactly one ACTIVE binding after five concurrent artifacts" || bad "$ACTIVE_N ACTIVE bindings"
[ "$SEALED2" = "t" ] && ok "and it is sealed" || bad "it is not sealed ($SEALED2)"

# ── cleanup ───────────────────────────────────────────────────────────────────
step "cleanup"
for k in "$KEYID" "$KEYID2"; do
  [ -n "$k" ] && dev POST "/internal/v1/fixture-keys/$k/revoke" "{\"created_by\":\"$ACTOR\"}" >/dev/null
done
ok "probe keys revoked"
echo
echo "  (the fixture projects and their sealed bindings are left in place: a sealed"
echo "   binding cannot be deleted, which is the property this proved)"

echo
[ "$FAIL" -eq 0 ] && echo "✓ ADR-055 holds on the deployed Sandbox — $PASS checks" \
                  || echo "✗ $FAIL of $((PASS+FAIL)) checks failed"
exit $([ "$FAIL" -eq 0 ] && echo 0 || echo 1)
