#!/usr/bin/env bash
# Receipt + proof assurance on the deployed Sandbox — runs ON the Sandbox VM.
#
# A fresh P2P transfer and a fresh merchant payment, each followed by its
# official receipt, then everything a receipt promises checked against the
# runtime rather than the source:
#
#   - the receipt is issued only with a proof, and the proof is SECURE_V1
#     (BZM + 6 groups of 4 from the 32-symbol alphabet: 120 bits) in SANDBOX;
#   - the proof was issued no later than the receipt was served;
#   - the PDF's verification link is exactly the proof's public URL;
#   - the public lookup answers VERIFIED-shaped (exists, CONFIRMED);
#   - the non-canonical spelling of that reference is not a reference (404);
#   - neither service nor either front door (edge, website nginx) logged the
#     full reference;
#   - BZM-F993-… (the historical receipt) still verifies.
#
# Money: a synthetic consumer, funded with Sandbox test credit, pays another
# synthetic consumer 1 000 Kz and a synthetic Business 2 000 Kz. Every Business,
# link and key this run creates is retired on exit (lib/e2e-run.sh).
#
# Secrets (JWT signing key, DB password) are read into memory and never printed.
# NEVER run under `bash -x`.
set -uo pipefail
GW=$(docker ps --format '{{.Names}}'  | grep api-gateway-staging | head -1)
PUB=$(docker ps --format '{{.Names}}' | grep public-api-staging  | head -1)
CORE=$(docker ps --format '{{.Names}}'| grep core-api-staging    | head -1)
PG=$(docker ps --format '{{.Names}}'  | grep postgres | grep bzsandbox | head -1)
SECRET=$(docker exec "$GW" sh -c 'cat /run/secrets/jwt_secret 2>/dev/null')
URL=$(docker exec "$CORE" cat /run/secrets/db_url 2>/dev/null); PW=$(printf "%s" "$URL"|sed -E "s#.*://[^:]+:([^@]+)@.*#\1#")
[ -n "$SECRET" ] && [ -n "$PW" ] || { echo "NO_SECRET"; exit 1; }
PUBLIC_API="${PUBLIC_API:-https://sandbox-api.banzami.com}"
psqlro(){ docker exec -e PGPASSWORD="$PW" "$PG" psql -U bl_app_runtime -d banzami_staging -At -c "$1" 2>&1; }
R="${RANDOM}${RANDOM}${RANDOM}"; RR="${R:0:5}"; SEQ=0
mint(){ SECRET="$SECRET" K="$1" V="$2" node -e 'const c=require("crypto");const b=(o)=>Buffer.from(typeof o==="string"?o:JSON.stringify(o)).toString("base64url");const n=Math.floor(Date.now()/1000);const h=b({alg:"HS256",typ:"JWT"});const cl={scopes:["*"],environment:"SANDBOX",iat:n,exp:n+3600};cl[process.env.K]=process.env.V;const p=b(cl);const s=c.createHmac("sha256",process.env.SECRET).update(h+"."+p).digest("base64url");process.stdout.write(h+"."+p+"."+s);';}
LAST="";CODE=""
call(){ local ct="$1" port="$2" m="$3" p="$4" bd="$5" au="$6";local a=(curl -s -w $'\n%{http_code}' -X "$m" "http://localhost:$port$p");[ "$au" != "-" ]&&a+=(-H "Authorization: Bearer $au");local r;if [ "$bd" = "-" ];then r=$(docker exec "$ct" "${a[@]}" 2>/dev/null);else a+=(-H "Content-Type: application/json" --data @-);r=$(printf '%s' "$bd"|docker exec -i "$ct" "${a[@]}" 2>/dev/null);fi;CODE=$(printf '%s' "$r"|tail -n1);LAST=$(printf '%s' "$r"|sed '$d');}
jget(){ printf '%s' "$LAST"|node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{let j=JSON.parse(s);process.stdout.write(String(j["'"$1"'"]??""))}catch(e){}})';}
jpath(){ printf '%s' "$LAST"|node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{let v=JSON.parse(s);for(const k of process.argv[1].split("."))v=v?.[k];process.stdout.write(String(v??""))}catch(e){}})' "$1";}
# A consumer as the app makes one: registered with a handle and PIN, holding its
# own session token (public-api issues it; a gateway-minted token is not one).
onboard(){ SEQ=$((SEQ+1));HANDLE="ra${RR}s${SEQ}";
  call "$PUB" 8083 POST /v1/auth/register "{\"handle\":\"$HANDLE\",\"pin\":\"1357\",\"display_name\":\"Recibo $RR $SEQ\"}" -;
  OCID=$(jpath consumer.id); OTOK=$(jpath token);}
PASS=0;FAIL=0
chk(){ if [ "$2" = "$3" ];then echo "  $1 PASS ($2)";PASS=$((PASS+1));else echo "  $1 FAIL (got '$2' want '$3')";FAIL=$((FAIL+1));fi;}
# same <a> <b>: compares two values that contain a proof reference without
# printing either — a reference is a bearer capability, not log output.
same(){ if [ "$1" = "$2" ]; then echo exact; else echo differs; fi; }
SECURE_RE='^BZM(-[0-9A-HJKMNP-TV-Z]{4}){6}$'
T0=$(date -u +%Y-%m-%dT%H:%M:%SZ)

. "$(cd "$(dirname "$0")" && pwd)/lib/e2e-run.sh"
e2e_begin

# ── fixtures ────────────────────────────────────────────────────────────────
ROOT=$(mint merchant_id 00000000-0000-0000-0000-000000000001)
call "$GW" 8080 POST /v1/merchants "{\"name\":\"Recibo $RR\",\"email\":\"ra$RR@synthetic.test\"}" "$ROOT"; MID=$(jget id); e2e_own merchant "$MID"
MJWT=$(mint merchant_id "$MID")
call "$GW" 8080 POST /v1/wallets '{"currency":"AOA"}' "$MJWT"; WID=$(jget id)
onboard; A=$OCID; AJ=$OTOK
call "$GW" 8080 POST /v1/compliance/customers/verify "{\"full_name\":\"SYN\",\"document_type\":\"BILHETE_DE_IDENTIDADE\",\"document_number\":\"RA${RR}1\",\"date_of_birth\":\"1990-01-01\",\"requested_level\":\"BASIC\"}" "$(mint customer_id "$A")"
call "$CORE" 8081 POST /internal/v1/consumer-wallets/test-credit "{\"consumer_id\":\"$A\",\"amount_minor\":10000,\"currency\":\"AOA\"}" -
onboard; B=$OCID; BH=$HANDLE
chk fixtures "$([ -n "$MID" ] && [ -n "$WID" ] && [ -n "$A" ] && [ -n "$AJ" ] && [ -n "$B" ] && echo ok)" ok

check_receipt(){ # label txn_id pdf_path_in_container container
  local label="$1" txn="$2" pdf="$3" ct="$4"
  local served; served=$(date -u +%Y-%m-%dT%H:%M:%S.%6NZ)
  local row; row=$(psqlro "SELECT proof_reference||'|'||environment||'|'||status||'|'||(issued_at <= '$served'::timestamptz) FROM transaction_proofs WHERE transaction_id='$txn'")
  local ref env st before; IFS='|' read -r ref env st before <<<"$row"
  chk "$label-proof-exists" "$([ -n "$ref" ] && echo yes)" yes
  chk "$label-SECURE_V1-120-bits" "$(printf '%s' "$ref" | grep -Eq "$SECURE_RE" && echo SECURE_V1)" SECURE_V1
  chk "$label-environment" "$env" SANDBOX
  chk "$label-proof-before-receipt" "$before" true
  local urls; urls=$(docker exec "$ct" sh -c "grep -aoE 'https?://[^ )>]*/r/BZM-[0-9A-Z-]+' $pdf | sort -u")
  chk "$label-qr-link-exact" "$(same "$urls" "https://banzami.com/r/$ref")" exact
  local pubj; pubj=$(curl -s "$PUBLIC_API/v1/public/proofs/$ref")
  chk "$label-public-verified" "$(printf '%s' "$pubj" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);process.stdout.write(j.exists===true&&j.status==="CONFIRMED"?"VERIFIED":String(j.status))}catch{process.stdout.write("unparseable")}})')" VERIFIED
  local lower; lower=$(printf '%s' "$ref" | tr 'A-Z' 'a-z')
  chk "$label-noncanonical-spelling-is-not-a-reference" "$(curl -s -o /dev/null -w '%{http_code}' "$PUBLIC_API/v1/public/proofs/$lower")" 404
  local logged=unknown
  [ -n "$ref" ] && logged=$( (docker logs --since "$T0" "$GW" 2>&1; docker logs --since "$T0" "$PUB" 2>&1; \
                               docker logs --since "$T0" bzsbedge-sandbox-edge 2>&1; docker logs --since "$T0" banzami-website-nginx-1 2>&1) | grep -c -- "$ref")
  chk "$label-full-reference-not-logged" "$logged" 0
  docker exec "$ct" rm -f "$pdf"
}

# ── fresh P2P ──────────────────────────────────────────────────────────────
call "$PUB" 8083 POST /v1/transfers "{\"recipient\":\"@$BH\",\"amount_minor\":1000,\"currency\":\"AOA\",\"note\":\"recibo $RR\",\"idempotency_key\":\"ra-p2p-$RR\"}" "$AJ"
TID=$(jget transfer_id); chk p2p-transfer "$CODE|$([ -n "$TID" ] && echo id)" "201|id"
RC=$(docker exec "$PUB" curl -s -o /tmp/ra-p2p.pdf -w '%{http_code}' -H "Authorization: Bearer $AJ" "http://localhost:8083/v1/consumer/transactions/$TID/receipt.pdf")
chk p2p-receipt "$RC|$(docker exec "$PUB" head -c 4 /tmp/ra-p2p.pdf 2>/dev/null)" "200|%PDF"
check_receipt p2p "$TID" /tmp/ra-p2p.pdf "$PUB"

# ── fresh merchant payment ─────────────────────────────────────────────────
call "$GW" 8080 POST /v1/payment-links "{\"merchant_id\":\"$MID\",\"wallet_id\":\"$WID\",\"amount_minor\":2000,\"currency\":\"AOA\",\"description\":\"recibo $RR\"}" "$MJWT"
LID=$(jget id); SLUG=$(jget slug); [ -n "$LID" ] && e2e_own payment_link "$LID" "$MID"
call "$PUB" 8083 POST "/v1/payment-links/$SLUG/pay" '{"amount_minor":2000}' "$AJ"; chk merchant-payment "$CODE" 200
WP=$(psqlro "SELECT id FROM wallet_payments WHERE merchant_id='$MID' ORDER BY created_at DESC LIMIT 1")
RC=$(docker exec "$GW" curl -s -o /tmp/ra-m.pdf -w '%{http_code}' -H "Authorization: Bearer $MJWT" "http://localhost:8080/v1/merchant/transactions/$WP/receipt.pdf")
chk merchant-receipt "$RC|$(docker exec "$GW" head -c 4 /tmp/ra-m.pdf 2>/dev/null)" "200|%PDF"
# One operation, one proof: the Business's receipt of a wallet payment is the
# receipt of the transfer it records — the payer's reference, not a second one.
WPT=$(psqlro "SELECT transfer_id FROM wallet_payments WHERE id='$WP'")
chk merchant-no-second-proof "$(psqlro "SELECT count(*) FROM transaction_proofs WHERE transaction_id='$WP'")" 0
check_receipt merchant "$WPT" /tmp/ra-m.pdf "$GW"
RC=$(docker exec "$PUB" curl -s -o /tmp/ra-mp.pdf -w '%{http_code}' -H "Authorization: Bearer $AJ" "http://localhost:8083/v1/consumer/transactions/$WPT/receipt.pdf")
chk merchant-payer-receipt "$RC|$(docker exec "$PUB" head -c 4 /tmp/ra-mp.pdf 2>/dev/null)" "200|%PDF"
chk merchant-one-reference-both-copies "$(same "$(docker exec "$PUB" sh -c "grep -aoE 'https?://[^ )>]*/r/BZM-[0-9A-Z-]+' /tmp/ra-mp.pdf | sort -u")" "https://banzami.com/r/$(psqlro "SELECT proof_reference FROM transaction_proofs WHERE transaction_id='$WPT'")")" exact
docker exec "$PUB" rm -f /tmp/ra-mp.pdf

# ── the historical receipt ─────────────────────────────────────────────────
# The historical legacy receipt (BZM-F993-…) is named by the SHA-256 of its
# reference, never the reference itself: a proof reference is a bearer
# capability and does not belong in source (tests/ops/proof-reference-literals).
HIST_LEGACY_SHA256=505132856639559d32b935d6a3376c535344f1ff77a918b9001bcb34350a9d35
HIST_LEGACY=$(psqlro "SELECT proof_reference FROM transaction_proofs WHERE encode(sha256(proof_reference::bytea),'hex')='$HIST_LEGACY_SHA256'")
H=$(curl -s "$PUBLIC_API/v1/public/proofs/$HIST_LEGACY")
chk historical-legacy-receipt "$(printf '%s' "$H" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);process.stdout.write(j.exists===true&&j.status==="CONFIRMED"?"VERIFIED":String(j.status))}catch{process.stdout.write("unparseable")}})')" VERIFIED

echo
echo "RECEIPT_ASSURANCE: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = 0 ]
