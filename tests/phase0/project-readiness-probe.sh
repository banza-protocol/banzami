#!/usr/bin/env bash
# Read one existing Project's financial readiness the way its integration does:
# with a key of that Project, over public HTTPS, and nothing else.
#
#   PROJECT_ID=<id> [EXPECT_HANDLE=@x] [EXPECT_PROFILE=p] [EXPECT_SETTLEMENT_BPS=n]
#   [EXPECT_PAYOUT_BPS=n] [EXPECT_READY=true|false] [EXPECT_BLOCKERS=A,B] \
#     bash tests/phase0/project-readiness-probe.sh
#
# THE KEY
#
# The Project's production key is its owner's and is not available here. The
# probe issues a key ON THAT PROJECT through the audited fixture-key path, with
# the single scope `identity:read` — it can describe the Project and nothing
# else: no payment, no account, no settlement. The key never leaves this
# machine, is used only in a header read from a file descriptor, and is revoked
# on exit however the script ends (lib/e2e-run.sh). Readiness is a property of
# the Project, not of the key: any key of the Project reads the same answer.
#
# Nothing here is specific to any application; the expectations are arguments.
# NEVER run under `bash -x`.
set -uo pipefail

API="${API:-https://sandbox-api.banzami.com}"
ACTOR="${ACTOR:-11111111-2222-4333-8444-555555555555}"
: "${PROJECT_ID:?PROJECT_ID required}"

DEV=$(docker ps --format '{{.Names}}' | grep developer-api | head -1)
[ -n "$DEV" ] || { echo "NO_CONTAINERS"; exit 1; }
DEVINT=$(docker exec "$DEV" sh -c 'cat /run/secrets/developer_internal_key 2>/dev/null')
[ -n "$DEVINT" ] || { echo "NO_SECRET"; exit 1; }

. "$(cd "$(dirname "$0")" && pwd)/lib/e2e-run.sh"
e2e_begin

PASS=0; FAIL=0
chk(){ if [ "$2" = "$3" ]; then echo "  $1 PASS ($2)"; PASS=$((PASS+1));
       else echo "  $1 FAIL (got '$2' want '$3')"; FAIL=$((FAIL+1)); fi; }
LAST=""; CODE=""
pub(){ local r
  r=$(curl -s -w $'\n%{http_code}' "$API$1" -H @/dev/fd/3 3< <(printf 'Authorization: Bearer %s\n' "$2") 2>/dev/null)
  CODE=$(printf '%s' "$r" | tail -n1); LAST=$(printf '%s' "$r" | sed '$d'); }
jp(){ printf '%s' "$LAST" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{let j;try{j=JSON.parse(s)}catch(e){return}const v=(function(j){return eval(process.argv[1])})(j);process.stdout.write(v===undefined||v===null?String(v):typeof v==="object"?JSON.stringify(v):String(v))})' "$1"; }

R="${RANDOM}${RANDOM}"
r=$(printf '%s' "{\"name\":\"readiness-probe-$R\",\"scopes\":[\"identity:read\"],\"created_by\":\"$ACTOR\"}" |
    docker exec -i "$DEV" curl -s -X POST "http://localhost:8086/internal/v1/projects/$PROJECT_ID/fixture-keys" \
      -H "X-Internal-Key: $DEVINT" -H "Content-Type: application/json" --data @- 2>/dev/null)
KEY=$(printf '%s' "$r" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).secret||"")}catch(e){}})')
KID=$(printf '%s' "$r" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).id||"")}catch(e){}})')
e2e_own fixture_key "$KID"
chk KEY_ISSUED_IDENTITY_READ_ONLY "$([ -n "$KEY" ] && echo yes)" yes
[ -n "$KEY" ] || exit 1

echo "### GET /v1/me"
pub /v1/me "$KEY"
chk ME_200 "$CODE" 200
chk ME_PROJECT_ID "$(jp j.project.id)" "$PROJECT_ID"
ME_BODY="$LAST"

echo "### GET /v1/financial-setup"
pub /v1/financial-setup "$KEY"
chk FS_200 "$CODE" 200
chk FS_PROJECT_ID "$(jp j.project.id)" "$PROJECT_ID"
FS_BODY="$LAST"
[ -n "${EXPECT_HANDLE:-}" ] && chk HANDLE "$(jp j.financial_identity.handle)" "$EXPECT_HANDLE"
chk KYB "$(jp j.kyb.status)" "${EXPECT_KYB:-APPROVED}"
chk WALLET "$(jp '`${j.wallet.status}/${j.wallet.currency}`')" "${EXPECT_WALLET:-ACTIVE/AOA}"
[ -n "${EXPECT_PROFILE:-}" ] && chk PRICING_PROFILE "$(jp j.pricing.profile)" "$EXPECT_PROFILE"
[ -n "${EXPECT_SETTLEMENT_BPS:-}" ] && chk SETTLEMENT_BPS "$(jp j.pricing.settlement_bps)" "$EXPECT_SETTLEMENT_BPS"
[ -n "${EXPECT_PAYOUT_BPS:-}" ] && chk PAYOUT_BPS "$(jp j.pricing.payout_bps)" "$EXPECT_PAYOUT_BPS"
[ -n "${EXPECT_READY:-}" ] && chk SETTLEMENT_READY "$(jp j.settlement.ready)" "$EXPECT_READY"
[ -n "${EXPECT_BLOCKERS+x}" ] && chk BLOCKERS "$(jp 'j.settlement.blockers.join(",")')" "$EXPECT_BLOCKERS"
# Internal consistency, whatever the state: ready exactly when nothing blocks.
chk READY_IFF_NO_BLOCKERS "$(jp 'String(j.settlement.ready === (j.settlement.blockers.length === 0))')" true
leaks=""
for k in merchant_id wallet_id account_id binding workspace_id key_id; do
  printf '%s%s' "$ME_BODY" "$FS_BODY" | grep -q "\"$k\"" && leaks="$leaks $k"; done
chk NAMES_NOTHING_BEHIND_THE_PROJECT "${leaks:-none}" none

echo
echo "### the Project's readiness, as its integration reads it"
printf '%s\n' "$FS_BODY" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.stringify(JSON.parse(s),null,2)))'
echo
echo "PROJECT_READINESS_PROBE: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
