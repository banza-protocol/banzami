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

# The canonical remote-execution contract: prove the host, run there, and return
# the proof's own exit status. See tools/ops/lib/remote.sh.
for _p in "$(dirname "$0")/remote.sh" "$(dirname "$0")/lib/remote.sh" \
          "$(dirname "$0")/../lib/remote.sh" "$(dirname "$0")/../../tools/ops/lib/remote.sh"; do
  [ -f "$_p" ] && { . "$_p"; break; }
done
command -v remote_self_or_continue >/dev/null 2>&1 \
  || { echo "✗ tools/ops/lib/remote.sh not found — refusing to run without the host guard" >&2; exit 2; }
remote_self_or_continue "$@"

PG=$(docker ps --format '{{.Names}}' | grep postgres | grep bzsandbox | head -1)
CORE=$(docker ps --format '{{.Names}}' | grep core-api-staging | head -1)
PW=$(docker exec "$CORE" sh -c 'cat /run/secrets/db_url' | sed -E 's#.*://[^:]+:([^@]+)@.*#\1#')
q(){ docker exec -e PGPASSWORD="$PW" "$PG" psql -U bl_app_runtime -d banzami_staging -At -c "$1" 2>/dev/null; }

AGE="interval '$HOURS hours'"
echo "fixture residue older than ${HOURS}h"
echo

# The canonical DOA tenant is not residue. It is the live integrator — DOA's
# production runs on this Sandbox — and it is old by design, so an age-based
# audit will always find it.
#
# These names were 'DOA Sandbox', which is not what anything is called: the
# project is 'Doa-Sandbox' and the merchant 'Sandbox · Doa-Sandbox'. So the
# exclusion matched nothing, every run reported DOA's live authority as stale
# fixture residue, and the report ended by suggesting the command that retires
# what it found. A safety belt that names the wrong thing is worse than no belt,
# because it reads as protection.
# Matched by a pattern, not by the exact string. The merchant is called
# "Sandbox · Doa-Sandbox" and that middle dot is U+00B7: it survives neither the
# shell nor the SSH hop intact, so an equality test against it silently matched
# nothing — the same failure, one layer down, as the wrong name above. The
# pattern uses only ASCII and still names exactly one tenant.
CANON_LIKE="%Doa-Sandbox%"

echo "live authority created before then (the canonical DOA tenant excluded)"
q "select '  developer keys      ' || count(*) from developer.dev_api_keys k join developer.dev_projects p on p.id=k.project_id
   where k.status='ACTIVE' and k.created_at < now() - $AGE
     and p.name not like '$CANON_LIKE'"
q "select '  merchant API keys   ' || count(*) from api_keys k join merchants m on m.id=k.merchant_id
   where k.revoked_at is null and k.created_at < now() - $AGE and m.name not like '$CANON_LIKE'"
q "select '  webhook endpoints   ' || count(*) from webhook_endpoints w join merchants m on m.id=w.merchant_id
   where w.active and w.created_at < now() - $AGE and m.name not like '$CANON_LIKE'"
q "select '  active merchants    ' || count(*) from merchants where status='ACTIVE' and created_at < now() - $AGE and name not like '$CANON_LIKE'"
q "select '  active projects     ' || count(*) from developer.dev_projects where status='ACTIVE' and created_at < now() - $AGE and name not like '$CANON_LIKE'"
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
