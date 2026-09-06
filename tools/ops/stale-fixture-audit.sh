#!/usr/bin/env bash
# What fixture state is still lying around, and how old is it?
#
# Harnesses clean up after themselves now, and the hygiene gate fails a run that
# does not. This is the backstop for the cases neither covers: a machine that
# died before its trap ran and whose manifest was lost, a harness added later
# that nobody wired up, an operator poking at the Sandbox by hand.
#
# REPORT ONLY. It never retires anything, and there is no flag that makes it.
# An autonomous sweeper deleting things on a schedule is how a cleanup job
# eventually takes something real: the two prune scripts do the retiring, under
# a person, with a dry run first.
#
#   bash tools/ops/stale-fixture-audit.sh          # older than 24h
#   bash tools/ops/stale-fixture-audit.sh 168      # older than a week
set -uo pipefail
REMOTE="${BANZAMI_REMOTE:-root@217.160.9.248}"
HOURS="${1:-24}"

if ! command -v docker >/dev/null 2>&1 || ! docker ps --format '{{.Names}}' 2>/dev/null | grep -q core-api-staging; then
  if [ "${BANZAMI_ON_VM:-0}" = "1" ]; then echo "✗ on the VM, but core-api-staging is not running." >&2; exit 2; fi
  echo "· the containers are not here — running on $REMOTE"
  scp -q "$0" "$REMOTE:/tmp/$(basename "$0")" || { echo "✗ could not reach $REMOTE" >&2; exit 2; }
  ssh "$REMOTE" "BANZAMI_ON_VM=1 bash /tmp/$(basename "$0") $HOURS; rm -f /tmp/$(basename "$0")"
  exit $?
fi

PG=$(docker ps --format '{{.Names}}' | grep postgres | grep bzsandbox | head -1)
CORE=$(docker ps --format '{{.Names}}' | grep core-api-staging | head -1)
PW=$(docker exec "$CORE" sh -c 'cat /run/secrets/db_url' | sed -E 's#.*://[^:]+:([^@]+)@.*#\1#')
q(){ docker exec -e PGPASSWORD="$PW" "$PG" psql -U bl_app_runtime -d banzami_staging -At -c "$1" 2>/dev/null; }

AGE="interval '$HOURS hours'"
echo "fixture residue older than ${HOURS}h"
echo

echo "live authority created before then"
q "select '  developer keys      ' || count(*) from developer.dev_api_keys k join developer.dev_projects p on p.id=k.project_id
   where k.status='ACTIVE' and k.created_at < now() - $AGE
     and p.name <> 'DOA Sandbox'"
q "select '  merchant API keys   ' || count(*) from api_keys where revoked_at is null and created_at < now() - $AGE"
q "select '  webhook endpoints   ' || count(*) from webhook_endpoints where active and created_at < now() - $AGE"
q "select '  active merchants    ' || count(*) from merchants where status='ACTIVE' and created_at < now() - $AGE"
q "select '  active projects     ' || count(*) from developer.dev_projects where status='ACTIVE' and created_at < now() - $AGE and name <> 'DOA Sandbox'"
q "select '  open payment links  ' || count(*) from payment_links where status='ACTIVE' and created_at < now() - $AGE"

echo
echo "run manifests never cleared"
# A manifest that outlives its run is the strongest signal here: it names, by
# id, exactly what that run still owns, and cleanup-e2e-run.sh can finish it.
found=0
for m in /var/tmp/banzami-e2e/*.tsv; do
  [ -f "$m" ] || continue
  found=$((found+1))
  printf '  %-20s %s resource(s)  age %s\n' "$(basename "$m" .tsv)" \
    "$(wc -l < "$m" | tr -d ' ')" \
    "$(( ( $(date +%s) - $(stat -c %Y "$m" 2>/dev/null || echo 0) ) / 60 ))m"
done
[ "$found" -eq 0 ] && echo "  none — every run cleaned up after itself"

echo
echo "nothing was changed. To retire what this found:"
echo "  bash tools/ops/cleanup-e2e-run.sh --all --apply     # runs with manifests"
echo "  bash tools/ops/prune-fixture-authority.sh --apply   # fixtures without one"
