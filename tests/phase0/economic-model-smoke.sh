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
#   D  payout                        -> priced at the deployed rate, persisted
#   E  settlement with no rule       -> refused, nothing moves
#   F  payout with no rule           -> refused, nothing moves
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
  # Every owner is distinct, and the uniqueness is generated by the DATABASE.
  # Naming them after the profile collided the moment a case needed two owners on
  # the same plan. A shell counter does not fix it either: mk is called inside
  # $( ), so every call runs in its own subshell and increments its own copy.
  # An APPLICATION account with approved KYB, because that is what an owner
  # settling value actually is: only APPLICATION/PLATFORM accounts may receive an
  # application fee, and only KYB-approved ones. A plain MERCHANT here fails at
  # the fee destination, which has nothing to do with pricing and looks like it
  # does.
  mid=$(q "INSERT INTO merchants (id, name, email, status, business_account_type)
           VALUES (gen_random_uuid(), 'smoke-$1-$R',
                   'smoke-' || gen_random_uuid() || '@projects.banzami.test', 'ACTIVE', 'APPLICATION')
           RETURNING id")
  [ -n "$mid" ] || return 1
  q "INSERT INTO merchant_compliance (merchant_id, kyb_status, aml_status)
     VALUES ('$mid', 'APPROVED', 'APPROVED')
     ON CONFLICT (merchant_id) DO UPDATE SET kyb_status='APPROVED', aml_status='APPROVED'" >/dev/null
  e2e_own merchant "$mid"
  [ "$1" != "none" ] && call "$CORE" 8081 PUT "/internal/v1/merchants/$mid/pricing-profile" "{\"profile_code\":\"$1\"}"
  call "$CORE" 8081 POST /internal/v1/wallets "{\"merchant_id\":\"$mid\",\"currency\":\"AOA\"}"
  wid=$(jget id)
  printf '%s|%s' "$mid" "$wid"
}

fund(){ call "$CORE" 8081 POST "/internal/v1/wallets/$1/admin-credit" \
          "{\"amount_minor\":$2,\"reason\":\"economic model smoke $R\"}"; }

payout(){ # $1=merchant $2=wallet $3=amount $4=idem -> leaves the payout id in LAST
  call "$CORE" 8081 POST /internal/v1/payouts \
    "{\"idempotency_key\":\"po-$4-$R\",\"merchant_id\":\"$1\",\"wallet_id\":\"$2\",\"amount_minor\":$3,\"currency\":\"AOA\",\"bank_account_number\":\"000$R\",\"bank_code\":\"BAI\",\"account_holder_name\":\"Smoke $R\"}"
}

settle(){ # $1=merchant $2=source_wallet $3=beneficiary_wallet $4=idem [$5=fee_wallet]
  # A nonzero settlement needs somewhere to put the fee. Omitting it is refused,
  # correctly — the operator does not invent a destination for money it charges.
  local jwt fee=""; jwt=$(mint "$1")
  [ -n "${5:-}" ] && fee=",\"application_fee_wallet_id\":\"$5\""
  call "$GW" 8080 POST /v1/application-settlements \
    "{\"idempotency_key\":\"set-$4-$R\",\"owner_ref\":\"own-$4-$R\",\"source_wallet_id\":\"$2\",\"beneficiary_wallet_id\":\"$3\"$fee}" "$jwt"
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
chk B_SETTLEMENT_OK "$CODE" "201"
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
# The fee destination is the settling owner's own wallet — a merchant holds
# exactly one wallet per currency, so there is no second one to name. Gross
# leaves the source, the beneficiary receives the net, and the fee stays behind.
settle "$CM" "$CW" "$CBEN" c "$CW" 
chk C_SETTLEMENT_OK "$CODE" "201"
CSID=$(jget id)
chk C_RATE_IS_200BPS "$(q "SELECT (pricing_snapshot_json->>'rate_bps') FROM app_settlements WHERE id='$CSID'")" "200"
chk C_FEE "$(q "SELECT application_fee_minor FROM app_settlements WHERE id='$CSID'")" "$EXPECTED_FEE"
chk C_NET "$(q "SELECT net_amount_minor FROM app_settlements WHERE id='$CSID'")" "$(( GROSS - EXPECTED_FEE ))"
chk C_BENEFICIARY_GETS_NET "$(wbal "$CBEN")" "$(( GROSS - EXPECTED_FEE ))"

echo
echo "### D — payout: priced at the deployed rate, and the decision is persisted"
PAYOUT_BPS=$(q "SELECT rate_bps FROM pricing_rules WHERE environment='SANDBOX' AND enabled
                  AND pricing_operation='PAYOUT' AND pricing_profile='sandbox-default' AND effective_to IS NULL")
chk D_PAYOUT_RULE_EXISTS "$([ -n "$PAYOUT_BPS" ] && echo yes)" yes
D_FEE=$(( GROSS * PAYOUT_BPS / 10000 ))
IFS='|' read -r DM DW <<<"$(mk sandbox-default)"
fund "$DW" "$GROSS"
payout "$DM" "$DW" "$GROSS" d
chk D_PAYOUT_CREATED "$CODE" "201"
DPID=$(jget id)
call "$CORE" 8081 POST "/internal/v1/payouts/$DPID/process" "-"
chk D_PAYOUT_PROCESSED "$CODE" "200"
# The fee is computed from the rate in the database, not from a number written
# here: a smoke that hard-codes the rate stops testing the rule and starts
# testing itself.
chk D_FEE_MATCHES_THE_RULE "$(q "SELECT fee_minor FROM payouts WHERE id='$DPID'")" "$D_FEE"
chk D_NET_IS_GROSS_LESS_FEE "$(q "SELECT net_minor FROM payouts WHERE id='$DPID'")" "$(( GROSS - D_FEE ))"
# ...and the payout can explain its own price without ledger archaeology.
chk D_RULE_PERSISTED     "$(q "SELECT (pricing_rule_id IS NOT NULL)::text FROM payouts WHERE id='$DPID'")" "true"
chk D_RATE_PERSISTED     "$(q "SELECT pricing_rate_bps FROM payouts WHERE id='$DPID'")" "$PAYOUT_BPS"
chk D_DECIDED_AT_PERSISTED "$(q "SELECT (pricing_decided_at IS NOT NULL)::text FROM payouts WHERE id='$DPID'")" "true"

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
echo "### F — a payout that resolves no rule refuses, and moves nothing"
# Arranged the way it actually happens: a plan exists and is assigned, but nobody
# ever wrote its PAYOUT rule. This is the exact shape of RA-063, where an 80 000
# withdrawal left with no fee 73 seconds before the rule was created.
q "INSERT INTO pricing_profiles (id, code, name, description, enabled, environment)
   VALUES (gen_random_uuid(), 'smoke-settle-only-$R', 'Smoke settle-only',
           'Probe: priced for settlement, deliberately unpriced for payout.', true, 'SANDBOX')" >/dev/null
q "INSERT INTO pricing_rules (id, rule_key, version, environment, enabled, pricing_profile,
                              pricing_operation, rate_bps, flat_minor, rounding, priority)
   VALUES (gen_random_uuid(), 'smoke-settle-only-$R', 1, 'SANDBOX', true,
           'smoke-settle-only-$R', 'SETTLEMENT', 100, 0, 'HALF_UP', 100)" >/dev/null
IFS='|' read -r FM FW <<<"$(mk "smoke-settle-only-$R")"
fund "$FW" "$GROSS"
payout "$FM" "$FW" "$GROSS" f
FPID=$(jget id)
call "$CORE" 8081 POST "/internal/v1/payouts/$FPID/process" "-"
chk F_PAYOUT_REFUSED  "$CODE" "409"
chk F_REFUSAL_IS_NAMED "$(errcode)" "PRICING_NOT_CONFIGURED"
chk F_WALLET_UNTOUCHED "$(wbal "$FW")" "$GROSS"
chk F_NO_FEE_RECORDED  "$(q "SELECT COALESCE(fee_minor::text,'none') FROM payouts WHERE id='$FPID'")" "none"
# The probe is removed, not disabled. A disabled profile is still a profile: it
# accumulates, it shows up in every inventory, and "why is this here" has no
# answer once the run that made it is gone. Nothing references it — the owner
# assigned to it is retired by the run manifest, and its only rule is deleted
# on the line above.
q "DELETE FROM pricing_rules WHERE rule_key='smoke-settle-only-$R'" >/dev/null
q "UPDATE merchants SET pricing_profile_id = NULL
    WHERE pricing_profile_id = (SELECT id FROM pricing_profiles WHERE code='smoke-settle-only-$R')" >/dev/null
q "DELETE FROM pricing_profiles WHERE code='smoke-settle-only-$R'" >/dev/null
chk F_PROBE_PROFILE_REMOVED "$(q "SELECT COUNT(*) FROM pricing_profiles WHERE code='smoke-settle-only-$R'")" "0"

echo "### G — two applicable rules refuse rather than rank"
# The unique index makes two OPEN rules for one cell impossible, so the overlap
# has to be the one it cannot cover: an open rule and a still-current dated one.
# That is the case the runtime check exists for, and the only way to reach it.
IFS='|' read -r GM GW2 <<<"$(mk sandbox-reference)"
IFS='|' read -r _ GBEN <<<"$(mk sandbox-reference)"
fund "$GW2" "$GROSS"
q "INSERT INTO pricing_rules (id, rule_key, version, environment, enabled, pricing_profile,
                              pricing_operation, rate_bps, flat_minor, rounding, priority,
                              effective_from, effective_to)
   VALUES (gen_random_uuid(), 'smoke-ambiguity-$R', 1, 'SANDBOX', true, 'sandbox-reference',
           'SETTLEMENT', 999, 0, 'HALF_UP', 100, now() - interval '1 day', now() + interval '1 day')" >/dev/null
chk G_OVERLAP_EXISTS "$(q "SELECT COUNT(*) FROM pricing_rules WHERE environment='SANDBOX' AND enabled
                            AND pricing_operation='SETTLEMENT' AND pricing_profile='sandbox-reference'
                            AND (effective_to IS NULL OR effective_to > now())")" "2"
settle "$GM" "$GW2" "$GBEN" g "$GW2"
chk G_SETTLEMENT_REFUSED "$CODE" "409"
chk G_REFUSAL_IS_NAMED   "$(errcode)" "PRICING_CONFIGURATION_ERROR"
chk G_SOURCE_UNTOUCHED   "$(wbal "$GW2")" "$GROSS"
chk G_BENEFICIARY_UNTOUCHED "$(wbal "$GBEN")" "0"
q "DELETE FROM pricing_rules WHERE rule_key='smoke-ambiguity-$R'" >/dev/null
chk G_PROBE_LEFT_NOTHING "$(q "SELECT COUNT(*) FROM pricing_rules WHERE rule_key='smoke-ambiguity-$R'")" "0"

echo "### H — the ledger is exactly as sound as it was"
chk H_UNBALANCED "$(unbalanced)" "0"
chk H_SINGLE_LEG "$(single_leg)" "0"
chk H_BOOK_SUMS_ZERO "$(ledger_sum)" "0"

echo
echo "ECONOMIC_MODEL_SMOKE: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
