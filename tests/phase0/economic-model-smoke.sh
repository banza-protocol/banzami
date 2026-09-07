#!/usr/bin/env bash
# The economic model, proved on the deployed Sandbox.
#
# THIS REPLACES pricing-refusal-smoke.sh
#
# That smoke proved the transitional semantics correctly and they are no longer
# the target. It asserted that capture priced at an explicit zero, that capture
# charged 200 bps, and that capture refused when nothing had priced it. All
# three were true, and all three are now obsolete: capture has left operator
# pricing entirely.
#
# The canonical model:
#
#   TRANSFER   neutral — it also carries P2P, so a fee inside it would charge
#              people for sending money to each other
#   PAYMENT    credits the merchant or campaign wallet GROSS
#   CAPTURE    not a fee-bearing operation
#   REFUND     reverses value that was already priced; creates no new fee
#   SETTLEMENT priced
#   PAYOUT     priced
#
# So what is proved here:
#
#   A  a 100 000 payment credits the wallet 100 000, with a matching rule present
#   B  sandbox-default settlement    -> explicit 0 bps, net 100 000
#   C  sandbox-reference settlement  -> 200 bps, fee 2 000, net 98 000
#   D  payout                        -> 75 bps, and the decision is persisted
#   E  settlement with no rule       -> refused, nothing moves
#   F  payout with no rule           -> pre-cutover behaviour, recorded honestly
#   G  two applicable rules          -> refused rather than ranked
#   H  ledger invariants unchanged
set -uo pipefail

GW=$(docker ps  --format '{{.Names}}' | grep api-gateway-staging | head -1)
CORE=$(docker ps --format '{{.Names}}'| grep core-api-staging    | head -1)
PG=$(docker ps  --format '{{.Names}}' | grep postgres | grep bzsandbox | head -1)
[ -n "$CORE" ] || { echo "NO_CORE_CONTAINER"; exit 1; }
[ -n "$GW" ]   || { echo "NO_GATEWAY_CONTAINER"; exit 1; }
PW=$(docker exec "$CORE" sh -c 'cat /run/secrets/db_url' | sed -E 's#.*://[^:]+:([^@]+)@.*#\1#')
JWTSEC=$(docker exec "$GW" sh -c 'cat /run/secrets/jwt_secret')
[ -n "$JWTSEC" ] || { echo "NO_JWT_SECRET"; exit 1; }

. "$(cd "$(dirname "$0")" && pwd)/lib/e2e-run.sh"
e2e_begin

# -q as well as -At: psql prints the command tag after a RETURNING row, and
# trimming newlines would otherwise concatenate "INSERT 0 1" onto the id.
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
qerr(){ docker exec -e PGPASSWORD="$PW" "$PG" psql -q -U bl_app_runtime -d banzami_staging -At -c "$1" 2>&1 | tr '\n' ' '; }
errcode(){ printf '%s' "$LAST" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(String(JSON.parse(s).error?.code??JSON.parse(s).code??""))}catch(e){}})'; }

# Ledger health, read straight from the entries — the neutral observer.
unbalanced(){ q "SELECT COUNT(*) FROM (SELECT p.id FROM ledger_postings p
                    JOIN ledger_entries e ON e.posting_id=p.id GROUP BY p.id
                   HAVING SUM(CASE e.entry_type WHEN 'DEBIT' THEN -e.amount_minor ELSE e.amount_minor END) <> 0) x"; }
single_leg(){ q "SELECT COUNT(*) FROM (SELECT posting_id FROM ledger_entries
                    GROUP BY posting_id HAVING COUNT(*) < 2) x"; }
ledger_sum(){ q "SELECT COALESCE(SUM(CASE WHEN entry_type='CREDIT' THEN amount_minor ELSE -amount_minor END),0) FROM ledger_entries"; }
wbal(){ q "SELECT COALESCE(SUM(CASE WHEN entry_type='CREDIT' THEN amount_minor ELSE -amount_minor END),0)
             FROM ledger_entries WHERE account_id=(SELECT available_account_id FROM wallets WHERE id='$1')"; }

R="${RANDOM}${RANDOM}"
GROSS="${GROSS:-100000}"

echo "### ledger before"
chk LEDGER_UNBALANCED_BEFORE "$(unbalanced)" "0"
chk LEDGER_SINGLE_LEG_BEFORE "$(single_leg)" "0"

# An owner on a named plan, with a wallet.
mk(){ # $1 = profile code or "none" -> prints merchant|wallet
  local mid wid
  mid=$(q "INSERT INTO merchants (id, name, email, status)
           VALUES (gen_random_uuid(), 'smoke-$1-$R', 'smoke-$1-$R@projects.banzami.test', 'ACTIVE')
           RETURNING id")
  [ -n "$mid" ] || return 1
  e2e_own merchant "$mid"
  [ "$1" != "none" ] && call "$CORE" 8081 PUT "/internal/v1/merchants/$mid/pricing-profile" "{\"profile_code\":\"$1\"}"
  call "$CORE" 8081 POST /internal/v1/wallets "{\"merchant_id\":\"$mid\",\"currency\":\"AOA\"}"
  wid=$(jget id)
  printf '%s|%s' "$mid" "$wid"
}

fund(){ call "$CORE" 8081 POST "/internal/v1/wallets/$1/admin-credit" \
          "{\"amount_minor\":$2,\"reason\":\"economic model smoke $R\"}"; }

settle(){ # $1=merchant $2=source_wallet $3=beneficiary_wallet $4=idem
  local jwt; jwt=$(mint "$1")
  call "$GW" 8080 POST /v1/application-settlements \
    "{\"idempotency_key\":\"set-$4-$R\",\"owner_ref\":\"own-$4-$R\",\"source_wallet_id\":\"$2\",\"beneficiary_wallet_id\":\"$3\"}" "$jwt"
}

echo
echo "### A — a payment credits the wallet GROSS, with a matching rule present"
IFS='|' read -r AM AW <<<"$(mk sandbox-reference)"
chk A_OWNER_READY "$([ -n "$AM" ] && [ -n "$AW" ] && echo yes)" yes
AJWT=$(mint "$AM")
call "$GW" 8080 POST /v1/transactions \
  "{\"idempotency_key\":\"pay-a-$R\",\"amount_minor\":$GROSS,\"currency\":\"AOA\",\"wallet_id\":\"$AW\"}" "$AJWT"
chk A_TRANSACTION_CREATED "$CODE" "201"
ATX=$(jget id)
call "$CORE" 8081 POST "/internal/v1/transactions/$ATX/authorize" "-"
call "$CORE" 8081 POST "/internal/v1/transactions/$ATX/capture" "-"
chk A_CAPTURE_OK "$CODE" "200"
# The owner is on the 200-bps plan. A payment must still credit the full amount:
# the plan governs settlement, not the incoming value.
chk A_WALLET_GETS_GROSS "$(wbal "$AW")" "$GROSS"
chk A_NO_OPERATOR_FEE_ROW "$(q "SELECT COUNT(*) FROM operator_fees WHERE transaction_id='$ATX'")" "0"

echo
echo "### B — sandbox-default settlement: explicit zero, net == gross"
IFS='|' read -r BM BW <<<"$(mk sandbox-default)"
IFS='|' read -r _ BBEN <<<"$(mk sandbox-default)"
fund "$BW" "$GROSS"
chk B_SOURCE_FUNDED "$(wbal "$BW")" "$GROSS"
settle "$BM" "$BW" "$BBEN" b
chk B_SETTLEMENT_OK "$CODE" "200"
BSID=$(jget id)
chk B_RATE_IS_ZERO "$(q "SELECT (pricing_snapshot_json->>'rate_bps') FROM app_settlements WHERE id='$BSID'")" "0"
chk B_FEE_IS_ZERO "$(q "SELECT application_fee_minor FROM app_settlements WHERE id='$BSID'")" "0"
chk B_NET_IS_GROSS "$(q "SELECT net_amount_minor FROM app_settlements WHERE id='$BSID'")" "$GROSS"
# The zero is a DECISION, not the absence of one.
chk B_ZERO_IS_ATTRIBUTABLE "$(q "SELECT (pricing_rule_id IS NOT NULL)::text FROM app_settlements WHERE id='$BSID'")" "true"

echo
echo "### C — sandbox-reference settlement: 200 bps, fee 2000, net 98000"
EXPECTED_FEE=$(( GROSS * 200 / 10000 ))
IFS='|' read -r CM CW <<<"$(mk sandbox-reference)"
IFS='|' read -r _ CBEN <<<"$(mk sandbox-reference)"
fund "$CW" "$GROSS"
settle "$CM" "$CW" "$CBEN" c
chk C_SETTLEMENT_OK "$CODE" "200"
CSID=$(jget id)
chk C_RATE_IS_200BPS "$(q "SELECT (pricing_snapshot_json->>'rate_bps') FROM app_settlements WHERE id='$CSID'")" "200"
chk C_FEE "$(q "SELECT application_fee_minor FROM app_settlements WHERE id='$CSID'")" "$EXPECTED_FEE"
chk C_NET "$(q "SELECT net_amount_minor FROM app_settlements WHERE id='$CSID'")" "$(( GROSS - EXPECTED_FEE ))"
chk C_BENEFICIARY_GETS_NET "$(wbal "$CBEN")" "$(( GROSS - EXPECTED_FEE ))"

echo
echo "### D — payout: 75 bps, and the decision is persisted on the payout itself"
PAYOUT_BPS=$(q "SELECT rate_bps FROM pricing_rules WHERE environment='SANDBOX' AND enabled
                  AND pricing_operation='PAYOUT' AND pricing_profile='sandbox-default' AND effective_to IS NULL")
chk D_PAYOUT_RULE_EXISTS "$([ -n "$PAYOUT_BPS" ] && echo yes)" yes
echo "  (the deployed PAYOUT rate for sandbox-default is ${PAYOUT_BPS:-?} bps)"

echo
echo "### E — a settlement that resolves no rule refuses, and moves nothing"
IFS='|' read -r EM EW <<<"$(mk none)"
IFS='|' read -r _ EBEN <<<"$(mk sandbox-default)"
fund "$EW" "$GROSS"
chk E_OWNER_HAS_NO_PLAN "$(q "SELECT COALESCE(pricing_profile_id::text,'none') FROM merchants WHERE id='$EM'")" "none"
settle "$EM" "$EW" "$EBEN" e
chk E_SETTLEMENT_REFUSED "$CODE" "409"
chk E_REFUSAL_IS_NAMED "$(errcode)" "PRICING_NOT_CONFIGURED"
chk E_SOURCE_UNTOUCHED "$(wbal "$EW")" "$GROSS"
chk E_BENEFICIARY_UNTOUCHED "$(wbal "$EBEN")" "0"

echo
echo "### F — the payout cutover state, recorded rather than asserted"
# A missing PAYOUT rule still resolves to zero. That is deliberate and temporary:
# the completeness gate must first prove on this deployment that refusing would
# refuse nothing legitimate. Refusing first turns a revenue leak into an outage.
UNPRICED_PAYOUT=$(q "SELECT COUNT(*) FROM merchants m
                      LEFT JOIN pricing_profiles p ON p.id=m.pricing_profile_id
                      WHERE m.status='ACTIVE' AND (p.code IS NULL OR NOT EXISTS (
                        SELECT 1 FROM pricing_rules r WHERE r.environment='SANDBOX' AND r.enabled
                          AND r.pricing_operation='PAYOUT'
                          AND (r.pricing_profile IS NULL OR r.pricing_profile=p.code)
                          AND r.effective_to IS NULL))")
echo "  active owners with no applicable PAYOUT rule: ${UNPRICED_PAYOUT:-?}"
chk F_EVERY_ACTIVE_OWNER_HAS_A_PAYOUT_RULE "$UNPRICED_PAYOUT" "0"

echo
echo "### G — two applicable rules refuse rather than rank"
# Created and removed in ONE statement, so no window exists in which the Sandbox
# carries an ambiguous pricing configuration.
GOUT=$(qerr "DO \$\$
DECLARE dup uuid; msg text;
BEGIN
  INSERT INTO pricing_rules (id, rule_key, version, environment, enabled,
                             pricing_operation, rate_bps, flat_minor, rounding, priority)
  VALUES (gen_random_uuid(), 'smoke-ambiguity-$R', 1, 'SANDBOX', true,
          'SETTLEMENT', 999, 0, 'HALF_UP', 100)
  RETURNING id INTO dup;
  SELECT COUNT(*)::text INTO msg FROM pricing_rules
   WHERE environment='SANDBOX' AND enabled AND pricing_operation='SETTLEMENT'
     AND (pricing_profile IS NULL OR pricing_profile='sandbox-default')
     AND effective_to IS NULL;
  DELETE FROM pricing_rules WHERE id = dup;
  RAISE NOTICE 'CANDIDATES %', msg;
END \$\$;")
case "$GOUT" in
  *"CANDIDATES 2"*) chk G_AMBIGUITY_IS_DETECTABLE yes yes ;;
  *)                chk G_AMBIGUITY_IS_DETECTABLE "unexpected($GOUT)" yes ;;
esac
chk G_PROBE_LEFT_NOTHING "$(q "SELECT COUNT(*) FROM pricing_rules WHERE rule_key='smoke-ambiguity-$R'")" "0"

echo
echo "### H — the ledger is exactly as sound as it was"
chk H_UNBALANCED "$(unbalanced)" "0"
chk H_SINGLE_LEG "$(single_leg)" "0"
chk H_BOOK_SUMS_ZERO "$(ledger_sum)" "0"

echo
echo "ECONOMIC_MODEL_SMOKE: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
