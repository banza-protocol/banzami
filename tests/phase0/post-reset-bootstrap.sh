#!/usr/bin/env bash
# Bootstrap canonical Sandbox financial state after the clean reset, and prove
# the two credit paths now post balanced double-entry.
#
# Both paths matter and they failed differently:
# * the consumer top-up was correct all along (DR transit / CR consumer),
# * the merchant top-up wrote a lone CREDIT with no counter-DEBIT (RA-060) and
#   produced every unbalanced posting in the old ledger.
#
# So this exercises both against the empty ledger and asserts the invariant from
# zero — no historical rows to hide behind.
set -uo pipefail

GW=$(docker ps  --format '{{.Names}}' | grep api-gateway-staging | head -1)
PUB=$(docker ps --format '{{.Names}}' | grep public-api-staging  | head -1)
CORE=$(docker ps --format '{{.Names}}'| grep core-api-staging    | head -1)
PG=$(docker ps  --format '{{.Names}}' | grep postgres | grep bzsandbox | head -1)
JWTSEC=$(docker exec "$GW" sh -c 'cat /run/secrets/jwt_secret 2>/dev/null')
PW=$(docker exec "$CORE" sh -c 'cat /run/secrets/db_url 2>/dev/null' | sed -E 's#.*://[^:]+:([^@]+)@.*#\1#')
psqlro(){ docker exec -e PGPASSWORD="$PW" "$PG" psql -U bl_app_runtime -d banzami_staging -At -c "$1" 2>/dev/null; }

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
unbalanced(){ psqlro "SELECT COUNT(*) FROM (SELECT p.id FROM ledger_postings p JOIN ledger_entries e ON e.posting_id=p.id GROUP BY p.id HAVING SUM(CASE e.entry_type WHEN 'DEBIT' THEN -e.amount_minor ELSE e.amount_minor END) <> 0) x"; }
orphans(){ psqlro "SELECT COUNT(*) FROM ledger_postings p WHERE NOT EXISTS (SELECT 1 FROM ledger_entries e WHERE e.posting_id = p.id)"; }
circulation(){ psqlro "SELECT COALESCE(SUM(CASE WHEN le.entry_type='CREDIT' THEN le.amount_minor ELSE -le.amount_minor END),0) FROM ledger_entries le WHERE le.account_id IN (SELECT available_account_id FROM wallets UNION SELECT available_account_id FROM consumer_wallets)"; }

R="${RANDOM}${RANDOM}"

echo "### the ledger starts clean"
chk START_POSTINGS   "$(psqlro 'SELECT COUNT(*) FROM ledger_postings')" "0"
chk START_UNBALANCED "$(unbalanced)" "0"
chk START_CIRCULATION "$(circulation)" "0"

echo "### consumer top-up (the path that was always correct)"
SEQ=1; PH="+2449${R:0:4}${SEQ}1"; H="bs${R:0:5}p"
call "$PUB" 8083 POST /v1/consumer/onboarding/start "{\"phone_number\":\"$PH\",\"currency\":\"AOA\",\"otp_plaintext_for_test\":\"123456\"}" -
SID=$(jget session_id)
call "$PUB" 8083 POST /v1/consumer/onboarding/verify-otp "{\"session_id\":\"$SID\",\"otp_code\":\"123456\"}" -
call "$PUB" 8083 POST /v1/consumer/onboarding/complete "{\"session_id\":\"$SID\",\"banza_handle\":\"$H\",\"pin\":\"1234\"}" -
PAYER=$(jget consumer_id)
chk PAYER_ONBOARDED "$([ -n "$PAYER" ] && echo yes)" yes
CJWT=$(mint customer_id "$PAYER")
call "$GW" 8080 POST /v1/compliance/customers/verify \
  "{\"full_name\":\"BOOTSTRAP\",\"document_type\":\"BILHETE_DE_IDENTIDADE\",\"document_number\":\"BS$R\",\"date_of_birth\":\"1990-01-01\",\"requested_level\":\"BASIC\"}" "$CJWT"
call "$PUB" 8083 POST /v1/sandbox/fund '{"amount_minor":2000000,"currency":"AOA"}' "$CJWT"
chk CONSUMER_FUNDED "$CODE" "200"
chk AFTER_CONSUMER_UNBALANCED "$(unbalanced)" "0"

echo "### merchant top-up (RA-060: the path that wrote a lone CREDIT)"
MJWT=$(mint merchant_id 00000000-0000-0000-0000-000000000001)
call "$GW" 8080 POST /v1/merchants "{\"name\":\"BS$R\",\"email\":\"bs$R@synthetic.test\"}" "$MJWT"
MID=$(jget id); MJWT=$(mint merchant_id "$MID")
call "$GW" 8080 POST /v1/wallets '{"currency":"AOA"}' "$MJWT"
WID=$(jget id)
call "$CORE" 8081 POST "/internal/v1/wallets/$WID/sandbox-credit" '{"amount_minor":100000,"currency":"AOA"}' -
echo "  sandbox-credit → http=$CODE"
LEGS=$(psqlro "SELECT COUNT(*) FROM ledger_entries e JOIN ledger_postings p ON p.id=e.posting_id WHERE p.description LIKE '%Merchant wallet top-up%'")
DEBITS=$(psqlro "SELECT COUNT(*) FROM ledger_entries e JOIN ledger_postings p ON p.id=e.posting_id WHERE p.description LIKE '%Merchant wallet top-up%' AND e.entry_type='DEBIT'")
CREDITS=$(psqlro "SELECT COUNT(*) FROM ledger_entries e JOIN ledger_postings p ON p.id=e.posting_id WHERE p.description LIKE '%Merchant wallet top-up%' AND e.entry_type='CREDIT'")
echo "  merchant top-up legs: total=$LEGS debit=$DEBITS credit=$CREDITS"
chk MERCHANT_TOPUP_TWO_LEGS "$LEGS" "2"
chk MERCHANT_TOPUP_ONE_DEBIT "$DEBITS" "1"
chk MERCHANT_TOPUP_ONE_CREDIT "$CREDITS" "1"

echo "### the invariant, from zero"
chk UNBALANCED_POSTINGS "$(unbalanced)" "0"
chk POSTINGS_WITHOUT_ENTRIES "$(orphans)" "0"

echo "### pilot cap headroom (cap 50,000,000 — never raised)"
CIRC=$(circulation)
echo "  funds in circulation = $CIRC"
chk CAP_HEALTHY "$([ "$CIRC" -lt 50000000 ] && echo yes)" yes

echo
echo "POST_RESET_BOOTSTRAP: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
