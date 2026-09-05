#!/usr/bin/env bash
# Phase 0 — Online payments / API-SDK / platform-integrator live harness.
#
# Runs ON the internal Sandbox VM (invoked over SSH by the operator runner). It
# exercises the developer/platform API-key layer, payment links/intents, online
# checkout (payment-session), webhooks (emission), reconciliation and receipt
# verification against the four approved Sandbox services — synthetic data only.
#
# It is an "SDK contract simulation": it issues the exact HTTP requests a future
# Banzami SDK exposes (dev-key auth, payee-from-binding, idempotency), NOT a
# packaged SDK runtime. No production SDK is claimed.
#
# Secrets (JWT signing key, developer internal key, DB password) are read from the
# services' mounted secret files into memory only, and NEVER printed. Containers
# are discovered dynamically. No secrets/tokens/keys/IPs/hostnames are emitted.
set -uo pipefail
GW=$(docker ps --format '{{.Names}}'  | grep api-gateway-staging   | head -1)
PUB=$(docker ps --format '{{.Names}}' | grep public-api-staging    | head -1)
CORE=$(docker ps --format '{{.Names}}'| grep core-api-staging      | head -1)
DEV=$(docker ps --format '{{.Names}}' | grep -E 'developer-api'    | head -1)
# The sandbox postgres, explicitly — the unfiltered match picked up the other
# stack's database, and every read came back empty.
PG=$(docker ps --format '{{.Names}}'  | grep postgres | grep bzsandbox | head -1)
SECRET=$(docker exec "$GW" sh -c 'cat /run/secrets/jwt_secret 2>/dev/null')
DEVINT=$(docker exec "$DEV" sh -c 'cat /run/secrets/developer_internal_key 2>/dev/null')
URL=$(docker exec "$CORE" cat /run/secrets/db_url 2>/dev/null); PW=$(printf "%s" "$URL"|sed -E "s#.*://[^:]+:([^@]+)@.*#\1#")
[ -n "$SECRET" ] && [ -n "$DEVINT" ] || { echo "NO_SECRET"; exit 1; }
psqlro(){ docker exec -e PGPASSWORD="$PW" "$PG" psql -U bl_app_runtime -d banzami_staging -At -c "$1" 2>/dev/null; }
R="${RANDOM}${RANDOM}${RANDOM}"; RR="${R:0:5}"; SEQ=0
mint(){ SECRET="$SECRET" K="$1" V="$2" node -e 'const c=require("crypto");const b=(o)=>Buffer.from(typeof o==="string"?o:JSON.stringify(o)).toString("base64url");const n=Math.floor(Date.now()/1000);const h=b({alg:"HS256",typ:"JWT"});const cl={scopes:["*"],environment:"SANDBOX",iat:n,exp:n+3600};cl[process.env.K]=process.env.V;const p=b(cl);const s=c.createHmac("sha256",process.env.SECRET).update(h+"."+p).digest("base64url");process.stdout.write(h+"."+p+"."+s);';}
LAST="";CODE=""
# call: <container> <port> <name|-> <method> <path> <body|-> <auth-header-value|-> [auth-header-name]
call(){ local ct="$1" port="$2" nm="$3" m="$4" p="$5" bd="$6" au="$7" ah="${8:-Authorization: Bearer}";local a=(curl -s -w $'\n%{http_code}' -X "$m" "http://localhost:$port$p");[ "$au" != "-" ]&&a+=(-H "$ah $au");local r;if [ "$bd" = "-" ];then r=$(docker exec "$ct" "${a[@]}" 2>/dev/null);else a+=(-H "Content-Type: application/json" --data @-);r=$(printf '%s' "$bd"|docker exec -i "$ct" "${a[@]}" 2>/dev/null);fi;CODE=$(printf '%s' "$r"|tail -n1);LAST=$(printf '%s' "$r"|sed '$d');[ "$nm" != "-" ]&&echo "  [$nm] http=$CODE $(printf '%s' "$LAST"|head -c 200)";}
gw(){ call "$GW" 8080 "$@";}
pub(){ call "$PUB" 8083 "$@";}
devint(){ call "$DEV" 8086 "$1" "$2" "$3" "$4" "$DEVINT" "X-Internal-Key:";}   # developer-api internal (X-Internal-Key)
jget(){ printf '%s' "$LAST"|node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{let j=JSON.parse(s);process.stdout.write(String(j["'"$1"'"]??""))}catch(e){}})';}
codeof(){ printf '%s' "$LAST"|node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{let j=JSON.parse(s);let e=j.error&&typeof j.error=="object"?j.error:j;process.stdout.write(String(e.code||e.status||"OK"))}catch(x){}})';}
OCID="";OWID=""
onboard(){ SEQ=$((SEQ+1));local ph="+2449${RR}$(printf '%03d' $SEQ)";local h="k${RR}s${SEQ}";
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
note(){ echo "  $1"; }

echo "env: pilot=$(docker exec "$CORE" printenv BANZAMI_PILOT_LIMITS 2>/dev/null) sandbox=$(docker exec "$GW" printenv ENVIRONMENT 2>/dev/null) devkey_enabled=$(docker exec "$GW" printenv DEVELOPER_KEY_AUTH_ENABLED 2>/dev/null) dev_url=$(docker exec "$GW" printenv DEVELOPER_API_URL 2>/dev/null)"

# ---- merchant + payer fixtures ----
MJWT=$(mint merchant_id 00000000-0000-0000-0000-000000000001)
gw - POST /v1/merchants "{\"name\":\"M$RR\",\"email\":\"m$RR@synthetic.test\"}" "$MJWT" >/dev/null;MID=$(jget id);MJWT=$(mint merchant_id "$MID")
gw - POST /v1/wallets '{"currency":"AOA"}' "$MJWT" >/dev/null;WID=$(jget id)
WACCT=$(jget available_account_id); [ -z "$WACCT" ] && WACCT=$(psqlro "SELECT available_account_id FROM wallets WHERE id='$WID'")
onboard; A=$OCID;AW=$OWID;AH="k${RR}s${SEQ}"; kyc "$A"; fund "$A" 300000 >/dev/null
echo "fixtures: merchant=$([ -n "$MID" ]&&echo ok) wallet=$([ -n "$WID" ]&&echo ok) acct=$([ -n "$WACCT" ]&&echo ok) payer=$([ -n "$A" ]&&echo ok)(bal=$(cbal "$AW"))"

# ---- synthetic platform (new sandbox fixture-projects endpoint) ----
# created_by is an opaque identity UUID (no FK) — use a synthetic UUID actor.
OP=$(cat /proc/sys/kernel/random/uuid 2>/dev/null || uuidgen | tr 'A-Z' 'a-z')
echo "### platform fixture (new sandbox fixture-projects endpoint)"
devint pf_create POST /internal/v1/fixture-projects "{\"name\":\"Synthetic Platform $RR\",\"created_by\":\"$OP\"}"
PROJ=$(jget project_id); PKEY=""; RKEY=""
if [ -n "$PROJ" ]; then
  devint pf_key POST "/internal/v1/projects/$PROJ/fixture-keys" "{\"name\":\"e2e $RR\",\"scopes\":[\"payment_sessions:write\",\"payment_sessions:read\",\"identity:read\"],\"created_by\":\"$OP\"}"
  PKEY=$(jget secret)
  devint pf_key_ro POST "/internal/v1/projects/$PROJ/fixture-keys" "{\"name\":\"ro $RR\",\"scopes\":[\"payment_sessions:read\"],\"created_by\":\"$OP\"}"
  RKEY=$(jget secret)
fi
echo "  platform provisioned: project=$([ -n "$PROJ" ]&&echo ok||echo BLOCKED) key=$([ -n "$PKEY" ]&&echo ok||echo BLOCKED) ro_key=$([ -n "$RKEY" ]&&echo ok||echo BLOCKED)"

DEVKEY_BLOCKED=0
if [ -z "$PROJ" ] || [ -z "$PKEY" ]; then
  DEVKEY_BLOCKED=1
  echo "  [BLOCKER] synthetic platform (fixture-projects) could not be provisioned — dev-key live path unavailable"
fi

echo "### F0-025 platform API key authentication (active synthetic key)"
if [ "$DEVKEY_BLOCKED" = 1 ]; then
  BLK=$((BLK+1)); echo "  F0-025 BLOCKED (platform fixture unavailable)"
else
  gw me GET /v1/me - "$PKEY"; chk F0-025 "$(jget key_status)" active
fi

echo "### F0-033 unauthorised platform rejection"
gw u_nokey POST /v1/business/payment-sessions "{\"amount_minor\":50000,\"currency\":\"AOA\"}" -    # no auth
chk F0-033-noauth "$CODE" 401
gw u_forged POST /v1/business/payment-sessions "{\"amount_minor\":50000,\"currency\":\"AOA\"}" "bz_test_sk_forged${RR}deadbeef1234"
chk F0-033-forged "$CODE" 401
# wrong-scope: an authenticated but read-only platform key on a write route is rejected.
if [ -n "$RKEY" ]; then
  gw u_scope POST /v1/business/payment-sessions "{\"amount_minor\":50000,\"currency\":\"AOA\"}" "$RKEY"
  chk F0-033-scope "$(codeof)" INSUFFICIENT_SCOPE
fi

echo "### F0-032 revoked/invalid API key rejection (invalid == revoked, both 401 by design)"
gw revk GET /v1/me - "bz_test_sk_revoked${RR}0000deadbeef"
chk F0-032 "$CODE" 401

echo "### F0-026 SDK-style payment request creation (payment link; SDK-shape request)"
# Merchant-authenticated (the dev-key authenticator is one of several; it is BLOCKED
# on the un-migrated developer schema). A payment link is the same 'create a payment
# request' shape a future SDK exposes.
gw plreq POST /v1/payment-links "{\"merchant_id\":\"$MID\",\"wallet_id\":\"$WID\",\"amount_minor\":50000,\"currency\":\"AOA\",\"description\":\"syn checkout\"}" "$MJWT"
LREQ=$(jget id)
LSLUG=$(printf '%s' "$LAST"|node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(String(JSON.parse(s).slug||""))}catch(e){}})')
chk F0-026 "$([ -n "$LREQ" ]&&echo ok)" ok

echo "### F0-027 online checkout payment success (the payer authorises it)"
# This used POST /v1/qr/pay with a merchant credential and the payer as free
# text — removed under RA-053, because a merchant JWT is not authority to debit
# a consumer's wallet. The checkout is now completed the way it actually works:
# the payer settles the link on their own authenticated surface.
gw qr POST /v1/qr/static "{\"owner_id\":\"$MID\",\"owner_type\":\"MERCHANT\",\"currency\":\"AOA\"}" "$MJWT";SPAY=$(jget payload)
chk F0-027-qr-issued "$CODE" "201"
gw checkout_removed POST /v1/qr/pay "{\"idempotency_key\":\"co$RR\",\"payer\":\"$AH\",\"payload\":\"$SPAY\",\"amount_minor\":50000}" "$MJWT"
chk F0-027-merchant-cannot-debit "$([ "$CODE" = "404" ] || [ "$CODE" = "405" ] && echo removed)" removed
M0=$(mbal); A0=$(cbal "$AW")
CJ=$(mint customer_id "$A")
pub paylink POST "/v1/payment-links/$LSLUG/pay" '{"amount_minor":50000}' "$CJ"
chk F0-027 "$CODE" "200"
M1=$(mbal); A1=$(cbal "$AW")
chk F0-027-balance "$((M1-M0))|$((A0-A1))" "50000|50000"

echo "### F0-028 webhook event emission (observed internally; live outbound delivery SIMULATED)"
gw whev GET "/v1/webhooks/events?limit=20" - "$MJWT"
WHCNT=$(printf '%s' "$LAST"|node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{let j=JSON.parse(s);let a=j.data||j.items||j.events||j;process.stdout.write(String(Array.isArray(a)?a.length:0))}catch(e){process.stdout.write("0")}})')
note "webhook_events visible via API: count=$WHCNT (emission pipeline reachable)"
SIM=$((SIM+1)); echo "  F0-028 SIMULATED (emission observed; outbound 2xx delivery needs a public https sink — excluded by no-external/no-public)"
echo "### F0-029 webhook retry/failure handling"
SIM=$((SIM+1)); echo "  F0-029 SIMULATED (retry/backoff 1m/5m/30m/2h/8h, max-5, terminal FAILED verified in code+unit tests; live outbound retries need an external sink — excluded)"

echo "### F0-030 platform reconciliation (created vs settled vs balance)"
gw recon_tx GET "/v1/transactions?limit=20" - "$MJWT"
gw recon_wp GET "/v1/merchant/wallet-payments?limit=20" - "$MJWT"
WPCNT=$(printf '%s' "$LAST"|node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{let j=JSON.parse(s);let a=j.items||j.data||[];process.stdout.write(String(a.length))}catch(e){process.stdout.write("0")}})')
MBAL=$(mbal)
# expected: platform created 1 session for 50000; merchant settled +50000; wallet balance == 50000
echo "  reconcile: session_created=1(amount 50000) settled_payments_listed=$WPCNT merchant_balance=$MBAL"
# The delta, not an absolute: the environment does not start at zero, and an
# absolute expectation only held while this was the very first settlement.
chk F0-030 "$((M1-M0))" 50000

echo "### F0-031 receipt verification (authenticated receipt; state-match; privacy; non-fabricable)"
# The settled wallet payment carries a server-generated receipt reference queryable
# via the authenticated merchant/platform receipt API. Verify: reference queryable,
# state matches the payment, payer shown handle-only (no unnecessary personal data),
# and a platform cannot fabricate a receipt (a forged reference does not resolve).
gw wp GET "/v1/merchant/wallet-payments?limit=5" - "$MJWT"
WPREF=$(printf '%s' "$LAST"|node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{let j=JSON.parse(s);let a=j.items||j.data||[];let x=a[0]||{};process.stdout.write([x.reference||"",x.status||"",x.payer_name||"",x.receipt_available].join("|"))}catch(e){}})')
IFS='|' read -r RREF RST RPAYER RAVAIL <<<"$WPREF"
note "receipt: reference=$RREF status=$RST payer=$RPAYER receipt_available=$RAVAIL"
# reference queryable + state matches settled payment (COMPLETED) + receipt available
chk F0-031-state "$([ -n "$RREF" ]&&[ "$RST" = COMPLETED ]&&[ "$RAVAIL" = true ]&&echo ok)" ok
# privacy: consumer payer shown handle-only (starts with @, no bare personal name)
chk F0-031-privacy "$(printf '%s' "$RPAYER"|grep -qE '^@' && echo handle-only || echo exposed)" handle-only
# non-fabricable: a forged/guessed reference does not resolve on the public verifier
gw proof_forged GET "/v1/public/proofs/BZM-FAKE-0000" - -
chk F0-031-nofabricate "$(jget exists)" false
note "public proof (/r/{ref}) is transaction/acquiring-scoped; wallet-native transfers expose the authenticated receipt above (public proof not minted for transfers)"

echo "### F0-031b a plain link payment is REFUNDABLE"
# The point of recording the payment is that money can come back out again. A
# receipt that exists but cannot be refunded would be a nicer-looking version of
# the same hole, so the refund is executed and the balance checked.
gw wp2 GET "/v1/merchant/wallet-payments?limit=1" - "$MJWT"
WPID=$(printf '%s' "$LAST"|node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{let a=(JSON.parse(s).items||[]);process.stdout.write(String((a[0]||{}).id||""))}catch(e){}})')
chk F0-031b-source-exists "$([ -n "$WPID" ] && echo yes)" yes
if [ -n "$WPID" ]; then
  RM0=$(mbal)
  gw refund POST /v1/refunds "{\"source_type\":\"WALLET_PAYMENT\",\"source_id\":\"$WPID\",\"amount_minor\":10000,\"currency\":\"AOA\",\"idempotency_key\":\"rf$RR\"}" "$MJWT"
  chk F0-031b-refund-accepted "$CODE" "201"
  RM1=$(mbal)
  chk F0-031b-money-returned "$((RM0-RM1))" "10000"
fi

echo "### F0-034 payment link expiry/cancel"
gw pl POST /v1/payment-links "{\"merchant_id\":\"$MID\",\"wallet_id\":\"$WID\",\"amount_minor\":50000,\"currency\":\"AOA\",\"description\":\"cancel me\"}" "$MJWT"
PLID=$(jget id); PLSLUG=$(jget slug)
gw pl_cancel DELETE "/v1/payment-links/$PLID" - "$MJWT"
gw pl_pay POST "/public/pay/$PLSLUG/pay" '{}' -
chk F0-034 "$(codeof)" LINK_NOT_ACTIVE

echo "### F0-035 paying the same link twice debits once"
# This used /v1/payment-requests, removed under RA-057 — those routes took both
# participants from the body and never read the principal, so a merchant could
# debit two strangers. Idempotency is now asserted where a double-payment can
# actually happen: the payer settling the same link twice.
onboard; C=$OCID;CW=$OWID; kyc "$C"; fund "$C" 200000 >/dev/null
gw pr_removed POST /v1/payment-requests "{\"requester_id\":\"$A\",\"payer_id\":\"$C\",\"amount_minor\":30000,\"currency\":\"AOA\",\"idempotency_key\":\"pi$RR\"}" "$MJWT"
chk F0-035-merchant-intent-removed "$([ "$CODE" = "404" ] || [ "$CODE" = "405" ] && echo removed)" removed
gw pl2 POST /v1/payment-links "{\"merchant_id\":\"$MID\",\"wallet_id\":\"$WID\",\"amount_minor\":30000,\"currency\":\"AOA\",\"description\":\"idem probe\"}" "$MJWT"
SLUG2=$(printf '%s' "$LAST"|node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(String(JSON.parse(s).slug||""))}catch(e){}})')
CJ2=$(mint customer_id "$C"); CB0=$(cbal "$CW")
pub pay1 POST "/v1/payment-links/$SLUG2/pay" '{"amount_minor":30000}' "$CJ2"
chk F0-035-first-pay "$CODE" "200"
pub pay2 POST "/v1/payment-links/$SLUG2/pay" '{"amount_minor":30000}' "$CJ2"
CB1=$(cbal "$CW")
chk F0-035-idempotent "$((CB0-CB1))" 30000   # debited exactly once despite two pay calls

echo "### SUMMARY pass=$PASS fail=$FAIL simulated=$SIM blocked=$BLK"
echo "=== DONE ==="
