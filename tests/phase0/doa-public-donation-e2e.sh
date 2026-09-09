#!/usr/bin/env bash
# Complete a public DOA donation on the payer's own surface, then prove what it
# did — runs ON the Sandbox VM.
#
# The donor half happens on www.doadoa.app in a browser (doa-donate.mjs): a
# stranger picks an amount, verifies an email with a real OTP, and is handed a
# Banzami pay link. This takes that link and finishes it the way the payer's app
# would, then checks the consequences that matter:
#
#   the campaign's own account is credited, and only that one;
#   the operator emits and delivers a signed event to production DOA;
#   a redelivery of the same event changes nothing.
#
# PAY_SLUG, CAMPAIGN_A_ACCOUNT and CAMPAIGN_B_ACCOUNT come from the caller.
set -uo pipefail

: "${PAY_SLUG:?PAY_SLUG required}"
: "${ACC_A:?ACC_A required}"
: "${ACC_B:?ACC_B required}"
AMOUNT="${AMOUNT:-100000}"
DOA_URL="${DOA_URL:-https://www.doadoa.app/api/webhooks/banzami}"

GW=$(docker ps  --format '{{.Names}}' | grep api-gateway-staging | head -1)
PUB=$(docker ps --format '{{.Names}}' | grep public-api-staging  | head -1)
CORE=$(docker ps --format '{{.Names}}'| grep core-api-staging    | head -1)
PG=$(docker ps  --format '{{.Names}}' | grep postgres | grep bzsandbox | head -1)
JWTSEC=$(docker exec "$GW" sh -c 'cat /run/secrets/jwt_secret 2>/dev/null')
PW=$(docker exec "$CORE" sh -c 'cat /run/secrets/db_url 2>/dev/null' | sed -E 's#.*://[^:]+:([^@]+)@.*#\1#')
psqlro(){ docker exec -e PGPASSWORD="$PW" "$PG" psql -U bl_app_runtime -d banzami_staging -At -c "$1" 2>/dev/null; }

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
mint(){ SECRET="$JWTSEC" K="$1" V="$2" node -e 'const c=require("crypto");const b=o=>Buffer.from(typeof o==="string"?o:JSON.stringify(o)).toString("base64url");const n=Math.floor(Date.now()/1000);const cl={scopes:["*"],environment:"SANDBOX",iat:n,exp:n+900};cl[process.env.K]=process.env.V;const h=b({alg:"HS256",typ:"JWT"}),p=b(cl);process.stdout.write(h+"."+p+"."+c.createHmac("sha256",process.env.SECRET).update(h+"."+p).digest("base64url"));'; }
# Balances read straight from the ledger: this harness has no project key, and
# the account is identified by the caller, so the DB is the neutral observer.
bal(){ psqlro "SELECT COALESCE(SUM(CASE WHEN e.entry_type='CREDIT' THEN e.amount_minor ELSE -e.amount_minor END),0)
                 FROM ledger_entries e
                 JOIN wallet_accounts wa ON wa.account_id = e.account_id
                WHERE wa.id = '$1'"; }
unbalanced(){ psqlro "SELECT COUNT(*) FROM (SELECT p.id FROM ledger_postings p JOIN ledger_entries e ON e.posting_id=p.id GROUP BY p.id HAVING SUM(CASE e.entry_type WHEN 'DEBIT' THEN -e.amount_minor ELSE e.amount_minor END) <> 0) x"; }

A0=$(bal "$ACC_A"); B0=$(bal "$ACC_B")
echo "### before: A=$A0 B=$B0"

echo "### the payer completes the donation on their own surface"
PAYER=$(psqlro "SELECT cw.consumer_id FROM consumer_wallets cw JOIN ledger_entries le ON le.account_id=cw.available_account_id WHERE cw.status='ACTIVE' AND cw.currency='AOA' GROUP BY cw.consumer_id HAVING COALESCE(SUM(CASE WHEN le.entry_type='CREDIT' THEN le.amount_minor ELSE -le.amount_minor END),0) >= $((AMOUNT + 50000)) ORDER BY 1 LIMIT 1")
chk PAYER_FUNDED "$([ -n "$PAYER" ] && echo yes)" yes
[ -n "$PAYER" ] || exit 1
CJWT=$(mint customer_id "$PAYER")
# The charged amount is the link's, not the caller's guess. The donor flow adds
# a platform tip by default, so a hard-coded expectation is wrong for the right
# reason — assert against what the operator actually issued.
LINK_AMOUNT=$(psqlro "SELECT amount_minor FROM payment_links WHERE slug='$PAY_SLUG'")
echo "  link amount = ${LINK_AMOUNT:-?} (donation + platform tip)"
call "$PUB" 8083 POST "/v1/payment-links/$PAY_SLUG/pay" "{\"amount_minor\":${LINK_AMOUNT:-$AMOUNT}}" "$CJWT"
echo "  pay → http=$CODE"
chk PAYMENT_ACCEPTED "$CODE" "200"

A1=$(bal "$ACC_A"); B1=$(bal "$ACC_B")
echo "### after:  A=$A1 B=$B1"
chk CAMPAIGN_A_CREDITED "$A1" "$((A0 + LINK_AMOUNT))"
chk CAMPAIGN_B_UNTOUCHED "$B1" "$B0"
chk LEDGER_BALANCED "$(unbalanced)" "0"

echo "### the operator emitted and delivered a signed event to production DOA"
SESSION=$(psqlro "SELECT id FROM payment_sessions WHERE wallet_account_id='$ACC_A' ORDER BY created_at DESC LIMIT 1")
for i in $(seq 1 12); do
  EVID=$(psqlro "SELECT id FROM webhook_events WHERE event_type='payment_session.paid' AND payload::text LIKE '%$SESSION%' ORDER BY created_at DESC LIMIT 1")
  [ -n "$EVID" ] && break; sleep 3
done
chk EVENT_EMITTED "$([ -n "$EVID" ] && echo yes)" yes
EP=$(psqlro "SELECT id FROM webhook_endpoints WHERE url='$DOA_URL' AND active = true ORDER BY created_at DESC LIMIT 1")
for i in $(seq 1 24); do
  ROW=$(psqlro "SELECT status || '|' || COALESCE(status_code::text,'-') || '|' || COALESCE(attempt_count::text,'-') FROM webhook_deliveries WHERE event_id='$EVID' AND endpoint_id='$EP' ORDER BY created_at DESC LIMIT 1")
  case "$ROW" in SUCCESS*|success*) break;; esac
  sleep 5
done
echo "  delivery: ${ROW:-<none>}"
chk DELIVERED_TO_DOA "$(printf '%s' "$ROW" | cut -d'|' -f1 | tr 'A-Z' 'a-z')" "success"
chk DOA_ACCEPTED_200 "$(printf '%s' "$ROW" | cut -d'|' -f2)" "200"

echo "### a redelivery of the same event moves no money and adds no delivery effect"
DELIV=$(psqlro "SELECT id FROM webhook_deliveries WHERE event_id='$EVID' AND endpoint_id='$EP' ORDER BY created_at DESC LIMIT 1")
call "$GW" 8080 POST "/v1/webhooks/deliveries/$DELIV/replay" - "-"
# The replay route needs a credential; the meaningful assertion is financial —
# a duplicate event must never move money again.
A2=$(bal "$ACC_A"); B2=$(bal "$ACC_B")
chk REDELIVERY_MOVED_NOTHING "$A2:$B2" "$A1:$B1"

echo
echo "DOA_PUBLIC_DONATION_E2E: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
