#!/usr/bin/env bash
# One Business, signed in, cannot read another Business — on the deployed
# Sandbox, through the public API, with the routes the Business App uses.
# Runs ON the Sandbox VM.
#
# Two disposable Businesses, A and B, each with a wallet and a payment link.
# Signed in as A (a merchant session token, the same shape the Business App's
# @handle+PIN login issues), every Business App read is pointed at B's ids:
# B's merchant record, wallet, balance, wallet accounts, payment links, a named
# payment link, and A's own lists (transactions, wallet payments, payment
# requests) are searched for anything of B's. A disclosure is any response to A
# that carries B's merchant id, wallet id, account id, link id or name.
#
#   BUSINESS_CROSS_TENANT_DISCLOSURE must be 0.
#
# A's reads of its OWN resources are the control: a probe where everything
# fails would also disclose nothing.
#
# The Gateway's JWT secret is held in a variable and never printed.
# NEVER run under `bash -x`.
set -uo pipefail

API="${API:-https://sandbox-api.banzami.com}"
HERE="$(cd "$(dirname "$0")" && pwd)"
GW=$(docker ps  --format '{{.Names}}' | grep api-gateway-staging | head -1)
PG=$(docker ps  --format '{{.Names}}' | grep postgres | grep bzsandbox | head -1)
CORE=$(docker ps --format '{{.Names}}'| grep core-api-staging    | head -1)
[ -n "$GW" ] && [ -n "$PG" ] && [ -n "$CORE" ] || { echo "NO_CONTAINERS"; exit 1; }
JWTSEC=$(docker exec "$GW" sh -c 'cat /run/secrets/jwt_secret 2>/dev/null')
PW=$(docker exec "$CORE" sh -c 'cat /run/secrets/db_url 2>/dev/null' | sed -E 's#.*://[^:]+:([^@]+)@.*#\1#')
[ -n "$JWTSEC" ] && [ -n "$PW" ] || { echo "NO_SECRET"; exit 1; }
q(){ docker exec -e PGPASSWORD="$PW" -e PGOPTIONS="-c default_transaction_read_only=on" "$PG" \
       psql -q -U bl_app_runtime -d banzami_staging -At -c "$1" 2>/dev/null | tr -d '\r'; }

. "$HERE/lib/e2e-run.sh"
e2e_begin

PASS=0; FAIL=0; DISCLOSURES=0
chk(){ if [ "$2" = "$3" ]; then echo "  $1 PASS ($2)"; PASS=$((PASS+1));
       else echo "  $1 FAIL (got '$2' want '$3')"; FAIL=$((FAIL+1)); fi; }
LAST=""; CODE=""
# Setup only, inside the Gateway container (a file descriptor does not cross
# docker exec, so the short-lived fixture token travels as an argument there, as
# in the other harnesses). Every probe below goes through the public edge.
gw(){ local m="$1" p="$2" bd="$3" tok="$4"
  local a=(curl -s -w $'\n%{http_code}' -X "$m" "http://localhost:8080$p" -H "Authorization: Bearer $tok")
  local r
  if [ "$bd" = "-" ]; then r=$(docker exec "$GW" "${a[@]}" 2>/dev/null)
  else a+=(-H "Content-Type: application/json" --data @-); r=$(printf '%s' "$bd" | docker exec -i "$GW" "${a[@]}" 2>/dev/null); fi
  CODE=$(printf '%s' "$r" | tail -n1); LAST=$(printf '%s' "$r" | sed '$d'); }
pub(){ local m="$1" p="$2" tok="$3"
  local r; r=$(curl -s -w $'\n%{http_code}' -X "$m" "$API$p" -H @/dev/fd/3 3< <(printf 'Authorization: Bearer %s\n' "$tok") 2>/dev/null)
  CODE=$(printf '%s' "$r" | tail -n1); LAST=$(printf '%s' "$r" | sed '$d'); }
jp(){ printf '%s' "$LAST" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{let j;try{j=JSON.parse(s)}catch(e){return}const v=(function(j){return eval(process.argv[1])})(j);process.stdout.write(v===undefined||v===null?String(v):typeof v==="object"?JSON.stringify(v):String(v))})' "$1"; }
mint(){ SECRET="$JWTSEC" V="$1" node -e 'const c=require("crypto");const b=o=>Buffer.from(typeof o==="string"?o:JSON.stringify(o)).toString("base64url");const n=Math.floor(Date.now()/1000);const cl={merchant_id:process.env.V,scopes:["*"],environment:"SANDBOX",iat:n,exp:n+900};const h=b({alg:"HS256",typ:"JWT"}),p=b(cl);process.stdout.write(h+"."+p+"."+c.createHmac("sha256",process.env.SECRET).update(h+"."+p).digest("base64url"));'; }
denial_count(){ docker exec "$GW" sh -c 'curl -s http://localhost:8080/metrics' 2>/dev/null \
  | awk '/^banzami_business_tenant_denials_total\{surface="wallet"\}/{print $2}' | head -1; }

R="${RANDOM}${RANDOM}"
ROOT=$(mint 00000000-0000-0000-0000-000000000001)

echo "### two Businesses, each with a wallet and a payment link"
for who in A B; do
  gw POST /v1/merchants "{\"name\":\"Sandbox · isolation-$who-$R\",\"email\":\"isolation-$who-$R@projects.banzami.test\"}" "$ROOT"
  mid=$(jp j.id); e2e_own merchant "$mid"
  tok=$(mint "$mid")
  gw POST /v1/wallets '{"currency":"AOA"}' "$tok"; wid=$(jp j.id)
  acct=$(q "SELECT id FROM wallet_accounts WHERE wallet_id='$wid' AND purpose='PRIMARY'")
  gw POST /v1/payment-links "{\"merchant_id\":\"$mid\",\"wallet_id\":\"$wid\",\"amount_minor\":1000,\"currency\":\"AOA\",\"description\":\"isolation $who\"}" "$tok"
  lid=$(jp j.id); [ -n "$lid" ] && e2e_own payment_link "$lid" "$mid"
  eval "M_$who=\$mid; T_$who=\$tok; W_$who=\$wid; ACC_$who=\$acct; L_$who=\$lid"
done
chk FIXTURES_READY "$([ -n "$M_A" ] && [ -n "$W_A" ] && [ -n "$L_A" ] && [ -n "$M_B" ] && [ -n "$W_B" ] && [ -n "$L_B" ] && echo yes)" yes

B_MARKERS=("$M_B" "$W_B" "$ACC_B" "$L_B" "isolation-B-$R")
discloses(){ local m; for m in "${B_MARKERS[@]}"; do [ -n "$m" ] && printf '%s' "$LAST" | grep -qF "$m" && return 0; done; return 1; }
probe(){ # <name> <path> <expected-status-or-any>
  pub GET "$2" "$T_A"
  if discloses; then DISCLOSURES=$((DISCLOSURES+1)); echo "  $1 DISCLOSED B (http $CODE)"; FAIL=$((FAIL+1));
  elif [ "$3" != any ] && [ "$CODE" != "$3" ]; then echo "  $1 FAIL (http $CODE, want $3)"; FAIL=$((FAIL+1));
  else echo "  $1 PASS (http $CODE, nothing of B)"; PASS=$((PASS+1)); fi; }

echo "### control: A reads its own"
pub GET "/v1/wallets/$W_A/balance" "$T_A"; chk OWN_BALANCE "$CODE" 200
# A new Business holds nothing yet: that is a balance of 0 Kz — an answer the
# app shows as money — not a failure to load one.
chk NEW_BUSINESS_BALANCE_IS_ZERO_KZ "$(jp j.available_minor):$(jp j.total_minor):$(jp j.currency)" "0:0:AOA"
pub GET "/v1/merchants/$M_A" "$T_A";       chk OWN_MERCHANT "$CODE" 200
pub GET "/v1/payment-links/$L_A" "$T_A";   chk OWN_LINK "$CODE" 200
# The detector itself: A's own wallet read must be recognised as carrying A's
# ids, or "nothing of B" below would mean nothing.
pub GET "/v1/wallets/$W_A" "$T_A"
chk DETECTOR_SEES_WHAT_IS_THERE "$(printf '%s' "$LAST" | grep -qF "$W_A" && printf '%s' "$LAST" | grep -qF "$M_A" && echo yes)" yes

echo "### A's session, ended"
# What the Business App meets when a token outlives its session: a refusal it
# can recognise (401), never data. The app then asks for the PIN once.
EXPIRED=$(SECRET="$JWTSEC" V="$M_A" node -e 'const c=require("crypto");const b=o=>Buffer.from(typeof o==="string"?o:JSON.stringify(o)).toString("base64url");const n=Math.floor(Date.now()/1000);const cl={merchant_id:process.env.V,scopes:["*"],environment:"SANDBOX",iat:n-90000,exp:n-3600};const h=b({alg:"HS256",typ:"JWT"}),p=b(cl);process.stdout.write(h+"."+p+"."+c.createHmac("sha256",process.env.SECRET).update(h+"."+p).digest("base64url"));')
pub GET "/v1/wallets/$W_A/balance" "$EXPIRED"
chk EXPIRED_SESSION_IS_401 "$CODE" 401
chk EXPIRED_SESSION_RETURNS_NO_BALANCE "$(printf '%s' "$LAST" | grep -c '"available')" 0

echo "### A, pointed at B"
before=$(denial_count); before=${before:-0}
probe MERCHANT_RECORD        "/v1/merchants/$M_B"                          any
probe WALLET                 "/v1/wallets/$W_B"                            404
probe BALANCE                "/v1/wallets/$W_B/balance"                    404
probe WALLET_ACCOUNTS        "/v1/wallet-accounts?wallet_id=$W_B"          any
probe PAYMENT_LINKS_BY_OWNER "/v1/payment-links?merchant_id=$M_B&limit=50" any
probe PAYMENT_LINK           "/v1/payment-links/$L_B"                      any
probe WALLET_LIST            "/v1/wallets?currency=AOA"                    any
probe TRANSACTIONS           "/v1/transactions?limit=50"                   any
probe WALLET_PAYMENTS        "/v1/merchant/wallet-payments?limit=50"       any
probe PAYMENT_REQUESTS       "/v1/payment-requests?limit=50"               any
pub GET "/v1/merchants/$M_B" "$T_A"; chk MERCHANT_RECORD_REFUSED "$([ "$CODE" = 403 ] || [ "$CODE" = 404 ] && echo refused)" refused
pub GET "/v1/payment-links/$L_B" "$T_A"; chk PAYMENT_LINK_REFUSED "$([ "$CODE" = 403 ] || [ "$CODE" = 404 ] && echo refused)" refused
after=$(denial_count); after=${after:-0}
chk WALLET_DENIALS_COUNTED "$(node -e "process.stdout.write(String(($after)-($before)>=2))")" true

echo
echo "BUSINESS_CROSS_TENANT_DISCLOSURE=$DISCLOSURES"
echo "BUSINESS_TENANT_ISOLATION: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ] && [ "$DISCLOSURES" -eq 0 ]
