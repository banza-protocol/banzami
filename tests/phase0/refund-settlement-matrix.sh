#!/usr/bin/env bash
# Refund and settlement, against the deployed Sandbox.
#
# Refund creates no new operator fee — it returns value that was already priced,
# or priced nothing. What it DOES change is how much is left to settle, and
# therefore what the settlement fee is computed on. That interaction is the
# whole subject here, because it is where an operator can quietly charge twice
# or refund money it no longer holds.
#
#   1  refund BEFORE settlement   gross 100 000, refund 20 000, settle 80 000
#                                 at 200 bps -> fee 1 600, net 78 400
#   2  refund larger than what remains -> refused, nothing moves
#   3  refund AFTER full settlement -> refused, nothing moves, no wallet goes
#                                 negative and no unrelated account is debited
#
# Case 3 is the one worth writing. Once a settlement has moved the value out,
# the money to fund a refund is not there. The only acceptable answers are "fail
# closed" or "draw on a canonical funding source"; the unacceptable ones are a
# negative wallet, a debit against a sibling account, or an invented liability.
#
# THE CONTRACT THIS SPEAKS
#
# Settlements used to be requested with source_wallet_id / beneficiary_wallet_id /
# application_fee_wallet_id, which /v1/application-settlements does not take:
# every one answered 400, case 1 measured a settlement that never happened and
# case 3 refunded against value that had never left. A settlement moves value out
# of a segregated account the caller owns, to a @banza, with the fee to the
# caller's own @banza. So a payment lands on the PRIMARY account (where a refund
# draws from), what is to be settled is moved into a CAMPAIGN account with a
# wallet-account transfer, and the settlement names that account and two @banza.
# Everything a run was given is retired when it ends (tests/phase0/lib/e2e-run.sh).
set -uo pipefail

P=$(docker ps --format '{{.Names}}' | grep -m1 'bzsandbox-.*-core-api-staging' | sed -E 's/-core-api-staging$//')
GW="$P-api-gateway-staging"; CORE="$P-core-api-staging"; PG="$P-postgres-1"
[ -n "$P" ] || { echo "NO_SANDBOX_STACK"; exit 1; }
PW=$(docker exec "$CORE" sh -c 'cat /run/secrets/db_url' | sed -E 's#.*://[^:]+:([^@]+)@.*#\1#')
JWTSEC=$(docker exec "$GW" sh -c 'cat /run/secrets/jwt_secret')

. "$(cd "$(dirname "$0")" && pwd)/lib/e2e-run.sh"
e2e_begin

q(){ docker exec -e PGPASSWORD="$PW" "$PG" psql -q -U bl_app_runtime -d banzami_staging -At -c "$1" 2>/dev/null | tr -d '\r\n'; }

PASS=0; FAIL=0
chk(){ if [ "$2" = "$3" ]; then echo "  $1 PASS ($2)"; PASS=$((PASS+1));
       else echo "  $1 FAIL (got '$2' want '$3')"; FAIL=$((FAIL+1)); fi; }
chk_in(){ case " $3 " in *" $2 "*) echo "  $1 PASS ($2)"; PASS=$((PASS+1));;
          *) echo "  $1 FAIL (got '$2' want one of '$3')"; FAIL=$((FAIL+1));; esac; }

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
abal(){ q "SELECT COALESCE(SUM(CASE WHEN e.entry_type='CREDIT' THEN e.amount_minor ELSE -e.amount_minor END),0)
             FROM ledger_entries e WHERE e.account_id=(SELECT account_id FROM wallet_accounts WHERE id='$1')"; }
unbalanced(){ q "SELECT COUNT(*) FROM (SELECT p.id FROM ledger_postings p
                    JOIN ledger_entries e ON e.posting_id=p.id GROUP BY p.id
                   HAVING SUM(CASE e.entry_type WHEN 'DEBIT' THEN -e.amount_minor ELSE e.amount_minor END) <> 0) x"; }
negative_wallets(){ q "SELECT COUNT(*) FROM (
    SELECT w.id FROM wallets w JOIN ledger_entries e ON e.account_id = w.available_account_id
     GROUP BY w.id
    HAVING SUM(CASE WHEN e.entry_type='CREDIT' THEN e.amount_minor ELSE -e.amount_minor END) < 0) x"; }

R="${RANDOM}${RANDOM}"

# An APPLICATION owner on the nonzero plan, with approved KYB — the shape that
# may receive an application fee.
mk(){ # $1 = profile -> prints merchant|wallet|campaign_account|@banza
  local mid wid
  mid=$(q "INSERT INTO merchants (id, name, email, status, business_account_type)
           VALUES (gen_random_uuid(), 'refund-$R',
                   'refund-' || gen_random_uuid() || '@projects.banzami.test', 'ACTIVE', 'APPLICATION')
           RETURNING id")
  [ -n "$mid" ] || return 1
  e2e_own merchant "$mid"
  q "INSERT INTO merchant_compliance (merchant_id, kyb_status, aml_status)
     VALUES ('$mid','APPROVED','APPROVED')
     ON CONFLICT (merchant_id) DO UPDATE SET kyb_status='APPROVED', aml_status='APPROVED'" >/dev/null
  call "$CORE" 8081 PUT "/internal/v1/merchants/$mid/pricing-profile" "{\"profile_code\":\"$1\"}"
  call "$CORE" 8081 POST /internal/v1/wallets "{\"merchant_id\":\"$mid\",\"currency\":\"AOA\"}"
  wid=$(jget id)
  # Nameable by @banza — as a beneficiary, and as its own fee destination.
  local h
  h=$(printf 'r%s' "$(printf '%s' "$mid" | tr -d '-' | cut -c1-11)" | tr 'A-Z' 'a-z')
  q "INSERT INTO handle_registry (handle, owner_type, owner_id, created_at)
     VALUES ('$h','MERCHANT','$mid', now()) ON CONFLICT (handle) DO NOTHING" >/dev/null
  call "$GW" 8080 POST /v1/wallet-accounts \
    "{\"wallet_id\":\"$wid\",\"purpose\":\"CAMPAIGN\",\"reference_type\":\"REFUND_MATRIX\",\"reference_id\":\"src-$mid\",\"label\":\"refund matrix source\"}" "$(mint "$mid")"
  printf '%s|%s|%s|%s' "$mid" "$wid" "$(jget id)" "$h"
}

# A captured payment: the wallet ends up holding the full gross.
pay(){ # $1=merchant $2=wallet $3=amount $4=idem -> prints tx id
  local jwt tx; jwt=$(mint "$1")
  call "$GW" 8080 POST /v1/transactions \
    "{\"idempotency_key\":\"rf-$4-$R\",\"amount_minor\":$3,\"currency\":\"AOA\",\"wallet_id\":\"$2\"}" "$jwt"
  tx=$(jget id)
  call "$CORE" 8081 POST "/internal/v1/transactions/$tx/authorize" "-"
  call "$CORE" 8081 POST "/internal/v1/transactions/$tx/capture" "-"
  printf '%s' "$tx"
}

refund(){ # $1=merchant $2=tx $3=amount $4=idem
  local jwt; jwt=$(mint "$1")
  call "$GW" 8080 POST /v1/refunds \
    "{\"source_type\":\"ACQUIRING_PAYMENT\",\"source_id\":\"$2\",\"amount_minor\":$3,\"currency\":\"AOA\",\"reason\":\"matrix $4\",\"idempotency_key\":\"rfd-$4-$R\"}" "$jwt"
}

# Move value from the PRIMARY account into the CAMPAIGN account that settles.
to_campaign(){ # $1=merchant $2=wallet $3=campaign_account $4=amount $5=idem
  local primary
  primary=$(q "SELECT id FROM wallet_accounts WHERE wallet_id='$2' AND purpose='PRIMARY'")
  call "$GW" 8080 POST /v1/wallet-account-transfers \
    "{\"source_wallet_account_id\":\"$primary\",\"destination_wallet_account_id\":\"$3\",\"amount_minor\":$4,\"currency\":\"AOA\",\"idempotency_key\":\"rft-$5-$R\",\"description\":\"refund matrix $R\"}" "$(mint "$1")"
}

settle(){ # $1=merchant $2=source_account $3=beneficiary_@banza $4=idem $5=own_@banza
  local jwt; jwt=$(mint "$1")
  call "$GW" 8080 POST /v1/application-settlements \
    "{\"idempotency_key\":\"rfs-$4-$R\",\"source_account_id\":\"$2\",\"beneficiary_banza_name\":\"$3\",\"fee_destination_banza_name\":\"$5\",\"reason\":\"REFUND_MATRIX\",\"reference_type\":\"REFUND_MATRIX\",\"reference_id\":\"rf-$4-$R\"}" "$jwt"
}

echo "### ledger before"
chk LEDGER_SOUND_BEFORE "$(unbalanced)" "0"
chk NO_NEGATIVE_WALLETS_BEFORE "$(negative_wallets)" "0"

# ─── 1. refund before settlement ────────────────────────────────────────────
echo
echo "### 1 — refund 20 000 of 100 000, then settle the 80 000 that remain"
IFS='|' read -r M1 W1 A1 H1 <<<"$(mk sandbox-reference)"
IFS='|' read -r _ B1 _ BH1 <<<"$(mk sandbox-reference)"
TX1=$(pay "$M1" "$W1" 100000 a)
chk ONE_WALLET_HAS_GROSS "$(wbal "$W1")" "100000"

refund "$M1" "$TX1" 20000 a
chk ONE_REFUND_ACCEPTED "$CODE" "201"
chk ONE_WALLET_AFTER_REFUND "$(wbal "$W1")" "80000"
# A refund is not a fee-bearing operation: it creates no operator fee row.
chk ONE_REFUND_CHARGED_NOTHING "$(q "SELECT COUNT(*) FROM operator_fees WHERE transaction_id='$TX1'")" "0"

# What remains is what is settled.
to_campaign "$M1" "$W1" "$A1" 80000 a
chk ONE_REMAINDER_SEGREGATED "$(abal "$A1")" "80000"
settle "$M1" "$A1" "$BH1" a "$H1"
chk ONE_SETTLEMENT_OK "$CODE" "201"
S1=$(jget id)
chk ONE_GROSS_IS_WHAT_REMAINED "$(q "SELECT gross_amount_minor FROM app_settlements WHERE id='$S1'")" "80000"
chk ONE_RATE "$(q "SELECT (pricing_snapshot_json->>'rate_bps') FROM app_settlements WHERE id='$S1'")" "200"
chk ONE_FEE_IS_1600 "$(q "SELECT application_fee_minor FROM app_settlements WHERE id='$S1'")" "1600"
chk ONE_NET_IS_78400 "$(q "SELECT net_amount_minor FROM app_settlements WHERE id='$S1'")" "78400"
chk ONE_BENEFICIARY_GETS_NET "$(wbal "$B1")" "78400"
chk ONE_FEE_TO_OWN_ACCOUNT "$(wbal "$W1")" "1600"

# ─── 2. refund beyond what remains ──────────────────────────────────────────
echo
echo "### 2 — a refund larger than the remaining refundable amount"
IFS='|' read -r M2 W2 _ _ <<<"$(mk sandbox-reference)"
TX2=$(pay "$M2" "$W2" 100000 b)
refund "$M2" "$TX2" 60000 b
chk TWO_FIRST_REFUND_OK "$CODE" "201"
chk TWO_WALLET_AFTER_FIRST "$(wbal "$W2")" "40000"
# 60 000 is already refunded; 60 000 more would exceed the captured amount.
refund "$M2" "$TX2" 60000 b2
chk_in TWO_SECOND_REFUND_REFUSED "$CODE" "409 422"
chk TWO_WALLET_UNCHANGED "$(wbal "$W2")" "40000"

# ─── 3. refund after the value has been settled away ────────────────────────
echo
echo "### 3 — refund attempted after a full settlement moved the value out"
IFS='|' read -r M3 W3 A3 H3 <<<"$(mk sandbox-reference)"
IFS='|' read -r _ B3 _ BH3 <<<"$(mk sandbox-reference)"
TX3=$(pay "$M3" "$W3" 100000 c)
to_campaign "$M3" "$W3" "$A3" 100000 c
settle "$M3" "$A3" "$BH3" c "$H3"
chk THREE_SETTLEMENT_OK "$CODE" "201"
S3=$(jget id)
FEE3=$(q "SELECT application_fee_minor FROM app_settlements WHERE id='$S3'")
chk THREE_FEE_CHARGED_ONCE "$FEE3" "2000"
# The fee came back to the owner's own PRIMARY account; the net left.
chk THREE_WALLET_AFTER_SETTLEMENT "$(wbal "$W3")" "$FEE3"
chk THREE_BENEFICIARY_GOT_NET "$(wbal "$B3")" "98000"
chk THREE_CAMPAIGN_EMPTIED "$(abal "$A3")" "0"

BEN_BEFORE=$(wbal "$B3")
refund "$M3" "$TX3" 100000 c
chk_in THREE_REFUND_REFUSED "$CODE" "409 422"
chk THREE_WALLET_NOT_DRAINED "$(wbal "$W3")" "$FEE3"
chk THREE_BENEFICIARY_NOT_DEBITED "$(wbal "$B3")" "$BEN_BEFORE"
chk THREE_CAMPAIGN_NOT_DEBITED "$(abal "$A3")" "0"

# ─── invariants ─────────────────────────────────────────────────────────────
echo
echo "### the ledger, after all of it"
chk NO_UNBALANCED_POSTING "$(unbalanced)" "0"
chk NO_NEGATIVE_WALLET "$(negative_wallets)" "0"
chk BOOK_STILL_SUMS_ZERO "$(q "SELECT COALESCE(SUM(CASE WHEN entry_type='CREDIT' THEN amount_minor ELSE -amount_minor END),0) FROM ledger_entries")" "0"

echo
echo "REFUND_SETTLEMENT_MATRIX: PASS=$PASS FAIL=$FAIL"
e2e_end
[ "$FAIL" -eq 0 ]
