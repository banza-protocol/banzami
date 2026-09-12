#!/usr/bin/env bash
# Paying a structured Banzami QR, against the deployed Sandbox — runs ON the VM.
#
# CAP-PAY-003 was the one public surface that could not be exercised: QR codes
# could be created and read, and nothing could pay one. The only route that ever
# tried took the payer as a free-text field on a MERCHANT credential — anyone
# holding a merchant key could name any consumer and take their money — and it
# was withdrawn rather than patched (RA-053).
#
# What this proves against the running system:
#
#   a merchant's dynamic QR is paid by a consumer, from their own wallet;
#   the merchant is credited exactly the code's amount;
#   the book balances;
#   a second payment of the same single-use code moves nothing;
#   a replayed idempotency key moves nothing;
#   the payer's own amount cannot override a fixed-amount code;
#   a tampered payload is refused and does not burn the code;
#   a static code stays payable, and needs an amount;
#   the settled transfer records that a QR started it, so its receipt says so;
#   a merchant QR payment leaves the refundable object a refund names;
#   and the withdrawn merchant route is still not there.
set -uo pipefail

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
jerr(){ printf '%s' "$LAST" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);process.stdout.write(String(j.error?.code??j.code??""))}catch(e){}})'; }
mint(){ SECRET="$JWTSEC" K="$1" V="$2" node -e 'const c=require("crypto");const b=o=>Buffer.from(typeof o==="string"?o:JSON.stringify(o)).toString("base64url");const n=Math.floor(Date.now()/1000);const cl={scopes:["*"],environment:"SANDBOX",iat:n,exp:n+900};cl[process.env.K]=process.env.V;const h=b({alg:"HS256",typ:"JWT"}),p=b(cl);process.stdout.write(h+"."+p+"."+c.createHmac("sha256",process.env.SECRET).update(h+"."+p).digest("base64url"));'; }
acctbal(){ psqlro "SELECT COALESCE(SUM(CASE WHEN entry_type='CREDIT' THEN amount_minor ELSE -amount_minor END),0) FROM ledger_entries WHERE account_id='$1'"; }
unbalanced(){ psqlro "SELECT COUNT(*) FROM (SELECT p.id FROM ledger_postings p JOIN ledger_entries e ON e.posting_id=p.id GROUP BY p.id HAVING SUM(CASE e.entry_type WHEN 'DEBIT' THEN -e.amount_minor ELSE e.amount_minor END) <> 0) x"; }

. "$(cd "$(dirname "$0")" && pwd)/lib/e2e-run.sh"
e2e_begin

R="${RANDOM}${RANDOM}"
AMOUNT=37500          # 375 Kz — a dynamic code's fixed amount
STATIC_AMOUNT=12000   # 120 Kz — chosen by the payer on a static code

echo "=== fixtures"
# Provisioned through the product's own routes, never by writing financial rows
# directly: a merchant and a wallet built by hand are not the merchant and
# wallet the product makes, and a test that asserts on money must assert on the
# real thing.
BOOTSTRAP=$(mint merchant_id 00000000-0000-0000-0000-000000000001)
call "$GW" 8080 POST /v1/merchants "{\"name\":\"QR E2E $R\",\"email\":\"qr-e2e-$R@synthetic.test\"}" "$BOOTSTRAP"
MERCHANT=$(jget id)
[ -n "$MERCHANT" ] || { echo "merchant fixture failed (http=$CODE): $LAST"; exit 1; }
e2e_own merchant "$MERCHANT"
MJWT=$(mint merchant_id "$MERCHANT")
call "$GW" 8080 POST /v1/wallets '{"currency":"AOA"}' "$MJWT"
WID=$(jget id)
[ -n "$WID" ] || { echo "wallet fixture failed (http=$CODE): $LAST"; exit 1; }
AVAIL=$(psqlro "SELECT available_account_id FROM wallets WHERE id='$WID'")

# The payer: onboarded, verified and funded in this run.
PH="+2449${R:0:4}77"; H="qr${R:0:5}p"
call "$PUB" 8083 POST /v1/consumer/onboarding/start "{\"phone_number\":\"$PH\",\"currency\":\"AOA\",\"otp_plaintext_for_test\":\"123456\"}" -
SID=$(jget session_id)
call "$PUB" 8083 POST /v1/consumer/onboarding/verify-otp "{\"session_id\":\"$SID\",\"otp_code\":\"123456\"}" -
call "$PUB" 8083 POST /v1/consumer/onboarding/complete "{\"session_id\":\"$SID\",\"banza_handle\":\"$H\",\"pin\":\"1234\"}" -
PAYER=$(jget consumer_id)
[ -n "$PAYER" ] || { echo "payer onboarding failed"; exit 1; }
e2e_own consumer "$PAYER"
CJWT=$(mint customer_id "$PAYER")
call "$GW" 8080 POST /v1/compliance/customers/verify \
  "{\"full_name\":\"QR PAY E2E\",\"document_type\":\"BILHETE_DE_IDENTIDADE\",\"document_number\":\"QR$R\",\"date_of_birth\":\"1990-01-01\",\"requested_level\":\"BASIC\"}" "$CJWT"
call "$PUB" 8083 POST /v1/sandbox/fund "{\"amount_minor\":200000,\"currency\":\"AOA\"}" "$CJWT"
[ "$CODE" = "200" ] || { echo "payer funding refused (http=$CODE): $LAST"; exit 1; }
PAYER_ACC=$(psqlro "SELECT available_account_id FROM consumer_wallets WHERE consumer_id='$PAYER' AND currency='AOA'")

echo "### the merchant issues a dynamic QR"
EXP=$(node -e 'process.stdout.write(new Date(Date.now()+30*60*1000).toISOString())')
call "$GW" 8080 POST /v1/qr/dynamic \
  "{\"owner_id\":\"$MERCHANT\",\"owner_type\":\"MERCHANT\",\"currency\":\"AOA\",\"amount_minor\":$AMOUNT,\"expires_at\":\"$EXP\"}" "$MJWT"
chk DYNAMIC_QR_ISSUED "$CODE" "201"
PAYLOAD=$(jget payload)
[ -n "$PAYLOAD" ] || { echo "no payload: $LAST"; exit 1; }

echo "### the payer's own amount cannot override a fixed-amount code"
B0=$(acctbal "$AVAIL"); P0=$(acctbal "$PAYER_ACC")
call "$PUB" 8083 POST /v1/qr/pay "{\"payload\":\"$PAYLOAD\",\"amount_minor\":100,\"idempotency_key\":\"qre2e-$R-1\"}" "$CJWT"
chk QR_PAID "$CODE" "200"
chk PAID_THE_CODES_AMOUNT "$(jget amount_minor)" "$AMOUNT"
TRANSFER=$(jget transfer_id)
WPID=$(jget wallet_payment_id)
chk MERCHANT_CREDITED "$(( $(acctbal "$AVAIL") - B0 ))" "$AMOUNT"
chk PAYER_DEBITED "$(( P0 - $(acctbal "$PAYER_ACC") ))" "$AMOUNT"
chk LEDGER_BALANCED "$(unbalanced)" "0"

echo "### the payment left the record a refund and a receipt need"
chk WALLET_PAYMENT_RECORDED "$([ -n "$WPID" ] && [ "$WPID" != "null" ] && echo yes)" "yes"
chk TRANSFER_SAYS_QR "$(psqlro "SELECT COALESCE(initiated_via,'') FROM transfers WHERE id='$TRANSFER'")" "QR"
chk TRANSFER_IS_SANDBOX "$(psqlro "SELECT environment FROM transfers WHERE id='$TRANSFER'")" "SANDBOX"
chk QR_AUDITED "$(psqlro "SELECT COUNT(*) FROM audit_log WHERE action='QR_PAYMENT_COMPLETED' AND subject='consumer:$PAYER'")" "1"

echo "### a single-use code cannot be paid twice"
B1=$(acctbal "$AVAIL")
call "$PUB" 8083 POST /v1/qr/pay "{\"payload\":\"$PAYLOAD\",\"idempotency_key\":\"qre2e-$R-2\"}" "$CJWT"
chk SECOND_PAYMENT_REFUSED "$CODE" "422"
chk SECOND_PAYMENT_NAMED "$(jerr)" "QR_ALREADY_USED"
chk SECOND_PAYMENT_MOVED_NOTHING "$(acctbal "$AVAIL")" "$B1"

echo "### a replayed idempotency key moves nothing"
call "$GW" 8080 POST /v1/qr/dynamic \
  "{\"owner_id\":\"$MERCHANT\",\"owner_type\":\"MERCHANT\",\"currency\":\"AOA\",\"amount_minor\":$AMOUNT,\"expires_at\":\"$EXP\"}" "$MJWT"
P2=$(jget payload)
B2=$(acctbal "$AVAIL")
call "$PUB" 8083 POST /v1/qr/pay "{\"payload\":\"$P2\",\"idempotency_key\":\"qre2e-$R-rep\"}" "$CJWT"
T1=$(jget transfer_id)
call "$PUB" 8083 POST /v1/qr/pay "{\"payload\":\"$P2\",\"idempotency_key\":\"qre2e-$R-rep\"}" "$CJWT"
# The code is spent, so the replay is refused by the claim — and either way the
# money must not move a second time. That is the assertion that matters.
chk REPLAY_MOVED_ONCE "$(( $(acctbal "$AVAIL") - B2 ))" "$AMOUNT"
chk ONE_TRANSFER_PER_KEY "$(psqlro "SELECT COUNT(*) FROM transfers WHERE idempotency_key='qre2e-$R-rep'")" "1"

echo "### a tampered payload is refused, and does not burn the code"
call "$GW" 8080 POST /v1/qr/dynamic \
  "{\"owner_id\":\"$MERCHANT\",\"owner_type\":\"MERCHANT\",\"currency\":\"AOA\",\"amount_minor\":$AMOUNT,\"expires_at\":\"$EXP\"}" "$MJWT"
P3=$(jget payload)
FORGED=$(P="$P3" node -e 'const raw=Buffer.from(process.env.P,"base64url").toString();const v=JSON.parse(raw);v.sig="A".repeat(43);process.stdout.write(Buffer.from(JSON.stringify(v)).toString("base64url"))')
B3=$(acctbal "$AVAIL")
call "$PUB" 8083 POST /v1/qr/pay "{\"payload\":\"$FORGED\",\"idempotency_key\":\"qre2e-$R-forge\"}" "$CJWT"
chk FORGERY_REFUSED "$CODE" "422"
chk FORGERY_NAMED "$(jerr)" "INVALID_SIGNATURE"
chk FORGERY_MOVED_NOTHING "$(acctbal "$AVAIL")" "$B3"
# The genuine code still works: a rejected forgery must not consume it.
call "$PUB" 8083 POST /v1/qr/pay "{\"payload\":\"$P3\",\"idempotency_key\":\"qre2e-$R-after\"}" "$CJWT"
chk GENUINE_STILL_PAYABLE "$CODE" "200"

echo "### nonsense is not a QR code"
call "$PUB" 8083 POST /v1/qr/pay "{\"payload\":\"not-a-banzami-qr\",\"idempotency_key\":\"qre2e-$R-junk\"}" "$CJWT"
chk JUNK_REFUSED "$([ "$CODE" = "400" ] || [ "$CODE" = "404" ] && echo refused)" "refused"

echo "### a static code stays payable, and needs an amount"
call "$GW" 8080 POST /v1/qr/static \
  "{\"owner_id\":\"$MERCHANT\",\"owner_type\":\"MERCHANT\",\"currency\":\"AOA\"}" "$MJWT"
SP=$(jget payload)
call "$PUB" 8083 POST /v1/qr/pay "{\"payload\":\"$SP\",\"idempotency_key\":\"qre2e-$R-noamt\"}" "$CJWT"
chk STATIC_NEEDS_AMOUNT "$(jerr)" "AMOUNT_REQUIRED"
B4=$(acctbal "$AVAIL")
call "$PUB" 8083 POST /v1/qr/pay "{\"payload\":\"$SP\",\"amount_minor\":$STATIC_AMOUNT,\"idempotency_key\":\"qre2e-$R-s1\"}" "$CJWT"
chk STATIC_PAID "$CODE" "200"
call "$PUB" 8083 POST /v1/qr/pay "{\"payload\":\"$SP\",\"amount_minor\":$STATIC_AMOUNT,\"idempotency_key\":\"qre2e-$R-s2\"}" "$CJWT"
chk STATIC_PAYABLE_AGAIN "$CODE" "200"
chk STATIC_CREDITED_TWICE "$(( $(acctbal "$AVAIL") - B4 ))" "$(( STATIC_AMOUNT * 2 ))"

echo "### an unauthenticated caller pays nothing"
call "$PUB" 8083 POST /v1/qr/pay "{\"payload\":\"$SP\",\"amount_minor\":100,\"idempotency_key\":\"qre2e-$R-anon\"}" -
chk ANON_REFUSED "$CODE" "401"

echo "### the withdrawn merchant route is still gone"
# The router answers 405, not 404: /v1/qr/{id} is mounted for GET, so the path
# matches with id="pay" and only the method is refused. Either answer is the
# router saying the route does not exist; what must never happen is that it
# works. So the assertion is on the outcome — a merchant credential naming a
# payer moves no money — rather than on which refusal the router chose.
PB=$(acctbal "$PAYER_ACC")
call "$GW" 8080 POST /v1/qr/pay "{\"payer_consumer_id\":\"$PAYER\",\"payload\":\"$SP\",\"amount_minor\":100}" "$MJWT"
chk MERCHANT_QR_PAY_REFUSED "$([ "$CODE" != "200" ] && echo refused)" "refused"
chk MERCHANT_CANNOT_DEBIT_A_PAYER "$(acctbal "$PAYER_ACC")" "$PB"

echo "### the book still balances"
chk LEDGER_STILL_BALANCED "$(unbalanced)" "0"

echo "QR_PAYMENT_E2E: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]
