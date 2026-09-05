#!/usr/bin/env bash
# The hosted payer surface, through a real payment — runs ON the Sandbox VM.
#
# The surface itself never moves money: it presents a payment, and the payer
# authorises it on their own authenticated surface. So this proves the loop the
# product actually runs:
#
#   the PUBLIC page resolves the link and shows the right amount;
#   the payer settles it under their own credential;
#   the page then shows the completed state, and offers no way to pay again;
#   the operator emits and delivers the signed event;
#   a second settlement attempt moves no money.
set -uo pipefail
BASE="${BASE:-https://pay.banzami.com}"
: "${SLUG:?SLUG required}" ; : "${ACC:?ACC required — the credited wallet account}"

GW=$(docker ps  --format '{{.Names}}' | grep api-gateway-staging | head -1)
PUB=$(docker ps --format '{{.Names}}' | grep public-api-staging  | head -1)
CORE=$(docker ps --format '{{.Names}}'| grep core-api-staging    | head -1)
PG=$(docker ps  --format '{{.Names}}' | grep postgres | grep bzsandbox | head -1)
JWTSEC=$(docker exec "$GW" sh -c 'cat /run/secrets/jwt_secret 2>/dev/null')
PW=$(docker exec "$CORE" sh -c 'cat /run/secrets/db_url 2>/dev/null' | sed -E 's#.*://[^:]+:([^@]+)@.*#\1#')
psqlro(){ docker exec -e PGPASSWORD="$PW" "$PG" psql -U bl_app_runtime -d banzami_staging -At -c "$1" 2>&1; }

PASS=0; FAIL=0
chk(){ if [ "$2" = "$3" ]; then echo "  $1 PASS ($2)"; PASS=$((PASS+1)); else echo "  $1 FAIL (got '$2' want '$3')"; FAIL=$((FAIL+1)); fi; }
LAST=""; CODE=""
call(){ local ct="$1" port="$2" m="$3" p="$4" bd="$5" au="$6"
  local a=(curl -s -w $'\n%{http_code}' -X "$m" "http://localhost:$port$p")
  [ "$au" != "-" ] && a+=(-H "Authorization: Bearer $au")
  local r
  if [ "$bd" = "-" ]; then r=$(docker exec "$ct" "${a[@]}" 2>/dev/null)
  else a+=(-H "Content-Type: application/json" --data @-); r=$(printf '%s' "$bd" | docker exec -i "$ct" "${a[@]}" 2>/dev/null); fi
  CODE=$(printf '%s' "$r" | tail -n1); LAST=$(printf '%s' "$r" | sed '$d'); }
jget(){ printf '%s' "$LAST" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);process.stdout.write(String(j["'"$1"'"]??""))}catch(e){}})'; }
mint(){ SECRET="$JWTSEC" K="$1" V="$2" node -e 'const c=require("crypto");const b=o=>Buffer.from(typeof o==="string"?o:JSON.stringify(o)).toString("base64url");const n=Math.floor(Date.now()/1000);const cl={scopes:["*"],environment:"SANDBOX",iat:n,exp:n+900};cl[process.env.K]=process.env.V;const h=b({alg:"HS256",typ:"JWT"}),p=b(cl);process.stdout.write(h+"."+p+"."+c.createHmac("sha256",process.env.SECRET).update(h+"."+p).digest("base64url"));'; }
bal(){ psqlro "SELECT COALESCE(SUM(CASE WHEN e.entry_type='CREDIT' THEN e.amount_minor ELSE -e.amount_minor END),0)
                 FROM ledger_entries e JOIN wallet_accounts wa ON wa.account_id = e.account_id WHERE wa.id = '$1'"; }
unbalanced(){ psqlro "SELECT COUNT(*) FROM (SELECT p.id FROM ledger_postings p JOIN ledger_entries e ON e.posting_id=p.id GROUP BY p.id HAVING SUM(CASE e.entry_type WHEN 'DEBIT' THEN -e.amount_minor ELSE e.amount_minor END) <> 0) x"; }

R="${RANDOM}${RANDOM}"
AMOUNT=$(curl -s --max-time 20 "https://sandbox-api.banzami.com/public/pay/$SLUG" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(String(JSON.parse(s).amount_minor??""))}catch(e){}})')

echo "### the PUBLIC page presents the payment before it is paid"
PAGE=$(curl -s --max-time 25 "$BASE/pay/$SLUG")
chk PAGE_SHOWS_AMOUNT "$(printf '%s' "$PAGE" | grep -c "$AMOUNT")" "1"
chk PAGE_NOT_YET_PAID "$(printf '%s' "$PAGE" | grep -c 'Pagamento recebido')" "0"

echo "### the payer authorises it on their own surface"
# Onboarded and funded here: a payer left over from an earlier run makes the
# result depend on state this test does not control.
PH="+2449${R:0:4}31"; H="hc${R:0:5}p"
call "$PUB" 8083 POST /v1/consumer/onboarding/start "{\"phone_number\":\"$PH\",\"currency\":\"AOA\",\"otp_plaintext_for_test\":\"123456\"}" -
SID=$(jget session_id)
call "$PUB" 8083 POST /v1/consumer/onboarding/verify-otp "{\"session_id\":\"$SID\",\"otp_code\":\"123456\"}" -
call "$PUB" 8083 POST /v1/consumer/onboarding/complete "{\"session_id\":\"$SID\",\"banza_handle\":\"$H\",\"pin\":\"1234\"}" -
PAYER=$(jget consumer_id)
[ -n "$PAYER" ] || { echo "payer onboarding failed"; exit 1; }
CJWT=$(mint customer_id "$PAYER")
call "$GW" 8080 POST /v1/compliance/customers/verify \
  "{\"full_name\":\"HOSTED CHECKOUT E2E\",\"document_type\":\"BILHETE_DE_IDENTIDADE\",\"document_number\":\"HC$R\",\"date_of_birth\":\"1990-01-01\",\"requested_level\":\"BASIC\"}" "$CJWT"
call "$PUB" 8083 POST /v1/sandbox/fund "{\"amount_minor\":$((AMOUNT + 50000)),\"currency\":\"AOA\"}" "$CJWT"
[ "$CODE" = "200" ] || { echo "payer funding refused (http=$CODE)"; exit 1; }

B0=$(bal "$ACC")
call "$PUB" 8083 POST "/v1/payment-links/$SLUG/pay" "{\"amount_minor\":$AMOUNT}" "$CJWT"
echo "  pay → http=$CODE"
chk PAYMENT_ACCEPTED "$CODE" "200"
B1=$(bal "$ACC")
chk ACCOUNT_CREDITED "$((B1 - B0))" "$AMOUNT"
chk LEDGER_BALANCED "$(unbalanced)" "0"

echo "### the PUBLIC page now shows the completed state and offers no way to pay again"
PAID=$(curl -s --max-time 25 "$BASE/pay/$SLUG")
chk PAGE_SHOWS_PAID "$(printf '%s' "$PAID" | grep -c 'Pagamento recebido')" "1"
chk PAGE_OFFERS_NO_PAYMENT "$(printf '%s' "$PAID" | grep -c 'Abrir app Banzami')" "0"

echo "### a second settlement attempt moves no money"
call "$PUB" 8083 POST "/v1/payment-links/$SLUG/pay" "{\"amount_minor\":$AMOUNT}" "$CJWT"
echo "  second attempt → http=$CODE"
chk SECOND_ATTEMPT_REFUSED "$([ "$CODE" != "200" ] && echo refused)" "refused"
chk REPLAY_MOVED_NOTHING "$(bal "$ACC")" "$B1"

echo "### the operator emitted and delivered the signed event"
SESSION=$(psqlro "SELECT id FROM payment_sessions WHERE wallet_account_id='$ACC' ORDER BY created_at DESC LIMIT 1")
for i in $(seq 1 12); do
  EVID=$(psqlro "SELECT id FROM webhook_events WHERE payload::text LIKE '%$SESSION%' ORDER BY created_at DESC LIMIT 1")
  [ -n "$EVID" ] && break; sleep 3
done
chk EVENT_EMITTED "$([ -n "$EVID" ] && echo yes)" yes
for i in $(seq 1 20); do
  ROW=$(psqlro "SELECT status FROM webhook_deliveries WHERE event_id='$EVID' ORDER BY created_at DESC LIMIT 1")
  case "$ROW" in SUCCESS*|success*) break;; esac; sleep 5
done
chk EVENT_DELIVERED "$(printf '%s' "$ROW" | tr 'A-Z' 'a-z')" "success"

echo
echo "HOSTED_CHECKOUT_PAYMENT_E2E: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
