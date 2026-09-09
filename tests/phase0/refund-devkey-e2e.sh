#!/usr/bin/env bash
# Reembolsos under a developer credential — runs ON the Sandbox VM.
#
# The full round trip: a project takes a real payment into its own campaign
# account, then refunds it with its own key. Nothing here is simulated — the
# payment is completed on the payer's authenticated surface and the refund goes
# through the same route a published SDK method calls.
#
# The negative half matters as much: a second project, holding an equally valid
# key, must not be able to refund the first project's payment. Knowing a payment
# id is not authority over it.
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

# Ownership and cleanup. Every key, project and merchant below is recorded by id
# and retired on the way out — including when an assertion fails, which is when
# it used to leak.
. "$(cd "$(dirname "$0")" && pwd)/lib/e2e-run.sh"
e2e_begin

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
bal(){ call "$GW" 8080 GET "/v1/wallet-accounts/$1" - "$2"
  printf '%s' "$LAST" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const v=JSON.parse(s).available_balance_minor;process.stdout.write(v===undefined?"?":String(v))}catch(e){process.stdout.write("?")}})'; }

R="${RANDOM}${RANDOM}"
SC='["identity:read","payment_sessions:read","payment_sessions:write","wallet_accounts:read","wallet_accounts:create","refunds:read","refunds:write"]'

echo "### keys"
call "$DEV" 8086 POST "/internal/v1/projects/$DOA_PROJECT/fixture-keys" \
  "{\"name\":\"refund-e2e-$R\",\"scopes\":$SC,\"created_by\":\"$ACTOR\"}" "$DEVINT" "X-Internal-Key:"
KEY=$(jget secret)
e2e_own fixture_key "$(jget id)"
chk KEY_ISSUED "$([ -n "$KEY" ] && echo yes)" yes
[ -n "$KEY" ] || exit 1

echo "### a real payment into the project's own account"
call "$GW" 8080 POST /v1/wallet-accounts \
  "{\"purpose\":\"CAMPAIGN\",\"reference_type\":\"DOA_CAMPAIGN\",\"reference_id\":\"refund-$R\",\"label\":\"Refund probe\"}" "$KEY"
ACCT=$(jget id)
PAYER=$(psqlro "SELECT cw.consumer_id FROM consumer_wallets cw JOIN ledger_entries le ON le.account_id=cw.available_account_id WHERE cw.status='ACTIVE' AND cw.currency='AOA' GROUP BY cw.consumer_id HAVING COALESCE(SUM(CASE WHEN le.entry_type='CREDIT' THEN le.amount_minor ELSE -le.amount_minor END),0) >= 300000 ORDER BY 1 LIMIT 1")
chk PAYER_AVAILABLE "$([ -n "$PAYER" ] && echo yes)" yes
[ -n "$PAYER" ] || { echo "no funded payer in this Sandbox"; exit 1; }
CJWT=$(mint customer_id "$PAYER")

call "$GW" 8080 POST /v1/payment-sessions \
  "{\"wallet_account_id\":\"$ACCT\",\"purpose\":\"DONATION\",\"reference_type\":\"DOA_DONATION\",\"reference_id\":\"refund-$R\",\"amount_minor\":200000,\"currency\":\"AOA\"}" "$KEY"
SESSION=$(jget session_id)
SLUG=$(printf '%s' "$LAST" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);const i=(j.interfaces||[]).find(x=>x.type==="PAYMENT_LINK");process.stdout.write(i?String(i.value).split("/").filter(Boolean).pop():"")}catch(e){}})')
call "$PUB" 8083 POST "/v1/payment-links/$SLUG/pay" '{"amount_minor":200000}' "$CJWT"
chk PAYMENT_COMPLETED "$CODE" "200"
AFTER_PAY=$(bal "$ACCT" "$KEY")
chk ACCOUNT_CREDITED "$AFTER_PAY" "200000"

echo "### the refundable source, as the operator types it"
# The session itself carries its refund source, typed by the operator
# (BANZA ADR-017): reading the session is the documented path, and it is what
# DOA's own refund driver does. Guessing at a table was wrong — a link-backed
# session writes no wallet_payments row, so an earlier run looked for one that
# never existed and then reported green on the emptiness.
call "$GW" 8080 GET "/v1/payment-sessions/$SESSION" - "$KEY"
SRC_TYPE=$(printf '%s' "$LAST" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);process.stdout.write(String(j.refund_source?.source_type??""))}catch(e){}})')
SRC=$(printf '%s' "$LAST" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);process.stdout.write(String(j.refund_source?.source_id??""))}catch(e){}})')
echo "  refund_source: type=${SRC_TYPE:-<none>} id=${SRC:0:8}…"
chk REFUND_SOURCE_FOUND "$([ -n "$SRC" ] && [ -n "$SRC_TYPE" ] && echo yes)" yes
# Without a source there is nothing to refund, and every assertion below would
# compare empty against empty and pass. An earlier run did exactly that and
# reported IDEMPOTENT_REPLAY and FOREIGN_CANNOT_READ_REFUND as green on nothing.
[ -n "$SRC" ] || { echo "no refundable source — refusing to report vacuous passes"; exit 1; }

echo "### refund with the project's own key"
IDEM="refund-idem-$R"
RB="{\"source_type\":\"$SRC_TYPE\",\"source_id\":\"$SRC\",\"amount_minor\":50000,\"currency\":\"AOA\",\"reason\":\"sandbox e2e partial\",\"idempotency_key\":\"$IDEM\"}"
call "$GW" 8080 POST /v1/refunds "$RB" "$KEY"
echo "  create → http=$CODE $(printf '%s' "$LAST" | head -c 140)"
chk REFUND_ACCEPTED "$CODE" "201"
RID=$(jget id)
[ -n "$RID" ] || { echo "refund not created — the rest would be vacuous"; exit 1; }

echo "### the money actually moved"
AFTER_REFUND=$(bal "$ACCT" "$KEY")
chk BALANCE_REDUCED "$AFTER_REFUND" "$((AFTER_PAY - 50000))"

echo "### the refund posting is balanced double-entry"
NET=$(psqlro "SELECT COUNT(*) FROM (SELECT p.id FROM ledger_postings p JOIN ledger_entries e ON e.posting_id=p.id GROUP BY p.id HAVING SUM(CASE e.entry_type WHEN 'DEBIT' THEN -e.amount_minor ELSE e.amount_minor END) <> 0) x")
chk LEDGER_STILL_BALANCED_AFTER_REFUND "$NET" "0"   # clean ledger: nothing unbalanced, ever

echo "### idempotency"
call "$GW" 8080 POST /v1/refunds "$RB" "$KEY"
REPLAY=$(jget id)
chk IDEMPOTENT_REPLAY "$REPLAY" "$RID"
AFTER_REPLAY=$(bal "$ACCT" "$KEY")
chk REPLAY_MOVED_NO_MONEY "$AFTER_REPLAY" "$AFTER_REFUND"

echo "### readable through the supported API"
call "$GW" 8080 GET "/v1/refunds/$RID" - "$KEY"
chk REFUND_READABLE "$CODE" "200"

echo "### the retired path is gone from the runtime, not just from the docs"
# A route that still answers is still a contract, whatever the reference says.
# /business/refunds was the merchant-credential-only mount; it is unmounted, so
# the router falls through to its own not-found rather than to an auth error —
# the same answer a developer gets for any path this API does not have.
call "$GW" 8080 POST /v1/refunds "$RB" "$KEY"
chk RETIRED_CREATE_PATH_NOT_FOUND "$CODE" "404"
call "$GW" 8080 GET "/v1/refunds/$RID" - "$KEY"
chk RETIRED_READ_PATH_NOT_FOUND "$CODE" "404"
call "$GW" 8080 GET /v1/refunds - "$KEY"
chk RETIRED_LIST_PATH_NOT_FOUND "$CODE" "404"
# And the money is where it was: a 404 must not have been a silent second refund.
chk RETIRED_PATH_MOVED_NO_MONEY "$(bal "$ACCT" "$KEY")" "$AFTER_REFUND"

echo "### scope separation"
call "$DEV" 8086 POST "/internal/v1/projects/$DOA_PROJECT/fixture-keys" \
  "{\"name\":\"refund-ro-$R\",\"scopes\":[\"identity:read\",\"refunds:read\"],\"created_by\":\"$ACTOR\"}" "$DEVINT" "X-Internal-Key:"
ROKEY=$(jget secret)
e2e_own fixture_key "$(jget id)"
call "$GW" 8080 POST /v1/refunds "$RB" "$ROKEY"
chk READ_SCOPE_CANNOT_REFUND "$CODE" "403"

echo "### another project cannot refund this payment"
call "$DEV" 8086 POST /internal/v1/fixture-projects "{\"name\":\"refund-other-$R\",\"created_by\":\"$ACTOR\"}" "$DEVINT" "X-Internal-Key:"
OTHER=$(jget project_id)
e2e_own fixture_project "$OTHER"
MJWT=$(mint merchant_id 00000000-0000-0000-0000-000000000001)
call "$GW" 8080 POST /v1/merchants "{\"name\":\"RF$R\",\"email\":\"rf$R@synthetic.test\"}" "$MJWT"; OMID=$(jget id)
e2e_own merchant "$OMID"
MJWT=$(mint merchant_id "$OMID")
call "$GW" 8080 POST /v1/wallets '{"currency":"AOA"}' "$MJWT"; OWID=$(jget id)
OWACCT=$(psqlro "SELECT id FROM wallet_accounts WHERE wallet_id='$OWID' AND purpose='PRIMARY'")
call "$DEV" 8086 POST "/internal/v1/projects/$OTHER/fixture-keys" "{\"name\":\"refund-other-$R\",\"scopes\":$SC,\"created_by\":\"$ACTOR\"}" "$DEVINT" "X-Internal-Key:"
OKEY=$(jget secret)
e2e_own fixture_key "$(jget id)"
call "$DEV" 8086 POST "/internal/v1/projects/$OTHER/binding" "{\"merchant_id\":\"$OMID\",\"wallet_id\":\"$OWID\",\"wallet_account_id\":\"$OWACCT\",\"actor_user_id\":\"$ACTOR\"}" "$DEVINT" "X-Internal-Key:"

call "$GW" 8080 POST /v1/refunds \
  "{\"source_type\":\"$SRC_TYPE\",\"source_id\":\"$SRC\",\"amount_minor\":10000,\"currency\":\"AOA\",\"reason\":\"cross-project attempt\",\"idempotency_key\":\"steal-$R\"}" "$OKEY"
echo "  foreign refund → http=$CODE $(printf '%s' "$LAST" | head -c 120)"
chk FOREIGN_REFUND_REJECTED "$([ "$CODE" -ge 400 ] && echo rejected)" "rejected"

VICTIM=$(bal "$ACCT" "$KEY")
chk VICTIM_BALANCE_UNCHANGED "$VICTIM" "$AFTER_REFUND"
call "$GW" 8080 GET "/v1/refunds/$RID" - "$OKEY"
chk FOREIGN_CANNOT_READ_REFUND "$CODE" "404"

echo
echo "REFUND_DEVKEY_E2E: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
