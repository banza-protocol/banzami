#!/usr/bin/env bash
# The operator's rate, charged where the operator actually charges it — proved
# on the deployed Sandbox.
#
# THE MODEL THIS TESTS
#
# The transfer primitive is neutral: it carries merchant payments and P2P alike,
# so pricing inside it would charge people for sending money to each other. An
# incoming payment or donation therefore credits the merchant or campaign wallet
# GROSS. The operator's rate is resolved one step later, at a fee-bearing
# operation — here, an application settlement.
#
# So the arithmetic under test is NOT "a 100 000 donation credits 98 000". It is:
#
#   wallet holds        100 000   (gross, from the payment leg)
#   settle              100 000
#   assigned profile    sandbox-donation-200
#   rate                    200 bps
#   fee                   2 000
#   net to beneficiary   98 000
#
# The gross-credit half is proved separately by doa-public-donation-e2e.sh,
# which asserts the campaign account is credited the FULL link amount.
#
# AND ECONOMIC PARITY
#
# The same settlement runs twice: once for an ordinary controlled owner and once
# for a second owner standing in for a reference application. Both carry the
# same generic profile, so both must produce the same rate, the same fee and the
# same net. The differential must be exactly zero — no tenant is special.
set -uo pipefail

GW=$(docker ps  --format '{{.Names}}' | grep api-gateway-staging | head -1)
CORE=$(docker ps --format '{{.Names}}'| grep core-api-staging    | head -1)
PG=$(docker ps  --format '{{.Names}}' | grep postgres | grep bzsandbox | head -1)
[ -n "$CORE" ] && [ -n "$GW" ] || { echo "NO_CONTAINERS"; exit 1; }
PW=$(docker exec "$CORE" sh -c 'cat /run/secrets/db_url' | sed -E 's#.*://[^:]+:([^@]+)@.*#\1#')
JWTSEC=$(docker exec "$GW" sh -c 'cat /run/secrets/jwt_secret')
[ -n "$JWTSEC" ] || { echo "NO_JWT_SECRET"; exit 1; }

. "$(cd "$(dirname "$0")" && pwd)/lib/e2e-run.sh"
e2e_begin

q(){ docker exec -e PGPASSWORD="$PW" "$PG" psql -q -U bl_app_runtime -d banzami_staging -At -c "$1" 2>/dev/null | tr -d '\r\n'; }

PASS=0; FAIL=0
chk(){ if [ "$2" = "$3" ]; then echo "  $1 PASS ($2)"; PASS=$((PASS+1));
       else echo "  $1 FAIL (got '$2' want '$3')"; FAIL=$((FAIL+1)); fi; }

LAST=""; CODE=""
call(){ local ct="$1" port="$2" m="$3" p="$4" bd="$5" au="${6:--}"
  local a=(curl -s -w $'\n%{http_code}' -X "$m" "http://localhost:$port$p")
  [ "$au" != "-" ] && a+=(-H "Authorization: Bearer $au")
  local r
  if [ "$bd" = "-" ]; then r=$(docker exec "$ct" "${a[@]}" 2>/dev/null)
  else a+=(-H "Content-Type: application/json" --data @-); r=$(printf '%s' "$bd" | docker exec -i "$ct" "${a[@]}" 2>/dev/null); fi
  CODE=$(printf '%s' "$r" | tail -n1); LAST=$(printf '%s' "$r" | sed '$d'); }
jget(){ printf '%s' "$LAST" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(String(JSON.parse(s)["'"$1"'"]??""))}catch(e){}})'; }
mint(){ SECRET="$JWTSEC" M="$1" node -e 'const c=require("crypto");const b=o=>Buffer.from(typeof o==="string"?o:JSON.stringify(o)).toString("base64url");const n=Math.floor(Date.now()/1000);const cl={merchant_id:process.env.M,scopes:["*"],environment:"SANDBOX",iat:n,exp:n+900};const h=b({alg:"HS256",typ:"JWT"}),p=b(cl);process.stdout.write(h+"."+p+"."+c.createHmac("sha256",process.env.SECRET).update(h+"."+p).digest("base64url"));'; }

wbal(){ q "SELECT COALESCE(SUM(CASE WHEN entry_type='CREDIT' THEN amount_minor ELSE -amount_minor END),0)
             FROM ledger_entries WHERE account_id=(SELECT available_account_id FROM wallets WHERE id='$1')"; }
unbalanced(){ q "SELECT COUNT(*) FROM (SELECT p.id FROM ledger_postings p
                    JOIN ledger_entries e ON e.posting_id=p.id GROUP BY p.id
                   HAVING SUM(CASE e.entry_type WHEN 'DEBIT' THEN -e.amount_minor ELSE e.amount_minor END) <> 0) x"; }

R="${RANDOM}${RANDOM}"
GROSS="${GROSS:-100000}"
RATE_BPS=200
EXPECTED_FEE=$(( GROSS * RATE_BPS / 10000 ))
EXPECTED_NET=$(( GROSS - EXPECTED_FEE ))

echo "### the arithmetic under test: gross $GROSS @ ${RATE_BPS}bps -> fee $EXPECTED_FEE, net $EXPECTED_NET"
chk LEDGER_SOUND_BEFORE "$(unbalanced)" "0"

# An owner on the generic 200-bps profile, with a wallet holding gross.
mkowner(){ # $1 = label -> prints merchant|source_wallet|beneficiary_wallet
  local mid sw bw
  mid=$(q "INSERT INTO merchants (id, name, email, status)
           VALUES (gen_random_uuid(), 'settle-$1-$R', 'settle-$1-$R@projects.banzami.test', 'ACTIVE')
           RETURNING id")
  [ -n "$mid" ] || return 1
  e2e_own merchant "$mid"
  call "$CORE" 8081 PUT "/internal/v1/merchants/$mid/pricing-profile" '{"profile_code":"sandbox-donation-200"}'
  call "$CORE" 8081 POST /internal/v1/wallets "{\"merchant_id\":\"$mid\",\"currency\":\"AOA\"}"; sw=$(jget id)
  call "$CORE" 8081 POST /internal/v1/wallets "{\"merchant_id\":\"$mid\",\"currency\":\"AOA\"}"; bw=$(jget id)
  # Stands in for the payment leg, which credits GROSS by design. The real
  # payment leg is proved by doa-public-donation-e2e.sh.
  call "$CORE" 8081 POST "/internal/v1/wallets/$sw/admin-credit" \
    "{\"amount_minor\":$GROSS,\"reason\":\"settlement economics harness $R\"}"
  printf '%s|%s|%s' "$mid" "$sw" "$bw"
}

settle(){ # $1=merchant $2=source_wallet $3=beneficiary_wallet $4=idem -> sets CODE, LAST
  local jwt; jwt=$(mint "$1")
  call "$GW" 8080 POST /v1/application-settlements \
    "{\"idempotency_key\":\"settle-$4-$R\",\"owner_ref\":\"owner-$4-$R\",\"source_wallet_id\":\"$2\",\"beneficiary_wallet_id\":\"$3\"}" "$jwt"
}

run_case(){ # $1 = label
  local label="$1" mid sw bw
  IFS='|' read -r mid sw bw <<<"$(mkowner "$label")"
  chk "${label}_OWNER_READY" "$([ -n "$mid" ] && [ -n "$sw" ] && [ -n "$bw" ] && echo yes)" yes
  chk "${label}_PROFILE_ASSIGNED" "$(q "SELECT p.code FROM merchants m JOIN pricing_profiles p ON p.id=m.pricing_profile_id WHERE m.id='$mid'")" "sandbox-donation-200"
  chk "${label}_WALLET_HOLDS_GROSS" "$(wbal "$sw")" "$GROSS"

  settle "$mid" "$sw" "$bw" "$label"
  chk "${label}_SETTLEMENT_ACCEPTED" "$CODE" "200"
  local sid; sid=$(jget id)

  local row fee net rate
  fee=$(q "SELECT application_fee_minor FROM app_settlements WHERE id='$sid'")
  net=$(q "SELECT net_amount_minor FROM app_settlements WHERE id='$sid'")
  rate=$(q "SELECT (pricing_snapshot_json->>'rate_bps') FROM app_settlements WHERE id='$sid'")
  chk "${label}_RATE_IS_200BPS" "$rate" "$RATE_BPS"
  chk "${label}_FEE" "$fee" "$EXPECTED_FEE"
  chk "${label}_NET" "$net" "$EXPECTED_NET"
  chk "${label}_RULE_ATTRIBUTED" "$(q "SELECT (pricing_rule_id IS NOT NULL)::text FROM app_settlements WHERE id='$sid'")" "true"
  chk "${label}_BENEFICIARY_GETS_NET" "$(wbal "$bw")" "$EXPECTED_NET"
  chk "${label}_SOURCE_DRAINED_BY_GROSS" "$(wbal "$sw")" "0"
  # Record for the parity comparison.
  printf '%s' "$fee" > "/tmp/fee-$label-$R"
  printf '%s' "$net" > "/tmp/net-$label-$R"
}

echo
echo "### an ordinary controlled owner"
run_case ORDINARY

echo
echo "### a second owner on the SAME generic profile — the reference-application shape"
run_case REFERENCE

echo
echo "### economic parity: the differential must be exactly zero"
FEE_A=$(cat "/tmp/fee-ORDINARY-$R" 2>/dev/null); FEE_B=$(cat "/tmp/fee-REFERENCE-$R" 2>/dev/null)
NET_A=$(cat "/tmp/net-ORDINARY-$R" 2>/dev/null); NET_B=$(cat "/tmp/net-REFERENCE-$R" 2>/dev/null)
chk PARITY_FEE_DIFFERENTIAL "$(( ${FEE_A:-0} - ${FEE_B:-1} ))" "0"
chk PARITY_NET_DIFFERENTIAL "$(( ${NET_A:-0} - ${NET_B:-1} ))" "0"
rm -f "/tmp/fee-ORDINARY-$R" "/tmp/fee-REFERENCE-$R" "/tmp/net-ORDINARY-$R" "/tmp/net-REFERENCE-$R"

echo
echo "### the ledger is exactly as sound as it was"
chk LEDGER_SOUND_AFTER "$(unbalanced)" "0"

echo
echo "SETTLEMENT_ECONOMICS_E2E: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
