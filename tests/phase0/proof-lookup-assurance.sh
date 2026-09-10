#!/usr/bin/env bash
# Public proof lookups on the deployed Sandbox — runs ON the Sandbox VM.
#
# What the throttle promises, against the running gateway:
#   1. one client gets 6 legacy (BZM-XXXX-XXXX) lookups a minute, the 7th is 429;
#   2. once limited, a real reference and a guessed one get the SAME answer
#      (status, body without its request id, Retry-After) — no existence oracle;
#   3. all clients together get 60 legacy lookups a minute, then 429;
#   4. while legacy is exhausted, SECURE_V1 lookups are unaffected;
#   5. every stored proof still verifies: N/N, paced to the limits.
#
# Each simulated client is a container on the gateway's network, alive for the
# whole run so it keeps its own address — the limiter's own view of "a client",
# not a header anyone could forge. No money moves and nothing is written except the
# verification counters the lookups themselves increment.
#
# Running it spends the global legacy budget for about a minute at a time.
# NEVER run under `bash -x`.
set -uo pipefail
GW=$(docker ps --format '{{.Names}}' | grep api-gateway-staging | head -1)
CORE=$(docker ps --format '{{.Names}}'| grep core-api-staging    | head -1)
PG=$(docker ps --format '{{.Names}}'  | grep postgres | grep bzsandbox | head -1)
NET=$(docker inspect "$GW" --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' | tr ' ' '\n' | grep -m1 'bzsb-app')
IMG=$(docker inspect "$GW" --format '{{.Config.Image}}')
URL=$(docker exec "$CORE" cat /run/secrets/db_url 2>/dev/null); PW=$(printf "%s" "$URL"|sed -E "s#.*://[^:]+:([^@]+)@.*#\1#")
psqlro(){ docker exec -e PGPASSWORD="$PW" "$PG" psql -U bl_app_runtime -d banzami_staging -At -c "$1" 2>&1; }
TARGET="http://$GW:8080/v1/public/proofs"
PASS=0;FAIL=0
chk(){ if [ "$2" = "$3" ];then echo "  $1 PASS ($2)";PASS=$((PASS+1));else echo "  $1 FAIL (got '$2' want '$3')";FAIL=$((FAIL+1));fi;}
# A pool of clients that exist at the same time, so each keeps its own address
# (Docker hands a finished container's address to the next one, so sequential
# throwaway containers would all be one client).
POOL=()
pool_up(){ local n="$1" i; for i in $(seq 1 "$n"); do
  POOL+=("$(docker run -d --rm --network "$NET" --entrypoint sleep "$IMG" 900)"); done; }
pool_down(){ [ ${#POOL[@]} -gt 0 ] && docker rm -f "${POOL[@]}" >/dev/null 2>&1; }
trap pool_down EXIT
# client <n> <refs...>: lookups from pool member n; one status per reference.
client(){ local c="${POOL[$1]}"; shift; docker exec "$c" sh -c '
  for r in "$@"; do curl -s -o /dev/null -w "%{http_code}\n" "'"$TARGET"'/$r"; done' sh "$@"; }
fake(){ printf 'BZM-%04X-%04X\n' "$1" "$2"; }
wait_window(){ echo "  (waiting ${1}s for the one-minute window)"; sleep "$1"; }

pool_up 14
REAL_LEGACY=BZM-F993-38E2
SECURE=$(psqlro "SELECT proof_reference FROM transaction_proofs WHERE length(proof_reference)=33 AND status='CONFIRMED' ORDER BY created_at LIMIT 1")

echo "### 1+2 one client: 6 a minute, then the same 429 for a real and a guessed reference"
OUT=$(docker exec "${POOL[0]}" sh -c '
  T='"$TARGET"'
  for i in 1 2 3 4 5 6 7; do curl -s -o /dev/null -w "%{http_code} " "$T/BZM-0000-00$(printf %02d $i)"; done; echo
  curl -s -D /tmp/h1 "$T/'"$REAL_LEGACY"'" | sed -E "s/\"request_id\":\"[^\"]*\"//" > /tmp/b1
  curl -s -D /tmp/h2 "$T/BZM-0000-00AA" | sed -E "s/\"request_id\":\"[^\"]*\"//" > /tmp/b2
  printf "%s|%s|%s|%s|%s\n" "$(head -1 /tmp/h1 | cut -d" " -f2)" "$(head -1 /tmp/h2 | cut -d" " -f2)" \
    "$(grep -i "^retry-after" /tmp/h1 | tr -d "\r")" "$(grep -i "^retry-after" /tmp/h2 | tr -d "\r")" \
    "$(cmp -s /tmp/b1 /tmp/b2 && echo same || echo different)"')
SEQ7=$(printf '%s' "$OUT" | head -1 | xargs)
chk per-ip-six-then-limited "$SEQ7" "404 404 404 404 404 404 429"
IFS='|' read -r s1 s2 ra1 ra2 same <<<"$(printf '%s' "$OUT" | tail -1)"
chk no-oracle-status "$s1|$s2" "429|429"
chk no-oracle-retry-after "$ra1" "$ra2"
chk no-oracle-body "$same" same

wait_window 62
echo "### 3+4 all clients together: 60 a minute; SECURE_V1 unaffected"
GLOBAL=""
for c in $(seq 1 11); do
  GLOBAL="$GLOBAL $(client "$c" $(for i in 1 2 3 4 5 6; do fake $((c+16)) $i; done) | tr '\n' ' ')"
done
OK=$(printf '%s' "$GLOBAL" | tr ' ' '\n' | grep -c '^404$'); LIM=$(printf '%s' "$GLOBAL" | tr ' ' '\n' | grep -c '^429$')
chk global-sixty-then-limited "$OK|$LIM" "60|6"
chk secure-v1-unaffected "$(client 12 "$SECURE" | tr -d '\n')" 200

wait_window 62
echo "### 5 every stored proof verifies"
mapfile -t LEG < <(psqlro "SELECT proof_reference FROM transaction_proofs WHERE length(proof_reference)=13 ORDER BY created_at")
mapfile -t SEC < <(psqlro "SELECT proof_reference FROM transaction_proofs WHERE length(proof_reference)=33 ORDER BY created_at")
N=$(( ${#LEG[@]} + ${#SEC[@]} )); V=0; i=0; c=0
while [ $i -lt ${#LEG[@]} ]; do
  batch=("${LEG[@]:$i:6}")
  for code in $(client "$c" "${batch[@]}"); do [ "$code" = 200 ] && V=$((V+1)); done
  i=$((i+6)); c=$((c+1))
  # ten clients x six = the global minute; then a fresh window, and the same
  # clients again (their own windows have expired too).
  if [ $c -eq 10 ] && [ $i -lt ${#LEG[@]} ]; then wait_window 62; c=0; fi
done
for code in $(client 13 "${SEC[@]}"); do [ "$code" = 200 ] && V=$((V+1)); done
chk historical-proofs-verify "$V/$N" "$N/$N"
echo "  (legacy ${#LEG[@]}, SECURE_V1 ${#SEC[@]})"

echo
echo "PROOF_LOOKUP_ASSURANCE: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = 0 ]
