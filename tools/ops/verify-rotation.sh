#!/usr/bin/env bash
# Did the rotation actually change who can act?
#
# A rotation is not successful because a value changed. It is successful when
# the old authority fails, the new authority works, and the system is still
# consistent. Two of those three are easy to skip, and skipping them is how a
# rotation gets recorded as done while the old credential still opens the door.
#
# So each rotated secret is exercised in both directions, using the previous
# values from the backup the rotation kept. Nothing is printed but the verdict —
# no value, old or new, reaches this output, a file, or the terminal.
#
#   bash tools/ops/verify-rotation.sh <backup-dir>
set -uo pipefail

for _p in "$(dirname "$0")/remote.sh" "$(dirname "$0")/lib/remote.sh" \
          "$(dirname "$0")/../lib/remote.sh" "$(dirname "$0")/../../tools/ops/lib/remote.sh"; do
  [ -f "$_p" ] && { . "$_p"; break; }
done
command -v remote_self_or_continue >/dev/null 2>&1 \
  || { echo "✗ tools/ops/lib/remote.sh not found" >&2; exit 2; }
remote_self_or_continue "$@"

BACKUP="${1:?usage: verify-rotation.sh <backup-dir>}"
[ -d "$BACKUP" ] || { echo "✗ no such backup directory: $BACKUP" >&2; exit 2; }

PROJECT=$(docker ps --format '{{.Names}}' | grep -m1 'bzsandbox-.*-core-api-staging' | sed -E 's/-core-api-staging$//')
CORE="$PROJECT-core-api-staging"; GW="$PROJECT-api-gateway-staging"
DEV="$PROJECT-developer-api";     PG="$PROJECT-postgres-1"
DIR=$(docker inspect "$CORE" --format '{{range .HostConfig.Binds}}{{println .}}{{end}}' \
      | grep '/run/secrets/db_url' | cut -d: -f1 | xargs dirname)

PASS=0; FAIL=0
chk(){ if [ "$2" = "$3" ]; then echo "  ✓ $1"; PASS=$((PASS+1));
       else echo "  ✗ $1 (got '$2' want '$3')"; FAIL=$((FAIL+1)); fi; }

echo "rotation verification — $PROJECT"
echo "  previous values read from $BACKUP, never printed"
echo

# ── the database password ───────────────────────────────────────────────────
echo "database credential"
OLDURL=$(cat "$BACKUP/db_url"); NEWURL=$(cat "$DIR/db_url")
USER=$(printf '%s' "$NEWURL" | sed -E 's#^[a-z]+://([^:]+):.*#\1#')
DB=$(printf '%s' "$NEWURL" | sed -E 's#.*/([^/?]+)$#\1#')
chk THE_VALUE_CHANGED "$([ "$OLDURL" != "$NEWURL" ] && echo yes || echo no)" "yes"

OLDPW=$(printf '%s' "$OLDURL" | sed -E 's#^[a-z]+://[^:]+:([^@]+)@.*#\1#')
NEWPW=$(printf '%s' "$NEWURL" | sed -E 's#^[a-z]+://[^:]+:([^@]+)@.*#\1#')
docker exec -e PGPASSWORD="$OLDPW" "$PG" psql -U "$USER" -d "$DB" -At -c 'select 1' >/dev/null 2>&1
chk OLD_PASSWORD_REJECTED "$([ $? -ne 0 ] && echo rejected || echo ACCEPTED)" "rejected"
docker exec -e PGPASSWORD="$NEWPW" "$PG" psql -U "$USER" -d "$DB" -At -c 'select 1' >/dev/null 2>&1
chk NEW_PASSWORD_ACCEPTED "$([ $? -eq 0 ] && echo accepted || echo REJECTED)" "accepted"
unset OLDPW NEWPW OLDURL NEWURL

# ── the internal bearer for developer-api ───────────────────────────────────
echo
echo "developer-api internal key"
OLDIK=$(cat "$BACKUP/developer_internal_key"); NEWIK=$(cat "$DIR/developer_internal_key")
chk THE_VALUE_CHANGED "$([ "$OLDIK" != "$NEWIK" ] && echo yes || echo no)" "yes"
# A route that exists and is guarded: the wrong key must be refused before the
# body is even considered, so an invalid payload is fine.
code_for(){ docker exec -e K="$1" "$DEV" sh -c \
  'curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:8086/internal/v1/fixture-projects \
     -H "X-Internal-Key: $K" -H "Content-Type: application/json" -d "{}"' 2>/dev/null; }
OLDCODE=$(code_for "$OLDIK"); NEWCODE=$(code_for "$NEWIK")
chk OLD_INTERNAL_KEY_REFUSED "$([ "$OLDCODE" = "401" ] || [ "$OLDCODE" = "403" ] && echo refused || echo "ACCEPTED($OLDCODE)")" "refused"
chk NEW_INTERNAL_KEY_PASSES_THE_GUARD "$([ "$NEWCODE" != "401" ] && [ "$NEWCODE" != "403" ] && echo yes || echo "no($NEWCODE)")" "yes"
unset OLDIK NEWIK

# ── session tokens ──────────────────────────────────────────────────────────
echo
echo "JWT signing key"
OLDJ=$(cat "$BACKUP/jwt_secret"); NEWJ=$(cat "$DIR/jwt_secret")
chk THE_VALUE_CHANGED "$([ "$OLDJ" != "$NEWJ" ] && echo yes || echo no)" "yes"
mint(){ SECRET="$1" node -e 'const c=require("crypto");const b=o=>Buffer.from(typeof o==="string"?o:JSON.stringify(o)).toString("base64url");const n=Math.floor(Date.now()/1000);const cl={merchant_id:"00000000-0000-0000-0000-000000000001",scopes:["*"],environment:"SANDBOX",iat:n,exp:n+300};const h=b({alg:"HS256",typ:"JWT"}),p=b(cl);process.stdout.write(h+"."+p+"."+c.createHmac("sha256",process.env.SECRET).update(h+"."+p).digest("base64url"));'; }
tok_code(){ docker exec -e T="$1" "$GW" sh -c \
  'curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/v1/merchants/me -H "Authorization: Bearer $T"' 2>/dev/null; }
OLDT=$(tok_code "$(mint "$OLDJ")"); NEWT=$(tok_code "$(mint "$NEWJ")")
chk TOKEN_SIGNED_WITH_THE_OLD_KEY_REJECTED "$([ "$OLDT" = "401" ] || [ "$OLDT" = "403" ] && echo rejected || echo "ACCEPTED($OLDT)")" "rejected"
chk TOKEN_SIGNED_WITH_THE_NEW_KEY_ACCEPTED "$([ "$NEWT" != "401" ] && [ "$NEWT" != "403" ] && echo yes || echo "no($NEWT)")" "yes"
unset OLDJ NEWJ

# ── the values that have no external door to knock on ───────────────────────
# core_internal_key, core_payee_validation_key, session_secret and otp_pepper
# are exercised by the golden journey rather than probed here: a payment session
# crosses gateway→Core, and a donor OTP goes through the pepper. Asserting only
# that they changed would be the weaker half of the check, so what is asserted
# here is that they changed AND that the services that read them came back.
echo
echo "the remaining secrets"
for n in core_internal_key core_payee_validation_key session_secret otp_pepper; do
  chk "${n}_CHANGED" "$([ "$(cat "$BACKUP/$n")" != "$(cat "$DIR/$n")" ] && echo yes || echo no)" "yes"
done
for c in "$CORE" "$GW" "$DEV" "$PROJECT-public-api-staging"; do
  chk "$(printf '%s' "$c" | sed "s/$PROJECT-//")_HEALTHY" \
      "$(docker inspect "$c" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}running{{end}}')" "healthy"
done

echo
[ "$FAIL" -eq 0 ] && echo "ROTATION_VERIFIED: PASS=$PASS FAIL=0" || echo "ROTATION_VERIFIED: PASS=$PASS FAIL=$FAIL"
exit $([ "$FAIL" -eq 0 ] && echo 0 || echo 1)
