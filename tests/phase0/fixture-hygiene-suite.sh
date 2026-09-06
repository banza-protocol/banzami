#!/usr/bin/env bash
# The whole stateful suite, and one question at the end: is anything new alive?
#
# The per-harness gate proves each harness cleans up. This proves the suite
# does — which is not the same claim. Harnesses share a Sandbox, and a run can
# leave something a later harness picks up and appears to clean; only measuring
# across the whole suite catches that.
#
# Runs every harness that creates operator state, in one pass, with a single
# before/after comparison around all of them. Individual harness failures do not
# stop the sweep: a suite that stops at the first failure never reaches the
# hygiene question, and the leak is what this exists to find.
#
# Usage (on the VM): bash tests/phase0/fixture-hygiene-suite.sh
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"

PG=$(docker ps --format '{{.Names}}' | grep postgres | grep bzsandbox | head -1)
CORE=$(docker ps --format '{{.Names}}' | grep core-api-staging | head -1)
[ -n "$PG" ] && [ -n "$CORE" ] || { echo "run this on the Sandbox VM" >&2; exit 2; }
PW=$(docker exec "$CORE" sh -c 'cat /run/secrets/db_url' | sed -E 's#.*://[^:]+:([^@]+)@.*#\1#')
q(){ docker exec -e PGPASSWORD="$PW" "$PG" psql -U bl_app_runtime -d banzami_staging -At -c "$1" 2>/dev/null; }

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

# Every harness that mints operator state. The three omitted — hosted-checkout,
# hosted-checkout-payment, doa-public-donation — consume existing state and
# create none; pay-frontend-lifecycle, ledger-reconciliation and
# doa-canonical-binding only read. sdk-types-cleanroom needs npm egress the
# Sandbox VM does not have, and runs in CI instead.
HARNESSES="
adr055-binding-seal-e2e.sh
campaign-payment-segregation.sh
developer-platform-e2e.sh
online-platform-sdk.sh
payout-sandbox-e2e.sh
post-reset-bootstrap.sh
refund-devkey-e2e.sh
refund-published-sdk-e2e.sh
sdk-wallet-accounts-public.sh
transfer-devkey-e2e.sh
wallet-subaccount-e2e.sh
webhook-delivery-to-doa.sh
webhook-lifecycle-e2e.sh
"

BEFORE=$(inventory)
echo "── operator authority before the suite ──"
printf '%s\n' "$BEFORE" | while IFS='|' read -r l n; do printf '  %-28s %s\n' "$l" "$n"; done

FAILED=""
for h in $HARNESSES; do
  [ -f "$HERE/$h" ] || { echo "  (missing: $h)"; continue; }
  printf '\n── %s ──\n' "$h"
  if bash "$HERE/$h" > "/tmp/suite-$h.log" 2>&1; then
    echo "  ok — $(grep -oE '(PASS=[0-9]+ FAIL=[0-9]+|[0-9]+ checks)' "/tmp/suite-$h.log" | tail -1)"
  else
    echo "  FAILED (log: /tmp/suite-$h.log)"
    FAILED="$FAILED $h"
  fi
done

AFTER=$(inventory)
echo
echo "── operator authority after the suite ──"
LEAKS=0
while IFS='|' read -r label now; do
  was=$(printf '%s\n' "$BEFORE" | awk -F'|' -v l="$label" '$1==l{print $2}')
  d=$((now - was))
  if   [ "$d" -eq 0 ]; then printf '  %-28s %s\n' "$label" "$now"
  elif [ "$d" -lt 0 ]; then printf '  %-28s %s  (%s)\n' "$label" "$now" "$d"
  else printf '  %-28s %s  ✗ LEAKED %s\n' "$label" "$now" "$d"; LEAKS=$((LEAKS + d)); fi
done <<< "$AFTER"

echo
[ -n "$FAILED" ] && echo "harnesses that failed:$FAILED"
if [ "$LEAKS" -eq 0 ]; then
  echo "FIXTURE_HYGIENE_SUITE: no authority leaked"
  [ -z "$FAILED" ] && exit 0 || exit 1
fi
echo "FIXTURE_HYGIENE_SUITE: $LEAKS leaked authority object(s)"
exit 1
