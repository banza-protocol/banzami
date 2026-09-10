#!/usr/bin/env bash
# F0-DP-011 — a real webhook, a real retry, verified by someone who never saw
# the signer. Runs ON the Sandbox VM.
#
# The setup is a generic fixture Project, configured the way Console Financial
# Setup configures one; everything after that is the Project key over public
# HTTPS and a public payer with no credential:
#
#   1. the Project registers its own endpoint on the independent public sink
#      (sandbox-webhook.banzami.com) and receives the signing secret once;
#   2. tools/cleanroom/payer-run.mjs drives payer journeys and judges every
#      delivery with an implementation that imports nothing from the signer:
#      a real delivery, every signature valid as of arrival, a wrong secret
#      and an altered body rejected, a repeat confirmation producing no second
#      event, six concurrent confirmations producing one, and a delivery the
#      sink refuses twice retried with the SAME event id, a fresh timestamp
#      and a fresh signature on every attempt;
#   3. the Developer Platform's own record of that retry — the event id, type,
#      endpoint, each attempt's number, status, HTTP result and timestamps —
#      read back with the Project key: the data the Console's Webhook events
#      page renders.
#
# The signing secret and the key are held in variables and never printed.
# NEVER run under `bash -x`.
set -uo pipefail

API="${API:-https://sandbox-api.banzami.com}"
ACTOR="${ACTOR:-11111111-2222-4333-8444-555555555555}"
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
OUT="${OUT:-/var/tmp/banzami-cleanroom/webhook-retry-$(date +%s)}"

GW=$(docker ps  --format '{{.Names}}' | grep api-gateway-staging | head -1)
CORE=$(docker ps --format '{{.Names}}'| grep core-api-staging    | head -1)
DEV=$(docker ps --format '{{.Names}}' | grep developer-api       | head -1)
PG=$(docker ps  --format '{{.Names}}' | grep postgres | grep bzsandbox | head -1)
EDGE=$(docker ps --format '{{.Names}}' | grep sandbox-edge | head -1)
[ -n "$GW" ] && [ -n "$CORE" ] && [ -n "$DEV" ] && [ -n "$EDGE" ] || { echo "NO_CONTAINERS"; exit 1; }
DEVINT=$(docker exec "$DEV" sh -c 'cat /run/secrets/developer_internal_key 2>/dev/null')
JWTSEC=$(docker exec "$GW" sh -c 'cat /run/secrets/jwt_secret 2>/dev/null')
PW=$(docker exec "$CORE" sh -c 'cat /run/secrets/db_url 2>/dev/null' | sed -E 's#.*://[^:]+:([^@]+)@.*#\1#')
[ -n "$DEVINT" ] && [ -n "$JWTSEC" ] && [ -n "$PW" ] || { echo "NO_SECRET"; exit 1; }
q(){ docker exec -e PGPASSWORD="$PW" -e PGOPTIONS="-c default_transaction_read_only=on" "$PG" \
       psql -q -U bl_app_runtime -d banzami_staging -At -c "$1" 2>/dev/null | tr -d '\r\n'; }

. "$HERE/lib/e2e-run.sh"
e2e_begin

PASS=0; FAIL=0
chk(){ if [ "$2" = "$3" ]; then echo "  $1 PASS ($2)"; PASS=$((PASS+1));
       else echo "  $1 FAIL (got '$2' want '$3')"; FAIL=$((FAIL+1)); fi; }
LAST=""; CODE=""
call(){ local ct="$1" port="$2" m="$3" p="$4" bd="$5" au="${6:--}" hdr="${7:-Authorization: Bearer}"
  local a=(curl -s -w $'\n%{http_code}' -X "$m" "http://localhost:$port$p")
  [ "$au" != "-" ] && a+=(-H "$hdr $au")
  local r
  if [ "$bd" = "-" ]; then r=$(docker exec "$ct" "${a[@]}" 2>/dev/null)
  else a+=(-H "Content-Type: application/json" --data @-); r=$(printf '%s' "$bd" | docker exec -i "$ct" "${a[@]}" 2>/dev/null); fi
  CODE=$(printf '%s' "$r" | tail -n1); LAST=$(printf '%s' "$r" | sed '$d'); }
pub(){ local m="$1" p="$2" bd="$3" key="$4" idem="${5:-}"
  local a=(curl -s -w $'\n%{http_code}' -X "$m" "$API$p" -H @/dev/fd/3)
  [ -n "$idem" ] && a+=(-H "Idempotency-Key: $idem")
  local r
  if [ "$bd" = "-" ]; then r=$("${a[@]}" 3< <(printf 'Authorization: Bearer %s\n' "$key") 2>/dev/null)
  else a+=(-H "Content-Type: application/json" --data @-)
       r=$(printf '%s' "$bd" | "${a[@]}" 3< <(printf 'Authorization: Bearer %s\n' "$key") 2>/dev/null); fi
  CODE=$(printf '%s' "$r" | tail -n1); LAST=$(printf '%s' "$r" | sed '$d'); }
jp(){ printf '%s' "$LAST" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{let j;try{j=JSON.parse(s)}catch(e){return}const v=(function(j){return eval(process.argv[1])})(j);process.stdout.write(v===undefined||v===null?String(v):typeof v==="object"?JSON.stringify(v):String(v))})' "$1"; }
mint(){ SECRET="$JWTSEC" K="$1" V="$2" node -e 'const c=require("crypto");const b=o=>Buffer.from(typeof o==="string"?o:JSON.stringify(o)).toString("base64url");const n=Math.floor(Date.now()/1000);const cl={scopes:["*"],environment:"SANDBOX",iat:n,exp:n+900};cl[process.env.K]=process.env.V;const h=b({alg:"HS256",typ:"JWT"}),p=b(cl);process.stdout.write(h+"."+p+"."+c.createHmac("sha256",process.env.SECRET).update(h+"."+p).digest("base64url"));'; }

R="${RANDOM}${RANDOM}"
SC='["identity:read","payment_sessions:read","payment_sessions:write","webhooks:read","webhooks:write"]'

echo "### a generic fixture Project, configured as Console Financial Setup does"
call "$DEV" 8086 POST /internal/v1/fixture-projects "{\"name\":\"webhook-retry-$R\",\"created_by\":\"$ACTOR\"}" "$DEVINT" "X-Internal-Key:"
P=$(jp j.project_id); e2e_own fixture_project "$P"
call "$DEV" 8086 POST "/internal/v1/projects/$P/fixture-keys" "{\"name\":\"webhook-retry-$R\",\"scopes\":$SC,\"created_by\":\"$ACTOR\"}" "$DEVINT" "X-Internal-Key:"
KEY=$(jp j.secret); e2e_own fixture_key "$(jp j.id)"
ROOT=$(mint merchant_id 00000000-0000-0000-0000-000000000001)
call "$GW" 8080 POST /v1/merchants "{\"name\":\"Sandbox · webhook-retry-$R\",\"email\":\"webhook-retry-$R@projects.banzami.test\"}" "$ROOT"
MID=$(jp j.id); e2e_own merchant "$MID"
call "$GW" 8080 POST /v1/wallets '{"currency":"AOA"}' "$(mint merchant_id "$MID")"; WID=$(jp j.id)
ACCT=$(q "SELECT id FROM wallet_accounts WHERE wallet_id='$WID' AND purpose='PRIMARY'")
H="wr$(printf '%s' "$P$R" | sha256sum | cut -c1-11)"
call "$CORE" 8081 POST /internal/v1/sandbox/business-readiness "{\"merchant_id\":\"$MID\",\"handle\":\"$H\"}"
call "$CORE" 8081 PUT "/internal/v1/merchants/$MID/pricing-profile" '{"profile_code":"sandbox-default"}'
call "$DEV" 8086 POST "/internal/v1/projects/$P/binding" "{\"merchant_id\":\"$MID\",\"wallet_id\":\"$WID\",\"wallet_account_id\":\"$ACCT\",\"actor_user_id\":\"$ACTOR\"}" "$DEVINT" "X-Internal-Key:"
chk PROJECT_READY "$([ -n "$KEY" ] && [ -n "$MID" ] && [ -n "$ACCT" ] && echo yes)" yes

echo "### the Project registers its own endpoint on the independent public sink"
CAP="f0dp011${R}$(date +%s)"
pub POST /v1/webhooks/endpoints "{\"url\":\"https://sandbox-webhook.banzami.com/receive/$CAP\",\"events\":[\"payment_session.paid\",\"payment_link.paid\"]}" "$KEY" "wh-$R"
WHSECRET=$(jp j.secret); EP=$(jp j.id)
[ -n "$EP" ] && e2e_own webhook_endpoint "$EP" "$MID"
chk ENDPOINT_REGISTERED_BY_THE_PROJECT "$CODE/$([ -n "$WHSECRET" ] && echo secret-revealed-once)" "201/secret-revealed-once"
chk ENDPOINT_NAMES_NO_OWNER "$(printf '%s' "$LAST" | grep -c '"merchant_id"')" 0

echo "### the payer side, judged by an independent verifier"
CLEANROOM_PROJECT_KEY="$KEY" CLEANROOM_WH_SECRET="$WHSECRET" \
  node "$REPO/tools/cleanroom/payer-run.mjs" --api "$API" --host local --edge "$EDGE" \
       --capability "$CAP" --out "$OUT"
PR=$?
chk PAYER_RUN "$PR" 0
REPORT="$OUT/cleanroom-payer.json"

echo "### the Developer Platform's own record of the retried event"
pub GET "/v1/webhooks/events?limit=50" - "$KEY"
chk EVENTS_LISTED "$CODE" 200
chk EVENTS_NAME_NO_OWNER "$(printf '%s' "$LAST" | grep -c '"merchant_id"')" 0
EVENTS="$LAST"
best=""; bestn=0; DELIVS=""
for id in $(printf '%s' "$EVENTS" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{for(const e of (JSON.parse(s).data||[]))console.log(e.id)})'); do
  pub GET "/v1/webhooks/events/$id/deliveries" - "$KEY"
  n=$(jp '(j.data||[]).length')
  if [ "${n:-0}" -gt "$bestn" ]; then bestn=$n; best=$id; DELIVS="$LAST"; fi
done
LAST="$DELIVS"
chk RETRIED_EVENT_HAS_AT_LEAST_THREE_ATTEMPTS "$([ "$bestn" -ge 3 ] && echo yes)" yes
chk ONE_EVENT_ID_ACROSS_ATTEMPTS "$(jp 'new Set((j.data||[]).map(d=>d.event_id)).size')" 1
chk ONE_ENDPOINT_ACROSS_ATTEMPTS "$(jp '[...new Set((j.data||[]).map(d=>d.endpoint_id))].join()')" "$EP"
chk ATTEMPT_NUMBERS_ASCEND "$(jp 'const a=(j.data||[]).map(d=>d.attempt_number).sort((x,y)=>x-y); String(a.every((v,i)=>v===i+1))')" true
chk REFUSED_ATTEMPTS_RECORD_THE_HTTP_RESULT "$(jp '(j.data||[]).slice().sort((x,y)=>x.attempt_number-y.attempt_number).slice(0,2).map(d=>d.status+":"+d.status_code).join(",")')" "failed:500,failed:500"
chk FINAL_ATTEMPT_DELIVERED "$(jp 'const d=(j.data||[]).slice().sort((x,y)=>y.attempt_number-x.attempt_number)[0]; d.status+":"+d.status_code+":"+Boolean(d.delivered_at)')" "success:200:true"
chk EVERY_ATTEMPT_TIMESTAMPED "$(jp 'String((j.data||[]).every(d=>d.created_at))')" true
echo "  event=$best attempts=$bestn"
echo "  $(jp '(j.data||[]).slice().sort((x,y)=>x.attempt_number-y.attempt_number).map(d=>`#${d.attempt_number} ${d.status} ${d.status_code||"-"} ${d.created_at}`).join(" | ")')"

echo
echo "WEBHOOK_RETRY_CLEANROOM: PASS=$PASS FAIL=$FAIL  report=$REPORT"
[ "$FAIL" -eq 0 ] || exit 1
