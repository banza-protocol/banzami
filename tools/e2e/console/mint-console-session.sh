#!/usr/bin/env bash
# A real Console session for a real account, without the email round trip.
#
# The Console signs in with an emailed code. The code is stored peppered and the
# mail goes out through a Resend account this machine is not signed into, so a
# browser test cannot read it. Minting the session directly is a bypass of email
# DELIVERY and of nothing else: the row is a genuine session for a genuine
# account, and every request made with it goes through the same membership and
# project-authority checks as one typed by a person.
#
# The token is random, hashed with the deployed session secret exactly as the
# service does, and printed once so a browser can carry it. It is a session
# cookie for a Sandbox console account, not a credential that moves money.
#
#   bash tools/e2e/console/mint-console-session.sh <email> [ttl-minutes]
#
# Prints one line: the raw cookie value. Nothing else goes to stdout, so the
# caller can capture it without parsing.
set -uo pipefail

for _p in "$(dirname "$0")/remote.sh" "$(dirname "$0")/../../ops/lib/remote.sh"; do
  [ -f "$_p" ] && { . "$_p"; break; }
done
command -v remote_self_or_continue >/dev/null 2>&1 \
  || { echo "✗ tools/ops/lib/remote.sh not found" >&2; exit 2; }
remote_self_or_continue "$@"

EMAIL="${1:?usage: mint-console-session.sh <email> [ttl-minutes]}"
TTL="${2:-60}"

PROJECT=$(docker ps --format '{{.Names}}' | grep -m1 'bzsandbox-.*-core-api-staging' | sed -E 's/-core-api-staging$//')
PG="$PROJECT-postgres-1"; CORE="$PROJECT-core-api-staging"; DEV="$PROJECT-developer-api"
PW=$(docker exec "$CORE" sh -c 'cat /run/secrets/db_url' | sed -E 's#.*://[^:]+:([^@]+)@.*#\1#')
SECRET=$(docker exec "$DEV" sh -c 'cat /run/secrets/session_secret')
q(){ docker exec -e PGPASSWORD="$PW" "$PG" psql -U bl_app_runtime -d banzami_staging -At -c "$1" 2>/dev/null; }

UID_=$(q "select id from account_identity.identity_users where email = '$EMAIL' and status='ACTIVE'")
[ -n "$UID_" ] || { echo "✗ no active console account for $EMAIL" >&2; exit 1; }

RAW=$(openssl rand -hex 32)
HASH=$(printf '%s' "$RAW" | openssl dgst -sha256 -hmac "$SECRET" -r | cut -d' ' -f1)
q "insert into account_identity.identity_sessions (user_id, token_hash, user_agent, ip, expires_at)
   values ('$UID_', '$HASH', 'banzami-console-e2e', null, now() + interval '$TTL minutes')" >/dev/null
printf '%s\n' "$RAW"
