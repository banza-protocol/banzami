#!/usr/bin/env bash
# Retire what DOA's tenants carry that is not DOA's current, canonical state.
# Owner decision 2026-09-11 (Sandbox clean slate): only the operational DOA
# remains — Project Doa-Sandbox bound to @doa, its two runtime keys, its
# receiving webhook, its Wallet and PRIMARY account. Everything else DOA-related
# that tests left behind is retired. By EXACT id, each named with the reason; no
# pattern decides anything here.
#
#   the old "DOA Sandbox" Project        superseded by Doa-Sandbox on 2026-09-09;
#                                        every key already revoked. Retired: the
#                                        Project archived (its sealed binding
#                                        stays as history, ADR-055).
#   its Business (Sandbox · DOA Sandbox) one webhook still delivering to
#                                        doadoa.app. Deactivated; suspended.
#   the first "Doa" Business             provisioned 2026-09-07, superseded; no
#                                        handle, no login, nothing bound. Suspended.
#   two test keys on Doa-Sandbox         "reference-journey", "ceremony-…-doa".
#                                        Revoked. The web and admin runtime keys —
#                                        the ones DOA runs on — are not touched.
#   an unpaid 126 000 Kz session on @doa  names a DOA donation that does not exist.
#                                        Cancelled with its link and QR.
#   six @doa CAMPAIGN accounts           five opened by assurance runs with no DOA
#                                        campaign behind them (reference journey,
#                                        Release A final), one behind a DOA
#                                        campaign that completed at 0 Kz. Value
#                                        retired, account closed.
#   @doa's PRIMARY balance               fees from test settlements. Retired to the
#                                        Sandbox funding source; the account stays.
#
# --doa-campaigns-ended retires the last four @doa CAMPAIGN accounts. They back
# campaigns that DOA's live datastore still shows (three active, one closed and in
# DOA's settlement queue); closing them first would leave doadoa.app offering a
# donation into a closed account. Run it once DOA has ended those campaigns (its
# own reset, scripts/ops/launch-reset.mjs, or closing them in DOA).
#
# Every change is a canonical API call (Core over its loopback, developer-api's
# operator routes, the gateway as the owning merchant). Nothing is deleted; the
# ledger keeps every posting. Dry run by default.
#
# Usage: bash tools/ops/retire-stale-doa-tenant-state.sh [--apply] [--doa-campaigns-ended]
# NEVER run under `bash -x`.
set -uo pipefail

APPLY=0; CAMPAIGNS=0
for a in "$@"; do case "$a" in --apply) APPLY=1 ;; --doa-campaigns-ended) CAMPAIGNS=1 ;; esac; done

for _p in "$(dirname "$0")/remote.sh" "$(dirname "$0")/lib/remote.sh" \
          "$(dirname "$0")/../lib/remote.sh" "$(dirname "$0")/../../tools/ops/lib/remote.sh"; do
  [ -f "$_p" ] && { . "$_p"; break; }
done
command -v remote_self_or_continue >/dev/null 2>&1 \
  || { echo "✗ tools/ops/lib/remote.sh not found — refusing to run without the host guard" >&2; exit 2; }
remote_self_or_continue "$@"

CORE=$(docker ps --format '{{.Names}}' | grep core-api-staging | head -1)
GW=$(docker ps --format '{{.Names}}' | grep api-gateway-staging | head -1)
DEV=$(docker ps --format '{{.Names}}' | grep developer-api | head -1)
PG=$(docker ps --format '{{.Names}}' | grep postgres | grep bzsandbox | head -1)
PW=$(docker exec "$CORE" sh -c 'cat /run/secrets/db_url' | sed -E 's#.*://[^:]+:([^@]+)@.*#\1#')
q(){ docker exec -e PGPASSWORD="$PW" -e PGOPTIONS="-c default_transaction_read_only=on" "$PG" \
       psql -U bl_app_runtime -d banzami_staging -At -F'|' -c "$1" 2>/dev/null; }

# ── the exact objects ────────────────────────────────────────────────────────
OLD_PROJECT=2515de46-f73d-42c5-8de8-ff8588821d33        # "DOA Sandbox"
OLD_MERCHANT=8565edf9-b128-4a0d-ae6d-beeaf652a233       # Sandbox · DOA Sandbox
OLD_HOOK=3af13ee7-1516-4c33-b48b-8d051ceec8bd
FIRST_MERCHANT=a779d287-8422-4d0f-b6af-6f392720f8e4     # "Doa"
DOA_MERCHANT=255afb6c-0f19-4867-9b96-28108ce416c9       # Sandbox · Doa-Sandbox (@doa) — kept
TEST_KEYS="ceec47d6-4004-4952-a11f-776ff8ee40a4 07e9ca15-abd0-472b-a895-a8ed12f842be"
ORPHAN_SESSION=ba704462-515f-4e29-8b5b-76fa9d5ce488
FIXTURE_ACCOUNTS="daa0d105-0562-4b84-958e-4221775fe84d 4cca52b7-bb4c-4be3-b574-54c0f26f80c3 8a789566-7bfb-4ce8-8eb3-9ee54b9fe868 b708cfb4-6ef7-42f1-9ab7-61603c2a6603 53499b29-ca1d-470e-89c1-f6f73ff0f68f 167d03b9-159b-48c8-928b-55d9b0d7af6d"
DOA_CAMPAIGN_ACCOUNTS="57de2623-2259-4dac-8a2f-f4bb055a5e9c 786214a5-0744-4f11-ab1a-60e6bbe5dd23 a049caa6-cb25-4d32-ae81-6159831e685a f7e428e3-6656-4965-a611-24acd847f6a9"
# What must come out exactly as it went in.
KEEP_PROJECT=84b0e8e6-fbda-417e-a537-19ad8574827a       # Doa-Sandbox
KEEP_KEYS="f0090c67-ddba-4f84-90b5-aef3479a2532 66fb03b6-a1c4-45ac-974e-0e4b33e39864"
KEEP_HOOK=5e6d68ff-b87d-400e-9641-cddd5a78a3c6

inlist(){ printf "'%s'," $1 | sed 's/,$//'; }
bal="COALESCE((SELECT SUM(CASE WHEN e.entry_type='CREDIT' THEN e.amount_minor ELSE -e.amount_minor END) FROM ledger_entries e WHERE e.account_id = %s), 0)"
state(){
  echo "  old project            $(q "SELECT status FROM developer.dev_projects WHERE id='$OLD_PROJECT'")"
  echo "  old Business           $(q "SELECT status FROM merchants WHERE id='$OLD_MERCHANT'") / webhook active=$(q "SELECT active FROM webhook_endpoints WHERE id='$OLD_HOOK'")"
  echo "  first Business         $(q "SELECT status FROM merchants WHERE id='$FIRST_MERCHANT'")"
  echo "  test keys active       $(q "SELECT count(*) FROM developer.dev_api_keys WHERE id IN ($(inlist "$TEST_KEYS")) AND status='ACTIVE'")"
  echo "  orphan session         $(q "SELECT status FROM payment_sessions WHERE id='$ORPHAN_SESSION'")"
  echo "  fixture accounts open  $(q "SELECT count(*) FROM wallet_accounts WHERE id IN ($(inlist "$FIXTURE_ACCOUNTS")) AND status<>'CLOSED'") (value $(q "SELECT COALESCE(SUM($(printf "$bal" 'wa.account_id')),0) FROM wallet_accounts wa WHERE wa.id IN ($(inlist "$FIXTURE_ACCOUNTS"))"))"
  echo "  DOA-campaign accounts  $(q "SELECT count(*) FROM wallet_accounts WHERE id IN ($(inlist "$DOA_CAMPAIGN_ACCOUNTS")) AND status<>'CLOSED'") open (value $(q "SELECT COALESCE(SUM($(printf "$bal" 'wa.account_id')),0) FROM wallet_accounts wa WHERE wa.id IN ($(inlist "$DOA_CAMPAIGN_ACCOUNTS"))"))"
  echo "  @doa PRIMARY value     $(q "SELECT $(printf "$bal" 'w.available_account_id') FROM wallets w WHERE w.merchant_id='$DOA_MERCHANT'")"
  echo "  KEPT: project $(q "SELECT status FROM developer.dev_projects WHERE id='$KEEP_PROJECT'"), runtime keys active $(q "SELECT count(*) FROM developer.dev_api_keys WHERE id IN ($(inlist "$KEEP_KEYS")) AND status='ACTIVE'")/2, webhook active=$(q "SELECT active FROM webhook_endpoints WHERE id='$KEEP_HOOK'"), @doa $(q "SELECT m.status||' '||(SELECT handle FROM handle_registry WHERE owner_id=m.id AND handle='doa') FROM merchants m WHERE m.id='$DOA_MERCHANT'"), binding $(q "SELECT state FROM developer.dev_project_sandbox_binding WHERE project_id='$KEEP_PROJECT' AND state='ACTIVE'")"
}

echo "stale DOA tenant state — $(date -u +%FT%TZ)"
echo "BEFORE"; state
[ "$APPLY" -eq 1 ] || { echo; echo "dry run — nothing changed. Re-run with --apply."; exit 0; }

JWTSEC=$(docker exec "$GW" sh -c 'cat /run/secrets/jwt_secret')
DEVKEY=$(docker exec "$DEV" sh -c 'cat /run/secrets/developer_internal_key')
mint(){ SECRET="$JWTSEC" M="$1" node -e 'const c=require("crypto");const b=o=>Buffer.from(typeof o==="string"?o:JSON.stringify(o)).toString("base64url");const n=Math.floor(Date.now()/1000);const cl={merchant_id:process.env.M,scopes:["*"],environment:"SANDBOX",iat:n,exp:n+300};const h=b({alg:"HS256",typ:"JWT"}),p=b(cl);process.stdout.write(h+"."+p+"."+c.createHmac("sha256",process.env.SECRET).update(h+"."+p).digest("base64url"));'; }
core(){ local body='{}'; [ -n "${3:-}" ] && body=$3
  printf '%s' "$body" | docker exec -i "$CORE" curl -s -o /dev/null -w '%{http_code}' -X "$1" -H 'Content-Type: application/json' --data @- "http://localhost:8081$2"; }
gw(){ docker exec "$GW" curl -s -o /dev/null -w '%{http_code}' -X "$1" "http://localhost:8080$2" -H "Authorization: Bearer $(mint "$3")"; }
dev(){ printf '%s' "$2" | docker exec -i -e IK="$DEVKEY" "$DEV" sh -c \
    "curl -s -o /dev/null -w '%{http_code}' -X POST -H \"X-Internal-Key: \$IK\" -H 'Content-Type: application/json' --data @- 'http://localhost:8086$1'"; }
FAILED=0
did(){ case "$2" in 2*|404) echo "  ✓ $1 ($2)";; *) echo "  ✗ $1 → HTTP ${2:-none}"; FAILED=$((FAILED+1));; esac; }
WHY="Sandbox clean slate — owner decision 2026-09-11: not DOA's current canonical state"
RUN="doa-stale-$(date +%s)"

echo; echo "applying"
for k in $TEST_KEYS; do did "revoke test key $k" "$(dev "/internal/v1/fixture-keys/$k/revoke" '{"created_by":"retire-stale-doa-tenant-state"}')"; done
did "cancel orphan session" "$(core POST "/internal/v1/payment-sessions/$ORPHAN_SESSION/cancel" "{\"merchant_id\":\"$DOA_MERCHANT\"}")"
retire_account(){ # account merchant
  did "retire value of $1" "$(core POST /internal/v1/sandbox/retire-funds "{\"owner_type\":\"WALLET_ACCOUNT\",\"owner_id\":\"$1\",\"reason\":\"$WHY\",\"retired_by\":\"retire-stale-doa-tenant-state\",\"idempotency_key\":\"$RUN-wa-$1\"}")"
  did "close $1" "$(core POST "/internal/v1/wallet-accounts/$1/close" "{\"reason\":\"$WHY\",\"closed_by\":\"retire-stale-doa-tenant-state\",\"merchant_id\":\"$2\"}")"
}
for a in $FIXTURE_ACCOUNTS; do retire_account "$a" "$DOA_MERCHANT"; done
if [ "$CAMPAIGNS" -eq 1 ]; then for a in $DOA_CAMPAIGN_ACCOUNTS; do retire_account "$a" "$DOA_MERCHANT"; done; fi
did "retire @doa PRIMARY value" "$(core POST /internal/v1/sandbox/retire-funds "{\"owner_type\":\"MERCHANT\",\"owner_id\":\"$DOA_MERCHANT\",\"reason\":\"$WHY — fees from test settlements\",\"retired_by\":\"retire-stale-doa-tenant-state\",\"idempotency_key\":\"$RUN-doa-primary\"}")"
did "deactivate old Business webhook" "$(gw DELETE "/v1/webhooks/endpoints/$OLD_HOOK" "$OLD_MERCHANT")"
did "retire old project" "$(dev "/internal/v1/projects/$OLD_PROJECT/retire" "{\"reason\":\"$WHY — superseded by Doa-Sandbox\",\"created_by\":\"retire-stale-doa-tenant-state\"}")"
did "retire old Business value" "$(core POST /internal/v1/sandbox/retire-funds "{\"owner_type\":\"MERCHANT\",\"owner_id\":\"$OLD_MERCHANT\",\"reason\":\"$WHY\",\"retired_by\":\"retire-stale-doa-tenant-state\",\"idempotency_key\":\"$RUN-old\"}")"
did "suspend old Business" "$(core POST "/internal/v1/merchants/$OLD_MERCHANT/suspend" '{}')"
did "retire first Business value" "$(core POST /internal/v1/sandbox/retire-funds "{\"owner_type\":\"MERCHANT\",\"owner_id\":\"$FIRST_MERCHANT\",\"reason\":\"$WHY\",\"retired_by\":\"retire-stale-doa-tenant-state\",\"idempotency_key\":\"$RUN-first\"}")"
did "suspend first Business" "$(core POST "/internal/v1/merchants/$FIRST_MERCHANT/suspend" '{}')"

echo; echo "AFTER"; state
[ "$FAILED" -eq 0 ]
