#!/usr/bin/env bash
# BUSINESS-RECEIVE-POINT-001 — ONE owner ceremony: migrate + runtime authority + verify.
# Fail-closed, self-cleaning, no application deploy. Run from ~/banzami on the Mac.
set -euo pipefail

VM=root@217.160.9.248
PORT=15432
CTRL="$(mktemp -u "${TMPDIR:-/tmp}/brp-tunnel.XXXXXX")"
cd ~/banzami

cleanup() {
  ssh -S "$CTRL" -O exit "$VM" 2>/dev/null || true      # tear the tunnel down
  rm -f "$CTRL" 2>/dev/null || true
  unset PW DATABASE_URL 2>/dev/null || true              # never leave the secret exported
}
trap cleanup EXIT

echo "── [0] discover the Sandbox postgres + clear any stale forward ──"
PG="$(ssh "$VM" "docker ps --format '{{.Names}}' | grep -E 'bzsandbox.*-postgres-1' | head -1")"
[ -n "$PG" ] || { echo "✗ no Sandbox postgres container"; exit 1; }
IP="$(ssh "$VM" "docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' $PG")"
pkill -f "ssh.*-L ${PORT}:" 2>/dev/null || true          # kill a residual tunnel from a prior run

echo "── [1] open a controlled tunnel (ExitOnForwardFailure, control socket) ──"
ssh -M -S "$CTRL" -fNT -o ExitOnForwardFailure=yes -L "${PORT}:${IP}:5432" "$VM"
PW="$(ssh "$VM" "docker exec $PG cat /run/secrets/mi_superuser" | tr -d '[:space:]')"
export DATABASE_URL="postgresql://sbadmin:${PW}@localhost:${PORT}/banzami_staging"

echo "── [2] MIGRATE (sanctioned gate: identity + sqlx migrate run + drift). Idempotent. ──"
BANZAMI_DB_TARGET=banzami_staging bash tools/migrate-and-verify.sh

echo "── [3] verify head = 155 (read-only, on the VM — no secret leaves the container) ──"
HEAD="$(ssh "$VM" "docker exec $PG sh -c 'PGPASSWORD=\$(cat /run/secrets/mi_superuser) psql -U sbadmin -d banzami_staging -tAc \"select max(version) from _sqlx_migrations\"'" | tr -d '[:space:]')"
[ "$HEAD" = "155" ] || { echo "✗ migration head is $HEAD, expected 155"; exit 1; }
echo "  head=155 ✓"

echo "── [4] RUNTIME AUTHORITY apply (staged, hash-verified; runs on the VM in one txn) ──"
ssh "$VM" "BZ_AUTHORITY_REPO=/root/brp-ceremony bash /root/brp-ceremony/runtime-authority.sh apply"

echo "── [5] verify runtime authority (read-only, sanctioned checker) ──"
ssh "$VM" "BZ_AUTHORITY_REPO=/root/brp-ceremony bash /root/brp-ceremony/runtime-authority.sh verify" | tail -8
GRANT="$(ssh "$VM" "docker exec $PG sh -c 'PGPASSWORD=\$(cat /run/secrets/mi_superuser) psql -U sbadmin -d banzami_staging -tAc \"select has_table_privilege(''bl_gateway_runtime'',''business_receive_point_mints'',''INSERT'') and has_table_privilege(''bl_gateway_runtime'',''business_receive_points'',''INSERT'')\"'" | tr -d '[:space:]')"
[ "$GRANT" = "t" ] || { echo "✗ gateway still cannot write the receive-point tables"; exit 1; }
echo "  gateway_can_write_receive_point_tables=t ✓"

echo "── [6] verify schema (tables + 4 invariant indexes + terms_version), read-only ──"
OBJ="$(ssh "$VM" "docker exec $PG sh -c 'PGPASSWORD=\$(cat /run/secrets/mi_superuser) psql -U sbadmin -d banzami_staging -tAc \"select (select count(*) from pg_tables where tablename in (''business_receive_points'',''business_receive_point_mints'')) || ''/'' || (select count(*) from pg_indexes where indexname in (''uq_business_receive_points_slug'',''uq_business_receive_points_one_active'',''uq_business_receive_point_mints_scope'',''uq_business_receive_point_mints_core_reference'')) || ''/'' || (select count(*) from information_schema.columns where table_name=''merchant_applications'' and column_name=''terms_version'')\"'" | tr -d '[:space:]')"
[ "$OBJ" = "2/4/1" ] || { echo "✗ schema objects = $OBJ, expected 2/4/1 (tables/indexes/column)"; exit 1; }
echo "  tables/indexes/column=2/4/1 ✓"

echo
echo "✓ CEREMONY COMPLETE — migrations 0153/0154/0155 applied, runtime authority granted, verified."
echo "  No application was deployed. The assistant continues from here (deploy + smoke + live E2E)."
