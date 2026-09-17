#!/usr/bin/env bash
# COLLECTIONS-PROTOCOL-AND-PRODUCT-001 — Sandbox migration ceremony (OWNER, interactive).
#
# Applies the tracked collections migrations 0156-0158 to banzami_staging via the ONLY
# sanctioned path: infra/deployment/rt04e-secure-rollout.sh in migration-only mode.
# That tool is deliberately un-automatable — it requires a direct interactive TTY, an
# exact authorisation phrase typed live, and the sanctioned migration credential pasted
# via a hidden prompt (never from env). NO ad-hoc SQL, NO operator-DB-URL bypass.
#
# RUN THIS ON THE SANDBOX HOST (VM), inside your own interactive SSH session:
#     ssh root@217.160.9.248         # a real TTY
#     bash /srv/banzami/src/infra/blueprint/sandbox-ops/scripts/collections-sandbox-ceremony.sh
#
# Prereqs (this script checks them, fail-closed): /srv/banzami/src is a clean git
# checkout whose db/migrations digest == the expected value; a backup exists (this
# script captures one). You will type the authorisation phrase and paste the sanctioned
# migration credential when rt04e-secure-rollout.sh prompts.
set -euo pipefail

EXPECTED_DIGEST="ba3a90c50f8b43fee51761aa90c4d136cf7467ba826f65c885312e607e1f8a56"
SRC="${BANZAMI_SRC:-/srv/banzami/src}"
BACKUP_DIR="${BANZAMI_BACKUP_DIR:-/root}"

say() { printf '\n\033[1m== %s ==\033[0m\n' "$1"; }
die() { printf '\n\033[31mceremony: ABORTED — %s\033[0m\n' "$1" >&2; exit 1; }

# --- must be the Sandbox host, with a real TTY (the rollout tool requires it) ---------
say "preflight (Sandbox host + interactive TTY)"
[ -t 0 ] || die "no interactive TTY — rt04e-secure-rollout.sh requires one; run this in a real 'ssh root@...' session, not piped"
command -v docker >/dev/null 2>&1 || die "docker not available — run on the Sandbox host"
PG="$(docker ps --format '{{.Names}}' 2>/dev/null | grep -m1 'bzsandbox-.*-postgres-1' || true)"
[ -n "$PG" ] || die "bzsandbox postgres not visible — run this ON THE SANDBOX HOST"
echo "  sandbox postgres: $PG"

# --- source checkout + digest gate ----------------------------------------------------
say "source + digest gate ($SRC)"
[ -d "$SRC/.git" ] || die "$SRC is not a git checkout — restore it first (git bundle/clone at the target revision)"
cd "$SRC"
[ -z "$(git status --porcelain)" ] || die "$SRC worktree not clean"
REV="$(git rev-parse HEAD)"; [ "${#REV}" -eq 40 ] || die "cannot resolve HEAD"
echo "  revision: $REV"
DIGEST="$(cat $(ls db/migrations/*.sql | sort) | shasum -a 256 | awk '{print $1}')"
[ "$DIGEST" = "$EXPECTED_DIGEST" ] || die "migration digest mismatch ($DIGEST != $EXPECTED_DIGEST)"
[ -f infra/deployment/rt04e-secure-rollout.sh ] || die "rt04e-secure-rollout.sh missing from $SRC"
echo "  digest OK: $DIGEST"

# --- read-only pre-head (expect 155) --------------------------------------------------
say "sandbox pre-head (read-only, expect 155)"
PRE="$(docker exec "$PG" sh -c 'PGPASSWORD=$(cat /run/secrets/mi_superuser) psql -U sbadmin -d banzami_staging -tAc "SELECT max(version) FROM _sqlx_migrations"' | tr -d '[:space:]')"
echo "  head: ${PRE:-<none>}"
[ "$PRE" = "155" ] || die "unexpected pre-head '$PRE' (expected 155)"

# --- REAL backup so RT04E_BACKUP_CONFIRMED is honest ----------------------------------
say "backup banzami_staging (pre-collections)"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
BK="$BACKUP_DIR/banzami_staging_pre_collections_${TS}.dump"
docker exec "$PG" sh -c 'PGPASSWORD=$(cat /run/secrets/mi_superuser) pg_dump -U sbadmin -Fc banzami_staging' > "$BK"
[ -s "$BK" ] || die "backup is empty — refusing to migrate without a real backup"
echo "  backup: $BK ($(du -h "$BK" | cut -f1))"

# --- the sanctioned interactive rollout (YOU type the phrase + paste the credential) --
say "rt04e-secure-rollout.sh (migration-only) — INTERACTIVE"
echo "  You will: (1) type the exact authorisation phrase, (2) paste the sanctioned"
echo "  banzami_staging migration credential at the hidden prompt. Nothing is built or"
echo "  replaced; forward-only migrate 0156->0158 + verify only."
RT04E_EXECUTION_MODE=migration-only \
  BANZAMI_DB_TARGET=banzami_staging \
  RT04E_RELEASE_REV="$REV" \
  RT04E_CHECKPOINT_CONFIRMED=yes \
  RT04E_CHECKPOINT_CAPTURED=yes \
  RT04E_BACKUP_CONFIRMED=yes \
  RT04E_MIGRATION_ACCESS_APPROVED=yes \
  bash infra/deployment/rt04e-secure-rollout.sh || die "rollout failed (nothing built/replaced) — see output above; restore from $BK if needed"

# --- restart Core (clear collections_available OnceCell) + verify ---------------------
say "restart core-api-staging"
CORE="$(docker ps --format '{{.Names}}' | grep -m1 core-api-staging || true)"
[ -n "$CORE" ] || die "core-api-staging not found"
docker restart "$CORE" >/dev/null; echo "  restarted: $CORE"
for i in $(seq 1 20); do st="$(docker inspect -f '{{.State.Health.Status}}' "$CORE" 2>/dev/null || echo unknown)"; [ "$st" = healthy ] && break; sleep 3; done
echo "  core health: ${st:-unknown}"

say "post-ceremony verification (read-only)"
docker exec -i "$PG" sh -c 'PGPASSWORD=$(cat /run/secrets/mi_superuser) psql -U sbadmin -d banzami_staging -tA' <<'SQL'
SELECT 'head='||max(version) FROM _sqlx_migrations;
SELECT 'collections='||to_regclass('public.collections');
SELECT 'payment_intents='||to_regclass('public.payment_intents');
SELECT 'collection_shares='||to_regclass('public.collection_shares');
SQL
POST="$(docker exec "$PG" sh -c 'PGPASSWORD=$(cat /run/secrets/mi_superuser) psql -U sbadmin -d banzami_staging -tAc "SELECT max(version) FROM _sqlx_migrations"' | tr -d '[:space:]')"
[ "$POST" = "158" ] || die "post-head '$POST' != 158"

printf '\n\033[32mCOLLECTIONS SANDBOX CEREMONY OK — head=158, collections schema present, Core restarted.\033[0m\n'
printf 'Tell Claude to continue: it will run the 452->226+226 lifecycle + acceptance matrix.\n'
