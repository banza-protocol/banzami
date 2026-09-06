#!/usr/bin/env bash
# The refund regression, closed against the PUBLISHED @banzami/sdk — runs ON the
# Sandbox VM.
#
# 0.7.0 and 0.8.0 pointed createRefund at /v1/refunds, a merchant-JWT route, so
# refunds answered 401 for the only credential the SDK documents. DOA's
# production refund path calls exactly this method. Monorepo source is not
# evidence for that: this installs the package from npm and drives it.
#
# The full matrix, because a refund that "works" is not the same as a refund
# that debits the right account and cannot be made twice.
set -uo pipefail
DOA_PROJECT="${DOA_PROJECT:-6367749d-ba77-47b6-80bd-982382ddd1c9}"
# Ownership and cleanup. Everything this run creates is recorded by id and
# retired on the way out, however the script exits.
. "$(cd "$(dirname "$0")" && pwd)/lib/e2e-run.sh"
e2e_begin

ACTOR="${ACTOR:-11111111-2222-4333-8444-555555555555}"
SDK_SPEC="${SDK_SPEC:-@banzami/sdk@latest}"

GW=$(docker ps  --format '{{.Names}}' | grep api-gateway-staging | head -1)
PUB=$(docker ps --format '{{.Names}}' | grep public-api-staging  | head -1)
CORE=$(docker ps --format '{{.Names}}'| grep core-api-staging    | head -1)
DEV=$(docker ps --format '{{.Names}}' | grep developer-api       | head -1)
PG=$(docker ps  --format '{{.Names}}' | grep postgres | grep bzsandbox | head -1)
DEVINT=$(docker exec "$DEV" sh -c 'cat /run/secrets/developer_internal_key 2>/dev/null')
JWTSEC=$(docker exec "$GW" sh -c 'cat /run/secrets/jwt_secret 2>/dev/null')
PW=$(docker exec "$CORE" sh -c 'cat /run/secrets/db_url 2>/dev/null' | sed -E 's#.*://[^:]+:([^@]+)@.*#\1#')
[ -n "$DEVINT" ] && [ -n "$JWTSEC" ] || { echo "NO_SECRET"; exit 1; }
psqlro(){ docker exec -e PGPASSWORD="$PW" "$PG" psql -U bl_app_runtime -d banzami_staging -At -c "$1" 2>&1; }

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
mint(){ SECRET="$JWTSEC" K="$1" V="$2" node -e 'const c=require("crypto");const b=o=>Buffer.from(typeof o==="string"?o:JSON.stringify(o)).toString("base64url");const n=Math.floor(Date.now()/1000);const cl={scopes:["*"],environment:"SANDBOX",iat:n,exp:n+900};cl[process.env.K]=process.env.V;const h=b({alg:"HS256",typ:"JWT"}),p=b(cl);process.stdout.write(h+"."+p+"."+c.createHmac("sha256",process.env.SECRET).update(h+"."+p).digest("base64url"));'; }
bal(){ psqlro "SELECT COALESCE(SUM(CASE WHEN e.entry_type='CREDIT' THEN e.amount_minor ELSE -e.amount_minor END),0)
                 FROM ledger_entries e JOIN wallet_accounts wa ON wa.account_id=e.account_id WHERE wa.id='$1'"; }
walletbal(){ psqlro "SELECT COALESCE(SUM(CASE WHEN e.entry_type='CREDIT' THEN e.amount_minor ELSE -e.amount_minor END),0)
                 FROM ledger_entries e WHERE e.account_id=(SELECT available_account_id FROM wallets WHERE id='$1')"; }
unbalanced(){ psqlro "SELECT COUNT(*) FROM (SELECT p.id FROM ledger_postings p JOIN ledger_entries e ON e.posting_id=p.id GROUP BY p.id HAVING SUM(CASE e.entry_type WHEN 'DEBIT' THEN -e.amount_minor ELSE e.amount_minor END) <> 0) x"; }

R="${RANDOM}${RANDOM}"
SC='["identity:read","payment_sessions:read","payment_sessions:write","wallet_accounts:read","wallet_accounts:create","refunds:read","refunds:write"]'

echo "### the PUBLISHED package, installed from npm on this machine"
# The install runs INSIDE a container: this VM has node but no npm, and the
# point is a registry install rather than anything this repository holds.
WORK=$(mktemp -d); chmod 777 "$WORK"
printf '{"name":"p","private":true,"type":"module","dependencies":{}}' > "$WORK/package.json"
docker run --rm -v "$WORK":/w -w /w node:22-alpine \
  sh -c "npm install --silent $SDK_SPEC" >/dev/null 2>&1
VER=$(node -p "require('$WORK/node_modules/@banzami/sdk/package.json').version" 2>/dev/null)
# The spec floats to @latest so this harness keeps testing whatever a developer
# would actually get today. A dist-tag is not a version, so the expectation is
# resolved from the registry rather than parsed out of the spec string.
WANT="${SDK_SPEC##*@}"
# Resolved inside the container: this VM has node but no npm.
case "$WANT" in latest|next|beta)
  WANT=$(docker run --rm node:22-alpine npm view "@banzami/sdk@$WANT" version 2>/dev/null | tr -d '\r\n');;
esac
chk SDK_FROM_NPM "$VER" "$WANT"
RESOLVED=$(node -e "const l=JSON.parse(require('fs').readFileSync('$WORK/package-lock.json','utf8'));process.stdout.write(String((l.packages&&l.packages['node_modules/@banzami/sdk']||{}).resolved||''))" 2>/dev/null)
chk SDK_REGISTRY_SOURCE "$(printf '%s' "$RESOLVED" | grep -c '^https://registry.npmjs.org/')" "1"

echo "### two project keys and two accounts of the same owner"
call "$DEV" 8086 POST "/internal/v1/projects/$DOA_PROJECT/fixture-keys" "{\"name\":\"rf-pub-$R\",\"scopes\":$SC,\"created_by\":\"$ACTOR\"}" "$DEVINT" "X-Internal-Key:"
KEY=$(jget secret); e2e_own fixture_key "$(jget id)"
chk KEY_ISSUED "$([ -n "$KEY" ] && echo yes)" yes
[ -n "$KEY" ] || exit 1
mk(){ call "$GW" 8080 POST /v1/business/wallet-accounts \
  "{\"purpose\":\"CAMPAIGN\",\"reference_type\":\"RF_PUB\",\"reference_id\":\"rf-$1-$R\",\"label\":\"Refund $1\"}" "$KEY"; jget id; }
A=$(mk a); B=$(mk b)
chk ACCOUNTS_OPENED "$([ -n "$A" ] && [ -n "$B" ] && [ "$A" != "$B" ] && echo yes)" yes
WID=$(psqlro "SELECT wallet_id FROM wallet_accounts WHERE id='$A'")

echo "### a real payment into account A, authorised by the payer"
PH="+2449${R:0:4}41"; H="rp${R:0:5}p"
call "$PUB" 8083 POST /v1/consumer/onboarding/start "{\"phone_number\":\"$PH\",\"currency\":\"AOA\",\"otp_plaintext_for_test\":\"123456\"}" -
SID=$(jget session_id)
call "$PUB" 8083 POST /v1/consumer/onboarding/verify-otp "{\"session_id\":\"$SID\",\"otp_code\":\"123456\"}" -
call "$PUB" 8083 POST /v1/consumer/onboarding/complete "{\"session_id\":\"$SID\",\"banza_handle\":\"$H\",\"pin\":\"1234\"}" -
PAYER=$(jget consumer_id); CJWT=$(mint customer_id "$PAYER")
call "$GW" 8080 POST /v1/compliance/customers/verify \
  "{\"full_name\":\"REFUND PUB E2E\",\"document_type\":\"BILHETE_DE_IDENTIDADE\",\"document_number\":\"RP$R\",\"date_of_birth\":\"1990-01-01\",\"requested_level\":\"BASIC\"}" "$CJWT"
call "$PUB" 8083 POST /v1/sandbox/fund '{"amount_minor":300000,"currency":"AOA"}' "$CJWT"
[ "$CODE" = "200" ] || { echo "payer funding refused ($CODE)"; exit 1; }
call "$GW" 8080 POST /v1/business/payment-sessions \
  "{\"wallet_account_id\":\"$A\",\"purpose\":\"DONATION\",\"reference_type\":\"RF_PUB\",\"reference_id\":\"rf-pay-$R\",\"amount_minor\":200000,\"currency\":\"AOA\"}" "$KEY"
SLUG=$(printf '%s' "$LAST" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);const i=(j.interfaces||[]).find(x=>x.type==="PAYMENT_LINK");process.stdout.write(i?String(i.value).split("/").filter(Boolean).pop():"")}catch(e){}})')
call "$PUB" 8083 POST "/v1/payment-links/$SLUG/pay" '{"amount_minor":200000}' "$CJWT"
chk PAYMENT_COMPLETED "$CODE" "200"
A0=$(bal "$A"); B0=$(bal "$B"); W0=$(walletbal "$WID")
chk ACCOUNT_A_CREDITED "$A0" "200000"

SRC=$(psqlro "SELECT id FROM wallet_payments WHERE wallet_account_id='$A' ORDER BY created_at DESC LIMIT 1")
chk REFUND_SOURCE_RECORDED "$([ -n "$SRC" ] && echo yes)" yes

echo "### the refund matrix, driven entirely by the published package"
cat > "$WORK/run.mjs" <<'JS'
import { BanzamiClient } from '@banzami/sdk';
const c = new BanzamiClient({ apiKey: process.env.KEY, baseUrl: 'http://localhost:8080' });
const [op, ...rest] = process.argv.slice(2);
const R = (amount, key) => c.createRefund({ source_type:'WALLET_PAYMENT', source_id: process.env.SRC, amount_minor:+amount, currency:'AOA', idempotency_key:key });
try {
  if (op === 'refund')      console.log(JSON.stringify(await R(rest[0], rest[1])));
  else if (op === 'get')    console.log(JSON.stringify(await c.getRefund(rest[0])));
  else if (op === 'list')   console.log(JSON.stringify(await c.listRefunds({ sourceId: process.env.SRC })));
  else if (op === 'foreign') { const f = new BanzamiClient({ apiKey: process.env.FKEY, baseUrl:'http://localhost:8080' });
    console.log(JSON.stringify(await f.createRefund({ source_type:'WALLET_PAYMENT', source_id: process.env.SRC, amount_minor:1000, currency:'AOA', idempotency_key:rest[0] }))); }
} catch (e) { console.log(JSON.stringify({ error:true, status:e.status ?? null, code:e.code ?? null, message:String(e.message).slice(0,90) })); }
JS
sdk(){ docker run --rm --network container:"$GW" -v "$WORK":/w -w /w -e KEY="$KEY" -e SRC="$SRC" -e FKEY="${FKEY:-}" node:22-alpine node run.mjs "$@" 2>/dev/null; }

echo "  partial refund"
OUT=$(sdk refund 50000 "rf1-$R"); RID=$(printf '%s' "$OUT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(String(JSON.parse(s).id||""))}catch(e){}})')
echo "    → ${OUT:0:120}"
chk PARTIAL_REFUND_SUCCEEDED "$([ -n "$RID" ] && echo yes)" yes
chk A_DEBITED_BY_PARTIAL "$(bal "$A")" "$((A0 - 50000))"
chk B_UNTOUCHED "$(bal "$B")" "$B0"
chk WALLET_DEFAULT_UNTOUCHED "$(walletbal "$WID")" "$W0"
chk LEDGER_BALANCED "$(unbalanced)" "0"

echo "  idempotent replay"
OUT=$(sdk refund 50000 "rf1-$R"); RID2=$(printf '%s' "$OUT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(String(JSON.parse(s).id||""))}catch(e){}})')
chk REPLAY_SAME_REFUND "$RID2" "$RID"
chk REPLAY_MOVED_NOTHING "$(bal "$A")" "$((A0 - 50000))"

echo "  the same key with a changed amount is a conflict, not a silent replay"
OUT=$(sdk refund 70000 "rf1-$R")
echo "    → ${OUT:0:120}"
chk CHANGED_PAYLOAD_REFUSED "$(printf '%s' "$OUT" | grep -c '"error":true')" "1"
chk CONFLICT_MOVED_NOTHING "$(bal "$A")" "$((A0 - 50000))"

echo "  the remainder"
OUT=$(sdk refund 150000 "rf2-$R")
chk REMAINDER_REFUNDED "$(printf '%s' "$OUT" | grep -c '"id"')" "1"
chk A_FULLY_REFUNDED "$(bal "$A")" "$((A0 - 200000))"

echo "  over-refund is refused"
OUT=$(sdk refund 1000 "rf3-$R")
echo "    → ${OUT:0:120}"
chk OVER_REFUND_REFUSED "$(printf '%s' "$OUT" | grep -c '"error":true')" "1"
chk OVER_REFUND_MOVED_NOTHING "$(bal "$A")" "$((A0 - 200000))"

echo "  readable through the published client"
OUT=$(sdk get "$RID")
chk REFUND_READABLE "$(printf '%s' "$OUT" | grep -c "$RID")" "1"

echo "### another project cannot refund this payment"
call "$DEV" 8086 POST /internal/v1/fixture-projects "{\"name\":\"rfpub-b-$R\",\"created_by\":\"$ACTOR\"}" "$DEVINT" "X-Internal-Key:"
PROJ2=$(jget project_id); e2e_own fixture_project "$PROJ2"
if [ -n "$PROJ2" ]; then
  # Its own foreign merchant, not the newest row in the table. Scavenging
  # "the most recent merchant" made this test depend on whatever the previous
  # harness happened to leave behind — and once harnesses started suspending
  # their fixtures on the way out, the newest merchant became a suspended one
  # and the foreign refund failed for the wrong reason.
  MJWT2=$(mint merchant_id 00000000-0000-0000-0000-000000000001)
  call "$GW" 8080 POST /v1/merchants "{\"name\":\"RFP$R\",\"email\":\"rfp$R@synthetic.test\"}" "$MJWT2"
  MID2=$(jget id); e2e_own merchant "$MID2"
  MJWT2=$(mint merchant_id "$MID2")
  call "$GW" 8080 POST /v1/wallets '{"currency":"AOA"}' "$MJWT2"
  W2=$(jget id)
  WA2=$(psqlro "SELECT id FROM wallet_accounts WHERE wallet_id='$W2' AND purpose='PRIMARY'")
  call "$DEV" 8086 POST "/internal/v1/projects/$PROJ2/binding" "{\"merchant_id\":\"$MID2\",\"wallet_id\":\"$W2\",\"wallet_account_id\":\"$WA2\",\"actor_user_id\":\"$ACTOR\"}" "$DEVINT" "X-Internal-Key:"
  call "$DEV" 8086 POST "/internal/v1/projects/$PROJ2/fixture-keys" "{\"name\":\"rf-foreign-$R\",\"scopes\":$SC,\"created_by\":\"$ACTOR\"}" "$DEVINT" "X-Internal-Key:"
  FKEY=$(jget secret); e2e_own fixture_key "$(jget id)"
  export FKEY
  VB=$(bal "$A")
  OUT=$(sdk foreign "rff-$R")
  echo "    → ${OUT:0:130}"
  chk FOREIGN_REFUND_REFUSED "$(printf '%s' "$OUT" | grep -c '"error":true')" "1"
  chk FOREIGN_SEES_NOT_FOUND "$(printf '%s' "$OUT" | grep -ci 'not_found\|not found')" "1"
  chk VICTIM_UNCHANGED "$(bal "$A")" "$VB"
fi

chk LEDGER_STILL_BALANCED "$(unbalanced)" "0"
rm -rf "$WORK"
echo
echo "REFUND_PUBLISHED_SDK_E2E: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
