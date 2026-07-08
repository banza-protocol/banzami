#!/usr/bin/env bash
# Banzami Environment Blueprint — Sandbox role/owner-session bootstrap (in-container, superuser).
#
# Establishes the approved role model on the Sandbox database (parameterised DB name):
#   - stable schema owner   : NOLOGIN, owns migration-created objects
#   - runtime application    : LOGIN, restricted, owns nothing, NOT an owner member
#   - control-plane          : LOGIN, restricted, owns nothing, NOT an owner member
#   - short-lived migration  : LOGIN, restricted, CONNECTION LIMIT, VALID UNTIL, sole owner member
# Same contract as the validated 2D model, parameterised for the Sandbox target (banzami_staging).
# No blanket grants; superuser only creates roles + transfers ownership of the empty public schema.
set -euo pipefail
SUPER_FILE="/run/secrets/mi_superuser"; CONTROL_FILE="/run/secrets/mi_control"; MIG_FILE="/run/secrets/mi_migration"; RUNTIME_FILE="/run/secrets/mi_runtime"
for f in "$SUPER_FILE" "$CONTROL_FILE" "$MIG_FILE" "$RUNTIME_FILE"; do
  [ -f "$f" ] && [ ! -L "$f" ] || { echo "bootstrap: secret $f missing/not-regular" >&2; exit 3; }
done
: "${PGHOST:?}" "${PGPORT:?}" "${MI_ADMIN_USER:?}" "${MI_DB:?}" "${MI_VALID_UNTIL:?}"
MI_CONN_LIMIT="${MI_CONN_LIMIT:-2}"; export MI_CONN_LIMIT

PGPASSFILE="$(mktemp)"; export PGPASSFILE; chmod 600 "$PGPASSFILE"
trap 'rm -f "$PGPASSFILE" 2>/dev/null || true' EXIT INT TERM
printf '%s:%s:*:%s:%s\n' "$PGHOST" "$PGPORT" "$MI_ADMIN_USER" "$(cat "$SUPER_FILE")" > "$PGPASSFILE"
export PGHOST PGPORT PGDATABASE="$MI_DB" PGUSER="$MI_ADMIN_USER"
MI_CONTROL_PW="$(cat "$CONTROL_FILE")"; export MI_CONTROL_PW
MI_MIGRATION_PW="$(cat "$MIG_FILE")"; export MI_MIGRATION_PW
MI_RUNTIME_PW="$(cat "$RUNTIME_FILE")"; export MI_RUNTIME_PW
export MI_VALID_UNTIL MI_DB

echo "bootstrap: establishing Sandbox role model on target database"

psql -v ON_ERROR_STOP=1 --no-psqlrc -q <<'SQL'
\getenv control_pw MI_CONTROL_PW
\getenv migration_pw MI_MIGRATION_PW
\getenv runtime_pw MI_RUNTIME_PW
\getenv valid_until MI_VALID_UNTIL
\getenv conn_limit MI_CONN_LIMIT
\getenv db_name MI_DB

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='bl_schema_owner') THEN CREATE ROLE bl_schema_owner NOLOGIN; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='bl_app_runtime') THEN CREATE ROLE bl_app_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS; END IF; END $$;
ALTER ROLE bl_app_runtime PASSWORD :'runtime_pw';
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='bl_control_plane') THEN CREATE ROLE bl_control_plane LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS; END IF; END $$;
ALTER ROLE bl_control_plane PASSWORD :'control_pw';

DROP ROLE IF EXISTS bl_migration;
CREATE ROLE bl_migration LOGIN
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
  CONNECTION LIMIT :conn_limit
  PASSWORD :'migration_pw'
  VALID UNTIL :'valid_until';

GRANT bl_schema_owner TO bl_migration;
ALTER ROLE bl_migration IN DATABASE :"db_name" SET role = 'bl_schema_owner';

ALTER SCHEMA public OWNER TO bl_schema_owner;
GRANT CREATE, CONNECT ON DATABASE :"db_name" TO bl_schema_owner;
GRANT CONNECT ON DATABASE :"db_name" TO bl_migration;
GRANT CONNECT ON DATABASE :"db_name" TO bl_app_runtime;
GRANT CONNECT ON DATABASE :"db_name" TO bl_control_plane;
SQL

echo "bootstrap: Sandbox role model established OK"
