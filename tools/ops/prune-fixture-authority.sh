#!/usr/bin/env bash
# Retire the operator-side credentials the end-to-end harnesses left behind.
#
# The Developer-project keys were pruned already (prune-doa-fixture-keys.sh).
# This is the other population, and it is larger: every harness that needed a
# merchant created one, and each merchant came with an API key, a webhook
# endpoint and an app PIN. Nothing revoked them, because nothing was
# responsible for revoking them. At the time of writing:
#
#   288 merchants, 276 of them harness fixtures
#   170 live API keys, 169 held by fixtures
#    56 active webhook endpoints, 55 held by fixtures
#
# Some of those endpoints point at https://www.doadoa.app/api/webhooks/banzami
# — a fixture merchant holding a live signing secret for the real product's
# webhook route. That is the one that makes this worth doing before launch.
#
# SELECTION IS POSITIVE. Fixtures are matched by the name shapes the harnesses
# generate, all of which end in a run id or are machine-numbered; nothing a
# person typed matches. Everything unmatched survives and is printed, so a
# mistake in the pattern leaves a credential alive rather than killing the one
# that takes donations. The canonical "Doa" merchant is unmatched by
# construction, and its key and webhook are listed at the end as proof they
# were left alone.
#
# NOTHING IS DELETED. Keys are revoked, endpoints are deactivated, PINs are
# locked. The rows stay: an audit needs to see that a credential existed and
# when it stopped working, which a DELETE destroys.
#
# The ledger is not touched at all.
#
# Usage:  bash tools/ops/prune-fixture-authority.sh [--apply]
set -uo pipefail

REMOTE="${BANZAMI_REMOTE:-root@217.160.9.248}"
APPLY=0; [ "${1:-}" = "--apply" ] && APPLY=1

# Not on the VM? Go there — the database password is a docker secret over there.
if ! command -v docker >/dev/null 2>&1 || ! docker ps --format '{{.Names}}' 2>/dev/null | grep -q core-api-staging; then
  if [ "${BANZAMI_ON_VM:-0}" = "1" ]; then
    echo "✗ on the VM, but no core-api-staging container is running." >&2
    docker ps --format '  {{.Names}}' 2>/dev/null | head -20 >&2
    exit 2
  fi
  echo "· the containers are not here — running on $REMOTE"
  scp -q "$0" "$REMOTE:/tmp/$(basename "$0")" || { echo "✗ could not copy the script to $REMOTE" >&2; exit 2; }
  ssh "$REMOTE" "BANZAMI_ON_VM=1 bash /tmp/$(basename "$0") ${1:-}; rm -f /tmp/$(basename "$0")"
  exit $?
fi

CORE=$(docker ps --format '{{.Names}}' | grep core-api-staging | head -1)
PG=$(docker ps --format '{{.Names}}' | grep postgres | grep bzsandbox | head -1)
PW=$(docker exec "$CORE" sh -c 'cat /run/secrets/db_url' | sed -E 's#.*://[^:]+:([^@]+)@.*#\1#')
q(){ docker exec -e PGPASSWORD="$PW" "$PG" psql -U bl_app_runtime -d banzami_staging -At -F'|' -c "$1"; }

# The harness name shapes, and only those.
#   "E2E wha 2de9c7f7"  "SYN M 16486"  "SYNTHETIC Merchant 1"  "E01 Valid Lda"
#   "M3077617520"  "WAO224149731"  "WH3016131357"  "RF152141024"  "TR260514357"
FIX="^(E2E |SYN |SYNTHETIC |E0[0-9] |E1 |E2 |[A-Z]{2,4}[0-9]{4,}$|M[0-9]+$)"

echo "fixture authority on the sandbox operator database"
[ "$APPLY" -eq 1 ] && echo "mode: APPLY" || echo "mode: dry run"
echo

echo "what survives — every merchant the pattern does NOT call a fixture"
q "select '  ' || rpad(m.name, 20) || ' keys=' ||
     (select count(*) from api_keys k where k.merchant_id=m.id and k.revoked_at is null) ||
     ' hooks=' ||
     (select count(*) from webhook_endpoints w where w.merchant_id=m.id and w.active)
   from merchants m where m.name !~ '$FIX' order by m.created_at"

echo
echo "what will be retired"
q "select '  fixture merchants   ' || count(*) from merchants where name ~ '$FIX'"
q "select '  live API keys      ' || count(*) from api_keys k join merchants m on m.id=k.merchant_id
   where k.revoked_at is null and m.name ~ '$FIX'"
q "select '  active webhooks    ' || count(*) from webhook_endpoints w join merchants m on m.id=w.merchant_id
   where w.active and m.name ~ '$FIX'"
q "select '  unlocked app PINs  ' || count(*) from merchant_app_credentials c join merchants m on m.id=c.merchant_id
   where m.name ~ '$FIX' and (c.locked_until is null or c.locked_until < now())"

echo
echo "endpoints pointing at the real product, held by a fixture"
q "select '  ' || m.name || '  ' || w.url from webhook_endpoints w join merchants m on m.id=w.merchant_id
   where w.active and m.name ~ '$FIX' and w.url like '%doadoa.app%'"

if [ "$APPLY" -eq 0 ]; then
  echo
  echo "dry run — nothing changed.  re-run with --apply"
  exit 0
fi

echo
echo "applying"
# One statement, so it is one transaction: either all three populations are
# retired or none is. A half-applied prune is worse than none — it looks done.
q "begin;
   update api_keys k set revoked_at = now()
     from merchants m where m.id = k.merchant_id and k.revoked_at is null and m.name ~ '$FIX';
   update webhook_endpoints w set active = false
     from merchants m where m.id = w.merchant_id and w.active and m.name ~ '$FIX';
   update merchant_app_credentials c set locked_until = 'infinity'
     from merchants m where m.id = c.merchant_id and m.name ~ '$FIX';
   commit;"

echo
echo "after"
q "select '  live API keys      ' || count(*) from api_keys where revoked_at is null"
q "select '  active webhooks    ' || count(*) from webhook_endpoints where active"
echo
echo "the canonical merchant, untouched"
q "select '  ' || m.name || '  key=' || k.key_prefix || '  env=' || k.environment
   from api_keys k join merchants m on m.id = k.merchant_id
   where k.revoked_at is null and m.name = 'Doa'"
q "select '  ' || m.name || '  ' || w.url
   from webhook_endpoints w join merchants m on m.id = w.merchant_id
   where w.active and m.name = 'Doa'"
