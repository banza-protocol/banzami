#!/usr/bin/env bash
# Banzami Sandbox — database authority of every runtime identity (WALLET-NATIVE-001).
#
#   runtime-authority.sh apply    # roles, passwords, grants (one transaction), credential files
#   runtime-authority.sh verify   # the authority matrix, read from PostgreSQL; prints no secret
#
# Every service connects as its own role. Only bl_core_runtime may write a
# financial table; that is PostgreSQL privilege, not a connection name. The
# grants are db/authority/runtime-authority.sql, generated from the manifest by
# tools/db-authority.mjs, applied by the cluster superuser in ONE transaction —
# running services never observe a half-applied state.
#
# Credentials, all file-only and never printed:
#   secrets/mi_<role>                 one password per runtime role (root-only dir, minted once)
#   evidence/db_url_<service>         the connection string ONE service mounts (0644 inside a 0700 dir,
#                                     because the services run non-root — see sandbox-deploy.sh)
#   /root/.banzami/operator_db_url    bl_app_runtime, for operator tooling on this host; mounted into
#                                     no container, and without financial write authority
#
# Called by sandbox-migration.sh after every migration. Idempotent.
#
# --keep-legacy-dml (cutover only): also leaves bl_app_runtime its old DML, for the
# minutes between granting the new roles and redeploying the services onto them.
# A second `apply` without the flag removes it, and verify reports it.
set -euo pipefail

CMD="${1:-}"; shift || true
KEEP_LEGACY=0
for a in "$@"; do [ "$a" = "--keep-legacy-dml" ] && KEEP_LEGACY=1; done

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="${BZ_AUTHORITY_REPO:-$(cd "$HERE/../../../.." && pwd)}"
SQL="$REPO/db/authority/runtime-authority.sql"
VERIFY_SQL="$REPO/db/authority/verify-authority.sql"
[ -f "$SQL" ] && [ -f "$VERIFY_SQL" ] || { echo "runtime-authority: $SQL or $VERIFY_SQL missing" >&2; exit 3; }

die() { echo "runtime-authority: $*" >&2; exit 1; }

PGC="$(docker ps --format '{{.Names}}' | grep -E '^bzsandbox-.*-postgres-1$' | head -1)"
[ -n "$PGC" ] || die "no Sandbox postgres container"
PG_IMAGE="$(docker inspect -f '{{.Config.Image}}' "$PGC")"
NET="$(docker network ls --format '{{.Name}}' | grep -E '^bzsb-data-' | head -1)"
[ -n "$NET" ] || die "no Sandbox data network"
SEC="$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/run/secrets/mi_superuser"}}{{.Source}}{{end}}{{end}}' "$PGC" | xargs dirname)"
[ -f "$SEC/mi_superuser" ] || die "cannot locate the Sandbox secrets directory"
EV="$(dirname "$SEC")/evidence"
[ -d "$EV" ] || die "cannot locate the Sandbox evidence directory"

# role | credential file a service mounts ("" = operator tooling)
ROLES="bl_core_runtime|db_url_core
bl_gateway_runtime|db_url_gateway
bl_public_api_runtime|db_url_public_api
bl_developer_api_runtime|db_url_developer_api
bl_admin_api_runtime|db_url_admin_api
bl_app_runtime|"

# pg <extra docker args...> -- <psql args...>: psql as the superuser, inside the pinned image.
pg() {
  local docker_args=() ; while [ "$1" != "--" ]; do docker_args+=("$1"); shift; done; shift
  docker run --rm -i --network "$NET" -v "$SEC/mi_superuser:/run/secrets/mi_superuser:ro" "${docker_args[@]}" \
    --entrypoint sh "$PG_IMAGE" -c 'export PGPASSFILE=/tmp/pp; printf "postgres:5432:*:sbadmin:%s\n" "$(cat /run/secrets/mi_superuser)" > $PGPASSFILE; chmod 600 $PGPASSFILE; exec psql -h postgres -U sbadmin -d banzami_staging -v ON_ERROR_STOP=1 --no-psqlrc "$@"' psql "$@"
}

cmd_apply() {
  local mounts=() role file pw
  while IFS='|' read -r role file; do
    if [ "$role" = "bl_app_runtime" ]; then
      [ -s "$SEC/mi_runtime" ] || die "secrets/mi_runtime missing (the role bootstrap owns it)"
      mounts+=(-v "$SEC/mi_runtime:/run/secrets/bl_app_runtime:ro")
      continue
    fi
    if [ ! -s "$SEC/mi_$role" ]; then
      (umask 077; openssl rand -hex 32 | tr -d '\n' > "$SEC/mi_$role")
      echo "  minted password for $role"
    fi
    mounts+=(-v "$SEC/mi_$role:/run/secrets/$role:ro")
  done <<< "$ROLES"

  local passwords; passwords="$(mktemp)"; trap 'rm -f "$passwords"' RETURN
  {
    echo '-- LOGIN and one password per runtime role, read from files inside this container.'
    while IFS='|' read -r role file; do
      echo "\\set pw \`cat /run/secrets/$role\`"
      echo "ALTER ROLE $role LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'pw';"
    done <<< "$ROLES"
    echo '\unset pw'
    if [ "$KEEP_LEGACY" = 1 ]; then
      echo '-- CUTOVER ONLY: the services still connect as bl_app_runtime until they are redeployed.'
      for s in public developer account_identity; do
        echo "GRANT USAGE ON SCHEMA $s TO bl_app_runtime;"
        echo "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA $s TO bl_app_runtime;"
      done
    fi
  } > "$passwords"

  pg "${mounts[@]}" -v "$SQL:/authority.sql:ro" -v "$passwords:/passwords.sql:ro" -- \
    --single-transaction -q -f /authority.sql -f /passwords.sql >/dev/null \
    || die "authority apply failed (nothing changed: one transaction)"
  echo "  runtime_authority_applied PASS (grants + roles + passwords, one transaction${KEEP_LEGACY:+, legacy DML kept=$KEEP_LEGACY})"

  # One connection string per service, derived from its own password file.
  while IFS='|' read -r role file; do
    [ -n "$file" ] || continue
    printf 'postgresql://%s:%s@postgres:5432/banzami_staging' "$role" "$(cat "$SEC/mi_$role")" > "$EV/$file.tmp"
    chmod 0644 "$EV/$file.tmp"
    if [ -f "$EV/$file" ]; then cat "$EV/$file.tmp" > "$EV/$file"; rm -f "$EV/$file.tmp"; else mv "$EV/$file.tmp" "$EV/$file"; fi
  done <<< "$ROLES"
  install -d -m 0700 /root/.banzami
  (umask 077; printf 'postgresql://bl_app_runtime:%s@postgres:5432/banzami_staging' "$(cat "$SEC/mi_runtime")" > /root/.banzami/operator_db_url)
  echo "  credential_files_written PASS (evidence/db_url_<service>, /root/.banzami/operator_db_url)"
}

cmd_verify() {
  # Direct and indirect write authority, against the live catalog. Fails closed.
  if pg -v "$VERIFY_SQL:/verify.sql:ro" -- -q -f /verify.sql >/dev/null; then
    echo "DB_AUTHORITY_VERIFY=PASS (no direct or indirect financial write path for a non-Core role)"
  else
    echo "DB_AUTHORITY_VERIFY=FAIL"; return 1
  fi
  pg -- -At -F '|' <<'SQL'
\echo ROLE|LOGIN|SUPER|BYPASSRLS|FINANCIAL_WRITE_PRIVILEGES|TABLES_WRITABLE|SCHEMAS_READABLE
WITH fin(t) AS (VALUES ('ledger_accounts'),('ledger_postings'),('ledger_entries'),('wallets'),('consumer_wallets'),('wallet_accounts'),('wallet_account_transfers'),('wallet_reservations'),('wallet_payments'),('transfers'),('transactions'),('payment_sessions'),('payment_links'),('refunds'),('refund_events'),('restitution_allocations'),('acquiring_payments'),('acquiring_callbacks'),('consumer_deposits'),('payouts'),('app_settlements'),('settlements'),('operator_fees'),('split_sessions'),('split_contributions')),
roles AS (SELECT rolname, rolcanlogin, rolsuper, rolbypassrls FROM pg_roles WHERE rolname LIKE 'bl\_%' OR rolname = 'sbadmin')
SELECT r.rolname, r.rolcanlogin, r.rolsuper, r.rolbypassrls,
       (SELECT count(*) FROM fin, unnest(ARRAY['INSERT','UPDATE','DELETE','TRUNCATE']) p WHERE has_table_privilege(r.rolname, 'public.'||fin.t, p)),
       (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','developer','account_identity') AND c.relkind='r'
          AND (has_table_privilege(r.rolname, c.oid, 'INSERT') OR has_table_privilege(r.rolname, c.oid, 'UPDATE') OR has_table_privilege(r.rolname, c.oid, 'DELETE'))),
       (SELECT string_agg(nspname, ',') FROM pg_namespace WHERE nspname IN ('public','developer','account_identity') AND has_schema_privilege(r.rolname, nspname, 'USAGE'))
  FROM roles r ORDER BY 1;
\echo
\echo CONNECTIONS (who is connected, as what)
SELECT usename, application_name, count(*) FROM pg_stat_activity WHERE datname = 'banzami_staging' AND backend_type = 'client backend' GROUP BY 1, 2 ORDER BY 1, 2;
SQL
  echo
  echo "CONTAINER CREDENTIALS (mounted secret names; no values)"
  local c
  for c in $(docker ps --format '{{.Names}}' | grep -E '^bzsandbox-'); do
    printf '%s|%s\n' "${c#bzsandbox-*-*-*-}" "$(docker inspect -f '{{range .Mounts}}{{if eq (printf "%.13s" .Destination) "/run/secrets/"}}{{.Destination}} {{end}}{{end}}' "$c" | tr ' ' '\n' | sed 's#/run/secrets/##' | grep -E '^(db_url|mi_)' | tr '\n' ' ')"
  done
}

case "$CMD" in
  apply) cmd_apply ;;
  verify) cmd_verify ;;
  *) echo "usage: $0 apply [--keep-legacy-dml] | verify" >&2; exit 2 ;;
esac
