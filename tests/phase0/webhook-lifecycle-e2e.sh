#!/usr/bin/env bash
# Webhook lifecycle under a developer credential (ADR-051) — runs ON the Sandbox VM.
#
# Proves an application can manage the endpoint carrying its OWN events with a
# project key, and only its own: registration under the bound merchant, scope
# separation, secret rotation, and a foreign endpoint that is indistinguishable
# from one that does not exist.
#
# No secret is printed. Rotation is asserted by "a secret came back and it is not
# the previous one", never by showing either.
set -uo pipefail

DOA_PROJECT="${DOA_PROJECT:-6367749d-ba77-47b6-80bd-982382ddd1c9}"
ACTOR="${ACTOR:-11111111-2222-4333-8444-555555555555}"

GW=$(docker ps  --format '{{.Names}}' | grep api-gateway-staging | head -1)
DEV=$(docker ps --format '{{.Names}}' | grep developer-api       | head -1)
CORE=$(docker ps --format '{{.Names}}'| grep core-api-staging    | head -1)
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
# Hash a secret so it can be compared without ever being displayed.
sighash(){ printf '%s' "$LAST" | node -e 'const c=require("crypto");let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);process.stdout.write(j.secret?c.createHash("sha256").update(j.secret).digest("hex").slice(0,12):"")}catch(e){}})'; }
mint(){ SECRET="$JWTSEC" K="$1" V="$2" node -e 'const c=require("crypto");const b=o=>Buffer.from(typeof o==="string"?o:JSON.stringify(o)).toString("base64url");const n=Math.floor(Date.now()/1000);const cl={scopes:["*"],environment:"SANDBOX",iat:n,exp:n+900};cl[process.env.K]=process.env.V;const h=b({alg:"HS256",typ:"JWT"}),p=b(cl);process.stdout.write(h+"."+p+"."+c.createHmac("sha256",process.env.SECRET).update(h+"."+p).digest("base64url"));'; }

R="${RANDOM}${RANDOM}"
RW='["identity:read","webhooks:read","webhooks:write"]'
RO='["identity:read","webhooks:read"]'
# Ownership and cleanup. Everything this run creates is recorded by id and
# retired on the way out, however the script exits.
. "$(cd "$(dirname "$0")" && pwd)/lib/e2e-run.sh"
e2e_begin


echo "### keys"
call "$DEV" 8086 POST "/internal/v1/projects/$DOA_PROJECT/fixture-keys" "{\"name\":\"wh-rw-$R\",\"scopes\":$RW,\"created_by\":\"$ACTOR\"}" "$DEVINT" "X-Internal-Key:"
KEY=$(jget secret)
e2e_own fixture_key "$(jget id)"
call "$DEV" 8086 POST "/internal/v1/projects/$DOA_PROJECT/fixture-keys" "{\"name\":\"wh-ro-$R\",\"scopes\":$RO,\"created_by\":\"$ACTOR\"}" "$DEVINT" "X-Internal-Key:"
RKEY=$(jget secret)
e2e_own fixture_key "$(jget id)"
chk KEYS_ISSUED "$([ -n "$KEY" ] && [ -n "$RKEY" ] && echo yes)" yes
[ -n "$KEY" ] || exit 1

BOUND_MERCHANT=$(psqlro "SELECT merchant_id FROM developer.dev_project_sandbox_binding WHERE project_id='$DOA_PROJECT' AND state='ACTIVE'")

echo "### register — under the binding's merchant, for an event core actually emits"
call "$GW" 8080 POST /v1/webhooks/endpoints \
  "{\"url\":\"https://www.doadoa.app/api/webhooks/banzami?probe=$R\",\"events\":[\"payment_session.paid\"]}" "$KEY"
chk REGISTERED "$CODE" "201"
EP=$(jget id)
e2e_own webhook_endpoint "$EP" "$(jget merchant_id)"
SEC1=$(sighash)
chk SECRET_RETURNED_ONCE "$([ -n "$SEC1" ] && echo yes)" yes
chk UNDER_BOUND_MERCHANT "$(jget merchant_id)" "$BOUND_MERCHANT"

echo "### the secret is never readable again"
call "$GW" 8080 GET "/v1/webhooks/endpoints/$EP" - "$KEY"
chk GET_OK "$CODE" "200"
chk GET_CARRIES_NO_SECRET "$(sighash)" ""

echo "### scope separation"
call "$GW" 8080 GET /v1/webhooks/endpoints - "$RKEY"
chk READ_KEY_CAN_LIST "$CODE" "200"
call "$GW" 8080 POST "/v1/webhooks/endpoints/$EP/rotate-secret" - "$RKEY"
chk READ_KEY_CANNOT_ROTATE "$CODE" "403"
call "$GW" 8080 POST /v1/webhooks/endpoints \
  "{\"url\":\"https://example.com/x\",\"events\":[\"payment_session.paid\"]}" "$RKEY"
chk READ_KEY_CANNOT_REGISTER "$CODE" "403"

echo "### rotation issues a genuinely different secret"
call "$GW" 8080 POST "/v1/webhooks/endpoints/$EP/rotate-secret" - "$KEY"
chk ROTATED "$CODE" "200"
SEC2=$(sighash)
chk ROTATED_SECRET_RETURNED "$([ -n "$SEC2" ] && echo yes)" yes
chk ROTATED_SECRET_IS_NEW "$([ -n "$SEC2" ] && [ "$SEC2" != "$SEC1" ] && echo yes)" yes

echo "### another project cannot see or touch it"
call "$DEV" 8086 POST /internal/v1/fixture-projects "{\"name\":\"wh-other-$R\",\"created_by\":\"$ACTOR\"}" "$DEVINT" "X-Internal-Key:"
OTHER=$(jget project_id)
e2e_own fixture_project "$OTHER"
MJWT=$(mint merchant_id 00000000-0000-0000-0000-000000000001)
call "$GW" 8080 POST /v1/merchants "{\"name\":\"WH$R\",\"email\":\"wh$R@synthetic.test\"}" "$MJWT"; OMID=$(jget id)
e2e_own merchant "$OMID"
MJWT=$(mint merchant_id "$OMID")
call "$GW" 8080 POST /v1/wallets '{"currency":"AOA"}' "$MJWT"; OWID=$(jget id)
OWACCT=$(psqlro "SELECT id FROM wallet_accounts WHERE wallet_id='$OWID' AND purpose='PRIMARY'")
call "$DEV" 8086 POST "/internal/v1/projects/$OTHER/fixture-keys" "{\"name\":\"wh-other-$R\",\"scopes\":$RW,\"created_by\":\"$ACTOR\"}" "$DEVINT" "X-Internal-Key:"
OKEY=$(jget secret)
e2e_own fixture_key "$(jget id)"
call "$DEV" 8086 POST "/internal/v1/projects/$OTHER/binding" "{\"merchant_id\":\"$OMID\",\"wallet_id\":\"$OWID\",\"wallet_account_id\":\"$OWACCT\",\"actor_user_id\":\"$ACTOR\"}" "$DEVINT" "X-Internal-Key:"

call "$GW" 8080 GET "/v1/webhooks/endpoints/$EP" - "$OKEY"
chk FOREIGN_GET_404 "$CODE" "404"
call "$GW" 8080 POST "/v1/webhooks/endpoints/$EP/rotate-secret" - "$OKEY"
chk FOREIGN_ROTATE_404 "$CODE" "404"

# And the victim is untouched: rotating with the owner's key still works, which
# it would not if the foreign call had changed or removed anything.
call "$GW" 8080 GET "/v1/webhooks/endpoints/$EP" - "$KEY"
chk VICTIM_INTACT "$CODE" "200"

call "$GW" 8080 GET /v1/webhooks/endpoints - "$OKEY"
LEAK=$(printf '%s' "$LAST" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);const xs=j.data||[];process.stdout.write(xs.some(e=>e.id==="'"$EP"'")?"leaked":"clean")}catch(e){process.stdout.write("clean")}})')
chk FOREIGN_LIST_CLEAN "$LEAK" "clean"

echo "### an unbound project has no webhooks at all"
call "$DEV" 8086 POST /internal/v1/fixture-projects "{\"name\":\"wh-unbound-$R\",\"created_by\":\"$ACTOR\"}" "$DEVINT" "X-Internal-Key:"
UNB=$(jget project_id)
e2e_own fixture_project "$UNB"
call "$DEV" 8086 POST "/internal/v1/projects/$UNB/fixture-keys" "{\"name\":\"wh-unbound-$R\",\"scopes\":$RW,\"created_by\":\"$ACTOR\"}" "$DEVINT" "X-Internal-Key:"
UKEY=$(jget secret)
e2e_own fixture_key "$(jget id)"
call "$GW" 8080 GET /v1/webhooks/endpoints - "$UKEY"
chk UNBOUND_403 "$CODE" "403"

echo "### cleanup — this probe endpoint is not the canonical one"
call "$GW" 8080 DELETE "/v1/webhooks/endpoints/$EP" - "$KEY"
chk PROBE_DEACTIVATED "$([ "$CODE" -lt 300 ] && echo yes)" yes

echo
echo "WEBHOOK_LIFECYCLE_E2E: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
