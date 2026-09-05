#!/usr/bin/env bash
# Transferências under a developer credential (ADR-052) — runs ON the Sandbox VM.
#
# The product: money between two child accounts of the SAME bound owner. This
# proves the money actually moves, that it moves by exactly the right amount in
# both directions, that a replay moves nothing, and that no account outside the
# caller's own owner can be named as either endpoint.
#
# The negative half is the reason the product is shaped this way, so it is tested
# as seriously as the positive: a second project with an equally valid key must
# not be able to use the first project's account as a source OR a destination.
set -uo pipefail

DOA_PROJECT="${DOA_PROJECT:-6367749d-ba77-47b6-80bd-982382ddd1c9}"
ACTOR="${ACTOR:-11111111-2222-4333-8444-555555555555}"

GW=$(docker ps  --format '{{.Names}}' | grep api-gateway-staging | head -1)
PUB=$(docker ps --format '{{.Names}}' | grep public-api-staging  | head -1)
CORE=$(docker ps --format '{{.Names}}'| grep core-api-staging    | head -1)
DEV=$(docker ps --format '{{.Names}}' | grep developer-api       | head -1)
PG=$(docker ps  --format '{{.Names}}' | grep postgres | grep bzsandbox | head -1)
DEVINT=$(docker exec "$DEV" sh -c 'cat /run/secrets/developer_internal_key 2>/dev/null')
JWTSEC=$(docker exec "$GW" sh -c 'cat /run/secrets/jwt_secret 2>/dev/null')
PW=$(docker exec "$CORE" sh -c 'cat /run/secrets/db_url 2>/dev/null' | sed -E 's#.*://[^:]+:([^@]+)@.*#\1#')
[ -n "$DEVINT" ] && [ -n "$JWTSEC" ] || { echo "NO_SECRET"; exit 1; }
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
bal(){ call "$GW" 8080 GET "/v1/business/wallet-accounts/$1" - "$2"
  printf '%s' "$LAST" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const v=JSON.parse(s).available_balance_minor;process.stdout.write(v===undefined?"?":String(v))}catch(e){process.stdout.write("?")}})'; }
unbalanced(){ psqlro "SELECT COUNT(*) FROM (SELECT p.id FROM ledger_postings p JOIN ledger_entries e ON e.posting_id=p.id GROUP BY p.id HAVING SUM(CASE e.entry_type WHEN 'DEBIT' THEN -e.amount_minor ELSE e.amount_minor END) <> 0) x"; }

R="${RANDOM}${RANDOM}"
SC='["identity:read","payment_sessions:read","payment_sessions:write","wallet_accounts:read","wallet_accounts:create","transfers:write"]'

echo "### key"
call "$DEV" 8086 POST "/internal/v1/projects/$DOA_PROJECT/fixture-keys" \
  "{\"name\":\"transfer-e2e-$R\",\"scopes\":$SC,\"created_by\":\"$ACTOR\"}" "$DEVINT" "X-Internal-Key:"
KEY=$(jget secret)
chk KEY_ISSUED "$([ -n "$KEY" ] && echo yes)" yes
[ -n "$KEY" ] || exit 1

echo "### two accounts of the same owner, one of them funded"
mk(){ call "$GW" 8080 POST /v1/business/wallet-accounts \
  "{\"purpose\":\"CAMPAIGN\",\"reference_type\":\"DOA_CAMPAIGN\",\"reference_id\":\"tr-$1-$R\",\"label\":\"Transfer $1\"}" "$KEY"; jget id; }
A=$(mk a); B=$(mk b)
chk ACCOUNTS_OPENED "$([ -n "$A" ] && [ -n "$B" ] && [ "$A" != "$B" ] && echo yes)" yes

# The payer is onboarded and funded by this harness rather than scavenged from
# whatever an earlier run left behind: a harness that depends on leftover state
# passes or fails for reasons that have nothing to do with the product. Funding
# goes through the sanctioned sandbox route, so the operator's own pilot
# aggregate cap still applies — nothing here can raise it.
PH="+2449${R:0:4}71"; H="tr${R:0:5}p"
call "$PUB" 8083 POST /v1/consumer/onboarding/start "{\"phone_number\":\"$PH\",\"currency\":\"AOA\",\"otp_plaintext_for_test\":\"123456\"}" -
SID=$(jget session_id)
call "$PUB" 8083 POST /v1/consumer/onboarding/verify-otp "{\"session_id\":\"$SID\",\"otp_code\":\"123456\"}" -
call "$PUB" 8083 POST /v1/consumer/onboarding/complete "{\"session_id\":\"$SID\",\"banza_handle\":\"$H\",\"pin\":\"1234\"}" -
PAYER=$(jget consumer_id)
[ -n "$PAYER" ] || { echo "payer onboarding failed"; exit 1; }
CJWT=$(mint customer_id "$PAYER")
call "$GW" 8080 POST /v1/compliance/customers/verify \
  "{\"full_name\":\"TRANSFER E2E\",\"document_type\":\"BILHETE_DE_IDENTIDADE\",\"document_number\":\"TR$R\",\"date_of_birth\":\"1990-01-01\",\"requested_level\":\"BASIC\"}" "$CJWT"
call "$PUB" 8083 POST /v1/sandbox/fund '{"amount_minor":400000,"currency":"AOA"}' "$CJWT"
[ "$CODE" = "200" ] || { echo "payer funding refused (http=$CODE) — the rest would be vacuous"; exit 1; }
call "$GW" 8080 POST /v1/business/payment-sessions \
  "{\"wallet_account_id\":\"$A\",\"purpose\":\"DONATION\",\"reference_type\":\"DOA_DONATION\",\"reference_id\":\"tr-fund-$R\",\"amount_minor\":300000,\"currency\":\"AOA\"}" "$KEY"
SLUG=$(printf '%s' "$LAST" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);const i=(j.interfaces||[]).find(x=>x.type==="PAYMENT_LINK");process.stdout.write(i?String(i.value).split("/").filter(Boolean).pop():"")}catch(e){}})')
call "$PUB" 8083 POST "/v1/payment-links/$SLUG/pay" '{"amount_minor":300000}' "$CJWT"
A0=$(bal "$A" "$KEY"); B0=$(bal "$B" "$KEY")
echo "  before: A=$A0 B=$B0"
chk SOURCE_FUNDED "$A0" "300000"
[ "$A0" = "300000" ] || { echo "source not funded — the rest would be vacuous"; exit 1; }

echo "### the transfer"
IDEM="tr-idem-$R"
TB="{\"source_wallet_account_id\":\"$A\",\"destination_wallet_account_id\":\"$B\",\"amount_minor\":50000,\"currency\":\"AOA\",\"idempotency_key\":\"$IDEM\"}"
call "$GW" 8080 POST /v1/business/transfers "$TB" "$KEY"
echo "  create → http=$CODE $(printf '%s' "$LAST" | head -c 130)"
chk TRANSFER_ACCEPTED "$CODE" "201"
TID=$(jget id)
[ -n "$TID" ] || { echo "no transfer created — the rest would be vacuous"; exit 1; }

A1=$(bal "$A" "$KEY"); B1=$(bal "$B" "$KEY")
echo "  after:  A=$A1 B=$B1"
chk SOURCE_DEBITED   "$A1" "$((A0 - 50000))"
chk DEST_CREDITED    "$B1" "$((B0 + 50000))"
chk OWNER_TOTAL_UNCHANGED "$((A1 + B1))" "$((A0 + B0))"

echo "### the ledger stays balanced"
chk LEDGER_BALANCED "$(unbalanced)" "0"   # clean ledger: nothing unbalanced, ever

echo "### idempotency"
call "$GW" 8080 POST /v1/business/transfers "$TB" "$KEY"
chk IDEMPOTENT_REPLAY "$(jget id)" "$TID"
A2=$(bal "$A" "$KEY"); B2=$(bal "$B" "$KEY")
chk REPLAY_MOVED_NOTHING "$A2:$B2" "$A1:$B1"

echo "### the same key with a different request is a conflict, not a silent replay"
call "$GW" 8080 POST /v1/business/transfers \
  "{\"source_wallet_account_id\":\"$A\",\"destination_wallet_account_id\":\"$B\",\"amount_minor\":77000,\"currency\":\"AOA\",\"idempotency_key\":\"$IDEM\"}" "$KEY"
# Returning the original here would answer a question the caller did not ask:
# a 200 for a transfer of the wrong amount, which they would believe happened.
chk CHANGED_PAYLOAD_CONFLICT "$CODE" "409"
AC=$(bal "$A" "$KEY"); BC=$(bal "$B" "$KEY")
chk CONFLICT_MOVED_NOTHING "$AC:$BC" "$A1:$B1"

echo "### rejected transfers move nothing"
call "$GW" 8080 POST /v1/business/transfers \
  "{\"source_wallet_account_id\":\"$A\",\"destination_wallet_account_id\":\"$B\",\"amount_minor\":99999999,\"currency\":\"AOA\",\"idempotency_key\":\"over-$R\"}" "$KEY"
chk INSUFFICIENT_FUNDS_REJECTED "$([ "$CODE" -ge 400 ] && echo rejected)" "rejected"
call "$GW" 8080 POST /v1/business/transfers \
  "{\"source_wallet_account_id\":\"$A\",\"destination_wallet_account_id\":\"$B\",\"amount_minor\":-50000,\"currency\":\"AOA\",\"idempotency_key\":\"neg-$R\"}" "$KEY"
chk NEGATIVE_REJECTED "$CODE" "400"
call "$GW" 8080 POST /v1/business/transfers \
  "{\"source_wallet_account_id\":\"$A\",\"destination_wallet_account_id\":\"$A\",\"amount_minor\":1000,\"currency\":\"AOA\",\"idempotency_key\":\"self-$R\"}" "$KEY"
chk SELF_TRANSFER_REJECTED "$CODE" "400"
A3=$(bal "$A" "$KEY"); B3=$(bal "$B" "$KEY")
chk REJECTIONS_MOVED_NOTHING "$A3:$B3" "$A1:$B1"

echo "### another project cannot use these accounts"
call "$DEV" 8086 POST /internal/v1/fixture-projects "{\"name\":\"tr-other-$R\",\"created_by\":\"$ACTOR\"}" "$DEVINT" "X-Internal-Key:"
OTHER=$(jget project_id)
MJWT=$(mint merchant_id 00000000-0000-0000-0000-000000000001)
call "$GW" 8080 POST /v1/merchants "{\"name\":\"TR$R\",\"email\":\"tr$R@synthetic.test\"}" "$MJWT"; OMID=$(jget id)
MJWT=$(mint merchant_id "$OMID")
call "$GW" 8080 POST /v1/wallets '{"currency":"AOA"}' "$MJWT"; OWID=$(jget id)
OWACCT=$(psqlro "SELECT id FROM wallet_accounts WHERE wallet_id='$OWID' AND purpose='PRIMARY'")
call "$DEV" 8086 POST "/internal/v1/projects/$OTHER/fixture-keys" "{\"name\":\"tr-other-$R\",\"scopes\":$SC,\"created_by\":\"$ACTOR\"}" "$DEVINT" "X-Internal-Key:"
OKEY=$(jget secret)
call "$DEV" 8086 POST "/internal/v1/projects/$OTHER/binding" "{\"merchant_id\":\"$OMID\",\"wallet_id\":\"$OWID\",\"wallet_account_id\":\"$OWACCT\",\"actor_user_id\":\"$ACTOR\"}" "$DEVINT" "X-Internal-Key:"

# Foreign SOURCE — stealing from A.
call "$GW" 8080 POST /v1/business/transfers \
  "{\"source_wallet_account_id\":\"$A\",\"destination_wallet_account_id\":\"$OWACCT\",\"amount_minor\":10000,\"currency\":\"AOA\",\"idempotency_key\":\"steal-$R\"}" "$OKEY"
chk FOREIGN_SOURCE_REJECTED "$CODE" "404"
# Foreign DESTINATION — pushing into A from outside.
call "$GW" 8080 POST /v1/business/transfers \
  "{\"source_wallet_account_id\":\"$OWACCT\",\"destination_wallet_account_id\":\"$A\",\"amount_minor\":10000,\"currency\":\"AOA\",\"idempotency_key\":\"push-$R\"}" "$OKEY"
chk FOREIGN_DESTINATION_REJECTED "$CODE" "404"

A4=$(bal "$A" "$KEY"); B4=$(bal "$B" "$KEY")
chk VICTIM_UNCHANGED "$A4:$B4" "$A1:$B1"
chk LEDGER_STILL_BALANCED "$(unbalanced)" "0"

echo
echo "TRANSFER_DEVKEY_E2E: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
