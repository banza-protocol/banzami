#!/usr/bin/env bash
# What is allowed to act on this operator, and what else currently can.
#
# The hygiene gate answers "did that run leak?" — a delta. This answers the
# other question, the absolute one: of everything live right now, which is
# supposed to be, and what is the rest?
#
# THE ALLOWLIST IS DELIBERATELY SHORT AND WRITTEN BY HAND
#
# Every entry names a thing a deployment actually uses, and says which. A list
# that grows by itself is not a list, and "it looks like a real one" is how 197
# live keys accumulated on a project that needs three.
#
# Everything outside it is reported with evidence — for a key, how many requests
# it has ever served and when it last did — so retiring one is a decision made
# on facts rather than on the name someone typed when they minted it.
#
# --retire revokes only keys OUTSIDE the allowlist, and only ones the request
# log shows have never served a request. A key that has served traffic is never
# revoked by this script no matter what it is called: if something is using it,
# that is the fact that matters, and a human decides.
#
#   bash tools/ops/canonical-authority.sh
#   bash tools/ops/canonical-authority.sh --retire
set -uo pipefail
REMOTE="${BANZAMI_REMOTE:-root@217.160.9.248}"
RETIRE=0; [ "${1:-}" = "--retire" ] && RETIRE=1

if ! command -v docker >/dev/null 2>&1 || ! docker ps --format '{{.Names}}' 2>/dev/null | grep -q core-api-staging; then
  if [ "${BANZAMI_ON_VM:-0}" = "1" ]; then echo "✗ on the VM, but core-api-staging is not running." >&2; exit 2; fi
  echo "· the containers are not here — running on $REMOTE"
  scp -q "$0" "$REMOTE:/tmp/$(basename "$0")" || { echo "✗ could not reach $REMOTE" >&2; exit 2; }
  ssh "$REMOTE" "BANZAMI_ON_VM=1 bash /tmp/$(basename "$0") ${1:-}; rm -f /tmp/$(basename "$0")"
  exit $?
fi

PG=$(docker ps --format '{{.Names}}' | grep postgres | grep bzsandbox | head -1)
CORE=$(docker ps --format '{{.Names}}' | grep core-api-staging | head -1)
PW=$(docker exec "$CORE" sh -c 'cat /run/secrets/db_url' | sed -E 's#.*://[^:]+:([^@]+)@.*#\1#')
q(){ docker exec -e PGPASSWORD="$PW" "$PG" psql -U bl_app_runtime -d banzami_staging -At -F'|' -c "$1"; }

# ── the allowlist ───────────────────────────────────────────────────────────
# Developer keys, by exact name, each with the deployment that holds it:
#   DOA production (final)                 www.doadoa.app
#   DOA admin surface (admin.doadoa.app)   admin.doadoa.app
#   DOA Sandbox server key                 doa-sandbox
CANON_KEYS="DOA production (final)|DOA admin surface (admin.doadoa.app)|DOA Sandbox server key"
CANON_PROJECT="DOA Sandbox"
CANON_MERCHANT="Doa"

echo "canonical authority — banzami_staging"
echo

echo "developer keys on the canonical project"
q "select case when k.name in ('DOA production (final)','DOA admin surface (admin.doadoa.app)','DOA Sandbox server key')
              then '  ✓ ' else '  · ' end
        || rpad(k.name, 40) || ' ' || k.key_prefix
        || '  calls=' || (select count(*) from developer.dev_api_request_logs l where l.key_id = k.id)
        || '  last=' || (select coalesce(max(l.created_at)::date::text,'never') from developer.dev_api_request_logs l where l.key_id = k.id)
   from developer.dev_api_keys k join developer.dev_projects p on p.id = k.project_id
   where k.status='ACTIVE' and p.name = '$CANON_PROJECT'
   order by (select count(*) from developer.dev_api_request_logs l where l.key_id = k.id) desc"

echo
echo "everything else that is live"
q "select '  developer keys on other projects  ' || count(*) from developer.dev_api_keys k
   join developer.dev_projects p on p.id = k.project_id
   where k.status='ACTIVE' and p.name <> '$CANON_PROJECT'"
q "select '  merchant API keys                 ' || count(*) from api_keys where revoked_at is null"
q "select '  webhook endpoints                 ' || count(*) from webhook_endpoints where active"
q "select '  active merchants                  ' || count(*) from merchants where status='ACTIVE'"
q "select '  active developer projects         ' || count(*) from developer.dev_projects where status='ACTIVE'"
q "select '  open payment links                ' || count(*) from payment_links where status='ACTIVE'"

echo
echo "active merchants, named"
q "select '  ' || case when name = '$CANON_MERCHANT' then '✓ ' else '· ' end || name from merchants where status='ACTIVE' order by created_at"

if [ "$RETIRE" -eq 0 ]; then
  echo
  echo "report only — re-run with --retire to revoke unused non-canonical keys"
  exit 0
fi

echo
echo "retiring"
# Two conditions, both required: outside the allowlist AND never used. The
# second is what makes this safe to run without reading the list first.
q "with doomed as (
     select k.id, k.name, k.key_prefix from developer.dev_api_keys k
     where k.status='ACTIVE'
       and k.name not in ('DOA production (final)','DOA admin surface (admin.doadoa.app)','DOA Sandbox server key')
       and not exists (select 1 from developer.dev_api_request_logs l where l.key_id = k.id))
   update developer.dev_api_keys k set status='REVOKED', revoked_at=now()
   from doomed d where k.id = d.id
   returning '  revoked ' || d.name || ' ' || d.key_prefix"

echo
echo "still live, and why"
q "select '  ' || k.name || ' ' || k.key_prefix || '  calls='
        || (select count(*) from developer.dev_api_request_logs l where l.key_id = k.id)
   from developer.dev_api_keys k where k.status='ACTIVE' order by k.name"
