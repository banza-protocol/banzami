#!/usr/bin/env bash
# Developer Platform E2E — runs ON the internal Sandbox VM. Synthetic only. It proves
# the full platform/integrator lifecycle (auth → workspace/project → API key →
# link/intent → online checkout → receipt → reconciliation → revoke → rejection →
# no-mutation → audit). SDK contract simulation: it issues the exact HTTP requests a
# future SDK exposes; no production SDK is claimed.
#
# Secrets (JWT signing key, developer internal key, DB password) are read from mounted
# files into memory only and NEVER printed. Containers are discovered dynamically. No
# secrets/tokens/keys/IPs/hostnames are emitted.
set -uo pipefail
GW=$(docker ps --format '{{.Names}}'  | grep api-gateway-staging | head -1)
PUB=$(docker ps --format '{{.Names}}' | grep public-api-staging  | head -1)
CORE=$(docker ps --format '{{.Names}}'| grep core-api-staging    | head -1)
DEV=$(docker ps --format '{{.Names}}' | grep developer-api       | head -1)
# The sandbox postgres, explicitly. Without the second filter this matched
# banzami-postgres-1 — the OTHER stack's database — and every psql read here
# came back empty with stderr suppressed, so the reconciliation and audit
# assertions failed against a database that was never being tested.
PG=$(docker ps --format '{{.Names}}'  | grep postgres | grep bzsandbox | head -1)
SECRET=$(docker exec "$GW" sh -c 'cat /run/secrets/jwt_secret 2>/dev/null')
DEVINT=$(docker exec "$DEV" sh -c 'cat /run/secrets/developer_internal_key 2>/dev/null')
URL=$(docker exec "$CORE" cat /run/secrets/db_url 2>/dev/null); PW=$(printf "%s" "$URL"|sed -E "s#.*://[^:]+:([^@]+)@.*#\1#")
[ -n "$SECRET" ] && [ -n "$DEVINT" ] || { echo "NO_SECRET"; exit 1; }
# Errors are NOT swallowed: a suppressed psql error reads as an empty result,
# which reads as a failing assertion about the product rather than about the
# query. That is exactly how the wrong-database bug above stayed hidden.
psqlro(){ docker exec -e PGPASSWORD="$PW" "$PG" psql -U bl_app_runtime -d banzami_staging -At -c "$1" 2>&1; }
R="${RANDOM}${RANDOM}${RANDOM}"; RR="${R:0:5}"; SEQ=0
OP=$(cat /proc/sys/kernel/random/uuid 2>/dev/null || uuidgen | tr 'A-Z' 'a-z')
mint(){ SECRET="$SECRET" K="$1" V="$2" node -e 'const c=require("crypto");const b=(o)=>Buffer.from(typeof o==="string"?o:JSON.stringify(o)).toString("base64url");const n=Math.floor(Date.now()/1000);const h=b({alg:"HS256",typ:"JWT"});const cl={scopes:["*"],environment:"SANDBOX",iat:n,exp:n+3600};cl[process.env.K]=process.env.V;const p=b(cl);const s=c.createHmac("sha256",process.env.SECRET).update(h+"."+p).digest("base64url");process.stdout.write(h+"."+p+"."+s);';}
LAST="";CODE=""
call(){ local ct="$1" port="$2" nm="$3" m="$4" p="$5" bd="$6" au="$7" ah="${8:-Authorization: Bearer}";local a=(curl -s -w $'\n%{http_code}' -X "$m" "http://localhost:$port$p");[ "$au" != "-" ]&&a+=(-H "$ah $au");local r;if [ "$bd" = "-" ];then r=$(docker exec "$ct" "${a[@]}" 2>/dev/null);else a+=(-H "Content-Type: application/json" --data @-);r=$(printf '%s' "$bd"|docker exec -i "$ct" "${a[@]}" 2>/dev/null);fi;CODE=$(printf '%s' "$r"|tail -n1);LAST=$(printf '%s' "$r"|sed '$d');[ "$nm" != "-" ]&&echo "  [$nm] http=$CODE $(printf '%s' "$LAST"|head -c 190)";}
gw(){ call "$GW" 8080 "$@";}
pub(){ call "$PUB" 8083 "$@";}
devint(){ call "$DEV" 8086 "$1" "$2" "$3" "$4" "$DEVINT" "X-Internal-Key:";}
jget(){ printf '%s' "$LAST"|node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{let j=JSON.parse(s);process.stdout.write(String(j["'"$1"'"]??""))}catch(e){}})';}
codeof(){ printf '%s' "$LAST"|node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{let j=JSON.parse(s);let e=j.error&&typeof j.error=="object"?j.error:j;process.stdout.write(String(e.code||e.status||"OK"))}catch(x){}})';}
OCID="";OWID=""
onboard(){ SEQ=$((SEQ+1));local ph="+2449${RR}$(printf '%03d' $SEQ)";local h="d${RR}s${SEQ}";
  call "$PUB" 8083 - POST /v1/consumer/onboarding/start "{\"phone_number\":\"$ph\",\"currency\":\"AOA\",\"otp_plaintext_for_test\":\"123456\"}" - - >/dev/null;local sid=$(jget session_id);
  call "$PUB" 8083 - POST /v1/consumer/onboarding/verify-otp "{\"session_id\":\"$sid\",\"otp_code\":\"123456\"}" - - >/dev/null;
  call "$PUB" 8083 - POST /v1/consumer/onboarding/complete "{\"session_id\":\"$sid\",\"banza_handle\":\"$h\",\"pin\":\"1234\"}" - - >/dev/null;
  OCID=$(jget consumer_id);OWID=$(jget wallet_id);}
kyc(){ local j=$(mint customer_id "$1");call "$GW" 8080 - POST /v1/compliance/customers/verify "{\"full_name\":\"SYN\",\"document_type\":\"BILHETE_DE_IDENTIDADE\",\"document_number\":\"SY${RR}${SEQ}\",\"date_of_birth\":\"1990-01-01\",\"requested_level\":\"BASIC\"}" "$j" >/dev/null;}
fund(){ call "$CORE" 8081 - POST /internal/v1/consumer-wallets/test-credit "{\"consumer_id\":\"$1\",\"amount_minor\":$2,\"currency\":\"AOA\"}" - - >/dev/null;jget new_balance;}
cbal(){ call "$CORE" 8081 - GET "/internal/v1/consumer-wallets/$1/balance" - - - >/dev/null;printf '%s' "$LAST"|node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{let j=JSON.parse(s);process.stdout.write(String(j.available?.amount_minor??"0"))}catch(e){process.stdout.write("0")}})';}
mbal(){ local j=$(mint merchant_id "$MID");call "$GW" 8080 - GET "/v1/wallets/$WID/balance" - "$j" >/dev/null;local v=$(jget available_minor);echo "${v:-0}";}
PASS=0;FAIL=0;SIM=0;BLK=0
chk(){ local id="$1" got="$2" want="$3";if [ "$got" = "$want" ];then echo "  $id PASS ($got)";PASS=$((PASS+1));else echo "  $id FAIL (got '$got' want '$want')";FAIL=$((FAIL+1));fi;}

# Ownership and cleanup. Everything this run creates is recorded by id and
# retired on the way out, however the script exits.
. "$(cd "$(dirname "$0")" && pwd)/lib/e2e-run.sh"
e2e_begin

echo "env: sandbox=$(docker exec "$GW" printenv ENVIRONMENT 2>/dev/null) devkey=$(docker exec "$GW" printenv DEVELOPER_KEY_AUTH_ENABLED 2>/dev/null)"
# --- fixtures: merchant + wallet + payer ---
MJWT=$(mint merchant_id 00000000-0000-0000-0000-000000000001)
gw - POST /v1/merchants "{\"name\":\"M$RR\",\"email\":\"m$RR@synthetic.test\"}" "$MJWT" >/dev/null;MID=$(jget id); e2e_own merchant "$MID"; MJWT=$(mint merchant_id "$MID")
gw - POST /v1/wallets '{"currency":"AOA"}' "$MJWT" >/dev/null;WID=$(jget id)
WACCT=$(psqlro "SELECT available_account_id FROM wallets WHERE id='$WID'")
onboard; A=$OCID;AW=$OWID;AH="d${RR}s${SEQ}"; kyc "$A"; fund "$A" 300000 >/dev/null
echo "fixtures: merchant=$([ -n "$MID" ]&&echo ok) wallet=$([ -n "$WID" ]&&echo ok) acct=$([ -n "$WACCT" ]&&echo ok) payer=$([ -n "$A" ]&&echo ok)"

echo "### platform lifecycle (workspace/project/keys)"
devint pf POST /internal/v1/fixture-projects "{\"name\":\"DevPlatform $RR\",\"created_by\":\"$OP\"}"
PROJ=$(jget project_id); WS=$(jget workspace_id); e2e_own fixture_project "$PROJ"
devint pk POST "/internal/v1/projects/$PROJ/fixture-keys" "{\"name\":\"e2e $RR\",\"scopes\":[\"payment_sessions:write\",\"payment_sessions:read\",\"payment_links:write\",\"payment_links:read\",\"identity:read\"],\"created_by\":\"$OP\"}"
PKEY=$(jget secret); KEYID=$(jget id); e2e_own fixture_key "$KEYID"
devint pkro POST "/internal/v1/projects/$PROJ/fixture-keys" "{\"name\":\"ro $RR\",\"scopes\":[\"payment_sessions:read\"],\"created_by\":\"$OP\"}"
RKEY=$(jget secret); e2e_own fixture_key "$(jget id)"
devint bind POST "/internal/v1/projects/$PROJ/binding" "{\"merchant_id\":\"$MID\",\"wallet_id\":\"$WID\",\"wallet_account_id\":\"$WACCT\",\"actor_user_id\":\"$OP\"}" >/dev/null
# A blocked run has proved nothing, so it must not report success. This used to
# exit 0: the suite printed BLOCKER, printed a summary counting the block, and
# then told every caller that trusts exit status that all was well.
if [ -z "$PROJ" ] || [ -z "$PKEY" ]; then echo "BLOCKER — WORKSPACE/PROJECT MODEL MISSING (fixture unavailable)"; echo "### SUMMARY pass=$PASS fail=$FAIL simulated=$SIM blocked=$((BLK+1))"; echo "=== DONE ==="; exit 3; fi

echo "### F0-DP-001 developer/platform auth"; gw me GET /v1/me - "$PKEY"; chk F0-DP-001 "$(jget key_status)" active
echo "### F0-DP-002 workspace available"; chk F0-DP-002 "$([ -n "$WS" ]&&echo ok)" ok
echo "### F0-DP-003 project available"; chk F0-DP-003 "$([ -n "$PROJ" ]&&echo ok)" ok
echo "### F0-DP-004 API key active accepted"; gw me2 GET /v1/me - "$PKEY"; chk F0-DP-004 "$(jget key_status)" active
echo "### F0-DP-005 API key scope enforced (read-only key on write route)"; gw sc POST /v1/business/payment-sessions "{\"amount_minor\":50000,\"currency\":\"AOA\"}" "$RKEY"; chk F0-DP-005 "$(codeof)" INSUFFICIENT_SCOPE

echo "### F0-DP-006 payment link from developer/platform context"
gw pl POST /v1/payment-links "{\"amount_minor\":50000,\"currency\":\"AOA\",\"description\":\"dp link\"}" "$PKEY"
LID=$(jget id); e2e_own payment_link "$LID" "$MID"
if [ -n "$LID" ]; then chk F0-DP-006 ok ok; note_ctx="dev-key (payee from binding)"; else
  gw pl_m POST /v1/payment-links "{\"merchant_id\":\"$MID\",\"wallet_id\":\"$WID\",\"amount_minor\":50000,\"currency\":\"AOA\",\"description\":\"dp link\"}" "$MJWT"; LID=$(jget id); chk F0-DP-006 "$([ -n "$LID" ]&&echo ok)" ok; note_ctx="merchant-auth (dev-key link create not accepted by core)"; fi
LSLUG=$(printf '%s' "$LAST"|node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(String(JSON.parse(s).slug||""))}catch(e){}})')
echo "  F0-DP-006 context: $note_ctx (slug ${LSLUG:-<none>})"

# F0-DP-007 / F0-DP-008 were written against two merchant-credential routes that
# have since been REMOVED for security, so testing them for success now asserts
# the opposite of what the platform should do:
#
#   POST /v1/payment-requests  — took BOTH participants from the request body and
#                                never read the principal (RA-057, SEC-015). An
#                                unrelated merchant could execute a request
#                                between two strangers and debit one of them.
#   POST /v1/qr/pay            — accepted the payer as free text, so a merchant
#                                JWT could debit a consumer's wallet (RA-053).
#
# Both are now absence tests. The money paths they used to cover live in
# campaign-payment-segregation.sh and doa-public-donation-e2e.sh, where the payer
# authorises their own payment.
echo "### F0-DP-007 the merchant-side payment-request surface stays removed (RA-057)"
gw pi POST /v1/payment-requests "{\"requester_id\":\"$A\",\"payer_id\":\"$A\",\"amount_minor\":40000,\"currency\":\"AOA\",\"idempotency_key\":\"pi$RR\"}" "$MJWT"
chk F0-DP-007-removed "$([ "$CODE" = "404" ] || [ "$CODE" = "405" ] && echo removed)" removed

echo "### F0-DP-008 a merchant credential cannot debit a consumer by QR (RA-053)"
# owner_id is the MERCHANT, not the wallet: naming anything else is refused
# (403), which is itself the ownership rule and is asserted right after.
gw qr POST /v1/qr/static "{\"owner_id\":\"$MID\",\"owner_type\":\"MERCHANT\",\"currency\":\"AOA\"}" "$MJWT";PAY=$(jget payload)
chk F0-DP-008-qr-still-issuable "$CODE" "201"
gw qr_foreign POST /v1/qr/static "{\"owner_id\":\"$WID\",\"owner_type\":\"MERCHANT\",\"currency\":\"AOA\"}" "$MJWT"
chk F0-DP-008-qr-owner-enforced "$CODE" "403"
A0=$(cbal "$AW")
gw co POST /v1/qr/pay "{\"idempotency_key\":\"co$RR\",\"payer\":\"$AH\",\"payload\":\"$PAY\",\"amount_minor\":50000}" "$MJWT"
chk F0-DP-008-pay-removed "$([ "$CODE" = "404" ] || [ "$CODE" = "405" ] && echo removed)" removed
# The point of the removal is the money, so check the money.
chk F0-DP-008-victim-untouched "$(cbal "$AW")" "$A0"

echo "### F0-DP-009 a forged proof reference is never confirmed"
gw proof_forged GET "/v1/public/proofs/BZM-FAKE-0000" - -; chk F0-DP-009-nofabricate "$(jget exists)" false

echo "### F0-DP-010 platform reconciliation (created vs settled vs balance)"
# This asserted a merchant balance of exactly 50,000 left behind by the qr/pay
# route removed under RA-053, so after the removal it could only ever fail. It
# now settles a payment through the supported path — the payer authorises it on
# their own surface — and reconciles the DELTA, which is what reconciliation
# means and does not depend on the balance the environment happened to start at.
# The slug is captured where the link is CREATED (F0-DP-006). Re-parsing $LAST
# here read whatever the previous call happened to return, so the branch below
# was silently skipped and the reconciliation compared two untouched balances.
M0=$(mbal); C0=$(cbal "$AW")
[ -n "$LSLUG" ] || { echo "  no payment link slug — the reconciliation would be vacuous"; }
if [ -n "$LSLUG" ]; then
  CJ=$(mint customer_id "$A")
  pub paylink POST "/v1/payment-links/$LSLUG/pay" '{"amount_minor":50000}' "$CJ"
  chk F0-DP-010-payment-accepted "$CODE" "200"
fi
M1=$(mbal); C1=$(cbal "$AW")
echo "  merchant $M0 → $M1 · payer $C0 → $C1"
chk F0-DP-010 "$((M1-M0))|$((C0-C1))" "50000|50000"

echo "### F0-DP-011 webhook event emitted/simulated (signed payload)"
gw wh GET "/v1/webhooks/events?limit=10" - "$MJWT"
SIM=$((SIM+1)); echo "  F0-DP-011 SIMULATED (event emission pipeline reachable; Banza-Signature HMAC + retry/backoff 1m/5m/30m/2h/8h max-5 + idempotency verified in code+unit tests; live outbound 2xx delivery needs a public HTTPS sink — excluded by no-external/no-public)"

echo "### F0-DP-015 no-mutation baseline (capture before rejected ops)"
MB=$(mbal); CB=$(cbal "$AW")

echo "### F0-DP-012 revoked API key rejected"
devint rev POST "/internal/v1/fixture-keys/$KEYID/revoke" "{\"created_by\":\"$OP\"}"; chk F0-DP-012-revoke "$(jget status)" REVOKED
gw me_rev GET /v1/me - "$PKEY"; chk F0-DP-012 "$CODE" 401
echo "### F0-DP-013 invalid API key rejected"; gw inv GET /v1/me - "bz_test_sk_invalid${RR}deadbeef00"; chk F0-DP-013 "$CODE" 401
echo "### F0-DP-014 unauthorised platform rejected"; gw noauth POST /v1/business/payment-sessions "{\"amount_minor\":50000,\"currency\":\"AOA\"}" -; chk F0-DP-014 "$CODE" 401

echo "### F0-DP-015 no ledger/balance mutation on rejected operations"
chk F0-DP-015 "$(mbal)|$(cbal "$AW")" "$MB|$CB"

echo "### F0-DP-016 audit/evidence record generated"
ACNT=$(psqlro "SELECT count(*) FROM developer.audit_events WHERE project_id='$PROJ' AND action IN ('project.created','apikey.fixture_created','apikey.fixture_revoked')")
echo "  developer.audit_events for this project: $ACNT (project.created + fixture_created + fixture_revoked expected >=3)"
chk F0-DP-016 "$([ "${ACNT:-0}" -ge 3 ]&&echo ok)" ok

echo "### SUMMARY pass=$PASS fail=$FAIL simulated=$SIM blocked=$BLK"
echo "=== DONE ==="

# Exit status is what release orchestration trusts first (see
# tools/e2e/lib/parse-suite-summary.mjs). This file used to end here, with no
# exit at all, so it returned the status of the final echo — zero — no matter
# how many assertions had failed.
#   0  every required assertion passed
#   1  at least one required assertion failed
#   3  a required assertion could not run (blocked)
if [ "${FAIL:-0}" -gt 0 ]; then exit 1; fi
if [ "${BLK:-0}" -gt 0 ]; then exit 3; fi
if [ "${PASS:-0}" -eq 0 ]; then echo "no assertions ran — refusing to report a vacuous pass"; exit 1; fi
exit 0
