#!/usr/bin/env bash
# Post-deploy smoke for the economic-finality change — runs ON the Sandbox VM.
#
# The change this checks is one sentence: an absent pricing decision is a
# refusal, not a free transaction. Everything below exists to tell those two
# apart, because in a ledger they look identical — both produce a fee of 0.
#
#   an owner on the explicit 0-bps policy captures, at zero, WITH a rule id
#   an owner on the 200-bps policy captures, at 200 bps
#   an owner with no policy is REFUSED at capture, and 409 rather than 500
#   an owner with no policy is REFUSED at settlement, and 409 rather than 500
#   every refusal leaves the ledger exactly where it was
#
# The 409 matters as much as the refusal. Falling through to a 500 was the bug
# found reading this path: a permanent, actionable configuration state that
# every client would retry forever.
set -uo pipefail

GW=$(docker ps  --format '{{.Names}}' | grep api-gateway-staging | head -1)
CORE=$(docker ps --format '{{.Names}}'| grep core-api-staging    | head -1)
PG=$(docker ps  --format '{{.Names}}' | grep postgres | grep bzsandbox | head -1)
[ -n "$CORE" ] || { echo "NO_CORE_CONTAINER"; exit 1; }
PW=$(docker exec "$CORE" sh -c 'cat /run/secrets/db_url' | sed -E 's#.*://[^:]+:([^@]+)@.*#\1#')

. "$(cd "$(dirname "$0")" && pwd)/lib/e2e-run.sh"
e2e_begin

# -q as well as -At: psql prints the command tag after a RETURNING row, and
# trimming newlines would otherwise concatenate "INSERT 0 1" onto the id.
q(){ docker exec -e PGPASSWORD="$PW" "$PG" psql -q -U bl_app_runtime -d banzami_staging -At -c "$1" 2>/dev/null | tr -d '\r\n'; }

PASS=0; FAIL=0
chk(){ if [ "$2" = "$3" ]; then echo "  $1 PASS ($2)"; PASS=$((PASS+1));
       else echo "  $1 FAIL (got '$2' want '$3')"; FAIL=$((FAIL+1)); fi; }

LAST=""; CODE=""
call(){ local ct="$1" port="$2" m="$3" p="$4" bd="$5"
  local a=(curl -s -w $'\n%{http_code}' -X "$m" "http://localhost:$port$p")
  local r
  if [ "$bd" = "-" ]; then r=$(docker exec "$ct" "${a[@]}" 2>/dev/null)
  else a+=(-H "Content-Type: application/json" --data @-); r=$(printf '%s' "$bd" | docker exec -i "$ct" "${a[@]}" 2>/dev/null); fi
  CODE=$(printf '%s' "$r" | tail -n1); LAST=$(printf '%s' "$r" | sed '$d'); }
jget(){ printf '%s' "$LAST" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(String(JSON.parse(s)["'"$1"'"]??""))}catch(e){}})'; }
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
UB0=$(unbalanced); SL0=$(single_leg); SUM0=$(ledger_sum)
chk LEDGER_UNBALANCED_BEFORE "$UB0" "0"
chk LEDGER_SINGLE_LEG_BEFORE "$SL0" "0"

# ── a merchant, a wallet, and whichever policy we want it on ────────────────
mk(){ # $1 = profile code or "none" | prints merchant_id|wallet_id
  local mid wid
  mid=$(q "INSERT INTO merchants (id, name, email, status)
           VALUES (gen_random_uuid(), 'smoke-$1-$R', 'smoke-$1-$R@projects.banzami.test', 'ACTIVE')
           RETURNING id")
  [ -n "$mid" ] || return 1
  e2e_own merchant "$mid"
  if [ "$1" != "none" ]; then
    call "$CORE" 8080 PUT "/internal/v1/merchants/$mid/pricing-profile" "{\"profile_code\":\"$1\"}"
  fi
  call "$CORE" 8080 POST /internal/v1/wallets "{\"merchant_id\":\"$mid\",\"currency\":\"AOA\"}"
  wid=$(jget id)
  printf '%s|%s' "$mid" "$wid"
}

# Authorize a transaction and try to capture it. Prints the capture status code.
cap(){ # $1=merchant $2=wallet $3=idem-suffix -> sets TXID, CODE, LAST
  call "$CORE" 8080 POST /internal/v1/transactions \
    "{\"idempotency_key\":\"smoke-$3-$R\",\"transaction_type\":\"PAYMENT\",\"amount_minor\":$GROSS,\"currency\":\"AOA\",\"merchant_id\":\"$1\",\"wallet_id\":\"$2\"}"
  TXID=$(jget id)
  [ -n "$TXID" ] || return 1
  call "$CORE" 8080 POST "/internal/v1/transactions/$TXID/authorize" "-"
  call "$CORE" 8080 POST "/internal/v1/transactions/$TXID/capture" "-"
}

echo
echo "### A — the explicit zero captures, and the zero is attributable"
IFS='|' read -r ZM ZW <<<"$(mk sandbox-default)"
chk A_MERCHANT_READY "$([ -n "$ZM" ] && [ -n "$ZW" ] && echo yes)" yes
cap "$ZM" "$ZW" a
chk A_CAPTURE_OK "$CODE" "200"
chk A_FEE_ZERO "$(q "SELECT amount_minor FROM operator_fees WHERE transaction_id='$TXID'")" "0"
# The whole point: a zero that a RULE said, not a zero nobody decided.
chk A_ZERO_IS_A_DECISION "$(q "SELECT (pricing_rule_id IS NOT NULL)::text FROM operator_fees WHERE transaction_id='$TXID'")" "true"
chk A_WALLET_GETS_GROSS "$(wbal "$ZW")" "$GROSS"

echo
echo "### B — 200 bps charges 200 bps"
IFS='|' read -r PM PW2 <<<"$(mk sandbox-donation-200)"
chk B_MERCHANT_READY "$([ -n "$PM" ] && [ -n "$PW2" ] && echo yes)" yes
cap "$PM" "$PW2" b
chk B_CAPTURE_OK "$CODE" "200"
EXPECTED_FEE=$(( GROSS * 200 / 10000 ))
chk B_FEE_IS_200BPS "$(q "SELECT amount_minor FROM operator_fees WHERE transaction_id='$TXID'")" "$EXPECTED_FEE"
chk B_WALLET_GETS_NET "$(wbal "$PW2")" "$(( GROSS - EXPECTED_FEE ))"

echo
echo "### C — no policy: capture refuses, and says so as a refusal"
IFS='|' read -r NM NW <<<"$(mk none)"
chk C_MERCHANT_READY "$([ -n "$NM" ] && [ -n "$NW" ] && echo yes)" yes
chk C_HAS_NO_POLICY "$(q "SELECT COALESCE(pricing_profile_id::text,'none') FROM merchants WHERE id='$NM'")" "none"
cap "$NM" "$NW" c
chk C_CAPTURE_REFUSED "$CODE" "409"
chk C_REFUSAL_IS_NAMED "$(errcode)" "PRICING_NOT_CONFIGURED"
chk C_NO_FEE_ROW "$(q "SELECT COUNT(*) FROM operator_fees WHERE transaction_id='$TXID'")" "0"
chk C_NOTHING_MOVED "$(wbal "$NW")" "0"
chk C_NOT_CAPTURED "$(q "SELECT (status <> 'CAPTURED')::text FROM transactions WHERE id='$TXID'")" "true"

echo
echo "### D — no policy: settlement refuses too, same code"
SRC=$(q "SELECT available_account_id FROM wallets WHERE id='$NW'")
BEN=$(q "SELECT available_account_id FROM wallets WHERE id='$ZW'")
call "$CORE" 8080 POST /internal/v1/application-settlements \
  "{\"idempotency_key\":\"smoke-d-$R\",\"owner_ref\":\"smoke-$R\",\"source_account_id\":\"$SRC\",\"beneficiary_account_id\":\"$BEN\",\"gross_amount_minor\":1000,\"currency\":\"AOA\"}"
chk D_SETTLEMENT_REFUSED "$CODE" "409"
chk D_REFUSAL_IS_NAMED "$(errcode)" "PRICING_NOT_CONFIGURED"

echo
echo "### E — the ledger is exactly as sound as it was"
chk E_UNBALANCED "$(unbalanced)" "0"
chk E_SINGLE_LEG "$(single_leg)" "0"
# Every posting nets to zero, so the whole book must still sum to zero.
chk E_BOOK_SUMS_ZERO "$(ledger_sum)" "0"

echo
echo "PRICING_REFUSAL_SMOKE: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
