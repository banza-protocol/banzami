#!/usr/bin/env bash
# A Project reads its own financial readiness — and readiness tells the truth
# about settlement. Runs ON the Sandbox VM; every Project-key call goes over
# public HTTPS, exactly as an integrator's would.
#
# THE CLAIM (ADR-057)
#
#   settlement.ready == true   ⇔   a settlement's deterministic prerequisites pass
#
# and each blocker is the refusal a settlement returns. Asserted by asking
# readiness, then settling, on the same Project, for each case:
#
#   CASE A  an ordinary Project on sandbox-default (settlement 0 bps, payout 75)
#           — ready with no classification; the fee is 0 and a named destination
#           is not validated.
#   CASE B  a generic application Project on sandbox-reference (200 bps)
#           — before an operator classifies it: blocked, and settlement refuses
#             with the same code;
#           — after: ready, and 100 000 settles at fee 2 000, net 98 000, with the
#             pricing snapshot recorded.
#
# Plus the contract edges: an unconfigured Project is a state, not an error; an
# invalid key is 401; a key without identity:read is 403; a Project key is sent
# away from the Business profile; a caller pricing field is refused; and no
# response names anything behind the Project.
#
# SETUP IS THE OPERATOR'S, AND SAYS SO
#
# The fixtures are created the way Console Financial Setup creates them — a
# merchant, a wallet, the Sandbox readiness step (handle + test KYB), a pricing
# profile, a binding — through internal routes, because a harness has no Console
# session. The CASE B classification goes through core's classification route,
# which records BUSINESS_ACCOUNT_TYPE_CHANGED like the operator path does. No
# Project-key call below touches an internal route, a database or an operator
# credential. No application is named: both cases are generic fixtures.
#
# NEVER run under `bash -x`: the setup reads the DB password and JWT secret.
set -uo pipefail

API="${API:-https://sandbox-api.banzami.com}"
ACTOR="${ACTOR:-11111111-2222-4333-8444-555555555555}"
GROSS=100000

GW=$(docker ps  --format '{{.Names}}' | grep api-gateway-staging | head -1)
PUB=$(docker ps --format '{{.Names}}' | grep public-api-staging  | head -1)
CORE=$(docker ps --format '{{.Names}}'| grep core-api-staging    | head -1)
DEV=$(docker ps --format '{{.Names}}' | grep developer-api       | head -1)
PG=$(docker ps  --format '{{.Names}}' | grep postgres | grep bzsandbox | head -1)
[ -n "$GW" ] && [ -n "$CORE" ] && [ -n "$DEV" ] && [ -n "$PG" ] || { echo "NO_CONTAINERS"; exit 1; }
DEVINT=$(docker exec "$DEV" sh -c 'cat /run/secrets/developer_internal_key 2>/dev/null')
JWTSEC=$(docker exec "$GW" sh -c 'cat /run/secrets/jwt_secret 2>/dev/null')
PW=$(docker exec "$CORE" sh -c 'cat /run/secrets/db_url 2>/dev/null' | sed -E 's#.*://[^:]+:([^@]+)@.*#\1#')
[ -n "$DEVINT" ] && [ -n "$JWTSEC" ] && [ -n "$PW" ] || { echo "NO_SECRET"; exit 1; }
q(){ docker exec -e PGPASSWORD="$PW" -e PGOPTIONS="-c default_transaction_read_only=on" "$PG" \
       psql -q -U bl_app_runtime -d banzami_staging -At -c "$1" 2>/dev/null | tr -d '\r\n'; }

. "$(cd "$(dirname "$0")" && pwd)/lib/e2e-run.sh"
e2e_begin

PASS=0; FAIL=0
chk(){ if [ "$2" = "$3" ]; then echo "  $1 PASS ($2)"; PASS=$((PASS+1));
       else echo "  $1 FAIL (got '$2' want '$3')"; FAIL=$((FAIL+1)); fi; }

LAST=""; CODE=""
# Internal setup call inside a container.
call(){ local ct="$1" port="$2" m="$3" p="$4" bd="$5" au="${6:--}" hdr="${7:-Authorization: Bearer}"
  local a=(curl -s -w $'\n%{http_code}' -X "$m" "http://localhost:$port$p")
  [ "$au" != "-" ] && a+=(-H "$hdr $au")
  local r
  if [ "$bd" = "-" ]; then r=$(docker exec "$ct" "${a[@]}" 2>/dev/null)
  else a+=(-H "Content-Type: application/json" --data @-); r=$(printf '%s' "$bd" | docker exec -i "$ct" "${a[@]}" 2>/dev/null); fi
  CODE=$(printf '%s' "$r" | tail -n1); LAST=$(printf '%s' "$r" | sed '$d'); }
# A Project-key call over public HTTPS. The key goes in a header read from a
# file descriptor, so it never appears in a process list.
pub(){ local m="$1" p="$2" bd="$3" key="$4" idem="${5:-}"
  local a=(curl -s -w $'\n%{http_code}' -X "$m" "$API$p" -H @/dev/fd/3)
  [ -n "$idem" ] && a+=(-H "Idempotency-Key: $idem")
  local r
  if [ "$bd" = "-" ]; then r=$("${a[@]}" 3< <(printf 'Authorization: Bearer %s\n' "$key") 2>/dev/null)
  else a+=(-H "Content-Type: application/json" --data @-)
       r=$(printf '%s' "$bd" | "${a[@]}" 3< <(printf 'Authorization: Bearer %s\n' "$key") 2>/dev/null); fi
  CODE=$(printf '%s' "$r" | tail -n1); LAST=$(printf '%s' "$r" | sed '$d'); }
# jp '<js expression over j>' — read the last body.
jp(){ printf '%s' "$LAST" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{let j;try{j=JSON.parse(s)}catch(e){process.stdout.write("");return}const v=(function(j){return eval(process.argv[1])})(j);process.stdout.write(v===undefined||v===null?String(v):typeof v==="object"?JSON.stringify(v):String(v))})' "$1"; }
mint(){ SECRET="$JWTSEC" K="$1" V="$2" node -e 'const c=require("crypto");const b=o=>Buffer.from(typeof o==="string"?o:JSON.stringify(o)).toString("base64url");const n=Math.floor(Date.now()/1000);const cl={scopes:["*"],environment:"SANDBOX",iat:n,exp:n+900};cl[process.env.K]=process.env.V;const h=b({alg:"HS256",typ:"JWT"}),p=b(cl);process.stdout.write(h+"."+p+"."+c.createHmac("sha256",process.env.SECRET).update(h+"."+p).digest("base64url"));'; }
unbalanced(){ q "SELECT COUNT(*) FROM (SELECT p.id FROM ledger_postings p JOIN ledger_entries e ON e.posting_id=p.id
                  GROUP BY p.id HAVING SUM(CASE e.entry_type WHEN 'DEBIT' THEN -e.amount_minor ELSE e.amount_minor END) <> 0) x"; }

R="${RANDOM}${RANDOM}"
SC='["identity:read","payment_sessions:read","payment_sessions:write","wallet_accounts:read","wallet_accounts:create","application_settlements:write"]'

chk LEDGER_SOUND_BEFORE "$(unbalanced)" "0"

echo "### a payer and a beneficiary, shared by both cases"
onboard(){ local ph="+2449${R:0:4}$1" h="pr${R:0:5}$1" sid
  call "$PUB" 8083 POST /v1/consumer/onboarding/start "{\"phone_number\":\"$ph\",\"currency\":\"AOA\",\"otp_plaintext_for_test\":\"123456\"}"
  sid=$(jp j.session_id)
  call "$PUB" 8083 POST /v1/consumer/onboarding/verify-otp "{\"session_id\":\"$sid\",\"otp_code\":\"123456\"}"
  call "$PUB" 8083 POST /v1/consumer/onboarding/complete "{\"session_id\":\"$sid\",\"banza_handle\":\"$h\",\"pin\":\"1234\"}"
  printf '%s|%s' "$(jp j.consumer_id)" "$h"; }
IFS='|' read -r PAYER_ID PAYER_HANDLE <<<"$(onboard 81)"
PAYER_JWT=$(mint customer_id "$PAYER_ID")
call "$GW" 8080 POST /v1/compliance/customers/verify \
  "{\"full_name\":\"PROJECT READINESS\",\"document_type\":\"BILHETE_DE_IDENTIDADE\",\"document_number\":\"PR$R\",\"date_of_birth\":\"1990-01-01\",\"requested_level\":\"BASIC\"}" "$PAYER_JWT"
call "$PUB" 8083 POST /v1/sandbox/fund "{\"amount_minor\":$(( GROSS * 4 )),\"currency\":\"AOA\"}" "$PAYER_JWT"
IFS='|' read -r BEN_ID BEN_HANDLE <<<"$(onboard 82)"
chk PARTIES_READY "$([ -n "$PAYER_ID" ] && [ -n "$BEN_HANDLE" ] && echo yes)" yes

# A fixture Project with a key. Unbound: the state every Project starts in.
mkproject(){ # $1 label -> P|KEY
  local p key
  call "$DEV" 8086 POST /internal/v1/fixture-projects "{\"name\":\"readiness-$1-$R\",\"created_by\":\"$ACTOR\"}" "$DEVINT" "X-Internal-Key:"
  p=$(jp j.project_id); e2e_own fixture_project "$p"
  call "$DEV" 8086 POST "/internal/v1/projects/$p/fixture-keys" "{\"name\":\"readiness-$1-$R\",\"scopes\":$SC,\"created_by\":\"$ACTOR\"}" "$DEVINT" "X-Internal-Key:"
  key=$(jp j.secret); e2e_own fixture_key "$(jp j.id)"
  printf '%s|%s' "$p" "$key"; }

# Configure it the way Console Financial Setup does. $1 P, $2 label, $3 profile
configure(){ local p="$1" label="$2" profile="$3" root mid mjwt wid acct h
  root=$(mint merchant_id 00000000-0000-0000-0000-000000000001)
  call "$GW" 8080 POST /v1/merchants "{\"name\":\"Sandbox · readiness-$label-$R\",\"email\":\"readiness-$label-$R@projects.banzami.test\"}" "$root"
  mid=$(jp j.id); e2e_own merchant "$mid"
  mjwt=$(mint merchant_id "$mid")
  call "$GW" 8080 POST /v1/wallets '{"currency":"AOA"}' "$mjwt"; wid=$(jp j.id)
  acct=$(q "SELECT id FROM wallet_accounts WHERE wallet_id='$wid' AND purpose='PRIMARY'")
  h="pr$(printf '%s' "$p$R" | sha256sum | cut -c1-11)"
  call "$CORE" 8081 POST /internal/v1/sandbox/business-readiness "{\"merchant_id\":\"$mid\",\"handle\":\"$h\"}"
  call "$CORE" 8081 PUT "/internal/v1/merchants/$mid/pricing-profile" "{\"profile_code\":\"$profile\"}"
  call "$DEV" 8086 POST "/internal/v1/projects/$p/binding" "{\"merchant_id\":\"$mid\",\"wallet_id\":\"$wid\",\"wallet_account_id\":\"$acct\",\"actor_user_id\":\"$ACTOR\"}" "$DEVINT" "X-Internal-Key:"
  printf '%s|%s|%s|%s' "$mid" "$wid" "$acct" "$h"; }

# Fund a fresh CAMPAIGN account through a paid session, all with the key.
fund(){ # $1 key $2 label -> account id
  local key="$1" acct slug
  pub POST /v1/wallet-accounts "{\"purpose\":\"CAMPAIGN\",\"label\":\"readiness $2\",\"reference_type\":\"CAMPAIGN\",\"reference_id\":\"rd-$2-$R\"}" "$key" "wa-$2-$R"
  acct=$(jp j.id)
  pub POST /v1/payment-sessions "{\"amount_minor\":$GROSS,\"currency\":\"AOA\",\"purpose\":\"DONATION\",\"wallet_account_id\":\"$acct\",\"reference_type\":\"CAMPAIGN\",\"reference_id\":\"rd-$2-$R\"}" "$key" "ps-$2-$R"
  slug=$(jp '((j.interfaces||[]).find(i=>i.type==="PAYMENT_LINK")||{}).value?.split("/").filter(Boolean).pop()')
  call "$PUB" 8083 POST "/v1/payment-links/$slug/pay" "{\"amount_minor\":$GROSS}" "$PAYER_JWT"
  printf '%s' "$acct"; }

settle(){ # $1 key $2 account $3 idem $4 fee destination (optional)
  local fd=""; [ -n "${4:-}" ] && fd=",\"fee_destination_banza_name\":\"$4\""
  pub POST /v1/application-settlements "{\"idempotency_key\":\"st-$3-$R\",\"source_account_id\":\"$2\",\"beneficiary_banza_name\":\"$BEN_HANDLE\",\"reason\":\"CAMPAIGN_CLOSE\",\"reference_type\":\"CAMPAIGN\",\"reference_id\":\"st-$3-$R\"$fd}" "$1" "st-$3-$R"; }

# The readiness body must name nothing behind the Project.
no_leak(){ # $1 label, then ids
  local label="$1"; shift; local leaked=""
  for id in "$@"; do [ -n "$id" ] && printf '%s' "$LAST" | grep -q "$id" && leaked="$leaked $id"; done
  for k in merchant_id wallet_id account_id binding workspace_id; do printf '%s' "$LAST" | grep -q "\"$k\"" && leaked="$leaked $k"; done
  chk "${label}_NAMES_NOTHING_BEHIND_THE_PROJECT" "${leaked:-none}" none; }

echo
echo "### CASE A — an ordinary Project on sandbox-default"
IFS='|' read -r PA KA <<<"$(mkproject a)"
chk A_KEY_ISSUED "$([ -n "$KA" ] && echo yes)" yes

pub GET /v1/me - "$KA"
chk A_ME_200 "$CODE" 200
chk A_ME_PROJECT_ID_IS_THE_PROJECT "$(jp j.project.id)" "$PA"
chk A_ME_PROJECT_REF "$(jp j.project.ref)" "readiness-a-$R"

pub GET /v1/financial-setup - "$KA"
chk A_UNCONFIGURED_IS_200 "$CODE" 200
chk A_UNCONFIGURED_STATE "$(jp j.financial_setup.state)" UNCONFIGURED
chk A_UNCONFIGURED_BLOCKER "$(jp 'j.settlement.blockers.join(",")')" FINANCIAL_SETUP_NOT_CONFIGURED
chk A_UNCONFIGURED_NOT_READY "$(jp j.settlement.ready)" false

IFS='|' read -r MA WA AA HA <<<"$(configure "$PA" a sandbox-default)"
pub GET /v1/financial-setup - "$KA"
chk A_READY_200 "$CODE" 200
chk A_PROJECT_ID "$(jp j.project.id)" "$PA"
chk A_STATE "$(jp j.financial_setup.state)" READY
chk A_HANDLE "$(jp j.financial_identity.handle)" "@$HA"
chk A_KYB "$(jp j.kyb.status)" APPROVED
chk A_WALLET "$(jp '`${j.wallet.status}/${j.wallet.ready}/${j.wallet.currency}`')" "ACTIVE/true/AOA"
chk A_PRICING "$(jp '`${j.pricing.profile}/${j.pricing.settlement_bps}/${j.pricing.payout_bps}`')" "sandbox-default/0/75"
chk A_NO_FEE_NO_DESTINATION_NEEDED "$(jp j.fee_destination.required)" false
chk A_NOT_CLASSIFIED "$(jp j.fee_destination.type_allowed)" false
chk A_SETTLEMENT_READY "$(jp j.settlement.ready)" true
chk A_NO_BLOCKERS "$(jp 'j.settlement.blockers.length')" 0
no_leak A "$MA" "$WA" "$AA"
A_READY=$(jp j.settlement.ready)

# Readiness said ready — settlement must agree, at the rate readiness reported.
SRC_A=$(fund "$KA" a1)
settle "$KA" "$SRC_A" a1 "$HA"
chk A_SETTLES_AS_READINESS_SAID "$([ "$A_READY" = true ] && [ "$CODE" = 201 ] && echo agree)" agree
chk A_FEE_ZERO "$(jp j.application_fee_minor)" 0
chk A_NET_IS_GROSS "$(jp j.net_amount_minor)" "$GROSS"
chk A_SNAPSHOT "$(jp '`${j.pricing.profile}/${j.pricing.applied_bps}`')" "sandbox-default/0"

# The caller does not choose a price — refused before anything moves.
SRC_A2=$(fund "$KA" a2)
pub POST /v1/application-settlements "{\"idempotency_key\":\"px-$R\",\"source_account_id\":\"$SRC_A2\",\"beneficiary_banza_name\":\"$BEN_HANDLE\",\"application_fee_bps\":4999,\"reference_type\":\"CAMPAIGN\",\"reference_id\":\"px-$R\"}" "$KA" "px-$R"
chk CALLER_PRICING_REFUSED "$CODE/$(jp j.code)" "400/PRICING_FIELD_NOT_ACCEPTED"

echo
echo "### CASE B — a generic application Project on sandbox-reference"
IFS='|' read -r PB KB <<<"$(mkproject b)"
IFS='|' read -r MB WB AB HB <<<"$(configure "$PB" b sandbox-reference)"
pub GET /v1/financial-setup - "$KB"
chk B_PRICING "$(jp '`${j.pricing.profile}/${j.pricing.settlement_bps}/${j.pricing.payout_bps}`')" "sandbox-reference/200/75"
chk B_FEE_NEEDS_A_DESTINATION "$(jp j.fee_destination.required)" true
chk B_UNCLASSIFIED_BLOCKED "$(jp 'j.settlement.blockers.join(",")')" FEE_DESTINATION_TYPE_NOT_ALLOWED
chk B_UNCLASSIFIED_NOT_READY "$(jp j.settlement.ready)" false
B_BLOCKER=$(jp 'j.settlement.blockers[0]')

SRC_B=$(fund "$KB" b1)
settle "$KB" "$SRC_B" b0 "$HB"
chk B_SETTLEMENT_REFUSES_WITH_THE_SAME_CODE "$(jp j.code)" "$B_BLOCKER"
chk B_NOTHING_MOVED "$([ "$CODE" -ge 400 ] && echo refused)" refused

# An operator decision, recorded — never a request of the Project's.
call "$CORE" 8081 PATCH "/internal/v1/merchants/$MB/business-account-type" '{"business_account_type":"APPLICATION"}'
chk B_CLASSIFIED_BY_OPERATOR "$CODE" 200
chk B_CLASSIFICATION_AUDITED "$(q "SELECT count(*) FROM audit_log WHERE action='BUSINESS_ACCOUNT_TYPE_CHANGED' AND subject='merchant:$MB'")" 1

pub GET /v1/financial-setup - "$KB"
chk B_READY "$(jp j.settlement.ready)" true
chk B_NO_BLOCKERS "$(jp 'j.settlement.blockers.length')" 0
chk B_FEE_DESTINATION "$(jp '["resolved","owned_by_project","kyb_approved","wallet_active","type_allowed","application_account_ready"].map(k=>j.fee_destination[k]).join(",")')" "true,true,true,true,true,true"
no_leak B "$MB" "$WB" "$AB"

settle "$KB" "$SRC_B" b1 "$HB"
chk B_SETTLES_AS_READINESS_SAID "$CODE" 201
chk B_FEE "$(jp j.application_fee_minor)" 2000
chk B_NET "$(jp j.net_amount_minor)" 98000
chk B_SNAPSHOT "$(jp '`${j.pricing.profile}/${j.pricing.applied_bps}`')" "sandbox-reference/200"
B_SID=$(jp j.id)
chk B_SNAPSHOT_STORED "$(q "SELECT (pricing_snapshot_json->>'pricing_profile')||'/'||(pricing_snapshot_json->>'rate_bps')||'/'||gross_amount_minor||'/'||application_fee_minor||'/'||net_amount_minor FROM app_settlements WHERE id='$B_SID'")" "sandbox-reference/200/100000/2000/98000"

echo
echo "### the contract's edges"
pub GET /v1/financial-setup - "bz_test_sk_invalid${R}"
chk INVALID_KEY_401 "$CODE" 401
call "$DEV" 8086 POST "/internal/v1/projects/$PA/fixture-keys" "{\"name\":\"readiness-noscope-$R\",\"scopes\":[\"payment_sessions:read\"],\"created_by\":\"$ACTOR\"}" "$DEVINT" "X-Internal-Key:"
KN=$(jp j.secret); e2e_own fixture_key "$(jp j.id)"
pub GET /v1/financial-setup - "$KN"
chk NO_SCOPE_403 "$CODE/$(jp j.code)" "403/INSUFFICIENT_SCOPE"
pub GET /v1/integration - "$KA"
chk PROJECT_KEY_SENT_FROM_BUSINESS_PROFILE "$CODE/$(jp j.code)" "403/USE_FINANCIAL_SETUP"
pub GET "/v1/financial-setup?merchant_id=$MB" - "$KA"
chk REQUEST_CANNOT_NAME_ANOTHER_OWNER "$(jp j.financial_identity.handle)" "@$HA"

echo
chk LEDGER_SOUND_AFTER "$(unbalanced)" "0"
echo
echo "PROJECT_READINESS_E2E: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
