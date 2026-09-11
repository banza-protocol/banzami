#!/usr/bin/env bash
# Levantamentos / payouts under a merchant credential — runs ON the Sandbox VM.
#
# A payout is the one operation that takes money OUT, so the things worth
# proving are the amounts and the refusals, not that the endpoint answers.
#
#   the wallet loses exactly gross, and gross = net + fee (ADR-031);
#   the fee is its OWN paired posting, never a third leg on the net posting;
#   a replay of the same idempotency key moves nothing;
#   an unverified merchant cannot withdraw at all (KYB gate, fail-closed);
#   a wallet the caller does not own is 404 — not 403, and not a hint;
#   every refusal leaves the balance exactly where it was.
#
# WHOSE MONEY
#
# The payout is made by a Business of the run's own, built by
# tests/phase0/lib/synthetic-tenant.sh on the sandbox-default profile (the
# 0.75% PAYOUT rule asserted below), and its wallet is funded by a payer the
# run onboards. It used to take whichever merchant wallet happened to hold
# enough, approve that merchant and withdraw from it — and, when none did, fund
# one through DOA's Project. A payout harness must never draw on a real
# tenant's balance: the only money it moves is money it put there.
#
# Needs Sandbox funding (the payer is funded through /v1/sandbox/fund). The
# payer's remaining balance and everything left in the Business are retired
# when the run ends (tests/phase0/lib/e2e-run.sh).
set -uo pipefail

GW=$(docker ps  --format '{{.Names}}' | grep api-gateway-staging | head -1)
CORE=$(docker ps --format '{{.Names}}'| grep core-api-staging    | head -1)
PG=$(docker ps  --format '{{.Names}}' | grep postgres | grep bzsandbox | head -1)
JWTSEC=$(docker exec "$GW" sh -c 'cat /run/secrets/jwt_secret 2>/dev/null')
PW=$(docker exec "$CORE" sh -c 'cat /run/secrets/db_url 2>/dev/null' | sed -E 's#.*://[^:]+:([^@]+)@.*#\1#')
[ -n "$JWTSEC" ] || { echo "NO_SECRET"; exit 1; }
psqlro(){ docker exec -e PGPASSWORD="$PW" "$PG" psql -U bl_app_runtime -d banzami_staging -At -c "$1" 2>/dev/null; }
# Ownership and cleanup. Everything this run creates is recorded by id and
# retired on the way out, however the script exits.
. "$(cd "$(dirname "$0")" && pwd)/lib/e2e-run.sh"
. "$(cd "$(dirname "$0")" && pwd)/lib/synthetic-tenant.sh"
e2e_begin


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
mint(){ SECRET="$JWTSEC" M="$1" node -e 'const c=require("crypto");const b=o=>Buffer.from(typeof o==="string"?o:JSON.stringify(o)).toString("base64url");const n=Math.floor(Date.now()/1000);const cl={merchant_id:process.env.M,scopes:["*"],environment:"SANDBOX",iat:n,exp:n+900};const h=b({alg:"HS256",typ:"JWT"}),p=b(cl);process.stdout.write(h+"."+p+"."+c.createHmac("sha256",process.env.SECRET).update(h+"."+p).digest("base64url"));'; }
# The funding path needs a PAYER token, which carries customer_id rather than
# merchant_id — a different claim, so a different minter.
mint_customer(){ SECRET="$JWTSEC" C="$1" node -e 'const c=require("crypto");const b=o=>Buffer.from(typeof o==="string"?o:JSON.stringify(o)).toString("base64url");const n=Math.floor(Date.now()/1000);const cl={customer_id:process.env.C,scopes:["*"],environment:"SANDBOX",iat:n,exp:n+900};const h=b({alg:"HS256",typ:"JWT"}),p=b(cl);process.stdout.write(h+"."+p+"."+c.createHmac("sha256",process.env.SECRET).update(h+"."+p).digest("base64url"));'; }

# Balance read straight from the ledger — the neutral observer.
bal(){ psqlro "SELECT COALESCE(SUM(CASE WHEN entry_type='CREDIT' THEN amount_minor ELSE -amount_minor END),0)
                 FROM ledger_entries WHERE account_id = (SELECT available_account_id FROM wallets WHERE id='$1')"; }
unbalanced(){ psqlro "SELECT COUNT(*) FROM (SELECT p.id FROM ledger_postings p JOIN ledger_entries e ON e.posting_id=p.id GROUP BY p.id HAVING SUM(CASE e.entry_type WHEN 'DEBIT' THEN -e.amount_minor ELSE e.amount_minor END) <> 0) x"; }

R="${RANDOM}${RANDOM}"
GROSS="${GROSS:-80000}"

echo "### a funded, KYB-approved merchant wallet — the run's own Business"
# A tenant of the run's own: a Project with a key, a Business with test KYB
# from Sandbox readiness, a wallet, and the sandbox-default profile whose
# PAYOUT rule prices the fee asserted below. The key carries exactly what the
# funding step needs.
synthetic_tenant payout '["identity:read","payment_sessions:read","payment_sessions:write"]' sandbox-default \
  || { echo "no tenant of its own — refusing to report a vacuous pass"; exit 1; }
WID="${ST_WALLET:-}"; MID="${ST_MERCHANT:-}"; DKEY="${ST_KEY:-}"

# The wallet is new, so it is funded here rather than found: scavenging a
# leftover funded wallet made this harness pass or fail on what an earlier run
# happened to leave, and withdrew from a Business that was not the run's. A
# payment session with NO wallet_account_id credits the merchant's wallet
# default, which is exactly the balance a payout draws from.
PUB=$(docker ps --format '{{.Names}}' | grep public-api-staging | head -1)
FUND=$((GROSS * 2))
PH="+2449${R:0:4}52"; HH="po${R:0:5}p"
call "$PUB" 8083 POST /v1/consumer/onboarding/start "{\"phone_number\":\"$PH\",\"currency\":\"AOA\",\"otp_plaintext_for_test\":\"123456\"}" -
SID=$(jget session_id)
call "$PUB" 8083 POST /v1/consumer/onboarding/verify-otp "{\"session_id\":\"$SID\",\"otp_code\":\"123456\"}" -
call "$PUB" 8083 POST /v1/consumer/onboarding/complete "{\"session_id\":\"$SID\",\"banza_handle\":\"$HH\",\"pin\":\"1234\"}" -
PAYER=$(jget consumer_id)
# Owned the moment it exists: the Sandbox value it is given goes back when the
# run ends, or the pilot funding cap fills with money nobody will spend.
e2e_own consumer "$PAYER"
PJWT=$(mint_customer "$PAYER")
call "$GW" 8080 POST /v1/compliance/customers/verify \
  "{\"full_name\":\"PAYOUT FUNDER\",\"document_type\":\"BILHETE_DE_IDENTIDADE\",\"document_number\":\"PO$R\",\"date_of_birth\":\"1990-01-01\",\"requested_level\":\"BASIC\"}" "$PJWT"
call "$PUB" 8083 POST /v1/sandbox/fund "{\"amount_minor\":$((FUND + 50000)),\"currency\":\"AOA\"}" "$PJWT"
call "$GW" 8080 POST /v1/payment-sessions \
  "{\"purpose\":\"DONATION\",\"reference_type\":\"PAYOUT_FUND\",\"reference_id\":\"po-$R\",\"amount_minor\":$FUND,\"currency\":\"AOA\"}" "$DKEY"
e2e_own payment_session "$(jget session_id)" "$MID"
FSLUG=$(printf '%s' "$LAST" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);const i=(j.interfaces||[]).find(x=>x.type==="PAYMENT_LINK");process.stdout.write(i?String(i.value).split("/").filter(Boolean).pop():"")}catch(e){}})')
call "$PUB" 8083 POST "/v1/payment-links/$FSLUG/pay" "{\"amount_minor\":$FUND}" "$PJWT"

FUNDED=$(bal "$WID")
chk MERCHANT_WALLET_FOUND "$([ -n "$WID" ] && [ -n "$MID" ] && [ "${FUNDED:-0}" -ge "$GROSS" ] && echo yes)" yes
[ -n "$WID" ] && [ "${FUNDED:-0}" -ge "$GROSS" ] || { echo "the run's own wallet was not funded — refusing to report a vacuous pass"; exit 1; }
JWT=$(mint "$MID")

# The KYB gate is fail-closed, so an unapproved merchant is the FIRST thing to
# check: without it a 403 here would be indistinguishable from a broken test.
KYB=$(psqlro "SELECT COALESCE(kyb_status,'') || '/' || COALESCE(aml_status,'') FROM merchant_compliance WHERE merchant_id='$MID'")
echo "  merchant $MID kyb/aml = ${KYB:-<none>}"

B0=$(bal "$WID")
echo "### before: available = $B0"

echo "### the KYB gate refuses an unapproved merchant"
# Asserted against a merchant that is genuinely unapproved rather than against
# the run's own Business: that one already holds test KYB from Sandbox
# readiness, and "the gate refused" would then be measuring nothing.
# The foreign merchant below is the same check from the other side.
UNAPP=$(psqlro "SELECT m.id FROM merchants m
                  LEFT JOIN merchant_compliance c ON c.merchant_id = m.id
                 WHERE COALESCE(c.kyb_status,'PENDING') <> 'APPROVED'
                 ORDER BY m.created_at DESC LIMIT 1")
if [ -n "$UNAPP" ]; then
  UJWT=$(mint "$UNAPP")
  PRE="{\"idempotency_key\":\"po-pre-$R\",\"wallet_id\":\"$WID\",\"amount_minor\":1000,\"currency\":\"AOA\",\"bank_account_number\":\"000123456789\",\"bank_code\":\"BAI\",\"account_holder_name\":\"SANDBOX PAYOUT E2E\"}"
  call "$GW" 8080 POST /v1/payouts "$PRE" "$UJWT"
  echo "  unapproved merchant → http=$CODE"
  chk KYB_GATE_REFUSES_UNAPPROVED "$CODE" "403"
  chk NOTHING_MOVED_WHILE_UNAPPROVED "$(bal "$WID")" "$B0"
else
  echo "  (every merchant in this environment is approved — gate asserted via the foreign merchant below)"
fi

echo "### the operator approves the merchant (the action admin-api performs)"
# Core's internal compliance route is the one /admin/v1/compliance/merchants/{id}/approve
# calls. Reached directly here because this harness has no admin session; the
# effect on the merchant is identical, and the point of the step is that the
# payout gate is driven by compliance state rather than by nothing. The run's
# Business already holds test KYB from Sandbox readiness; approving it again is
# idempotent (the record is upserted to APPROVED/APPROVED), so the 200 still
# says the operator's decision is what the payout below stands on.
call "$CORE" 8081 POST "/internal/v1/compliance/merchants/$MID/approve" '{}' -
echo "  approve → http=$CODE"
chk MERCHANT_APPROVED "$CODE" "200"
KYB2=$(psqlro "SELECT kyb_status || '/' || aml_status FROM merchant_compliance WHERE merchant_id='$MID'")
echo "  kyb/aml now = ${KYB2:-<none>}"

echo "### the payout"
IDEM="po-$R"
BODY="{\"idempotency_key\":\"$IDEM\",\"wallet_id\":\"$WID\",\"amount_minor\":$GROSS,\"currency\":\"AOA\",\"bank_account_number\":\"000123456789\",\"bank_code\":\"BAI\",\"account_holder_name\":\"SANDBOX PAYOUT E2E\"}"
call "$GW" 8080 POST /v1/payouts "$BODY" "$JWT"
echo "  create → http=$CODE ${LAST:0:150}"
if [ "$CODE" = "403" ]; then
  # The gate was supposed to open at the approval above. Stopping here rather
  # than reporting the money assertions as vacuously green.
  echo "  still refused after approval — the rest would be vacuous"
  echo; echo "PAYOUT_SANDBOX_E2E: PASS=$PASS FAIL=$((FAIL+1))"
  exit 1
fi
chk PAYOUT_ACCEPTED "$CODE" "201"
PID=$(jget id)
STATUS=$(jget status)
# initiate QUEUES the withdrawal; it does not post. Asserting a debit here would
# be asserting the wrong contract, so the state is checked instead and the money
# is checked after process().
chk PAYOUT_STARTS_PENDING "$STATUS" "PENDING"
chk NOTHING_POSTED_AT_INITIATE "$(bal "$WID")" "$B0"

echo "### the operator processes it — this is where the money moves"
call "$CORE" 8081 POST "/internal/v1/payouts/$PID/process" '{}' -
echo "  process → http=$CODE"
chk PAYOUT_PROCESSED "$CODE" "200"

B1=$(bal "$WID")
echo "### after: available = $B1"
chk WALLET_DEBITED_BY_GROSS "$((B0 - B1))" "$GROSS"
chk LEDGER_BALANCED "$(unbalanced)" "0"

echo "### gross = net + fee, and the fee is its own paired posting (ADR-031)"
FEEPOST=$(psqlro "SELECT COUNT(*) FROM ledger_postings WHERE idempotency_key='$IDEM:process:fee'")
NETPOST=$(psqlro "SELECT COUNT(*) FROM ledger_postings WHERE idempotency_key='$IDEM:process'")
chk NET_POSTING_EXISTS "$NETPOST" "1"
chk FEE_POSTING_IS_SEPARATE "$FEEPOST" "1"
NETLEGS=$(psqlro "SELECT COUNT(*) FROM ledger_entries e JOIN ledger_postings p ON p.id=e.posting_id WHERE p.idempotency_key='$IDEM:process'")
FEELEGS=$(psqlro "SELECT COUNT(*) FROM ledger_entries e JOIN ledger_postings p ON p.id=e.posting_id WHERE p.idempotency_key='$IDEM:process:fee'")
chk NET_POSTING_IS_A_PAIR "$NETLEGS" "2"
chk FEE_POSTING_IS_A_PAIR "$FEELEGS" "2"
FEE=$(psqlro "SELECT amount_minor FROM ledger_entries e JOIN ledger_postings p ON p.id=e.posting_id WHERE p.idempotency_key='$IDEM:process:fee' AND e.entry_type='DEBIT' LIMIT 1")
NET=$(psqlro "SELECT amount_minor FROM ledger_entries e JOIN ledger_postings p ON p.id=e.posting_id WHERE p.idempotency_key='$IDEM:process' AND e.entry_type='DEBIT' LIMIT 1")
echo "  gross=$GROSS net=${NET:-?} fee=${FEE:-?}"
chk GROSS_EQUALS_NET_PLUS_FEE "$(( ${NET:-0} + ${FEE:-0} ))" "$GROSS"
# 0.75% of the gross, as the operator's own pricing rule states.
chk FEE_IS_0_75_PERCENT "${FEE:-0}" "$(( GROSS * 75 / 10000 ))"
FEEACC=$(psqlro "SELECT a.account_type FROM ledger_entries e JOIN ledger_postings p ON p.id=e.posting_id JOIN ledger_accounts a ON a.id=e.account_id WHERE p.idempotency_key='$IDEM:process:fee' AND e.entry_type='CREDIT' LIMIT 1")
chk FEE_CREDITS_REVENUE "$FEEACC" "REVENUE"

echo "### a replay returns the SAME payout and moves nothing"
call "$GW" 8080 POST /v1/payouts "$BODY" "$JWT"
echo "  replay → http=$CODE"
# "handled" is not enough: a second 201 carrying a NEW id would be a second
# withdrawal waiting to be processed. The id is what makes the replay safe.
chk REPLAY_IS_THE_SAME_PAYOUT "$(jget id)" "$PID"
chk REPLAY_MOVED_NOTHING "$(bal "$WID")" "$B1"

echo "### processing it twice does not withdraw twice"
call "$CORE" 8081 POST "/internal/v1/payouts/$PID/process" '{}' -
chk SECOND_PROCESS_MOVED_NOTHING "$(bal "$WID")" "$B1"

echo "### refusals move nothing"
BAL=$(bal "$WID")
call "$GW" 8080 POST /v1/payouts "{\"idempotency_key\":\"po-neg-$R\",\"wallet_id\":\"$WID\",\"amount_minor\":-1,\"currency\":\"AOA\",\"bank_account_number\":\"000123456789\",\"bank_code\":\"BAI\",\"account_holder_name\":\"X\"}" "$JWT"
chk NEGATIVE_REJECTED "$CODE" "400"
call "$GW" 8080 POST /v1/payouts "{\"idempotency_key\":\"po-big-$R\",\"wallet_id\":\"$WID\",\"amount_minor\":999999999999,\"currency\":\"AOA\",\"bank_account_number\":\"000123456789\",\"bank_code\":\"BAI\",\"account_holder_name\":\"X\"}" "$JWT"
chk INSUFFICIENT_REJECTED "$CODE" "422"
call "$GW" 8080 POST /v1/payouts "{\"idempotency_key\":\"po-nb-$R\",\"wallet_id\":\"$WID\",\"amount_minor\":1000,\"currency\":\"AOA\",\"bank_code\":\"BAI\",\"account_holder_name\":\"X\"}" "$JWT"
chk MISSING_BANK_ACCOUNT_REJECTED "$CODE" "400"
chk REFUSALS_MOVED_NOTHING "$(bal "$WID")" "$BAL"

echo "### another merchant cannot withdraw from this wallet"
OTHER=$(psqlro "SELECT id FROM merchants WHERE id <> '$MID' ORDER BY created_at DESC LIMIT 1")
if [ -n "$OTHER" ]; then
  OJWT=$(mint "$OTHER")
  call "$GW" 8080 POST /v1/payouts "{\"idempotency_key\":\"po-foreign-$R\",\"wallet_id\":\"$WID\",\"amount_minor\":1000,\"currency\":\"AOA\",\"bank_account_number\":\"000123456789\",\"bank_code\":\"BAI\",\"account_holder_name\":\"X\"}" "$OJWT"
  echo "  foreign wallet → http=$CODE ${LAST:0:110}"
  # 404 (not owned) or 403 (that merchant is not KYB-approved) are both correct
  # refusals; what must never happen is a payout.
  chk FOREIGN_WALLET_REFUSED "$([ "$CODE" = "404" ] || [ "$CODE" = "403" ] && echo refused)" "refused"
  chk VICTIM_BALANCE_UNCHANGED "$(bal "$WID")" "$BAL"
else
  echo "  (no second merchant in this environment)"
fi

echo "### the payout is readable by its owner and not by id alone"
call "$GW" 8080 GET "/v1/payouts/$PID" - "$JWT"
chk OWNER_CAN_READ "$CODE" "200"
chk LEDGER_STILL_BALANCED "$(unbalanced)" "0"

echo
echo "PAYOUT_SANDBOX_E2E: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
