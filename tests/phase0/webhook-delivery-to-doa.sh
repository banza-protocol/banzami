#!/usr/bin/env bash
# REFERENCE_APPLICATION_DOA — an integration test OF DOA, the reference application:
# it acts in DOA's real tenant on purpose, so it runs only when asked
# (BANZAMI_ALLOW_DOA_TENANT_WRITES=1). A generic harness never names DOA —
# it builds a tenant of its own (tests/phase0/lib/synthetic-tenant.sh).
#
# A real operator event, delivered to production DOA (ADR-051 / CAP-WEBHOOK).
#
# Everything before this proved pieces: that DOA verifies a signature we
# construct, that the operator can register an endpoint, that payments land in
# the right account. This closes the loop the integration actually depends on —
# the operator emits `payment_session.paid` because money moved, its outbox
# delivers it over the public internet to https://www.doadoa.app, and DOA
# accepts it.
#
# It does NOT prove the business effect (a confirmed donation), because that
# needs a donation intent, which needs a campaign created through DOA's
# authenticated UI. What it proves is the transport and the signature, which is
# the part that lives in the operator.
set -uo pipefail

DOA_PROJECT="${DOA_PROJECT:-6367749d-ba77-47b6-80bd-982382ddd1c9}"
# Ownership and cleanup. Everything this run creates is recorded by id and
# retired on the way out, however the script exits.
. "$(cd "$(dirname "$0")" && pwd)/lib/e2e-run.sh"
e2e_begin

ACTOR="${ACTOR:-11111111-2222-4333-8444-555555555555}"
DOA_URL="${DOA_URL:-https://www.doadoa.app/api/webhooks/banzami}"

GW=$(docker ps  --format '{{.Names}}' | grep api-gateway-staging | head -1)
PUB=$(docker ps --format '{{.Names}}' | grep public-api-staging  | head -1)
CORE=$(docker ps --format '{{.Names}}'| grep core-api-staging    | head -1)
DEV=$(docker ps --format '{{.Names}}' | grep developer-api       | head -1)
PG=$(docker ps  --format '{{.Names}}' | grep postgres | grep bzsandbox | head -1)
DEVINT=$(docker exec "$DEV" sh -c 'cat /run/secrets/developer_internal_key 2>/dev/null')
JWTSEC=$(docker exec "$GW" sh -c 'cat /run/secrets/jwt_secret 2>/dev/null')
PW=$(docker exec "$CORE" sh -c 'cat /run/secrets/db_url 2>/dev/null' | sed -E 's#.*://[^:]+:([^@]+)@.*#\1#')
psqlro(){ docker exec -e PGPASSWORD="$PW" "$PG" psql -U bl_app_runtime -d banzami_staging -At -c "$1" 2>/dev/null; }

PASS=0; FAIL=0
chk(){ if [ "$2" = "$3" ]; then echo "  $1 PASS ($2)"; PASS=$((PASS+1)); else echo "  $1 FAIL (got '$2' want '$3')"; FAIL=$((FAIL+1)); fi; }
LAST=""; CODE=""
call(){ local ct="$1" port="$2" m="$3" p="$4" bd="$5" au="$6" hdr="${7:-Authorization: Bearer}"
  local a=(curl -s -w $'\n%{http_code}' -X "$m" "http://localhost:$port$p")
  [ "$au" != "-" ] && a+=(-H "$hdr $au")
  local r
  if [ "$bd" = "-" ]; then r=$(docker exec "$ct" "${a[@]}" 2>/dev/null)
  else a+=(-H "Content-Type: application/json" --data @-); r=$(printf '%s' "$bd" | docker exec -i "$ct" "${a[@]}" 2>/dev/null); fi
  CODE=$(printf '%s' "$r" | tail -n1); LAST=$(printf '%s' "$r" | sed '$d'); }
jget(){ printf '%s' "$LAST" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);process.stdout.write(String(j["'"$1"'"]??""))}catch(e){}})'; }
mint(){ SECRET="$JWTSEC" K="$1" V="$2" node -e 'const c=require("crypto");const b=o=>Buffer.from(typeof o==="string"?o:JSON.stringify(o)).toString("base64url");const n=Math.floor(Date.now()/1000);const cl={scopes:["*"],environment:"SANDBOX",iat:n,exp:n+900};cl[process.env.K]=process.env.V;const h=b({alg:"HS256",typ:"JWT"}),p=b(cl);process.stdout.write(h+"."+p+"."+c.createHmac("sha256",process.env.SECRET).update(h+"."+p).digest("base64url"));'; }

R="${RANDOM}${RANDOM}"

echo "### the canonical endpoint is registered and active"
EP=$(psqlro "SELECT id FROM webhook_endpoints WHERE url='$DOA_URL' AND active = true ORDER BY created_at DESC LIMIT 1")
chk ENDPOINT_REGISTERED "$([ -n "$EP" ] && echo yes)" yes
SUBSCRIBED=$(psqlro "SELECT CASE WHEN 'payment_session.paid' = ANY(events) THEN 'yes' ELSE 'no' END FROM webhook_endpoints WHERE id='$EP'")
chk SUBSCRIBED_TO_SESSION_PAID "$SUBSCRIBED" "yes"
[ -n "$EP" ] || exit 1

echo "### a real payment on a DOA campaign account"
call "$DEV" 8086 POST "/internal/v1/projects/$DOA_PROJECT/fixture-keys" \
  "{\"name\":\"wh-deliver-$R\",\"scopes\":[\"payment_sessions:read\",\"payment_sessions:write\",\"wallet_accounts:read\",\"wallet_accounts:create\"],\"created_by\":\"$ACTOR\"}" "$DEVINT" "X-Internal-Key:"
KEY=$(jget secret)
e2e_own fixture_key "$(jget id)"
call "$GW" 8080 POST /v1/wallet-accounts \
  "{\"purpose\":\"CAMPAIGN\",\"reference_type\":\"DOA_CAMPAIGN\",\"reference_id\":\"whdel-$R\",\"label\":\"Delivery probe\"}" "$KEY"
ACCT=$(jget id)
# The payer is onboarded and funded here rather than scavenged from whatever an
# earlier run left behind: with no funded consumer the minted token carries no
# customer_id, the payment answers 401, and every assertion after it fails for a
# reason that has nothing to do with webhook delivery. Funding goes through the
# sanctioned sandbox route, so the operator's pilot aggregate cap still applies.
PH="+2449${R:0:4}91"; H="wd${R:0:5}p"
call "$PUB" 8083 POST /v1/consumer/onboarding/start "{\"phone_number\":\"$PH\",\"currency\":\"AOA\",\"otp_plaintext_for_test\":\"123456\"}" -
SID=$(jget session_id)
call "$PUB" 8083 POST /v1/consumer/onboarding/verify-otp "{\"session_id\":\"$SID\",\"otp_code\":\"123456\"}" -
call "$PUB" 8083 POST /v1/consumer/onboarding/complete "{\"session_id\":\"$SID\",\"banza_handle\":\"$H\",\"pin\":\"1234\"}" -
PAYER=$(jget consumer_id)
[ -n "$PAYER" ] || { echo "payer onboarding failed — the rest would be vacuous"; exit 1; }
CJWT=$(mint customer_id "$PAYER")
call "$GW" 8080 POST /v1/compliance/customers/verify \
  "{\"full_name\":\"WEBHOOK DELIVERY E2E\",\"document_type\":\"BILHETE_DE_IDENTIDADE\",\"document_number\":\"WD$R\",\"date_of_birth\":\"1990-01-01\",\"requested_level\":\"BASIC\"}" "$CJWT"
call "$PUB" 8083 POST /v1/sandbox/fund '{"amount_minor":200000,"currency":"AOA"}' "$CJWT"
[ "$CODE" = "200" ] || { echo "payer funding refused (http=$CODE) — the rest would be vacuous"; exit 1; }
call "$GW" 8080 POST /v1/payment-sessions \
  "{\"wallet_account_id\":\"$ACCT\",\"purpose\":\"DONATION\",\"reference_type\":\"DOA_DONATION\",\"reference_id\":\"whdel-$R\",\"amount_minor\":100000,\"currency\":\"AOA\"}" "$KEY"
SESSION=$(jget session_id)
SLUG=$(printf '%s' "$LAST" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);const i=(j.interfaces||[]).find(x=>x.type==="PAYMENT_LINK");process.stdout.write(i?String(i.value).split("/").filter(Boolean).pop():"")}catch(e){}})')
call "$PUB" 8083 POST "/v1/payment-links/$SLUG/pay" '{"amount_minor":100000}' "$CJWT"
chk PAYMENT_ACCEPTED "$CODE" "200"

echo "### the operator emitted the event"
for i in $(seq 1 10); do
  EVID=$(psqlro "SELECT id FROM webhook_events WHERE event_type='payment_session.paid' AND payload::text LIKE '%$SESSION%' ORDER BY created_at DESC LIMIT 1")
  [ -n "$EVID" ] && break; sleep 3
done
chk EVENT_EMITTED "$([ -n "$EVID" ] && echo yes)" yes

echo "### and delivered it over the public internet to production DOA"
for i in $(seq 1 20); do
  ROW=$(psqlro "SELECT status || '|' || COALESCE(status_code::text,'-') || '|' || COALESCE(attempt_count::text,'-') FROM webhook_deliveries WHERE event_id='$EVID' AND endpoint_id='$EP' ORDER BY created_at DESC LIMIT 1")
  case "$ROW" in success*|SUCCESS*) break;; esac
  # A row that reads PENDING|500 is DOA rejecting a legitimately signed event.
  # Surfaced rather than waited out, because the retry backoff would otherwise
  # make a real failure look like slowness.
  case "$ROW" in *"|500|"*|*"|4"*) echo "  (attempt so far: $ROW)";; esac
  sleep 5
done
echo "  delivery row: ${ROW:-<none>}"
STATUS=$(printf '%s' "$ROW" | cut -d'|' -f1 | tr 'A-Z' 'a-z')
HTTP=$(printf '%s' "$ROW" | cut -d'|' -f2)
chk DELIVERED "$STATUS" "success"
chk DOA_ACCEPTED_200 "$HTTP" "200"

echo "### and a redelivery of the same event is accepted again, not rejected"
# Exactly-once is a property of the RECEIVER. What the OPERATOR can prove from
# here is the half it owns: it really did redeliver the same event, and DOA
# answered 200 again rather than erroring on a duplicate — an integration that
# 500s on a retry is one the operator will keep retrying forever.
#
# The other half — that a second copy creates no second donation — is a fact
# about DOA's database, which this harness cannot read. It is covered by DOA's
# own dedup tests against a real database (apply-payment-event), run in DOA CI.
# Scraping a public page would not close it either: the campaign accounts here
# are synthetic and have no public campaign behind them. Asserting only what is
# actually observable from this side is the honest scope.
DID=$(psqlro "SELECT id FROM webhook_deliveries WHERE event_id='$EVID' AND endpoint_id='$EP' ORDER BY created_at DESC LIMIT 1")
chk REPLAY_TARGET_FOUND "$([ -n "$DID" ] && echo yes)" yes
EPMID=$(psqlro "SELECT merchant_id FROM webhook_endpoints WHERE id='$EP'")
MJWT=$(mint merchant_id "$EPMID")

A0=$(psqlro "SELECT attempt_count FROM webhook_deliveries WHERE id='$DID'")
REPLAY_CODES=""
for i in 1 2 3; do
  call "$GW" 8080 POST "/v1/webhooks/deliveries/$DID/replay" - "$MJWT"
  REPLAY_CODES="$REPLAY_CODES$CODE "
  sleep 6
done
echo "  replay responses: $REPLAY_CODES"
chk REPLAY_ACCEPTED "$(printf '%s' "$REPLAY_CODES" | grep -cE '20[0-9]')" "1"

for i in $(seq 1 12); do
  ROW2=$(psqlro "SELECT status || '|' || COALESCE(status_code::text,'-') || '|' || COALESCE(attempt_count::text,'-') FROM webhook_deliveries WHERE id='$DID'")
  A2=$(printf '%s' "$ROW2" | cut -d'|' -f3)
  case "$ROW2" in success*|SUCCESS*) [ "${A2:-0}" -gt "${A0:-0}" ] && break;; esac
  sleep 5
done
echo "  after replay: ${ROW2:-<none>} (attempts before: ${A0:-?})"
chk REDELIVERED_AND_ACCEPTED "$(printf '%s' "$ROW2" | cut -d'|' -f1 | tr 'A-Z' 'a-z')|$(printf '%s' "$ROW2" | cut -d'|' -f2)" "success|200"
chk ATTEMPTS_INCREASED "$([ "${A2:-0}" -gt "${A0:-0}" ] && echo yes)" yes
# Replay must re-queue the existing delivery, never create a second row: the
# table is UNIQUE on (event_id, endpoint_id), and inserting was how replay used
# to answer 500 for every real delivery.
NROWS=$(psqlro "SELECT COUNT(*) FROM webhook_deliveries WHERE event_id='$EVID' AND endpoint_id='$EP'")
chk REPLAY_REUSES_ONE_ROW "$NROWS" "1"

echo
echo "WEBHOOK_DELIVERY_TO_DOA: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
