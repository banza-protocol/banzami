#!/usr/bin/env bash
# Project-bound wallet sub-accounts E2E (ADR-050). Runs ON the internal Sandbox VM.
#
# Proves the authority split that ADR-050 rests on:
#   owner selection is refused, child selection is verified.
#
# The project under test is a tenant of the run's own
# (tests/phase0/lib/synthetic-tenant.sh): a Project, its key, and a Business
# with a @banza and a wallet, bound through the same internal routes Console
# Financial Setup uses — so it is configured the way a real integrator's is,
# not a bare fixture. Its owner is still read back from the binding, never
# assumed from what the harness created.
#
# It used to use DOA's canonical Sandbox project instead, on the argument that
# the claim under test was that DOA can run as a pure Developer Platform
# consumer. That made a real tenant the fixture: every run opened two CAMPAIGN
# accounts and two unpaid sessions in DOA's wallet. The property asserted here —
# owner selection refused, child selection verified — belongs to the Developer
# Platform, and a tenant nothing else uses is the stronger proof of it.
#
# REFERENCE_APPLICATION_DOA: what this harness no longer asserts is that DOA's
# own Console-created project, specifically, passes these checks. That is a
# claim about one integration and belongs to DOA's integration evidence; no
# assertion below was removed for it — each one now runs against the synthetic
# tenant with its meaning unchanged.
#
# Needs no Sandbox funding: sessions are opened, never paid.
#
# Secrets (internal key, DB password, the minted API key) are read into memory
# only and NEVER printed. No key, token, IP or hostname is emitted.
set -uo pipefail

ACTOR="${ACTOR:-11111111-2222-4333-8444-555555555555}"

GW=$(docker ps --format '{{.Names}}'  | grep api-gateway-staging | head -1)
DEV=$(docker ps --format '{{.Names}}' | grep developer-api       | head -1)
CORE=$(docker ps --format '{{.Names}}'| grep core-api-staging    | head -1)
PG=$(docker ps --format '{{.Names}}'  | grep -E 'postgres' | grep bzsandbox | head -1)
[ -n "$GW" ] && [ -n "$DEV" ] && [ -n "$PG" ] || { echo "CONTAINERS_NOT_FOUND"; exit 1; }

DEVINT=$(docker exec "$DEV" sh -c 'cat /run/secrets/developer_internal_key 2>/dev/null')
JWTSEC=$(docker exec "$GW" sh -c 'cat /run/secrets/jwt_secret 2>/dev/null')
DBURL=$(docker exec "$CORE" sh -c 'cat /run/secrets/db_url 2>/dev/null')
PW=$(printf '%s' "$DBURL" | sed -E 's#.*://[^:]+:([^@]+)@.*#\1#')
[ -n "$DEVINT" ] || { echo "NO_INTERNAL_KEY"; exit 1; }

psqlro(){ docker exec -e PGPASSWORD="$PW" "$PG" psql -U bl_app_runtime -d banzami_staging -At -c "$1" 2>/dev/null; }

PASS=0; FAIL=0
chk(){ if [ "$2" = "$3" ]; then echo "  $1 PASS ($2)"; PASS=$((PASS+1)); else echo "  $1 FAIL (got '$2' want '$3')"; FAIL=$((FAIL+1)); fi; }
chkne(){ if [ -n "$2" ] && [ "$2" != "$3" ]; then echo "  $1 PASS (distinct)"; PASS=$((PASS+1)); else echo "  $1 FAIL (values collided or empty)"; FAIL=$((FAIL+1)); fi; }

LAST=""; CODE=""
# call <container> <port> <method> <path> <body|-> <bearer|->
call(){ local ct="$1" port="$2" m="$3" p="$4" bd="$5" au="$6" hdr="${7:-Authorization: Bearer}"
  local a=(curl -s -w $'\n%{http_code}' -X "$m" "http://localhost:$port$p")
  [ "$au" != "-" ] && a+=(-H "$hdr $au")
  local r
  if [ "$bd" = "-" ]; then r=$(docker exec "$ct" "${a[@]}" 2>/dev/null)
  else a+=(-H "Content-Type: application/json" --data @-); r=$(printf '%s' "$bd" | docker exec -i "$ct" "${a[@]}" 2>/dev/null); fi
  CODE=$(printf '%s' "$r" | tail -n1); LAST=$(printf '%s' "$r" | sed '$d'); }
jget(){ printf '%s' "$LAST" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);process.stdout.write(String(j["'"$1"'"]??""))}catch(e){}})'; }

R="${RANDOM}${RANDOM}"
SCOPES='["identity:read","payment_sessions:read","payment_sessions:write","wallet_accounts:read","wallet_accounts:create"]'

# Ownership and cleanup. Everything this run creates is recorded by id and
# retired on the way out, however the script exits — a failed assertion used to
# skip cleanup entirely, which is precisely when residue was left behind.
. "$(cd "$(dirname "$0")" && pwd)/lib/e2e-run.sh"
. "$(cd "$(dirname "$0")" && pwd)/lib/synthetic-tenant.sh"
e2e_begin

echo "### the project under test — a tenant of the run's own"
# The tenant's key carries exactly the scopes above. sandbox-default gives its
# Business a pricing decision, as Financial Setup would.
synthetic_tenant wa "$SCOPES" sandbox-default || { echo "  synthetic tenant not built — the rest would be vacuous"; exit 1; }
PROJECT="$ST_PROJECT"; KEY="$ST_KEY"

echo "### binding (the owner the project is bound to)"
# The column is `state`, not `status`. An earlier run of this harness filtered on
# a column that does not exist, got an empty string back, and every comparison
# against it "passed" as an empty-vs-empty match or failed for the wrong reason.
BOUND_WALLET=$(psqlro "SELECT wallet_id FROM developer.dev_project_sandbox_binding WHERE project_id='$PROJECT' AND state='ACTIVE'")
BOUND_MERCHANT=$(psqlro "SELECT merchant_id FROM developer.dev_project_sandbox_binding WHERE project_id='$PROJECT' AND state='ACTIVE'")
chk "BINDING_ACTIVE" "$([ -n "$BOUND_WALLET" ] && echo yes)" "yes"
[ -n "$BOUND_WALLET" ] || { echo "no binding — the rest would compare against empty strings"; exit 1; }

echo "### keys (the tenant's, and a second project for cross-project checks)"
chk "KEY_ISSUED" "$([ -n "$KEY" ] && echo yes)" "yes"

# The second project must be BOUND to a different owner. An unbound project is
# refused at the binding check (403) before the account is ever loaded, so a
# cross-project test using one proves only that unbound projects are refused —
# which is a different property, pinned separately below.
mint(){ SECRET="$JWTSEC" K="$1" V="$2" node -e 'const c=require("crypto");const b=o=>Buffer.from(typeof o==="string"?o:JSON.stringify(o)).toString("base64url");const n=Math.floor(Date.now()/1000);const cl={scopes:["*"],environment:"SANDBOX",iat:n,exp:n+3600};cl[process.env.K]=process.env.V;const h=b({alg:"HS256",typ:"JWT"}),p=b(cl);process.stdout.write(h+"."+p+"."+c.createHmac("sha256",process.env.SECRET).update(h+"."+p).digest("base64url"));'; }

MJWT=$(mint merchant_id 00000000-0000-0000-0000-000000000001)
call "$GW" 8080 POST /v1/merchants "{\"name\":\"WAO$R\",\"email\":\"wao$R@synthetic.test\"}" "$MJWT"
OMID=$(jget id); e2e_own merchant "$OMID"; MJWT=$(mint merchant_id "$OMID")
call "$GW" 8080 POST /v1/wallets '{"currency":"AOA"}' "$MJWT"
OWID=$(jget id)
OWACCT=$(psqlro "SELECT id FROM wallet_accounts WHERE wallet_id='$OWID' AND purpose='PRIMARY'")

call "$DEV" 8086 POST "/internal/v1/fixture-projects" "{\"name\":\"wa-other-$R\",\"created_by\":\"$ACTOR\"}" "$DEVINT" "X-Internal-Key:"
OTHER=$(jget project_id)
e2e_own fixture_project "$OTHER"
call "$DEV" 8086 POST "/internal/v1/projects/$OTHER/fixture-keys" \
  "{\"name\":\"wa-other-$R\",\"scopes\":$SCOPES,\"created_by\":\"$ACTOR\"}" "$DEVINT" "X-Internal-Key:"
OKEY=$(jget secret)
e2e_own fixture_key "$(jget id)"
call "$DEV" 8086 POST "/internal/v1/projects/$OTHER/binding" \
  "{\"merchant_id\":\"$OMID\",\"wallet_id\":\"$OWID\",\"wallet_account_id\":\"$OWACCT\",\"actor_user_id\":\"$ACTOR\"}" "$DEVINT" "X-Internal-Key:"
chk "OTHER_PROJECT_BOUND" "$([ -n "$OMID" ] && [ -n "$OWID" ] && [ "$CODE" -lt 300 ] && echo yes)" "yes"
chkne "OWNERS_DIFFER" "$OWID" "$BOUND_WALLET"

# An UNBOUND project is a separate case: refused at the binding check, before any
# account is loaded. Pinned here so it is never mistaken for the ownership check.
call "$DEV" 8086 POST "/internal/v1/fixture-projects" "{\"name\":\"wa-unbound-$R\",\"created_by\":\"$ACTOR\"}" "$DEVINT" "X-Internal-Key:"
UNBOUND=$(jget project_id)
e2e_own fixture_project "$UNBOUND"
call "$DEV" 8086 POST "/internal/v1/projects/$UNBOUND/fixture-keys" \
  "{\"name\":\"wa-unbound-$R\",\"scopes\":$SCOPES,\"created_by\":\"$ACTOR\"}" "$DEVINT" "X-Internal-Key:"
UKEY=$(jget secret)
e2e_own fixture_key "$(jget id)"
call "$GW" 8080 GET "/v1/wallet-accounts" - "$UKEY"
chk "UNBOUND_PROJECT_403" "$CODE" "403"

echo "### campaign segregation — two campaigns, two accounts, one owner"
mkacct(){ call "$GW" 8080 POST /v1/wallet-accounts \
  "{\"purpose\":\"CAMPAIGN\",\"reference_type\":\"CAMPAIGN\",\"reference_id\":\"$1\",\"label\":\"$2\"}" "$3"; }

mkacct "camp-a-$R" "Campaign A" "$KEY"; A_CODE="$CODE"; A_ID=$(jget id); A_WALLET=$(jget wallet_id)
mkacct "camp-b-$R" "Campaign B" "$KEY"; B_CODE="$CODE"; B_ID=$(jget id); B_WALLET=$(jget wallet_id)
chk   "A_CREATED"        "$A_CODE"   "201"
chk   "B_CREATED"        "$B_CODE"   "201"
chkne "A_B_DISTINCT"     "$A_ID"     "$B_ID"
chk   "A_UNDER_BINDING"  "$A_WALLET" "$BOUND_WALLET"
chk   "B_UNDER_BINDING"  "$B_WALLET" "$BOUND_WALLET"

echo "### idempotency — the same campaign never gets a second account"
mkacct "camp-a-$R" "Campaign A" "$KEY"; A2_ID=$(jget id)
chk "A_IDEMPOTENT" "$A2_ID" "$A_ID"

echo "### owner selection stays refused"
call "$GW" 8080 POST /v1/wallet-accounts \
  "{\"wallet_id\":\"$BOUND_WALLET\",\"purpose\":\"CAMPAIGN\",\"reference_type\":\"CAMPAIGN\",\"reference_id\":\"camp-x-$R\"}" "$KEY"
# Refused even though the wallet id is the caller's OWN: a field that is
# sometimes honoured teaches integrators it is meaningful.
chk "OWN_WALLET_ID_REFUSED" "$([ "$CODE" -ge 400 ] && echo refused)" "refused"

call "$GW" 8080 POST /v1/payment-sessions \
  "{\"merchant_id\":\"$BOUND_MERCHANT\",\"amount_minor\":1000,\"currency\":\"AOA\"}" "$KEY"
chk "MERCHANT_ID_REFUSED" "$CODE" "400"

echo "### cross-project isolation reads as NOT_FOUND, never FORBIDDEN"
call "$GW" 8080 GET "/v1/wallet-accounts/$A_ID" - "$OKEY"
chk "FOREIGN_ACCOUNT_404" "$CODE" "404"
call "$GW" 8080 GET "/v1/wallet-accounts/$A_ID" - "$KEY"
chk "OWN_ACCOUNT_200" "$CODE" "200"

echo "### list returns only the bound wallet's accounts"
call "$GW" 8080 GET "/v1/wallet-accounts?wallet_id=$BOUND_WALLET" - "$OKEY"
FOREIGN_IN_LIST=$(printf '%s' "$LAST" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);const xs=Array.isArray(j)?j:(j.data||j.wallet_accounts||[]);process.stdout.write(xs.some(a=>a.id==="'"$A_ID"'")?"leaked":"clean")}catch(e){process.stdout.write("clean")}})')
chk "LIST_IGNORES_SUPPLIED_WALLET" "$FOREIGN_IN_LIST" "clean"

echo "### payments land in the campaign's own account"
sess(){ call "$GW" 8080 POST /v1/payment-sessions \
  "{\"wallet_account_id\":\"$1\",\"purpose\":\"DONATION\",\"reference_type\":\"DONATION\",\"reference_id\":\"don-$2-$R\",\"amount_minor\":250000,\"currency\":\"AOA\"}" "$KEY"; }
sess "$A_ID" a; SA_CODE="$CODE"; SA=$(jget session_id); e2e_own payment_session "$SA" "$BOUND_MERCHANT"
sess "$B_ID" b; SB_CODE="$CODE"; SB=$(jget session_id); e2e_own payment_session "$SB" "$BOUND_MERCHANT"
chk   "SESSION_A_OPENED" "$SA_CODE" "201"
chk   "SESSION_B_OPENED" "$SB_CODE" "201"
chkne "SESSIONS_DISTINCT" "$SA" "$SB"
DEST_A=$(psqlro "SELECT wallet_account_id::text FROM payment_sessions WHERE id='$SA'")
DEST_B=$(psqlro "SELECT wallet_account_id::text FROM payment_sessions WHERE id='$SB'")
chk "SESSION_A_CREDITS_A" "$DEST_A" "$A_ID"
chk "SESSION_B_CREDITS_B" "$DEST_B" "$B_ID"

echo "### a foreign account cannot be named as a destination"
call "$GW" 8080 POST /v1/payment-sessions \
  "{\"wallet_account_id\":\"$A_ID\",\"purpose\":\"DONATION\",\"amount_minor\":1000,\"currency\":\"AOA\"}" "$OKEY"
chk "FOREIGN_DESTINATION_404" "$CODE" "404"

echo
echo "WALLET_SUBACCOUNT_E2E: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
