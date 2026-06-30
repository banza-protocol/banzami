#!/usr/bin/env bash
# check-migration-drift.sh — report SCHEMA PARITY drift between two Banzami
# databases (typically LIVE `banzami` vs SANDBOX `banzami_staging`).
#
# Why parity, not "every CREATE TABLE must exist": migrations are applied with
# `sqlx migrate run` (which tracks versions in `_sqlx_migrations`), but the live &
# sandbox DBs were hand-applied per-file, so neither has that tracking table and the
# migration history contains superseded designs (e.g. 0042 split_sessions, 0050
# kyc_verifications) whose tables were never applied to either env. Checking raw
# CREATE-TABLE presence therefore cries wolf. What actually matters operationally is
# that the two environments do not silently DIVERGE — a feature live in one but not
# the other (audit Part 4: live was missing refunds / disputes / payment_requests).
#
# Usage:
#   REFERENCE_DATABASE_URL=postgres://…/banzami_staging \
#   DATABASE_URL=postgres://…/banzami \
#   tools/check-migration-drift.sh
#
# Allow-list intentional, documented divergences (one per env):
#   PARITY_IGNORE=collections,collection_shares,payment_intents …
# (collections* / payment_intents = split-charge prototype, intentionally absent in
#  LIVE pending BANZA ADR-036 — see CLAUDE.md / Banzami ADR-019.)
set -euo pipefail

: "${DATABASE_URL:?set DATABASE_URL (the TARGET db, e.g. live banzami)}"
: "${REFERENCE_DATABASE_URL:?set REFERENCE_DATABASE_URL (the reference db, e.g. sandbox banzami_staging)}"

tables() { psql "$1" -tAc "SELECT tablename FROM pg_tables WHERE schemaname='public'" | tr -d ' ' | sort -u; }

ref="$(tables "$REFERENCE_DATABASE_URL")"
tgt="$(tables "$DATABASE_URL")"

ignore_re='^$'
if [ -n "${PARITY_IGNORE:-}" ]; then
  ignore_re="$(echo "$PARITY_IGNORE" | tr ',' '\n' | tr -d ' ' | grep -v '^$' | paste -sd'|' -)"
fi

only_ref="$(comm -23 <(echo "$ref") <(echo "$tgt") | grep -ivE "^(${ignore_re})$" || true)"
only_tgt="$(comm -13 <(echo "$ref") <(echo "$tgt") | grep -ivE "^(${ignore_re})$" || true)"

# sqlx tracking present? (its absence is the root governance gap.)
for label in REFERENCE TARGET; do
  url="$REFERENCE_DATABASE_URL"; [ "$label" = TARGET ] && url="$DATABASE_URL"
  echo "$(tables "$url")" | grep -qx "_sqlx_migrations" || \
    echo "WARN: $label db has no _sqlx_migrations — not managed by 'sqlx migrate run'."
done

drift=0
if [ -n "$only_ref" ]; then
  drift=1
  echo "DRIFT: in REFERENCE but MISSING from target:"
  echo "$only_ref" | sed 's/^/  - /'
fi
if [ -n "$only_tgt" ]; then
  drift=1
  echo "DRIFT: in TARGET but MISSING from reference:"
  echo "$only_tgt" | sed 's/^/  - /'
fi

if [ "$drift" -ne 0 ]; then
  echo ""
  echo "Resolve by applying the missing migrations (after backup) or allow-list a"
  echo "documented exception via PARITY_IGNORE. See this script's header."
  exit 1
fi
echo "OK: live/sandbox schema parity holds (ignoring: ${PARITY_IGNORE:-none})."
