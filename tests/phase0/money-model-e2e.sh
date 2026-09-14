#!/usr/bin/env bash
# MONEY-MODEL-001 (ADR-063) on the deployed Sandbox: a balance is an obligation,
# what backs it is explicit, and the book stays covered at every step.
#
# Runs ON the Sandbox host (like the other tests/phase0 harnesses). Every figure
# is read from Core's own read-only position (GET /internal/v1/admin/financial-
# position) — obligations, synthetic backing and transit, revenue, costs,
# in-flight withdrawals, findings — before and after each step, and compared as
# DELTAS so other Sandbox activity does not make it flaky.
#
#   A  cash-in (Sandbox funding)       obligations +X, transit +X
#   B  P2P                             obligations =, backing =
#   C  wallet payment to a Business    obligations =, backing =
#   D  application settlement          obligations =, backing =
#   E  acquirer settlement (sweep)     transit → backing, obligations =
#   F  withdrawal requested            obligation reserved in flight, fee → revenue, backing =
#   G  rail DOWN                       payout not submitted; hosted payment not created; P2P still moves
#   H  ambiguous outcome               SENT payout NOT failed without evidence
#   I  withdrawal confirmed            in flight → 0, backing −net, once
#   J  reconciliation                  MATCHED · DUPLICATE · MISSING_INTERNAL · MISSING_EXTERNAL ·
#                                      AMOUNT_MISMATCH · REQUIRES_REVIEW; same inputs = same run;
#                                      the ledger is untouched; late confirmation converges
#   K  cleanup (SANDBOX-DELETE-001)    value retired through Core; no finding; nothing hidden
#
# Nothing here writes a financial table: owners are created the way the other
# harnesses create them, value moves only through Core routes, and every fixture
# is retired through the canonical routes on the way out.
set -uo pipefail

GW=$(docker ps  --format '{{.Names}}' | grep api-gateway-staging | head -1)
CORE=$(docker ps --format '{{.Names}}'| grep core-api-staging    | head -1)
PG=$(docker ps  --format '{{.Names}}' | grep postgres | grep bzsandbox | head -1)
[ -n "$CORE" ] || { echo "NO_CORE_CONTAINER"; exit 1; }
[ -n "$GW" ]   || { echo "NO_GATEWAY_CONTAINER"; exit 1; }
PW=$(sed -E 's#.*://[^:]+:([^@]+)@.*#\1#' /root/.banzami/operator_db_url)
JWTSEC=$(docker exec "$GW" sh -c 'cat /run/secrets/jwt_secret')
[ -n "$JWTSEC" ] || { echo "NO_JWT_SECRET"; exit 1; }

. "$(cd "$(dirname "$0")" && pwd)/lib/e2e-run.sh"
e2e_begin

q(){ docker exec -e PGPASSWORD="$PW" "$PG" psql -q -U bl_app_runtime -d banzami_staging -At -c "$1" 2>/dev/null | tr -d '\r\n'; }
PASS=0; FAIL=0
chk(){ if [ "$2" = "$3" ]; then echo "  $1 PASS ($2)"; PASS=$((PASS+1));
       else echo "  $1 FAIL (got '$2' want '$3') last=$(printf '%s' "$LAST" | head -c 200)"; FAIL=$((FAIL+1)); fi; }
LAST=""; CODE=""
call(){ local ct="$1" port="$2" m="$3" p="$4" bd="$5" au="${6:--}"
  local a=(curl -s -w $'\n%{http_code}' -X "$m" "http://localhost:$port$p")
  [ "$au" != "-" ] && a+=(-H "Authorization: Bearer $au")
  local r
  if [ "$bd" = "-" ]; then r=$(docker exec "$ct" "${a[@]}" 2>/dev/null)
  else a+=(-H "Content-Type: application/json" --data @-); r=$(printf '%s' "$bd" | docker exec -i "$ct" "${a[@]}" 2>/dev/null); fi
  CODE=$(printf '%s' "$r" | tail -n1); LAST=$(printf '%s' "$r" | sed '$d'); }
jget(){ printf '%s' "$LAST" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const v=String(process.argv[1]).split(".").reduce((o,k)=>o?.[k],JSON.parse(s));process.stdout.write(String(v??""))}catch(e){}})' "$1"; }
errcode(){ printf '%s' "$LAST" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);process.stdout.write(String(j.error?.code??j.code??""))}catch(e){}})'; }
mint(){ SECRET="$JWTSEC" M="$1" node -e 'const c=require("crypto");const b=o=>Buffer.from(typeof o==="string"?o:JSON.stringify(o)).toString("base64url");const n=Math.floor(Date.now()/1000);const cl={merchant_id:process.env.M,scopes:["*"],environment:"SANDBOX",iat:n,exp:n+900};const h=b({alg:"HS256",typ:"JWT"}),p=b(cl);process.stdout.write(h+"."+p+"."+c.createHmac("sha256",process.env.SECRET).update(h+"."+p).digest("base64url"));'; }

# ── the position ────────────────────────────────────────────────────────────
POS=""
snap(){ POS=$(docker exec "$CORE" curl -s localhost:8081/internal/v1/admin/financial-position); }
# p FIELD [json] → an AOA field; p findings → codes, comma-joined
p(){ printf '%s' "${2:-$POS}" | node -e '
  let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);const f=process.argv[1];
  if(f==="findings"){process.stdout.write(j.findings.map(x=>x.code).sort().join(",")||"none");return;}
  if(f==="ledger_findings"){process.stdout.write(j.findings.filter(x=>!x.code.startsWith("BOUNDARY_")).map(x=>x.code).sort().join(",")||"none");return;}
  if(f==="synthetic"){process.stdout.write(String(j.currencies.find(c=>c.currency==="AOA").backing_is_synthetic));return;}
  if(f==="identity"){const c=j.currencies.find(c=>c.currency==="AOA");process.stdout.write(String(c.backing_total_minor+c.external_costs_minor-c.covered_obligations_minor-c.operator_revenue_minor));return;}
  const c=j.currencies.find(c=>c.currency==="AOA")||{};process.stdout.write(String(c[f]??0));});' "$1"; }
d(){ echo $(( $(p "$1" "$POS") - $(p "$1" "$2") )); }   # delta of FIELD from an earlier snapshot
consistent(){ # $1=step
  chk "$1_LEDGER_FINDINGS" "$(p ledger_findings)" "none"
  chk "$1_DOUBLE_ENTRY_IDENTITY" "$(p identity)" "0"
  chk "$1_COVERED" "$([ "$(p coverage_difference_minor)" -ge 0 ] && echo yes)" "yes"
}

R="${RANDOM}${RANDOM}"
RUN_START=$(date -u -d '-5 seconds' +%Y-%m-%dT%H:%M:%SZ)

# ── owners ──────────────────────────────────────────────────────────────────
mk(){ # $1 = profile → merchant|wallet|campaign_account|@banza
  local mid wid h
  mid=$(q "INSERT INTO merchants (id, name, email, status, business_account_type)
           VALUES (gen_random_uuid(), 'money-model-$R', 'mm-' || gen_random_uuid() || '@projects.banzami.test', 'ACTIVE', 'APPLICATION')
           RETURNING id")
  [ -n "$mid" ] || return 1
  q "INSERT INTO merchant_compliance (merchant_id, kyb_status, aml_status) VALUES ('$mid','APPROVED','APPROVED')
     ON CONFLICT (merchant_id) DO UPDATE SET kyb_status='APPROVED', aml_status='APPROVED'" >/dev/null
  e2e_own merchant "$mid"
  call "$CORE" 8081 PUT "/internal/v1/merchants/$mid/pricing-profile" "{\"profile_code\":\"$1\"}"
  call "$CORE" 8081 POST /internal/v1/wallets "{\"merchant_id\":\"$mid\",\"currency\":\"AOA\"}"
  wid=$(jget id)
  h=$(printf 'mm%s' "$(printf '%s' "$mid" | tr -d '-' | cut -c1-10)" | tr 'A-Z' 'a-z')
  q "INSERT INTO handle_registry (handle, owner_type, owner_id, created_at) VALUES ('$h','MERCHANT','$mid', now()) ON CONFLICT (handle) DO NOTHING" >/dev/null
  call "$GW" 8080 POST /v1/wallet-accounts \
    "{\"wallet_id\":\"$wid\",\"purpose\":\"CAMPAIGN\",\"reference_type\":\"MONEY_MODEL\",\"reference_id\":\"src-$mid\",\"label\":\"money model source\"}" "$(mint "$mid")"
  printf '%s|%s|%s|%s' "$mid" "$wid" "$(jget id)" "$h"
}
consumer(){ # → consumer_id|handle
  local cid h
  # From the database: $RANDOM repeats inside $( ) subshells, so two consumers
  # created back to back would collide on the same handle.
  h=$(q "SELECT 'mm' || substr(md5(gen_random_uuid()::text), 1, 12)")
  cid=$(q "INSERT INTO consumers (id, handle, status) VALUES (gen_random_uuid(), '$h', 'ACTIVE') RETURNING id")
  [ -n "$cid" ] || return 1
  e2e_own consumer "$cid"
  q "INSERT INTO handle_registry (handle, owner_type, owner_id, created_at) VALUES ('$h','CONSUMER','$cid', now()) ON CONFLICT (handle) DO NOTHING" >/dev/null
  call "$CORE" 8081 POST /internal/v1/consumer-wallets "{\"consumer_id\":\"$cid\",\"currency\":\"AOA\"}"
  printf '%s|%s' "$cid" "$h"
}

echo "### setup"
snap; P0=$POS
chk SETUP_BACKING_IS_SYNTHETIC "$(p synthetic)" "true"
consistent SETUP
IFS='|' read -r BM BW BA BH <<<"$(mk sandbox-reference)"
IFS='|' read -r CM CW _ CH <<<"$(mk sandbox-default)"
IFS='|' read -r AC AH <<<"$(consumer)"
IFS='|' read -r FC FH <<<"$(consumer)"
chk SETUP_OWNERS "$([ -n "$BM" ] && [ -n "$BW" ] && [ -n "$BA" ] && [ -n "$CM" ] && [ -n "$AC" ] && [ -n "$FC" ] && echo yes)" yes

echo "### A — cash-in: the network total grows on both sides"
snap; S=$POS
call "$CORE" 8081 POST /internal/v1/consumer-wallets/test-credit "{\"consumer_id\":\"$AC\",\"amount_minor\":30000,\"currency\":\"AOA\",\"idempotency_key\":\"mm-fund-a-$R\"}"
chk A_FUNDED "$CODE" "200"
call "$CORE" 8081 POST /internal/v1/consumer-wallets/test-credit "{\"consumer_id\":\"$AC\",\"amount_minor\":30000,\"currency\":\"AOA\",\"idempotency_key\":\"mm-fund-a-$R\"}"
chk A_DUPLICATE_FUNDING_ONE_EFFECT "$CODE" "200"
snap
chk A_OBLIGATIONS_DELTA "$(d covered_obligations_minor "$S")" "30000"
chk A_TRANSIT_DELTA "$(d external_transit_minor "$S")" "30000"
consistent A

echo "### B — P2P: who is owed changes, how much does not"
snap; S=$POS
call "$CORE" 8081 POST /internal/v1/consumer/transfers "{\"idempotency_key\":\"mm-p2p-$R\",\"sender\":\"$AH\",\"recipient\":\"$FH\",\"amount_minor\":4000,\"currency\":\"AOA\"}"
chk B_P2P "$CODE" "201"
snap
chk B_OBLIGATIONS_UNCHANGED "$(d covered_obligations_minor "$S")" "0"
chk B_BACKING_UNCHANGED "$(d backing_total_minor "$S")" "0"
consistent B

echo "### C — a wallet payment to a Business: an allocation, not new value"
snap; S=$POS
call "$CORE" 8081 POST /internal/v1/transfers "{\"idempotency_key\":\"mm-pay-$R\",\"sender_id\":\"$AC\",\"recipient_id\":\"$BW\",\"amount_minor\":20000,\"currency\":\"AOA\",\"description\":\"money model\"}"
chk C_PAYMENT "$CODE" "201"
snap
chk C_OBLIGATIONS_UNCHANGED "$(d covered_obligations_minor "$S")" "0"
chk C_BUSINESS_DELTA "$(d business_available_minor "$S")" "20000"
chk C_BACKING_UNCHANGED "$(d backing_total_minor "$S")" "0"
consistent C

echo "### D — application settlement: internal, obligations unchanged"
snap; S=$POS
PRIMARY=$(q "SELECT id FROM wallet_accounts WHERE wallet_id='$BW' AND purpose='PRIMARY'")
call "$GW" 8080 POST /v1/wallet-account-transfers "{\"source_wallet_account_id\":\"$PRIMARY\",\"destination_wallet_account_id\":\"$BA\",\"amount_minor\":6000,\"currency\":\"AOA\",\"idempotency_key\":\"mm-wat-$R\",\"description\":\"money model\"}" "$(mint "$BM")"
chk D_ACCOUNT_TRANSFER "$CODE" "201"
call "$GW" 8080 POST /v1/application-settlements "{\"idempotency_key\":\"mm-set-$R\",\"source_account_id\":\"$BA\",\"beneficiary_banza_name\":\"$CH\",\"reason\":\"MONEY_MODEL\",\"reference_type\":\"MONEY_MODEL\",\"reference_id\":\"mm-$R\",\"fee_destination_banza_name\":\"$BH\"}" "$(mint "$BM")"
chk D_SETTLEMENT "$CODE" "201"
snap
chk D_OBLIGATIONS_UNCHANGED "$(d covered_obligations_minor "$S")" "0"
chk D_BACKING_UNCHANGED "$(d backing_total_minor "$S")" "0"
chk D_REVENUE_UNCHANGED "$(d operator_revenue_minor "$S")" "0"
consistent D

echo "### F — withdrawal requested: reserved in flight, no backing moves"
# Not called in $( ): a subshell would keep CODE and LAST to itself.
payout(){ # $1=amount $2=tag → PID
  call "$CORE" 8081 POST /internal/v1/payouts "{\"idempotency_key\":\"mm-po-$2-$R\",\"merchant_id\":\"$BM\",\"wallet_id\":\"$BW\",\"amount_minor\":$1,\"currency\":\"AOA\",\"bank_account_number\":\"AO06$R\",\"bank_code\":\"0040\",\"account_holder_name\":\"Money model $R\"}"
  PID=$(jget id)
}
snap; S=$POS
payout 5000 one; P1=$PID; chk F_P1_CREATED "$CODE" "201"
call "$CORE" 8081 POST "/internal/v1/payouts/$P1/process" "-"; chk F_P1_PROCESSED "$CODE" "200"
payout 3000 two; P2=$PID; chk F_P2_CREATED "$CODE" "201"
call "$CORE" 8081 POST "/internal/v1/payouts/$P2/process" "-"; chk F_P2_PROCESSED "$CODE" "200"
N1=$(q "SELECT net_minor FROM payouts WHERE id='$P1'"); N2=$(q "SELECT net_minor FROM payouts WHERE id='$P2'")
F1=$(( 5000 - N1 )); F2=$(( 3000 - N2 ))
snap
chk F_IN_FLIGHT_DELTA "$(d withdrawals_in_flight_minor "$S")" "$(( N1 + N2 ))"
chk F_REVENUE_DELTA "$(d operator_revenue_minor "$S")" "$(( F1 + F2 ))"
chk F_BACKING_UNCHANGED "$(d backing_total_minor "$S")" "0"
chk F_OBLIGATIONS_DELTA_IS_THE_FEES "$(d covered_obligations_minor "$S")" "$(( -(F1 + F2) ))"
consistent F

echo "### E — acquirer settlement: value moves from transit to backing"
snap; S=$POS
batch(){ # $1=gross $2=tag → BID (not called in $( ), for the same reason)
  call "$CORE" 8081 POST /internal/v1/settlements "{\"idempotency_key\":\"mm-stl-$2-$R\",\"merchant_id\":\"$BM\",\"wallet_id\":\"$BW\",\"gross_amount_minor\":$1,\"fee_amount_minor\":0,\"currency\":\"AOA\",\"transaction_count\":1,\"period_start\":\"$RUN_START\",\"period_end\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}"
  local id; id=$(jget id)
  call "$CORE" 8081 POST "/internal/v1/settlements/$id/submit" "-"
  call "$CORE" 8081 POST "/internal/v1/settlements/$id/confirm" "-"
  BID=$id
}
batch "$N1" one; B1=$BID; chk E_B1_SETTLED "$CODE" "200"
batch "$N2" two; B2=$BID; chk E_B2_SETTLED "$CODE" "200"
snap
chk E_BACKING_DELTA "$(d external_backing_minor "$S")" "$(( N1 + N2 ))"
chk E_TRANSIT_DELTA "$(d external_transit_minor "$S")" "$(( -(N1 + N2) ))"
chk E_OBLIGATIONS_UNCHANGED "$(d covered_obligations_minor "$S")" "0"
consistent E

echo "### G — the rail is down: the boundary waits, internal value moves"
snap; S=$POS
call "$CORE" 8081 PUT "/internal/v1/sandbox/external-rail/$BM" '{"state":"UNAVAILABLE"}'; chk G_RAIL_DOWN "$CODE" "200"
call "$CORE" 8081 POST "/internal/v1/payouts/$P1/sent" "-"
chk G_PAYOUT_NOT_SUBMITTED "$(errcode)" "PROVIDER_UNAVAILABLE"
call "$CORE" 8081 POST /internal/v1/payment-links "{\"merchant_id\":\"$BM\",\"wallet_id\":\"$BW\",\"amount_minor\":1000,\"currency\":\"AOA\",\"description\":\"money model rail\"}"
LINK=$(jget id); [ -n "$LINK" ] && e2e_own payment_link "$LINK" "$BM"
if [ -n "$LINK" ]; then
  BEFORE=$(q "SELECT COUNT(*) FROM acquiring_payments")
  call "$CORE" 8081 POST /internal/v1/acquiring/payments "{\"payment_link_id\":\"$LINK\",\"amount_minor\":1000,\"currency\":\"AOA\"}"
  chk G_HOSTED_PAYMENT_REFUSED "$(errcode)" "PROVIDER_UNAVAILABLE"
  chk G_NOTHING_CREATED "$(q "SELECT COUNT(*) FROM acquiring_payments")" "$BEFORE"
fi
call "$CORE" 8081 POST /internal/v1/consumer/transfers "{\"idempotency_key\":\"mm-p2p-down-$R\",\"sender\":\"$FH\",\"recipient\":\"$AH\",\"amount_minor\":1000,\"currency\":\"AOA\"}"
chk G_P2P_WITH_RAIL_DOWN "$CODE" "201"
snap
chk G_OBLIGATIONS_UNCHANGED "$(d covered_obligations_minor "$S")" "0"
chk G_BACKING_UNCHANGED "$(d backing_total_minor "$S")" "0"
chk G_STILL_PROCESSING "$(q "SELECT status FROM payouts WHERE id='$P1'")" "PROCESSING"
consistent G
call "$CORE" 8081 PUT "/internal/v1/sandbox/external-rail/$BM" '{"state":"AVAILABLE"}'; chk G_RAIL_UP "$CODE" "200"

echo "### H — an ambiguous outcome is not a failure"
for P in "$P1" "$P2"; do call "$CORE" 8081 POST "/internal/v1/payouts/$P/sent" "-"; done
chk H_SENT "$CODE" "200"
snap; S=$POS
call "$CORE" 8081 POST "/internal/v1/payouts/$P2/fail" '{"reason":"provider timeout"}'
chk H_BLIND_FAIL_REFUSED "$(errcode)" "EXTERNAL_EVIDENCE_REQUIRED"
call "$CORE" 8081 POST "/internal/v1/payouts/$P2/returned" '{"evidence_ref":""}'
chk H_BLIND_RETURN_REFUSED "$(errcode)" "EXTERNAL_EVIDENCE_REQUIRED"
chk H_STILL_SENT "$(q "SELECT status FROM payouts WHERE id='$P2'")" "SENT"
snap
chk H_NOTHING_RESTORED "$(d covered_obligations_minor "$S")" "0"
chk H_STILL_IN_FLIGHT "$(d withdrawals_in_flight_minor "$S")" "0"

echo "### I — the rail confirms: the obligation is extinguished against backing, once"
snap; S=$POS
call "$CORE" 8081 POST "/internal/v1/payouts/$P1/confirm" "-"; chk I_CONFIRMED "$CODE" "200"
call "$CORE" 8081 POST "/internal/v1/payouts/$P1/confirm" "-"; chk I_SECOND_CONFIRM_REFUSED "$(errcode)" "INVALID_TRANSITION"
snap
chk I_IN_FLIGHT_DELTA "$(d withdrawals_in_flight_minor "$S")" "$(( -N1 ))"
chk I_BACKING_DELTA "$(d external_backing_minor "$S")" "$(( -N1 ))"
chk I_OBLIGATIONS_DELTA "$(d covered_obligations_minor "$S")" "$(( -N1 ))"
consistent I

echo "### J — reconciliation compares the boundary and changes nothing"
PERIOD_END=$(date -u -d '+10 minutes' +%Y-%m-%dT%H:%M:%SZ)
AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
ev(){ printf '{"source":"SANDBOX_SYNTHETIC_BANK","kind":"%s","external_ref":"%s","amount_minor":%s,"currency":"AOA","occurred_at":"%s"}' "$1" "$2" "$3" "$AT"; }
EVIDENCE="[$(ev CASH_OUT "$P1" "$N1"),$(ev CASH_OUT "$P1" "$N1"),$(ev CASH_IN "EMIS-MM-UNKNOWN-$R" 900),$(ev CASH_OUT "$P2" "$N2"),$(ev ACQUIRER_SETTLEMENT "$B2" "$(( N2 - 1 ))")]"
BODY="{\"period_start\":\"$RUN_START\",\"period_end\":\"$PERIOD_END\",\"evidence\":$EVIDENCE}"
LEDGER_ROWS_BEFORE=$(q "SELECT (SELECT COUNT(*) FROM ledger_postings) || '/' || (SELECT COUNT(*) FROM ledger_entries)")
call "$CORE" 8081 POST /internal/v1/admin/boundary-reconciliation "$BODY"
chk J_RUN "$CODE" "200"
RUN1=$LAST
chk J_LEDGER_UNTOUCHED "$(q "SELECT (SELECT COUNT(*) FROM ledger_postings) || '/' || (SELECT COUNT(*) FROM ledger_entries)")" "$LEDGER_ROWS_BEFORE"
out(){ printf '%s' "$RUN1" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);process.stdout.write(j.items.filter(i=>i.external_ref===process.argv[1]).map(i=>i.outcome).join(",")||"none")})' "$1"; }
chk J_P1_MATCHED_AND_DUPLICATE "$(out "$P1")" "MATCHED,DUPLICATE_EXTERNAL"
chk J_UNKNOWN_EVIDENCE "$(out "EMIS-MM-UNKNOWN-$R")" "MISSING_INTERNAL"
chk J_P2_EXECUTED_BUT_UNCONFIRMED "$(out "$P2")" "REQUIRES_REVIEW"
chk J_B1_WITHOUT_EVIDENCE "$(out "$B1")" "MISSING_EXTERNAL"
chk J_B2_AMOUNT "$(out "$B2")" "AMOUNT_MISMATCH"
RID=$(printf '%s' "$RUN1" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).run_id))')
call "$CORE" 8081 POST /internal/v1/admin/boundary-reconciliation "$BODY"
chk J_SAME_INPUTS_SAME_RUN "$(jget run_id)" "$RID"
chk J_NOT_CREATED_AGAIN "$(jget created)" "false"
chk J_ONE_RUN_ROW "$(q "SELECT COUNT(*) FROM boundary_reconciliation_runs WHERE id='$RID'")" "1"
chk J_LEDGER_STILL_UNTOUCHED "$(q "SELECT (SELECT COUNT(*) FROM ledger_postings) || '/' || (SELECT COUNT(*) FROM ledger_entries)")" "$LEDGER_ROWS_BEFORE"
snap
for c in BOUNDARY_DUPLICATE_EXTERNAL BOUNDARY_EXTERNAL_WITHOUT_OPERATION BOUNDARY_REQUIRES_REVIEW BOUNDARY_OPERATION_WITHOUT_EVIDENCE BOUNDARY_AMOUNT_MISMATCH; do
  chk "J_POSITION_REPORTS_$c" "$(p findings | tr ',' '\n' | grep -cx "$c")" "1"
done
consistent J

# The late confirmation, applied through the payout's own lifecycle — once.
snap; S=$POS
call "$CORE" 8081 POST "/internal/v1/payouts/$P2/confirm" "-"; chk J_LATE_CONFIRMATION "$CODE" "200"
call "$CORE" 8081 POST "/internal/v1/payouts/$P2/confirm" "-"; chk J_LATE_CONFIRMATION_ONCE "$(errcode)" "INVALID_TRANSITION"
snap
chk J_LATE_BACKING_DELTA "$(d external_backing_minor "$S")" "$(( -N2 ))"
chk J_BACKING_BACK_WHERE_IT_WAS "$(d external_backing_minor "$P0")" "0"

# A later, complete statement for the period: every confirmed boundary operation
# in it, as it is. The reconciliation converges and the position is clean.
FULL=$(q "SELECT COALESCE(json_agg(json_build_object('source','SANDBOX_SYNTHETIC_BANK','kind',k,'external_ref',r,'amount_minor',a,'currency',c,'occurred_at','$AT'))::text,'[]') FROM (
  SELECT 'CASH_IN' k, external_ref r, amount_minor a, currency::text c FROM acquiring_payments WHERE status='CONFIRMED' AND created_at >= '$RUN_START' AND created_at < '$PERIOD_END'
  UNION ALL SELECT 'CASH_IN', external_ref, amount_minor, currency::text FROM consumer_deposits WHERE status='COMPLETED' AND created_at >= '$RUN_START' AND created_at < '$PERIOD_END'
  UNION ALL SELECT 'CASH_OUT', id::text, COALESCE(net_minor, amount_minor), currency::text FROM payouts WHERE status='CONFIRMED' AND created_at >= '$RUN_START' AND created_at < '$PERIOD_END'
  UNION ALL SELECT 'ACQUIRER_SETTLEMENT', id::text, net_amount_minor, currency::text FROM settlements WHERE status='SETTLED' AND created_at >= '$RUN_START' AND created_at < '$PERIOD_END') x")
call "$CORE" 8081 POST /internal/v1/admin/boundary-reconciliation "{\"period_start\":\"$RUN_START\",\"period_end\":\"$PERIOD_END\",\"evidence\":$FULL}"
chk J_CONVERGED_RUN "$CODE" "200"
chk J_CONVERGED_NEW_RUN "$(jget created)" "true"
chk J_CONVERGED_P2_MATCHED "$(printf '%s' "$LAST" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);process.stdout.write(j.items.filter(i=>i.external_ref===process.argv[1]).map(i=>i.outcome).join(","))})' "$P2")" "MATCHED"
chk J_CONVERGED_NO_SEVERE "$(printf '%s' "$LAST" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);process.stdout.write(String(j.items.filter(i=>!["MATCHED","PENDING"].includes(i.outcome)).length))})')" "0"
snap
chk J_POSITION_CLEAN "$(p findings)" "none"

echo "### K — cleanup through Core: nothing hidden on retired resources"
PAYOUT_FEES=$(( F1 + F2 ))
e2e_end
snap
chk K_FINDINGS "$(p findings)" "none"
# Retirement returned every remaining obligation to synthetic transit, so what
# Banzami owes is exactly what it owed before the run. What stays is the
# withdrawal fees it earned: revenue, sitting in synthetic transit.
chk K_OBLIGATIONS_BACK "$(d covered_obligations_minor "$P0")" "0"
chk K_REVENUE_IS_THE_WITHDRAWAL_FEES "$(d operator_revenue_minor "$P0")" "$PAYOUT_FEES"
chk K_TRANSIT_HOLDS_THE_FEES "$(d external_transit_minor "$P0")" "$PAYOUT_FEES"
chk K_IN_FLIGHT_BACK "$(d withdrawals_in_flight_minor "$P0")" "0"
chk K_BACKING_BACK "$(d external_backing_minor "$P0")" "0"
chk K_IDENTITY "$(p identity)" "0"
chk K_RETIRED_HOLD_NOTHING "$(q "SELECT COUNT(*) FROM ledger_entries e JOIN consumer_wallets w ON e.account_id = w.available_account_id WHERE w.consumer_id IN ('$AC','$FC') HAVING SUM(CASE e.entry_type WHEN 'CREDIT' THEN e.amount_minor ELSE -e.amount_minor END) <> 0")" ""

echo
echo "MONEY_MODEL_SANDBOX_E2E: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
