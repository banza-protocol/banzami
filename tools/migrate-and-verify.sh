#!/usr/bin/env bash
# migrate-and-verify.sh — the ONE sanctioned migration path for a financial Core rollout.
#
# This is NOT a standalone convenience script. It is the enforced rollout gate:
# deploy.sh (the manual deploy path, CLAUDE.md §19.4) and .github/workflows/ci.yml
# both invoke it and MUST abort if it exits non-zero. It encodes the mandatory
# sequence required before any Core financial deployment (Banzami ADR-034):
#
#   1. explicitly identify + log the target database / environment
#   2. sqlx migrate run                       (the only approved migration path)
#   3. introspect the LIVE physical schema
#   4. run the manifest-based drift detector  (authoritative)
#   5. FAIL (non-zero) on drift → the caller must not deploy the application
#
# A drift failure here is a HARD STOP: no application deployment may proceed until
# a forward-only repair migration closes the gap. History is never backfilled
# (tools/sqlx-backfill.sh is disabled — it is what caused the 0090–0095 drift).
#
# Usage:
#   DATABASE_URL=postgres://user:pass@host:port/db \
#   BANZAMI_DB_TARGET=banzami_staging \
#     bash tools/migrate-and-verify.sh
#
# Env:
#   DATABASE_URL              (required) the target database, reachable from here
#   BANZAMI_DB_TARGET         (required) human label for the target, logged + audited
#   I_ACK_PRODUCTION_TARGET   set to "yes" to permit a production-looking target
#
# Exit: 0 = migrated + manifest satisfied; 1 = drift (BLOCK); 2 = usage; 3 = prod guard.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MIGRATIONS="$REPO_ROOT/db/migrations"
MANIFEST="$REPO_ROOT/tools/schema-manifest.json"
INTROSPECT="$REPO_ROOT/tools/introspect-schema.sql"

: "${DATABASE_URL:?DATABASE_URL is required — the explicit target database}"
: "${BANZAMI_DB_TARGET:?BANZAMI_DB_TARGET is required — the human label for the target (e.g. banzami_staging)}"

for bin in sqlx psql node; do
  command -v "$bin" >/dev/null 2>&1 || { echo "✗ required tool not found: $bin" >&2; exit 2; }
done

# ── Step 1: identify + log the target (never emit the password) ──────────────
safe_url="$(printf '%s' "$DATABASE_URL" | sed -E 's#(://[^:/]+:)[^@]*@#\1***@#')"
db_name="$(printf '%s' "$DATABASE_URL" | sed -E 's#.*/([^/?]+)(\?.*)?$#\1#')"
echo "────────────────────────────────────────────────────────────"
echo "  ROLLOUT GATE — migrate-and-verify"
echo "  target label : $BANZAMI_DB_TARGET"
echo "  database     : $db_name"
echo "  DATABASE_URL : $safe_url"
echo "  migrations   : $MIGRATIONS"
echo "  manifest     : $MANIFEST"
echo "────────────────────────────────────────────────────────────"

# Production guard: refuse a production-looking target unless explicitly acknowledged.
if printf '%s\n' "$db_name $BANZAMI_DB_TARGET" | grep -qiE 'prod|banzami_live'; then
  if [ "${I_ACK_PRODUCTION_TARGET:-}" != "yes" ]; then
    echo "✗ target looks like PRODUCTION ('$db_name' / '$BANZAMI_DB_TARGET')." >&2
    echo "  Set I_ACK_PRODUCTION_TARGET=yes to proceed intentionally." >&2
    exit 3
  fi
  echo "  ⚠ PRODUCTION target explicitly acknowledged."
fi

# ── Step 2: sqlx migrate run (the only approved migration path) ──────────────
echo "── [2/4] sqlx migrate run ──"
( cd "$REPO_ROOT" && sqlx migrate run --source "$MIGRATIONS" )

# ── Step 3: introspect the live physical schema ─────────────────────────────
echo "── [3/4] introspect live schema ──"
inv="$(mktemp -t banzami-inv.XXXXXX)"
trap 'rm -f "$inv"' EXIT
psql "$DATABASE_URL" -tAc "$(cat "$INTROSPECT")" > "$inv"

# ── Step 4: manifest drift detector (authoritative gate) ────────────────────
echo "── [4/4] schema-manifest drift detector ──"
if ! node "$REPO_ROOT/tools/check-schema-manifest.mjs" "$MANIFEST" "$inv"; then
  echo "" >&2
  echo "✗ ROLLOUT GATE FAILED on '$BANZAMI_DB_TARGET' ($db_name): schema drift." >&2
  echo "  DEPLOYMENT BLOCKED. Write a forward-only repair migration; do not backfill." >&2
  exit 1
fi

echo ""
echo "✓ ROLLOUT GATE PASSED — '$BANZAMI_DB_TARGET' ($db_name): migrations applied, manifest satisfied."
