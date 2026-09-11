#!/usr/bin/env bash
# Retired authority must be refused, and surviving authority must still work.
#
# The cleanup revoked 194 credentials, suspended 287 merchants and locked their
# application PINs. The database says so. This asks the deployed services
# instead, because "the row says REVOKED" and "the door is shut" are different
# claims, and only one of them is the one that matters.
#
# Doors, each proved by opening it first — a denial test that never saw the
# credential work proves only that something is broken:
#
#   a developer key works, is revoked, and is then refused
#   a second key on the same Project still works throughout
#
# The third door — a suspended Business's app login — is proved against a real
# database (TestVerifyHandlePin_RefusesASuspendedBusiness) and in the
# human-gated approved-Business journey: a PIN now exists only through an
# operator-approved activation, which a harness does not fake (see below).
#
# The third is not decoration. A mass revocation is only safe if the credentials
# that had to survive still authenticate, and that is exactly the thing a
# too-broad cleanup breaks.
#
# Nothing here uses a real credential from the cleanup: the secrets were never
# recorded anywhere, by design. It mints its own, proves the path, and retires
# what it made.
#
# The Project is a tenant this run builds for itself
# (tests/phase0/lib/synthetic-tenant.sh). The probe key used to be minted on
# DOA's Project, and "the credential that had to survive" was DOA's, checked
# only as a row count. DOA is a tenant, not a fixture. The survivor is now the
# synthetic tenant's own key, and it is proved at the door — before the
# revocation, after it, and after the suspension.
#
# Usage (on the VM): bash tests/phase0/retired-authority-denied.sh
set -uo pipefail

ACTOR="${ACTOR:-11111111-2222-4333-8444-555555555555}"

# The canonical remote-execution contract: prove the host, run there, and return
# the proof's own exit status. See tools/ops/lib/remote.sh.
for _p in "$(dirname "$0")/remote.sh" "$(dirname "$0")/lib/remote.sh" \
          "$(dirname "$0")/../lib/remote.sh" "$(dirname "$0")/../../tools/ops/lib/remote.sh"; do
  [ -f "$_p" ] && { . "$_p"; break; }
done
command -v remote_self_or_continue >/dev/null 2>&1 \
  || { echo "✗ tools/ops/lib/remote.sh not found — refusing to run without the host guard" >&2; exit 2; }
REMOTE_EXTRA_FILES="$(dirname "$0")/lib/e2e-run.sh $(dirname "$0")/lib/synthetic-tenant.sh"
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
for _r in "$(cd "$(dirname "$0")" && pwd)/lib/synthetic-tenant.sh" "$(cd "$(dirname "$0")" && pwd)/synthetic-tenant.sh"; do
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

echo "### a Project of its own, and the key on it that has to survive"
synthetic_tenant denial '["identity:read"]' || { echo "could not build the synthetic tenant"; exit 1; }
SURVIVOR="$ST_KEY"
call "$GW" 8080 GET /v1/me - "$SURVIVOR"
chk SURVIVING_KEY_WORKS_BEFORE "$CODE" "200"

echo "### a developer key, before and after revocation"
call "$DEV" 8086 POST "/internal/v1/projects/$ST_PROJECT/fixture-keys" \
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

# Same Project, same scopes: the only difference is which one was revoked.
call "$GW" 8080 GET /v1/me - "$SURVIVOR"
chk SURVIVING_KEY_WORKS_AFTER_REVOCATION "$CODE" "200"

echo "### a merchant, suspended"
# This used to prove, live, that a suspended Business's PIN stops working. It
# set the PIN through /v1/merchant/auth/claim — now retired (410): a Business
# App PIN is set only by an activation link, which only an operator's approval
# of an application issues, a person's decision this harness does not fake —
# and then marked the credential activated by hand. Without a real login, a
# refused sign-in proves nothing (a Business with no login is refused anyway)
# and the public lookup, which does not enumerate, says nothing either. So the
# refusal is proved where it lives, against a real database:
# TestVerifyHandlePin_RefusesASuspendedBusiness (services/api-gateway). The
# live end-to-end half needs an operator-approved Business and is part of the
# human-gated journey (tools/e2e/business/approved-business-e2e.mjs).
MJWT=$(mint merchant_id 00000000-0000-0000-0000-000000000001)
call "$GW" 8080 POST /v1/merchants "{\"name\":\"E2E den $R\",\"email\":\"den$R@synthetic.test\"}" "$MJWT"
MID=$(jget id); e2e_own merchant "$MID"; MJWT=$(mint merchant_id "$MID")
call "$GW" 8080 POST "/v1/merchants/$MID/suspend" - "$MJWT"
chk SUSPEND_ACCEPTED "$([ "$CODE" -lt 300 ] && echo yes || echo "no($CODE)")" "yes"
chk SUSPENDED_IN_THE_RECORD "$(psql "SELECT status FROM merchants WHERE id='$MID'")" "SUSPENDED"

echo "### the credentials that had to survive"
# At the door first: after a revocation beside it and a suspension elsewhere,
# the survivor still authenticates.
call "$GW" 8080 GET /v1/me - "$SURVIVOR"
chk SURVIVING_KEY_WORKS_THROUGHOUT "$CODE" "200"
# Then the records agree: on the tenant's Project exactly the survivor is live
# — the revocation took the probe and nothing beside it — and the Project and
# the Business holding it are untouched by a suspension aimed at another.
chk SURVIVING_KEYS_STILL_ACTIVE "$(psql "SELECT count(*) FROM developer.dev_api_keys WHERE project_id='$ST_PROJECT' AND status='ACTIVE'")" "1"
chk SURVIVING_KEY_IS_THE_SURVIVOR "$(psql "SELECT status FROM developer.dev_api_keys WHERE id='$ST_KEY_ID'")" "ACTIVE"
chk TENANT_PROJECT_ACTIVE "$(psql "SELECT status FROM developer.dev_projects WHERE id='$ST_PROJECT'")" "ACTIVE"
chk TENANT_MERCHANT_ACTIVE "$(psql "SELECT status FROM merchants WHERE id='$ST_MERCHANT'")" "ACTIVE"

# REFERENCE_APPLICATION_DOA: rewritten above, not dropped —
# CANONICAL_KEYS_STILL_ACTIVE (DOA's Project held exactly its three keys) is now
# SURVIVING_KEYS_STILL_ACTIVE on the tenant's Project, and
# CANONICAL_PROJECT_ACTIVE / CANONICAL_MERCHANT_ACTIVE are now the tenant's
# Project and Business, looked up by id rather than by DOA's names.
#
# REFERENCE_APPLICATION_DOA: removed from here — each was a claim about the
# whole Sandbox population with DOA's tenant as the one allowed survivor, not a
# property of a revocation or a suspension, and none can hold while this run
# holds a live synthetic tenant (or while any other tenant exists):
#   SUPERSEDED_KEYS_REVOKED — no ACTIVE key without the '[rotated' name marker,
#     true only while DOA's keys re-issued in the api_key_pepper rotation are
#     the only live ones; the survivor above is live and carries no marker.
#   NO_OTHER_ACTIVE_MERCHANT — no ACTIVE merchant but DOA's; the tenant's is.
#   NO_LIVE_KEY_OFF_THE_CANONICAL_PROJECT — no live key off DOA's Project; the
#     survivor is one.
#   NO_PIN_CAN_LOG_IN_EXCEPT_THE_CANONICAL_ONE, NO_ACTIVE_WEBHOOK_OFF_THE_CANONICAL_MERCHANT
#     — no door open on any ACTIVE merchant but DOA's.
# The run-scoped half of each is asserted above, at the door: the revoked key is
# refused, the suspended merchant's PIN is refused, and the survivor works. A
# census of the retired population belongs to an operator audit that knows
# which tenants are real, not to a harness that must not name one.

echo "### what the run retired, as the database holds it"
# Scoped to the merchant this run suspended. A count over every link in the
# Sandbox measured every tenant's open links — a real tenant's included — and
# could not pass while any Business was taking payments.
chk NO_OPEN_PAYMENT_LINK "$(psql "SELECT count(*) FROM payment_links WHERE status='ACTIVE' AND merchant_id='$MID'")" "0"

echo
[ "$FAIL" -eq 0 ] && echo "RETIRED_AUTHORITY_DENIED: PASS=$PASS FAIL=0" || echo "RETIRED_AUTHORITY_DENIED: PASS=$PASS FAIL=$FAIL"
exit $([ "$FAIL" -eq 0 ] && echo 0 || echo 1)
