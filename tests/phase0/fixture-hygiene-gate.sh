#!/usr/bin/env bash
# Did that harness give back everything it took? — runs ON the Sandbox VM.
#
# Counts the operator authority that exists, runs a harness, counts again. The
# delta must be zero. Not "roughly zero", not "zero except the ones tagged
# test" — zero, because a credential tagged test still authenticates.
#
# Delta rather than an allowlist by design. An allowlist has to be maintained
# and is wrong the moment something canonical is added; a delta is right
# forever, and it says exactly what a leak is: something that was not here
# before and is here now.
#
# What is counted is authority, not history. Ledger postings, audit rows and
# retired credentials all grow and are supposed to — they are the record. What
# must not grow is the set of things that can act: live keys, active endpoints,
# usable PINs, active projects, active merchants.
#
#   bash tests/phase0/fixture-hygiene-gate.sh tests/phase0/refund-devkey-e2e.sh
#   bash tests/phase0/fixture-hygiene-gate.sh --baseline     # just print it
#
# Exit 0 when nothing leaked, 1 when something did, and it names what.
set -uo pipefail
REMOTE="${BANZAMI_REMOTE:-root@217.160.9.248}"

if ! command -v docker >/dev/null 2>&1 || ! docker ps --format '{{.Names}}' 2>/dev/null | grep -q core-api-staging; then
  if [ "${BANZAMI_ON_VM:-0}" = "1" ]; then echo "✗ on the VM, but core-api-staging is not running." >&2; exit 2; fi
  echo "· the containers are not here — running on $REMOTE" >&2
  exit 2
fi

PG=$(docker ps --format '{{.Names}}' | grep postgres | grep bzsandbox | head -1)
CORE=$(docker ps --format '{{.Names}}' | grep core-api-staging | head -1)
PW=$(docker exec "$CORE" sh -c 'cat /run/secrets/db_url' | sed -E 's#.*://[^:]+:([^@]+)@.*#\1#')
q(){ docker exec -e PGPASSWORD="$PW" "$PG" psql -U bl_app_runtime -d banzami_staging -At -c "$1" 2>/dev/null; }

# Each line is one kind of authority. The label is what gets printed when it
# leaks, so it names the thing rather than the query.
inventory() {
  echo "live merchant API keys|$(q "select count(*) from api_keys where revoked_at is null")"
  echo "live developer keys|$(q "select count(*) from developer.dev_api_keys where status='ACTIVE'")"
  echo "active webhook endpoints|$(q "select count(*) from webhook_endpoints where active")"
  # A PIN is only a way in if the merchant it belongs to can log in at all.
  # Suspension refuses the login (proved in retired-authority-denied.sh), so an
  # unlocked PIN row on a suspended merchant is inert — counting it as live
  # authority made this gate fail a run whose fixture merchant it had correctly
  # suspended.
  echo "app PINs that can log in|$(q "select count(*) from merchant_app_credentials c join merchants m on m.id = c.merchant_id where m.status = 'ACTIVE' and (c.locked_until is null or c.locked_until < now())")"
  echo "active developer projects|$(q "select count(*) from developer.dev_projects where status='ACTIVE'")"
  echo "active merchants|$(q "select count(*) from merchants where status='ACTIVE'")"
  echo "open payment links|$(q "select count(*) from payment_links where status='ACTIVE'")"
}

if [ "${1:-}" = "--baseline" ]; then
  echo "operator authority right now"
  inventory | while IFS='|' read -r label n; do printf '  %-28s %s\n' "$label" "$n"; done
  exit 0
fi

HARNESS="${1:?usage: fixture-hygiene-gate.sh <harness> [args...]}"; shift
[ -f "$HARNESS" ] || { echo "✗ no such harness: $HARNESS" >&2; exit 2; }

BEFORE=$(inventory)
echo "── before ──"
printf '%s\n' "$BEFORE" | while IFS='|' read -r label n; do printf '  %-28s %s\n' "$label" "$n"; done

echo
echo "── running $(basename "$HARNESS") ──"
bash "$HARNESS" "$@"
RC=$?
echo "── harness exit: $RC ──"

# Deliberately still checked when the harness failed. A failing harness that
# also leaks is two problems, and the second one is the one nobody would look
# for — it is exactly the case that produced RA-075 and RA-077.
AFTER=$(inventory)
echo
echo "── after ──"
LEAKS=0
while IFS='|' read -r label now; do
  was=$(printf '%s\n' "$BEFORE" | awk -F'|' -v l="$label" '$1==l{print $2}')
  d=$((now - was))
  if [ "$d" -eq 0 ]; then printf '  %-28s %s\n' "$label" "$now"
  elif [ "$d" -lt 0 ]; then printf '  %-28s %s  (%s — retired more than it made)\n' "$label" "$now" "$d"
  else printf '  %-28s %s  ✗ LEAKED %s\n' "$label" "$now" "$d"; LEAKS=$((LEAKS + d)); fi
done <<< "$AFTER"

echo
if [ "$LEAKS" -eq 0 ]; then
  echo "FIXTURE_HYGIENE: clean — the harness gave back everything it took"
  exit "$RC"
fi
echo "FIXTURE_HYGIENE: $LEAKS leaked authority object(s)"
echo "  a manifest under /var/tmp/banzami-e2e names what a run still owns:"
ls -1 /var/tmp/banzami-e2e/*.tsv 2>/dev/null | sed 's/^/    /' || true
exit 1
