#!/usr/bin/env bash
# Revoke the E2E residue on DOA's Developer project.
#
# The project accumulated 171 active API keys against 175 ever issued. All but a
# handful are leftovers from end-to-end runs — seg-*, wh-*, sdk-public-*,
# refund-e2e-*, wa-e2e-* — and every one of them is a live credential on a real
# project, several carrying wallet_accounts:create. Nothing revoked them because
# nothing was responsible for revoking them.
#
# Keeps, by exact name, the credentials the running product uses. Everything else
# active is revoked. Names are matched exactly rather than by pattern: a pattern
# that is slightly wrong here revokes the key that takes donations.
#
# The work happens on the Sandbox VM, because the credentials it needs are docker
# secrets there. Run it from anywhere: it copies itself over and re-runs when the
# containers are not local. Dry run by default.
#
# Usage:  bash tools/ops/prune-doa-fixture-keys.sh [--apply]
set -uo pipefail

REMOTE="${BANZAMI_REMOTE:-root@217.160.9.248}"

# Not on the VM? Go there. The first version simply reported "containers not
# found", which is true and useless: run from the repository root — the obvious
# place — it named a symptom and left the reader to guess the machine.
if ! command -v docker >/dev/null 2>&1 || ! docker ps --format '{{.Names}}' 2>/dev/null | grep -q developer-api; then
  if [ "${BANZAMI_ON_VM:-0}" = "1" ]; then
    echo "✗ on the VM, but no developer-api container is running." >&2
    docker ps --format '  {{.Names}}' 2>/dev/null | head -20 >&2
    exit 2
  fi
  echo "· the containers are not here — running on $REMOTE"
  scp -q "$0" "$REMOTE:/tmp/$(basename "$0")" || { echo "✗ could not copy the script to $REMOTE" >&2; exit 2; }
  # `ssh host "cmd; rm -f ..."` returns the status of the LAST command — the rm —
  # so the result of the run itself was being discarded and every invocation
  # looked successful.
  ssh "$REMOTE" "BANZAMI_ON_VM=1 bash /tmp/$(basename "$0") ${1:-}; rc=\$?; rm -f /tmp/$(basename "$0"); exit \$rc"
  exit $?
fi

PROJECT=6367749d-ba77-47b6-80bd-982382ddd1c9
ACTOR=11111111-2222-4333-8444-555555555555
APPLY=0; [ "${1:-}" = "--apply" ] && APPLY=1

# Selected by what they ARE, not by what they are not.
#
# An earlier version kept two keys by name and revoked everything else. That is
# the wrong direction on a project holding live credentials: a name slightly
# wrong there revokes the key that takes donations. This revokes only names the
# E2E harnesses generate — each ends in a run-id, none is typed by a person —
# so a mistake leaves a key alive rather than killing one in use.
#
# Everything with a human-written name survives, including "DOA Sandbox server
# key" and "DOA production (final)", which may still be configured somewhere.
GENERATED='^(refund-e2e|transfer-e2e|wh-deliver|refund-ro|seg|wh-ro|wh-rw|wa-e2e|sdk-public|rf-pub|slug|payout-fund)-[0-9]{4,}$'

# Named credentials the running product uses. Not the selection criterion — a
# precondition: if these are not present and active, this script does not know
# what it is looking at and refuses to touch anything.
KEEP_WEB="DOA production (rotated 2026-09-05)"
KEEP_ADMIN="DOA admin surface (admin.doadoa.app)"

DEV=$(docker ps --format '{{.Names}}' | grep developer-api | head -1)
PG=$(docker ps --format '{{.Names}}' | grep '23807-postgres' | head -1)
[ -n "$DEV" ] && [ -n "$PG" ] || { echo "✗ developer-api or postgres container not found on this host" >&2; exit 2; }
IK=$(docker exec "$DEV" sh -c 'cat /run/secrets/developer_internal_key')
URL=$(docker exec "$DEV" sh -c 'cat /run/secrets/db_url')

q() { docker exec -e U="$URL" "$PG" sh -c "psql \"\$U\" -tAc \"$1\""; }

# Refuse to run at all unless both keepers are present and active. If the
# canonical keys are not there, this script does not know what it is looking at.
for name in "$KEEP_WEB" "$KEEP_ADMIN"; do
  n=$(q "select count(*) from developer.dev_api_keys where project_id='$PROJECT' and revoked_at is null and name='${name//\'/\'\'}'")
  [ "$n" = "1" ] || { echo "✗ expected exactly one active key named '$name', found $n — refusing"; exit 1; }
done
echo "✓ both canonical keys present and active"

VICTIMS=$(q "select id || '|' || name from developer.dev_api_keys
             where project_id='$PROJECT' and revoked_at is null
               and name ~ '$GENERATED'
             order by created_at")
COUNT=$(echo "$VICTIMS" | grep -c '|' || true)
echo "  $COUNT active key(s) to revoke"

[ "$COUNT" -eq 0 ] && { echo "nothing to do"; exit 0; }

echo "$VICTIMS" | head -5 | sed 's/^/    /'
[ "$COUNT" -gt 5 ] && echo "    … and $((COUNT-5)) more"

if [ "$APPLY" -eq 0 ]; then
  echo
  echo "dry run — pass --apply to revoke"
  exit 0
fi

DONE=0; FAILED=0
echo "$VICTIMS" | while IFS='|' read -r id name; do
  [ -n "$id" ] || continue
  c=$(printf '%s' "{\"created_by\":\"$ACTOR\"}" | docker exec -i -e IK="$IK" "$DEV" sh -c \
        "curl -s -o /dev/null -w '%{http_code}' -X POST 'http://localhost:8086/internal/v1/fixture-keys/$id/revoke' \
           -H \"X-Internal-Key: \$IK\" -H 'Content-Type: application/json' --data @-")
  [ "$c" = "200" ] || echo "    ✗ $name → $c"
done

REMAINING=$(q "select count(*) from developer.dev_api_keys where project_id='$PROJECT' and revoked_at is null")
echo
echo "active keys on DOA's project now: $REMAINING"
q "select '  ' || name from developer.dev_api_keys where project_id='$PROJECT' and revoked_at is null order by created_at"
