#!/usr/bin/env bash
# Campaign payment segregation E2E (ADR-042/050) — runs ON the internal Sandbox VM.
#
# The wallet-subaccount harness proves that two campaigns get two accounts and
# that a session names the right one. It stops short of the thing that actually
# matters: that MONEY lands in one account and not the other.
#
# This pays two real Sandbox payments through the canonical rail — a consumer
# scanning the session's QR — and reads the balances back from the API. No row is
# written by hand; a test that moves money by UPDATE proves only that UPDATE works.
#
# Secrets are read into memory and never printed.
set -uo pipefail

DOA_PROJECT="${DOA_PROJECT:-6367749d-ba77-47b6-80bd-982382ddd1c9}"
ACTOR="${ACTOR:-11111111-2222-4333-8444-555555555555}"

GW=$(docker ps  --format '{{.Names}}' | grep api-gateway-staging | head -1)
PUB=$(docker ps --format '{{.Names}}' | grep public-api-staging  | head -1)
CORE=$(docker ps --format '{{.Names}}'| grep core-api-staging    | head -1)
DEV=$(docker ps --format '{{.Names}}' | grep developer-api       | head -1)
PG=$(docker ps  --format '{{.Names}}' | grep postgres | grep bzsandbox | head -1)
DEVINT=$(docker exec "$DEV" sh -c 'cat /run/secrets/developer_internal_key 2>/dev/null')
JWTSEC=$(docker exec "$GW" sh -c 'cat /run/secrets/jwt_secret 2>/dev/null')
PW=$(docker exec "$CORE" sh -c 'cat /run/secrets/db_url 2>/dev/null' | sed -E 's#.*://[^:]+:([^@]+)@.*#\1#')
[ -n "$DEVINT" ] && [ -n "$JWTSEC" ] || { echo "NO_SECRET"; exit 1; }

psqlro(){ docker exec -e PGPASSWORD="$PW" "$PG" psql -U bl_app_runtime -d banzami_staging -At -c "$1" 2>/dev/null; }

PASS=0; FAIL=0
chk(){ if [ "$2" = "$3" ]; then echo "  $1 PASS ($2)"; PASS=$((PASS+1)); else echo "  $1 FAIL (got '$2' want '$3')"; FAIL=$((FAIL+1)); fi; }

LAST=""; CODE=""
call(){ local ct="$1" port="$2" m="$3" p="$4" bd="$5" au="$6" hdr="${7:-Authorization: Bearer}"
  local a=(curl -s -w $'\n%{http_code}' -X "$m" "http://localhost:$port$p")
  [ "$au" != "-" ] && a+=(-H "$hdr $au")
  local r
  if [ "$bd" = "-" ]; then r=$(docker exec "$ct" "${a[@]}" 2>/dev/null)
  else a+=(-H "Content-Type: application/json" --data @-); r=$(printf '%s' "$bd" | docker exec -i "$ct" "${a[@]}" 2>/dev/null); fi
  CODE=$(printf '%s' "$r" | tail -n1); LAST=$(printf '%s' "$r" | sed '$d'); }
jget(){ printf '%s' "$LAST" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);process.stdout.write(String(j["'"$1"'"]??""))}catch(e){}})'; }
mint(){ SECRET="$JWTSEC" K="$1" V="$2" node -e 'const c=require("crypto");const b=o=>Buffer.from(typeof o==="string"?o:JSON.stringify(o)).toString("base64url");const n=Math.floor(Date.now()/1000);const cl={scopes:["*"],environment:"SANDBOX",iat:n,exp:n+3600};cl[process.env.K]=process.env.V;const h=b({alg:"HS256",typ:"JWT"}),p=b(cl);process.stdout.write(h+"."+p+"."+c.createHmac("sha256",process.env.SECRET).update(h+"."+p).digest("base64url"));'; }

R="${RANDOM}${RANDOM}"; SEQ=0

# Balance of a wallet account, read back through the API the integrator uses.
bal(){ call "$GW" 8080 GET "/v1/business/wallet-accounts/$1" - "$KEY"
  printf '%s' "$LAST" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);const v=j.available_balance_minor;process.stdout.write(v===undefined?"?":String(v))}catch(e){process.stdout.write("?")}})'; }

echo "### project key"
SCOPES='["identity:read","payment_sessions:read","payment_sessions:write","wallet_accounts:read","wallet_accounts:create"]'
call "$DEV" 8086 POST "/internal/v1/projects/$DOA_PROJECT/fixture-keys" \
  "{\"name\":\"seg-$R\",\"scopes\":$SCOPES,\"created_by\":\"$ACTOR\"}" "$DEVINT" "X-Internal-Key:"
KEY=$(jget secret); chk KEY_ISSUED "$([ -n "$KEY" ] && echo yes)" yes
[ -n "$KEY" ] || exit 1

echo "### two campaigns"
mk(){ call "$GW" 8080 POST /v1/business/wallet-accounts \
  "{\"purpose\":\"CAMPAIGN\",\"reference_type\":\"DOA_CAMPAIGN\",\"reference_id\":\"seg-$1-$R\",\"label\":\"$2\"}" "$KEY"; jget id; }
A=$(mk a "Campanha A — demo"); B=$(mk b "Campanha B — demo")
chk A_OPENED "$([ -n "$A" ] && echo yes)" yes
chk B_OPENED "$([ -n "$B" ] && echo yes)" yes

A0=$(bal "$A"); B0=$(bal "$B")
echo "  opening balances: A=$A0 B=$B0"
chk BALANCE_READABLE "$([ "$A0" != "?" ] && [ "$B0" != "?" ] && echo yes)" yes
# Stop here rather than continue. An unreadable balance makes every comparison
# below "?" vs "?", which passes while proving nothing — the first run of this
# harness did exactly that and reported B_UNTOUCHED PASS on two unknowns.
[ "$A0" != "?" ] && [ "$B0" != "?" ] || { echo "balances unreadable — refusing to report vacuous passes"; exit 1; }

echo "### payer — an existing funded Sandbox consumer"
# Deliberately NOT a fresh onboard + top-up. The Sandbox has reached its pilot
# aggregate funds-in-circulation cap (50,000,000 minor) through accumulated E2E
# balances, so /v1/sandbox/fund now refuses with PILOT_LIMIT_AGGREGATE_FUNDS_EXCEEDED.
#
# That cap is a compliance control, not a nuisance: raising it to make a test pass
# would be disabling the thing being tested. Draining old balances to make room is
# a financial operation on a shared environment and belongs in a deliberate
# cleanup, not in a test harness. So the harness uses a payer who is already
# funded — which is what a real donor is anyway.
PAYER=$(psqlro "SELECT cw.consumer_id FROM consumer_wallets cw JOIN ledger_entries le ON le.account_id=cw.available_account_id WHERE cw.status='ACTIVE' AND cw.currency='AOA' GROUP BY cw.consumer_id HAVING COALESCE(SUM(CASE WHEN le.entry_type='CREDIT' THEN le.amount_minor ELSE -le.amount_minor END),0) >= 500000 ORDER BY 1 LIMIT 1")
chk PAYER_FOUND "$([ -n "$PAYER" ] && echo yes)" yes
[ -n "$PAYER" ] || { echo "no funded consumer available in this Sandbox"; exit 1; }
CJWT=$(mint customer_id "$PAYER")
call "$PUB" 8083 GET /v1/me/wallet/balance - "$CJWT"
PAYER_BAL=$(printf '%s' "$LAST" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);process.stdout.write(String(j.available?.amount_minor??j.available_minor??"0"))}catch(e){process.stdout.write("0")}})')
echo "  payer balance=$PAYER_BAL"
chk PAYER_FUNDED "$([ "${PAYER_BAL:-0}" -ge 400000 ] && echo yes)" yes

# Pay a session the way a donor does: the session's PAYMENT_LINK slug, paid on
# the CONSUMER's own authenticated surface.
#
# /v1/qr/pay is deliberately unmounted (RA-053, SEC-015) — it took the payer as
# free text on a merchant credential, so a merchant could debit any consumer.
# The authority belongs with the payer, which is where this route puts it.
pay(){ local acct="$1" amt="$2" ref="$3"
  call "$GW" 8080 POST /v1/business/payment-sessions \
    "{\"wallet_account_id\":\"$acct\",\"purpose\":\"DONATION\",\"reference_type\":\"DOA_DONATION\",\"reference_id\":\"$ref\",\"amount_minor\":$amt,\"currency\":\"AOA\"}" "$KEY"
  local slug
  slug=$(printf '%s' "$LAST" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);const i=(j.interfaces||[]).find(x=>x.type==="PAYMENT_LINK")||(j.interfaces||[]).find(x=>x.type==="DEEP_LINK");process.stdout.write(i?String(i.value).split("/").filter(Boolean).pop():"")}catch(e){}})')
  [ -n "$slug" ] || { echo "  (no PAYMENT_LINK interface on the session)"; return 1; }
  call "$PUB" 8083 POST "/v1/payment-links/$slug/pay" "{\"amount_minor\":$amt}" "$CJWT"
  echo "  pay($ref) slug=${slug:0:8}… http=$CODE $(printf '%s' "$LAST" | head -c 120)"; }

echo "### Campaign A is paid"
pay "$A" 250000 "segA-$R"
A1=$(bal "$A"); B1=$(bal "$B")
echo "  after A: A=$A1 B=$B1"
chk A_CREDITED   "$A1" "$((A0 + 250000))"
chk B_UNTOUCHED  "$B1" "$B0"

echo "### Campaign B is paid"
pay "$B" 150000 "segB-$R"
A2=$(bal "$A"); B2=$(bal "$B")
echo "  after B: A=$A2 B=$B2"
chk B_CREDITED   "$B2" "$((B0 + 150000))"
chk A_UNCHANGED  "$A2" "$A1"

echo
echo "CAMPAIGN_PAYMENT_SEGREGATION: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
