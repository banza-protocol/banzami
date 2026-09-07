#!/usr/bin/env bash
# Prove the migration chain on a database that has never existed before.
#
# Every other check in this repository runs against a database that was migrated
# incrementally, which is exactly how a schema can be correct in practice and
# unreproducible from source: a column added by hand, a migration applied and
# never recorded, a repair that only works because of what was already there.
# The deployed Sandbox had all three.
#
# This creates an EMPTY database, applies 0001 -> latest through the ordinary
# runner, and then asserts three things a drifted database cannot satisfy:
#
#   1. every migration in the chain is recorded and successful, and the count
#      matches the number of files on disk
#   2. the physical schema satisfies the manifest (via the rollout gate)
#   3. the canonical pricing matrix is exactly what the seed says it is —
#      two profiles, four rules, no wildcard, no extras
#
# No cached schema. No reused migration ledger. No Sandbox dependency.
#
#   usage: DATABASE_URL=postgres://…/postgres tools/ci/fresh-migration-check.sh
#
# DATABASE_URL must point at a database in the target cluster that this script
# may connect to in order to CREATE another one; it never migrates that database.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
: "${DATABASE_URL:?DATABASE_URL is required — an admin connection to the target cluster}"

DB="banzami_freshchain_$$"
ADMIN_URL="$DATABASE_URL"
TARGET_URL="$(printf '%s' "$ADMIN_URL" | sed -E "s#/[^/?]+(\\?.*)?\$#/$DB\\1#")"

cleanup() { psql "$ADMIN_URL" -q -c "DROP DATABASE IF EXISTS $DB;" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "────────────────────────────────────────────────────────────"
echo "  FRESH MIGRATION CHECK — 0001 to latest, from nothing"
echo "  scratch database : $DB"
echo "────────────────────────────────────────────────────────────"

psql "$ADMIN_URL" -q -c "DROP DATABASE IF EXISTS $DB;"
psql "$ADMIN_URL" -q -c "CREATE DATABASE $DB;"

# ── 1+2: the ordinary rollout gate does the migrating and the drift detection ─
DATABASE_URL="$TARGET_URL" BANZAMI_DB_TARGET="$DB" bash "$REPO_ROOT/tools/migrate-and-verify.sh"

fail=0
say_fail() { echo "  ✗ $1" >&2; fail=1; }

# ── 1: the ledger is internally consistent and complete ──────────────────────
echo ""
echo "── migration ledger ──"
files="$(find "$REPO_ROOT/db/migrations" -name '[0-9]*.sql' | wc -l | tr -d ' ')"
applied="$(psql "$TARGET_URL" -Atc 'SELECT count(*) FROM _sqlx_migrations')"
failed="$(psql "$TARGET_URL" -Atc 'SELECT count(*) FROM _sqlx_migrations WHERE NOT success')"
[ "$applied" = "$files" ] \
  && echo "  ✓ every migration recorded ($applied of $files files)" \
  || say_fail "$applied migrations recorded but $files files on disk"
[ "$failed" = "0" ] \
  && echo "  ✓ none recorded as failed" \
  || say_fail "$failed migrations recorded as unsuccessful"

# ── 3: the canonical pricing matrix, exactly ─────────────────────────────────
echo ""
echo "── canonical pricing matrix ──"
matrix="$(psql "$TARGET_URL" -Atc "
  SELECT string_agg(pricing_profile || '/' || pricing_operation || '=' || rate_bps, ' ' ORDER BY pricing_profile, pricing_operation)
    FROM pricing_rules WHERE environment = 'SANDBOX' AND enabled AND effective_to IS NULL")"
expected='sandbox-default/PAYOUT=75 sandbox-default/SETTLEMENT=0 sandbox-reference/PAYOUT=75 sandbox-reference/SETTLEMENT=200'
[ "$matrix" = "$expected" ] \
  && echo "  ✓ $matrix" \
  || { say_fail "matrix is not canonical"; echo "      expected: $expected" >&2; echo "      actual:   $matrix" >&2; }

profiles="$(psql "$TARGET_URL" -Atc "SELECT count(*) FROM pricing_profiles WHERE enabled")"
[ "$profiles" = "2" ] \
  && echo "  ✓ exactly 2 enabled pricing profiles" \
  || say_fail "$profiles enabled pricing profiles — the seed creates 2"

wildcards="$(psql "$TARGET_URL" -Atc "
  SELECT count(*) FROM pricing_rules
   WHERE enabled AND (pricing_operation IS NULL OR pricing_profile IS NULL)")"
[ "$wildcards" = "0" ] \
  && echo "  ✓ no enabled rule leaves an axis unnamed" \
  || say_fail "$wildcards enabled rules name no operation or no profile"

echo ""
if [ "$fail" = "0" ]; then
  echo "✓ FRESH MIGRATION CHECK PASSED — the chain reproduces the intended schema from nothing"
else
  echo "✗ FRESH MIGRATION CHECK FAILED — the schema is not reproducible from source" >&2
  exit 1
fi
