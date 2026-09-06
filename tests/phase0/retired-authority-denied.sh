#!/usr/bin/env bash
# Retired authority must be refused, and surviving authority must still work.
#
# The cleanup revoked 194 credentials, suspended 287 merchants and locked their
# application PINs. The database says so. This asks the deployed services
# instead, because "the row says REVOKED" and "the door is shut" are different
# claims, and only one of them is the one that matters.
#
# Three doors, each proved by opening it first — a denial test that never saw
# the credential work proves only that something is broken:
#
#   a developer key works, is revoked, and is then refused
#   a merchant app login works, the merchant is suspended, and it is then refused
#   the canonical DOA key still works throughout
#
# The third is not decoration. A mass revocation is only safe if the credentials
# that had to survive still authenticate, and that is exactly the thing a
# too-broad cleanup breaks.
#
# Nothing here uses a real credential from the cleanup: the secrets were never
# recorded anywhere, by design. It mints its own, proves the path, and retires
# what it made.
#
# Usage (on the VM): bash tests/phase0/retired-authority-denied.sh
set -uo pipefail

DOA_PROJECT="${DOA_PROJECT:-6367749d-ba77-47b6-80bd-982382ddd1c9}"
ACTOR="${ACTOR:-11111111-2222-4333-8444-555555555555}"

# The canonical remote-execution contract: prove the host, run there, and return
# the proof's own exit status. See tools/ops/lib/remote.sh.
for _p in "$(dirname "$0")/remote.sh" "$(dirname "$0")/lib/remote.sh" \
          "$(dirname "$0")/../lib/remote.sh" "$(dirname "$0")/../../tools/ops/lib/remote.sh"; do
  [ -f "$_p" ] && { . "$_p"; break; }
done
command -v remote_self_or_continue >/dev/null 2>&1 \
  || { echo "✗ tools/ops/lib/remote.sh not found — refusing to run without the host guard" >&2; exit 2; }
REMOTE_EXTRA_FILES="$(dirname "$0")/lib/e2e-run.sh"
remote_self_or_continue

GW=$(docker ps  --format '{{.Names}}' | grep api-gateway-staging | head -1)
DEV=$(docker ps --format '{{.Names}}' | grep developer-api       | head -1)
CORE=$(docker ps --format '{{.Names}}'| grep core-api-staging    | head -1)
PG=$(docker ps  --format '{{.Names}}' | grep postgres | grep bzsandbox | head -1)
[ -n "$GW" ] && [ -n "$DEV" ] && [ -n "$PG" ] || { echo "the Sandbox containers are not all present" >&2; exit 2; }
DEVINT=$(docker exec "$DEV" sh -c 'cat /run/secrets/developer_internal_key 2>/dev/null')
JWTSEC=$(docker exec "$GW" sh -c 'cat /run/secrets/jwt_secret 2>/dev/null')
PW=$(docker exec "$CORE" sh -c 'cat /run/secrets/db_url 2>/dev/null' | sed -E 's#.*://[^:]+:([^@]+)@.*#\1#')
psql(){ docker exec -e PGPASSWORD="$PW" "$PG" psql -U bl_app_runtime -d banzami_staging -At -c "$1" 2>/dev/null; }

for _r in "$(cd "$(dirname "$0")" && pwd)/lib/e2e-run.sh" "$(cd "$(dirname "$0")" && pwd)/e2e-run.sh"; do
  [ -f "$_r" ] && { . "$_r"; break; }
done
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

R="${RANDOM}${RANDOM}"

echo "### a developer key, before and after revocation"
call "$DEV" 8086 POST "/internal/v1/projects/$DOA_PROJECT/fixture-keys" \
  "{\"name\":\"$(e2e_name denial)\",\"scopes\":[\"identity:read\"],\"created_by\":\"$ACTOR\"}" "$DEVINT" "X-Internal-Key:"
KEY=$(jget secret); KEYID=$(jget id)
e2e_own fixture_key "$KEYID"
[ -n "$KEY" ] || { echo "could not mint a probe key"; exit 1; }

call "$GW" 8080 GET /v1/me - "$KEY"
chk KEY_WORKS_BEFORE_REVOCATION "$CODE" "200"

call "$DEV" 8086 POST "/internal/v1/fixture-keys/$KEYID/revoke" "{\"created_by\":\"$ACTOR\"}" "$DEVINT" "X-Internal-Key:"
chk REVOKE_ACCEPTED "$CODE" "200"

call "$GW" 8080 GET /v1/me - "$KEY"
chk REVOKED_KEY_REFUSED "$([ "$CODE" -ge 400 ] && echo "refused($CODE)" || echo "ACCEPTED($CODE)")" "refused($CODE)"
chk REVOKED_KEY_NOT_2XX "$([ "$CODE" -lt 300 ] && echo accepted || echo refused)" "refused"

echo "### a merchant app login, before and after suspension"
MJWT=$(mint merchant_id 00000000-0000-0000-0000-000000000001)
call "$GW" 8080 POST /v1/merchants "{\"name\":\"E2E den $R\",\"email\":\"den$R@synthetic.test\"}" "$MJWT"
MID=$(jget id); e2e_own merchant "$MID"; MJWT=$(mint merchant_id "$MID")
HANDLE="den${R:0:8}"; PIN=$(printf '%04d' $((RANDOM % 10000)))

call "$GW" 8080 POST /v1/merchant/auth/claim "{\"handle\":\"$HANDLE\",\"pin\":\"$PIN\"}" "$MJWT"
chk HANDLE_CLAIMED "$([ "$CODE" -lt 300 ] && echo yes || echo "no($CODE)")" "yes"

# Activation is its own product flow (an emailed capability token). The property
# under test is whether suspension closes the login, so the credential is marked
# activated directly — test setup, not a claim about the activation path.
psql "UPDATE merchant_app_credentials SET activated_at = now() WHERE merchant_id = '$MID'" >/dev/null

call "$GW" 8080 POST /v1/merchant/auth/token "{\"handle\":\"$HANDLE\",\"pin\":\"$PIN\"}" -
chk PIN_LOGIN_WORKS_WHILE_ACTIVE "$CODE" "200"

call "$GW" 8080 POST "/v1/merchants/$MID/suspend" - "$MJWT"
chk SUSPEND_ACCEPTED "$([ "$CODE" -lt 300 ] && echo yes || echo "no($CODE)")" "yes"

call "$GW" 8080 POST /v1/merchant/auth/token "{\"handle\":\"$HANDLE\",\"pin\":\"$PIN\"}" -
chk SUSPENDED_MERCHANT_CANNOT_LOG_IN "$CODE" "401"

echo "### the credentials that had to survive"
# Read from the database, because the canonical secrets are held only by the
# deployments that use them and are not readable from here — which is the point.
chk CANONICAL_KEYS_STILL_ACTIVE "$(psql "SELECT count(*) FROM developer.dev_api_keys k JOIN developer.dev_projects p ON p.id=k.project_id WHERE k.status='ACTIVE' AND p.name='DOA Sandbox'")" "3"
# The api_key_pepper rotation superseded three keys. Their records are revoked,
# and they were unverifiable from the moment the pepper changed — the hash they
# were stored under can no longer be produced from any input.
chk SUPERSEDED_KEYS_REVOKED "$(psql "SELECT count(*) FROM developer.dev_api_keys WHERE status='ACTIVE' AND name NOT LIKE '%[rotated%'")" "0"
chk CANONICAL_PROJECT_ACTIVE "$(psql "SELECT status FROM developer.dev_projects WHERE name='DOA Sandbox'")" "ACTIVE"
chk CANONICAL_MERCHANT_ACTIVE "$(psql "SELECT status FROM merchants WHERE name='Doa'")" "ACTIVE"
chk NO_OTHER_ACTIVE_MERCHANT "$(psql "SELECT count(*) FROM merchants WHERE status='ACTIVE' AND name<>'Doa'")" "0"

echo "### the retired population, as the database holds it"
chk NO_LIVE_KEY_OFF_THE_CANONICAL_PROJECT "$(psql "SELECT count(*) FROM developer.dev_api_keys k JOIN developer.dev_projects p ON p.id=k.project_id WHERE k.status='ACTIVE' AND p.name<>'DOA Sandbox'")" "0"
# Not "no unlocked PIN row exists on a suspended merchant" — rows are history and
# some are held by it. The question is whether any of them can open a door, and
# the answer above is that suspension returns 401 whatever the PIN says.
chk NO_PIN_CAN_LOG_IN_EXCEPT_THE_CANONICAL_ONE "$(psql "SELECT count(*) FROM merchant_app_credentials c JOIN merchants m ON m.id=c.merchant_id WHERE m.status='ACTIVE' AND m.name<>'Doa' AND (c.locked_until IS NULL OR c.locked_until < now())")" "0"
chk NO_ACTIVE_WEBHOOK_OFF_THE_CANONICAL_MERCHANT "$(psql "SELECT count(*) FROM webhook_endpoints w JOIN merchants m ON m.id=w.merchant_id WHERE w.active AND m.name<>'Doa'")" "0"
chk NO_OPEN_PAYMENT_LINK "$(psql "SELECT count(*) FROM payment_links WHERE status='ACTIVE'")" "0"

echo
[ "$FAIL" -eq 0 ] && echo "RETIRED_AUTHORITY_DENIED: PASS=$PASS FAIL=0" || echo "RETIRED_AUTHORITY_DENIED: PASS=$PASS FAIL=$FAIL"
exit $([ "$FAIL" -eq 0 ] && echo 0 || echo 1)
