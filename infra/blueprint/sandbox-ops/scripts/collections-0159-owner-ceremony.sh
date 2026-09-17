#!/usr/bin/env bash
# COLLECTIONS-PROTOCOL-AND-PRODUCT-001 — Sandbox migration 0158 → 0159 (collection
# create idempotency). ONE sanctioned owner ceremony. Run it ON the sandbox host
# (root@217.160.9.248) with a TTY:
#
#     ssh -t root@217.160.9.248 \
#       'bash /srv/banzami/src/infra/blueprint/sandbox-ops/scripts/collections-0159-owner-ceremony.sh'
#
# It uses ONLY the sanctioned controller (sandbox-release-package.sh +
# sandbox-migration.sh). No ad-hoc SQL, no operator-DB-URL bypass, no hand-written
# authz/receipt. It does NOT deploy Core (that follows, after 0159 verifies).
# Fail-closed: set -euo pipefail + an explicit pre-head guard + each script's own
# die/hold on revision/digest/target/authz/executor/lock/head/drift/receipt.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
cd "$REPO_ROOT"
S=infra/blueprint/sandbox-ops/scripts

echo "== repo =="
echo "  root=$REPO_ROOT"
echo "  HEAD=$(git rev-parse HEAD)"
[ -z "$(git status --porcelain)" ] || { echo "ABORT: worktree not clean (release build requires it)"; exit 1; }

echo "== read-only pre-check (fail closed unless head == 158) =="
PG="$(docker ps --format '{{.Names}}' | grep -m1 'bzsandbox-.*-postgres-1')"
[ -n "$PG" ] || { echo "ABORT: sandbox postgres container not found"; exit 1; }
H="$(docker exec "$PG" sh -c 'PGPASSWORD=$(cat /run/secrets/mi_superuser) psql -U sbadmin -d banzami_staging -tAc "SELECT max(version) FROM _sqlx_migrations"')"
echo "  pre-head=$H (expect 158)"
[ "$H" = "158" ] || { echo "ABORT: pre-head $H != 158"; exit 1; }
IDX="$(docker exec "$PG" sh -c 'PGPASSWORD=$(cat /run/secrets/mi_superuser) psql -U sbadmin -d banzami_staging -tAc "SELECT indexname FROM pg_indexes WHERE indexname='"'"'collections_idem_scope'"'"'"')"
[ -z "$IDX" ] || { echo "ABORT: collections_idem_scope already present — 0159 looks applied"; exit 1; }

echo "== 1-2. verified, secret-free release package from clean HEAD =="
bash "$S/sandbox-release-package.sh" build
bash "$S/sandbox-release-package.sh" verify

echo "== 3-5. controlled migration 158 -> 159 (plan -> apply -> governed verify) =="
bash "$S/sandbox-migration.sh" plan
bash "$S/sandbox-migration.sh" apply
bash "$S/sandbox-migration.sh" verify

echo "== 6. post-checks (read-only): head 159 + idem index present =="
H2="$(docker exec "$PG" sh -c 'PGPASSWORD=$(cat /run/secrets/mi_superuser) psql -U sbadmin -d banzami_staging -tAc "SELECT max(version) FROM _sqlx_migrations"')"
echo "  post-head=$H2 (expect 159)"
[ "$H2" = "159" ] || { echo "ABORT: post-head $H2 != 159"; exit 1; }
IDX2="$(docker exec "$PG" sh -c 'PGPASSWORD=$(cat /run/secrets/mi_superuser) psql -U sbadmin -d banzami_staging -tAc "SELECT indexname FROM pg_indexes WHERE indexname='"'"'collections_idem_scope'"'"'"')"
echo "  idem_index=$IDX2 (expect collections_idem_scope)"
[ "$IDX2" = "collections_idem_scope" ] || { echo "ABORT: collections_idem_scope missing after apply"; exit 1; }

echo "== 7. single-use cleanup of ceremony material =="
bash "$S/sandbox-migration.sh" clean

echo
echo "SANDBOX_0159_CEREMONY=DONE  (head 158 -> 159, idem index present, receipt consumed)"
echo "NEXT (Claude, not blocked): ./deploy.sh core-api-staging -> health -> runtime idempotency proof."
