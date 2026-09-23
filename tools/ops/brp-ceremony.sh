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
# Capture the remote status before printing: with set -e a failed sanctioned
# verify aborts the ceremony here, instead of a `| tail` swallowing its verdict.
AUTHV="$(ssh "$VM" "BZ_AUTHORITY_REPO=/root/brp-ceremony bash /root/brp-ceremony/runtime-authority.sh verify")"
printf '%s\n' "$AUTHV" | tail -8 | sed 's/^/    /'
# Robust read-only verify: ship the SQL as a file (a quoted heredoc), so nested
# ssh→docker→psql quoting cannot mangle the string literals, then pipe it into psql
# on the VM via stdin. Grants first (gateway writes; public-api does not), then schema.
VSQL="$(mktemp "${TMPDIR:-/tmp}/brp-verify.XXXXXX.sql")"
cat > "$VSQL" <<'SQL'
select 'gw_mints_INSERT='   || has_table_privilege('bl_gateway_runtime','business_receive_point_mints','INSERT')::text;
select 'gw_mints_UPDATE='   || has_table_privilege('bl_gateway_runtime','business_receive_point_mints','UPDATE')::text;
select 'gw_points_INSERT='  || has_table_privilege('bl_gateway_runtime','business_receive_points','INSERT')::text;
select 'gw_points_UPDATE='  || has_table_privilege('bl_gateway_runtime','business_receive_points','UPDATE')::text;
select 'papi_mints_INSERT=' || has_table_privilege('bl_public_api_runtime','business_receive_point_mints','INSERT')::text;
select 'tables='  || count(*)::text from pg_tables  where tablename in ('business_receive_points','business_receive_point_mints');
select 'indexes=' || count(*)::text from pg_indexes where indexname in ('uq_business_receive_points_slug','uq_business_receive_points_one_active','uq_business_receive_point_mints_scope','uq_business_receive_point_mints_core_reference');
select 'terms_col=' || count(*)::text from information_schema.columns where table_name='merchant_applications' and column_name='terms_version';
SQL
scp -q "$VSQL" "$VM:/tmp/brp-verify.sql"
rm -f "$VSQL"
V="$(ssh "$VM" "docker exec -i $PG sh -c 'PGPASSWORD=\$(cat /run/secrets/mi_superuser) psql -U sbadmin -d banzami_staging -tA' < /tmp/brp-verify.sql; rm -f /tmp/brp-verify.sql" | tr -d '[:space:]')"
echo "  $V" | tr ';' '\n' | sed 's/^/    /'
grep -q 'gw_mints_INSERT=true'  <<<"$V" && grep -q 'gw_mints_UPDATE=true'  <<<"$V" \
  && grep -q 'gw_points_INSERT=true' <<<"$V" && grep -q 'gw_points_UPDATE=true' <<<"$V" \
  || { echo "✗ gateway cannot write the receive-point tables"; exit 1; }
grep -q 'papi_mints_INSERT=false' <<<"$V" || { echo "✗ public-api unexpectedly has write on a receive-point table"; exit 1; }
grep -q 'tables=2' <<<"$V" && grep -q 'indexes=4' <<<"$V" && grep -q 'terms_col=1' <<<"$V" \
  || { echo "✗ schema objects missing (want tables=2 indexes=4 terms_col=1)"; exit 1; }
echo "  gateway_writes=OK · public_api_no_write=OK · schema 2/4/1 ✓"

echo
echo "✓ CEREMONY COMPLETE — migrations 0153/0154/0155 applied, runtime authority granted, verified."
echo "  No application was deployed. The assistant continues from here (deploy + smoke + live E2E)."
