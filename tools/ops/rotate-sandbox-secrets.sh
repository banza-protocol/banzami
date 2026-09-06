#!/usr/bin/env bash
# Rotate the operator secrets an unmanaged container could read (RA-080).
#
# A container nobody deployed ran for five days on the Sandbox host with every
# operator secret mounted. There is no evidence it exfiltrated anything, and no
# evidence it did not, so the credentials it could read are treated as exposed.
#
# WHAT THIS DOES NOT CLAIM. The secrets are read-only bind mounts of files on
# the host. Anyone able to start that container already had root on the host and
# could read those files directly, so rotation does not defend against whoever
# started it. What it does is end the validity of credentials that were readable
# by a process nobody was tracking — which is the honest scope, and enough
# reason to do it before launch.
#
# EVERY VALUE IS GENERATED ON THE HOST and never passes through the operator's
# terminal, this script's output, or any file outside the secret directory. The
# script prints names, sizes and outcomes.
#
# api_key_pepper is deliberately NOT rotated here — see --plan for why, and for
# the sequence it needs instead.
#
#   bash tools/ops/rotate-sandbox-secrets.sh --plan     # names and dispositions
#   bash tools/ops/rotate-sandbox-secrets.sh --apply
#   bash tools/ops/rotate-sandbox-secrets.sh --rollback <backup-dir>
#
# After --apply the services MUST be redeployed; the script says so and the
# health check will fail until they are, which is the correct failure mode: a
# secret file that no running container has read yet is a rotation half done.
set -uo pipefail
REMOTE="${BANZAMI_REMOTE:-root@217.160.9.248}"
MODE="${1:---plan}"

# api_key_pepper has its own mode, because it is the only secret here whose
# rotation reaches outside this host: it invalidates every developer API key,
# and those live in deployments that have to be given replacements. Rotating it
# alongside the others would have made a two-repository, four-deployment
# operation look like one more line of output.

# The canonical remote-execution contract: prove the host, run there, and return
# the proof's own exit status. See tools/ops/lib/remote.sh.
for _p in "$(dirname "$0")/remote.sh" "$(dirname "$0")/lib/remote.sh" \
          "$(dirname "$0")/../lib/remote.sh" "$(dirname "$0")/../../tools/ops/lib/remote.sh"; do
  [ -f "$_p" ] && { . "$_p"; break; }
done
command -v remote_self_or_continue >/dev/null 2>&1 \
  || { echo "✗ tools/ops/lib/remote.sh not found — refusing to run without the host guard" >&2; exit 2; }
remote_self_or_continue "$@"

PROJECT=$(docker ps --format '{{.Names}}' | grep -m1 'bzsandbox-.*-core-api-staging' | sed -E 's/-core-api-staging$//')
CORE="$PROJECT-core-api-staging"
PG="$PROJECT-postgres-1"
# The directory is read from the running container's own bind, not guessed.
DIR=$(docker inspect "$CORE" --format '{{range .HostConfig.Binds}}{{println .}}{{end}}' \
      | grep '/run/secrets/db_url' | cut -d: -f1 | xargs dirname)
[ -d "$DIR" ] || { echo "✗ cannot locate the secret directory" >&2; exit 2; }

# ── the inventory ───────────────────────────────────────────────────────────
# name | consumers | what rotating it invalidates
ROTATE="
jwt_secret|api-gateway, admin-api, public-api|outstanding merchant and consumer session tokens
core_internal_key|core-api, api-gateway, developer-api|nothing durable — an internal bearer between services
developer_internal_key|api-gateway, developer-api|nothing durable — an internal bearer for the fixture routes
core_payee_validation_key|core-api, developer-api|nothing durable — an internal bearer
session_secret|developer-api|outstanding Developer Console sessions
otp_pepper|developer-api|outstanding account-identity OTPs
"

echo "operator secrets on $PROJECT"
echo "  directory: $DIR"
echo
echo "to rotate now"
printf '%s\n' "$ROTATE" | while IFS='|' read -r n c inv; do
  [ -n "$n" ] || continue
  printf '  %-26s %s bytes\n      consumers: %s\n      invalidates: %s\n' "$n" "$(wc -c < "$DIR/$n" | tr -d ' ')" "$c" "$inv"
done

echo
echo "  db_url                     $(wc -c < "$DIR/db_url" | tr -d ' ') bytes"
echo "      consumers: core-api, api-gateway, developer-api, public-api"
echo "      invalidates: the database password itself; the role changes its own"
echo
echo "held back"
echo "  api_key_pepper             $(wc -c < "$DIR/api_key_pepper" | tr -d ' ') bytes"
echo "      consumers: developer-api"
echo "      invalidates: EVERY developer API key, including the three DOA holds."
echo "      Those keys live in Vercel environment variables, which take effect only"
echo "      on a new deployment — and Vercel's daily build allowance is exhausted,"
echo "      so a replacement key cannot be installed today. Rotating it now would"
echo "      take DOA's donations down until the allowance resets."
echo "      Sequence when it can be done: mint replacements under the new pepper,"
echo "      install them into their deployments, redeploy, prove each consumer,"
echo "      then revoke the old records."

if [ "$MODE" = "--api-key-pepper" ]; then
  BACKUP="$DIR/../rotation-backup-$(date +%Y%m%dT%H%M%SZ)"
  mkdir -p "$BACKUP" && chmod 700 "$BACKUP"
  cp -p "$DIR/api_key_pepper" "$BACKUP"/ && chmod 600 "$BACKUP"/*
  openssl rand -hex 32 > "$DIR/api_key_pepper.new" 2>/dev/null \
    || head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n' > "$DIR/api_key_pepper.new"
  if [ "$(wc -c < "$DIR/api_key_pepper.new" | tr -d ' ')" -ge 64 ]; then
    mv "$DIR/api_key_pepper.new" "$DIR/api_key_pepper"; chmod 644 "$DIR/api_key_pepper"
    echo
    echo "  ✓ api_key_pepper rotated (previous value at $BACKUP)"
    echo
    echo "EVERY developer API key is now unverifiable. Until developer-api is"
    echo "redeployed it still holds the old pepper, so nothing has changed yet"
    echo "for callers — the moment it restarts, all of them stop working."
    echo
    echo "  ./deploy.sh developer-api"
    echo "  then mint and install the replacements before anything else."
    exit 0
  fi
  rm -f "$DIR/api_key_pepper.new"
  echo "  ✗ api_key_pepper NOT rotated (generation failed)"
  exit 1
fi

if [ "$MODE" != "--apply" ]; then
  echo
  echo "plan only — nothing changed. Re-run with --apply"
  exit 0
fi

# ── rotate ──────────────────────────────────────────────────────────────────
BACKUP="$DIR/../rotation-backup-$(date +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP" && chmod 700 "$BACKUP"
cp -p "$DIR"/* "$BACKUP"/ && chmod 600 "$BACKUP"/*
echo
echo "previous values kept at $BACKUP (mode 600) so this is reversible"

fail=0
printf '%s\n' "$ROTATE" | while IFS='|' read -r n _ _; do
  [ -n "$n" ] || continue
  # Generated here, written here. The value exists in exactly one place.
  openssl rand -hex 32 > "$DIR/$n.new" 2>/dev/null || head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n' > "$DIR/$n.new"
  if [ "$(wc -c < "$DIR/$n.new" | tr -d ' ')" -ge 64 ]; then
    mv "$DIR/$n.new" "$DIR/$n"; chmod 644 "$DIR/$n"
    echo "  ✓ $n rotated"
  else
    rm -f "$DIR/$n.new"; echo "  ✗ $n NOT rotated (generation failed)"
  fi
done

# ── the database password ───────────────────────────────────────────────────
# The application role changes its own password, which needs no superuser and
# no password anyone has to hold. The URL is rebuilt from its own parts so the
# host, port, database and user cannot drift.
URL=$(cat "$DIR/db_url")
USER=$(printf '%s' "$URL" | sed -E 's#^[a-z]+://([^:]+):.*#\1#')
REST=$(printf '%s' "$URL" | sed -E 's#^[a-z]+://[^:]+:[^@]+@(.*)$#\1#')
NEWPW=$(openssl rand -hex 24 2>/dev/null || head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')
OLDPW=$(printf '%s' "$URL" | sed -E 's#^[a-z]+://[^:]+:([^@]+)@.*#\1#')

if docker exec -e PGPASSWORD="$OLDPW" "$PG" psql -U "$USER" -d "${REST##*/}" -v ON_ERROR_STOP=1 \
     -c "ALTER ROLE \"$USER\" WITH PASSWORD '$NEWPW'" >/dev/null 2>&1; then
  printf 'postgresql://%s:%s@%s' "$USER" "$NEWPW" "$REST" > "$DIR/db_url"
  chmod 644 "$DIR/db_url"
  echo "  ✓ db_url rotated (the role changed its own password)"
else
  echo "  ✗ db_url NOT rotated — the ALTER ROLE was refused; the file is unchanged"
  fail=1
fi
unset NEWPW OLDPW URL

echo
echo "the running containers still hold the OLD values — they read the files at start."
echo "redeploy all four services now, then prove:"
echo "  ./deploy.sh core-api-staging && ./deploy.sh public-api-staging \\"
echo "    && ./deploy.sh api-gateway-staging && ./deploy.sh developer-api"
echo
echo "to undo before redeploying:"
echo "  bash tools/ops/rotate-sandbox-secrets.sh --rollback $BACKUP"
exit $fail
