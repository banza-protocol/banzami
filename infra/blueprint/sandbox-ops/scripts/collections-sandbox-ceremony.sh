#!/usr/bin/env bash
# COLLECTIONS-PROTOCOL-AND-PRODUCT-001 — Sandbox migration ceremony (owner-run).
#
# Applies the tracked collections migrations 0156-0158 to banzami_staging through the
# ONLY controlled path (sandbox-release-package -> sandbox-migration), restarts Core,
# and verifies enablement. Fail-closed. NO ad-hoc SQL, NO operator-DB-URL bypass, and
# it deliberately NEVER runs sandbox-bootstrap (that is create-only and its teardown
# wipes the PG volume — the live bzsandbox project is reused, never rebuilt).
#
# MUST be run ON THE SANDBOX HOST, where the bzsandbox docker project + /run/secrets
# live, from a clean checkout of this repo.
#
#   ./collections-sandbox-ceremony.sh            # interactive: pauses for you to type APPLY
#   ./collections-sandbox-ceremony.sh --yes      # non-interactive apply
#   ./collections-sandbox-ceremony.sh --plan-only # build + plan + verify gates, no apply
set -euo pipefail

EXPECTED_DIGEST="ba3a90c50f8b43fee51761aa90c4d136cf7467ba826f65c885312e607e1f8a56"
MODE="interactive"
case "${1:-}" in
  --yes) MODE="yes" ;;
  --plan-only) MODE="plan-only" ;;
  "") : ;;
  *) echo "usage: $0 [--yes|--plan-only]" >&2; exit 2 ;;
esac

say()  { printf '\n\033[1m== %s ==\033[0m\n' "$1"; }
die()  { printf '\n\033[31mceremony: ABORTED — %s\033[0m\n' "$1" >&2; exit 1; }

# --- locate the repo root ---------------------------------------------------------
REPO="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[ -n "$REPO" ] || die "run this from inside the banzami git checkout"
cd "$REPO"
S="infra/blueprint/sandbox-ops/scripts"
[ -f "$S/sandbox-release-package.sh" ] && [ -f "$S/sandbox-migration.sh" ] \
  || die "sandbox-ops scripts not found under $S (wrong repo?)"

# --- preflight: this must be the Sandbox host -------------------------------------
say "preflight"
command -v docker >/dev/null 2>&1 || die "docker not available — run on the Sandbox host"
PG="$(docker ps --format '{{.Names}}' 2>/dev/null | grep -m1 'bzsandbox-.*-postgres-1' || true)"
[ -n "$PG" ] || die "the bzsandbox postgres container is not visible via 'docker ps' — run this ON THE SANDBOX HOST, not your laptop"
echo "  sandbox postgres container: $PG"

# --- worktree + revision + digest gates -------------------------------------------
say "repo + digest gates"
[ -z "$(git status --porcelain)" ] || die "worktree not clean (the release package build requires a clean tree)"
REV="$(git rev-parse HEAD)"
[ "${#REV}" -eq 40 ] || die "could not resolve a full HEAD revision"
echo "  source_revision (HEAD): $REV"
DIGEST="$(cat $(ls db/migrations/*.sql | sort) | shasum -a 256 | awk '{print $1}')"
echo "  migration digest       : $DIGEST"
[ "$DIGEST" = "$EXPECTED_DIGEST" ] \
  || die "migration digest mismatch (got $DIGEST, expected $EXPECTED_DIGEST) — wrong tree/revision"
ls db/migrations/0156_collections.sql db/migrations/0157_payment_intents.sql db/migrations/0158_collection_shares.sql >/dev/null 2>&1 \
  || die "0156-0158 not present in db/migrations"

# --- read-only pre-head check (expect 0155) ---------------------------------------
say "sandbox pre-ceremony head (read-only, expect 155)"
PRE_HEAD="$(docker exec "$PG" sh -c 'PGPASSWORD=$(cat /run/secrets/mi_superuser) psql -U sbadmin -d banzami_staging -tAc "SELECT max(version) FROM _sqlx_migrations"' | tr -d '[:space:]')"
echo "  _sqlx_migrations head: ${PRE_HEAD:-<none>}"
[ "$PRE_HEAD" = "155" ] || die "unexpected pre-ceremony head '${PRE_HEAD}' (expected 155) — stopping"

# --- build the verified release package -------------------------------------------
say "release package build"
bash "$S/sandbox-release-package.sh" build
bash "$S/sandbox-release-package.sh" verify

# --- controlled migration: plan (dry, fail-closed gate) ---------------------------
say "migration plan (dry gate — review it)"
bash "$S/sandbox-migration.sh" plan

if [ "$MODE" = "plan-only" ]; then
  say "plan-only: stopping before apply (no writes performed)"
  exit 0
fi

# --- confirmation before the real apply -------------------------------------------
if [ "$MODE" = "interactive" ]; then
  printf '\nAbout to APPLY migrations 0156-0158 to banzami_staging (%s).\nType APPLY to proceed: ' "$REV"
  read -r ans
  [ "$ans" = "APPLY" ] || die "not confirmed"
fi

# --- apply + verify ----------------------------------------------------------------
say "migration apply"
bash "$S/sandbox-migration.sh" apply
say "migration verify"
bash "$S/sandbox-migration.sh" verify

# --- restart Core to clear the collections_available() OnceCell -------------------
say "restart core-api-staging (clears collections_available cache)"
CORE="$(docker ps --format '{{.Names}}' | grep -m1 core-api-staging || true)"
[ -n "$CORE" ] || die "core-api-staging container not found"
docker restart "$CORE" >/dev/null
echo "  restarted: $CORE"
# give Core a moment to come back
for i in $(seq 1 20); do
  st="$(docker inspect -f '{{.State.Health.Status}}' "$CORE" 2>/dev/null || echo unknown)"
  [ "$st" = "healthy" ] && break
  sleep 3
done
echo "  core health: ${st:-unknown}"

# --- read-only enablement verification --------------------------------------------
say "post-ceremony verification (read-only)"
docker exec -i "$PG" sh -c 'PGPASSWORD=$(cat /run/secrets/mi_superuser) psql -U sbadmin -d banzami_staging -tA' <<'SQL'
SELECT 'head='||max(version) FROM _sqlx_migrations;
SELECT 'collections='||to_regclass('public.collections');
SELECT 'payment_intents='||to_regclass('public.payment_intents');
SELECT 'collection_shares='||to_regclass('public.collection_shares');
SQL

POST_HEAD="$(docker exec "$PG" sh -c 'PGPASSWORD=$(cat /run/secrets/mi_superuser) psql -U sbadmin -d banzami_staging -tAc "SELECT max(version) FROM _sqlx_migrations"' | tr -d '[:space:]')"
[ "$POST_HEAD" = "158" ] || die "post-ceremony head '${POST_HEAD}' != 158"

# --- single-use ceremony state cleanup --------------------------------------------
say "clean ceremony state"
bash "$S/sandbox-migration.sh" clean

printf '\n\033[32mCOLLECTIONS SANDBOX CEREMONY OK — head=158, collections schema present, Core restarted.\033[0m\n'
printf 'Next: POST /v1/collections should return 201 (not 503 COLLECTIONS_UNAVAILABLE).\n'
