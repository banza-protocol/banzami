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
# A key that HAS served traffic and is still not canonical is reported and left
# alone. Retiring one is a named decision: --retire-key <prefix>, one at a time,
# by the person who knows what it was.
#
# --cancel-orphan-links cancels the ACTIVE payment links on the canonical
# merchant. Every one was opened by a pre-launch DOA journey against a campaign
# that no longer exists — doa-live was reset to a clean launch baseline and holds
# zero campaigns — so nothing on the application side can ever settle them, while
# the URLs stay payable into wallet accounts nobody is watching. Payment links
# carry no expiry; they do not go away on their own.
#
# THE PREMISE IS NOT CHECKABLE FROM HERE. The operator database cannot see DOA's,
# so this cannot verify that no campaign exists; whoever runs it must know that
# it is true. After launch it will not be, and the flag becomes the wrong thing
# to run.
#
#   bash tools/ops/canonical-authority.sh
#   bash tools/ops/canonical-authority.sh --retire
#   bash tools/ops/canonical-authority.sh --retire-key bz_test_sk_XXXXXXXX
#   bash tools/ops/canonical-authority.sh --cancel-orphan-links
#   bash tools/ops/canonical-authority.sh --retire-leftovers
#
# --retire-leftovers is the last pass, and the only one here that selects by
# exclusion: everything ACTIVE except the canonical merchant and the canonical
# project. That is normally the wrong direction — a pattern slightly wrong in
# that direction retires the thing that takes money — so it is allowed only
# because the survivor list is twelve merchants and three projects, printed in
# full above, and every one of them has been read. It prints what each holds
# before touching it.
#
# It also restores the canonical project to ACTIVE. An earlier version of the
# fixture prune archived it, matching projects through ANY binding to a fixture
# merchant; DOA's project keeps the retired binding it was corrected away from.
# Nothing broke, because key authorisation reads the key's status and never the
# project's — which is luck, not design.
set -uo pipefail
REMOTE="${BANZAMI_REMOTE:-root@217.160.9.248}"
RETIRE=0;       [ "${1:-}" = "--retire" ] && RETIRE=1
RETIRE_KEY="";  [ "${1:-}" = "--retire-key" ] && RETIRE_KEY="${2:?--retire-key needs a key prefix}"
CANCEL_LINKS=0; [ "${1:-}" = "--cancel-orphan-links" ] && CANCEL_LINKS=1
LEFTOVERS=0;    [ "${1:-}" = "--retire-leftovers" ] && LEFTOVERS=1

if ! command -v docker >/dev/null 2>&1 || ! docker ps --format '{{.Names}}' 2>/dev/null | grep -q core-api-staging; then
  if [ "${BANZAMI_ON_VM:-0}" = "1" ]; then echo "✗ on the VM, but core-api-staging is not running." >&2; exit 2; fi
  echo "· the containers are not here — running on $REMOTE"
  scp -q "$0" "$REMOTE:/tmp/$(basename "$0")" || { echo "✗ could not reach $REMOTE" >&2; exit 2; }
  ssh "$REMOTE" "BANZAMI_ON_VM=1 bash /tmp/$(basename "$0") ${1:-} ${2:-}; rm -f /tmp/$(basename "$0")"
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

if [ "$LEFTOVERS" -eq 1 ]; then
  echo "the canonical project, first — an earlier prune archived it"
  q "update developer.dev_projects set status='ACTIVE', updated_at=now()
      where name = '$CANON_PROJECT' and status='ARCHIVED'
      returning '  restored ' || name || ' to ACTIVE'"

  echo
  echo "what is still ACTIVE and is not canonical"
  q "select '  ' || rpad(m.name, 18) || ' pins=' ||
       (select count(*) from merchant_app_credentials c where c.merchant_id=m.id
          and (c.locked_until is null or c.locked_until < now())) ||
       ' keys=' || (select count(*) from api_keys k where k.merchant_id=m.id and k.revoked_at is null) ||
       ' wallets=' || (select count(*) from wallets w where w.merchant_id=m.id)
     from merchants m where m.status='ACTIVE' and m.name <> '$CANON_MERCHANT' order by m.created_at"
  q "select '  project ' || name from developer.dev_projects
      where status='ACTIVE' and name <> '$CANON_PROJECT' order by created_at"

  echo
  echo "retiring"
  # An app PIN is a login. Four of these merchants still had one, which is why
  # 'they hold nothing' was not true of them.
  q "with done as (
       update merchants set status='SUSPENDED', updated_at=now()
        where status='ACTIVE' and name <> '$CANON_MERCHANT' returning id, name)
     select '  suspended ' || name from done"
  q "update merchant_app_credentials c set locked_until='infinity'
      from merchants m
     where m.id = c.merchant_id and m.status='SUSPENDED'
       and (c.locked_until is null or c.locked_until < now())
     returning '  locked the app PIN of ' || m.name"
  q "update developer.dev_projects set status='ARCHIVED', updated_at=now()
      where status='ACTIVE' and name <> '$CANON_PROJECT'
      returning '  archived project ' || name"

  echo
  echo "what is live now"
  q "select '  merchants: ' || string_agg(name, ', ') from merchants where status='ACTIVE'"
  q "select '  projects:  ' || string_agg(name, ', ') from developer.dev_projects where status='ACTIVE'"
  q "select '  developer keys: ' || count(*) from developer.dev_api_keys where status='ACTIVE'"
  q "select '  merchant keys:  ' || count(*) from api_keys where revoked_at is null"
  q "select '  webhooks:       ' || count(*) from webhook_endpoints where active"
  q "select '  usable app PINs:' || count(*) from merchant_app_credentials where locked_until is null or locked_until < now()"
  q "select '  open links:     ' || count(*) from payment_links where status='ACTIVE'"
  exit 0
fi

if [ "$CANCEL_LINKS" -eq 1 ]; then
  echo "cancelling the canonical merchant's open payment links"
  echo "  premise: doa-live holds no campaigns, so none of these can ever settle"
  q "update payment_links l set status='CANCELLED', updated_at=now()
      from merchants m
     where m.id = l.merchant_id and m.name = '$CANON_MERCHANT' and l.status = 'ACTIVE'
     returning '  cancelled ' || l.slug"
  echo
  q "select '  open payment links now: ' || count(*) from payment_links where status='ACTIVE'"
  exit 0
fi

if [ -n "$RETIRE_KEY" ]; then
  echo "retiring one key by prefix: $RETIRE_KEY"
  q "update developer.dev_api_keys set status='REVOKED', revoked_at=now()
      where status='ACTIVE' and key_prefix = '$RETIRE_KEY'
      returning '  revoked ' || name || ' ' || key_prefix"
  exit 0
fi

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
