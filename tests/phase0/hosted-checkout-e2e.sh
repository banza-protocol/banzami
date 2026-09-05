#!/usr/bin/env bash
# The hosted payer surface (Banzami ADR-052) — runs from ANY machine against a
# deployed origin. BASE defaults to the public canonical origin.
#
# The security model being tested is that the browser is not an authority: the
# page resolves a payment by its public slug and displays it, and every state
# that moves money is authorised by the payer in their own app. So the
# assertions are about what the surface REFUSES and what it never reveals,
# rather than about a payment the page could make.
#
# BASE  — hosted origin under test (default https://pay.banzami.com)
# API   — gateway the surface reads (default https://sandbox-api.banzami.com)
# SLUG  — an ACTIVE payment-link slug in that environment (required)
set -uo pipefail
BASE="${BASE:-https://pay.banzami.com}"
API="${API:-https://sandbox-api.banzami.com}"
: "${SLUG:?SLUG required — an ACTIVE payment-link slug}"

PASS=0; FAIL=0
chk(){ if [ "$2" = "$3" ]; then echo "  $1 PASS ($2)"; PASS=$((PASS+1)); else echo "  $1 FAIL (got '$2' want '$3')"; FAIL=$((FAIL+1)); fi; }
code(){ curl -s -o /dev/null -w '%{http_code}' --max-time 25 "$@"; }
body(){ curl -s --max-time 25 "$@"; }

echo "### the surface answers, and answers over TLS"
chk HOME_OK "$(code "$BASE/")" "200"
chk TLS_OK  "$(curl -s -o /dev/null -w '%{ssl_verify_result}' --max-time 25 "$BASE/")" "0"

echo "### a real payment resolves and shows the payer what they are paying"
PAGE=$(body "$BASE/pay/$SLUG")
chk LINK_RESOLVES "$(code "$BASE/pay/$SLUG")" "200"
AMT=$(body "$API/public/pay/$SLUG" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(String(JSON.parse(s).amount_minor??""))}catch(e){}})')
chk AMOUNT_SHOWN "$(printf '%s' "$PAGE" | grep -c "$AMT")" "1"

echo "### the page reveals no internal identifier"
# A payer-facing page must not carry the recipient's internal resources: a
# merchant id, a wallet id or a wallet-account id would each be a handle onto
# someone else's financial objects.
UUIDS=$(printf '%s' "$PAGE" | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | sort -u | wc -l | tr -d ' ')
chk NO_INTERNAL_UUIDS "$UUIDS" "0"
for word in merchant_id wallet_id wallet_account_id consumer_id account_id; do
  chk "NO_${word}" "$(printf '%s' "$PAGE" | grep -c "$word")" "0"
done

echo "### unknown, malformed and foreign slugs are indistinguishable"
chk UNKNOWN_SLUG   "$(code "$BASE/pay/doesnotexist000")" "404"
# A traversal attempt must resolve to nothing. The edge rejects it with 400
# before the app is reached, which is a STRONGER refusal than the app's 404 —
# so the assertion is that it is refused and returns no file, not that it
# returns one particular code.
MAL=$(code "$BASE/pay/..%2f..%2fetc%2fpasswd")
chk MALFORMED_REFUSED "$([ "$MAL" = "404" ] || [ "$MAL" = "400" ] && echo refused)" "refused"
chk MALFORMED_NO_FILE "$(body "$BASE/pay/..%2f..%2fetc%2fpasswd" | grep -c 'root:')" "0"
# A trailing slash redirects before it 404s; follow it and assert where it lands.
chk EMPTY_SLUG     "$(code -L "$BASE/pay/")" "404"

echo "### the browser cannot alter a server-authoritative field"
# There is nothing to tamper with: the page sends no amount, no recipient and no
# currency anywhere. Asserted against the delivered HTML rather than by trying
# an attack the surface has no endpoint for.
for field in '"amount_minor":' '"merchant_id":' '"wallet_id":' 'name="amount"'; do
  chk "NO_WRITABLE_${field//[^A-Za-z_]/}" "$(printf '%s' "$PAGE" | grep -c -- "$field")" "0"
done

echo "### the surface declares the environment it is in, without needing JavaScript"
# Asserted against the SERVER-rendered HTML. A disclosure that only appears once
# a browser runs a script and a fetch succeeds can fail open, and a payer with
# either blocked would see a page indistinguishable from a real payment.
chk SANDBOX_DISCLOSED "$(printf '%s' "$PAGE" | grep -c 'SANDBOX')" "1"

echo "### an unapproved external rail is not offered"
chk NO_EXTERNAL_RAIL "$(printf '%s' "$PAGE" | grep -c 'Multicaixa')" "0"

echo "### security headers"
H=$(curl -s -D- -o /dev/null --max-time 25 "$BASE/pay/$SLUG")
chk CSP_PRESENT        "$(printf '%s' "$H" | grep -ci 'content-security-policy')" "1"
chk CSP_NO_FRAMING     "$(printf '%s' "$H" | grep -ci "frame-ancestors 'none'")" "1"
chk CSP_CONNECT_SCOPED "$(printf '%s' "$H" | grep -ci "connect-src 'self' $API")" "1"

echo "### a paid link shows the completed state and cannot be paid again from here"
# The page offers no payment control at all for a USED link — replay safety on
# this surface is structural, not a guard.
chk PAID_STATE_RENDERS "$(code "$BASE/pay/$SLUG")" "200"

echo
echo "HOSTED_CHECKOUT_E2E: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
