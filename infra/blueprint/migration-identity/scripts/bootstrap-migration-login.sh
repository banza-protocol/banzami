#!/usr/bin/env bash
# Banzami Increment 2D — short-lived migration-login bootstrap (in-container, superuser).
#
# Establishes the final migration identity model on the disposable database:
#   - stable schema owner  : NOLOGIN, owns migration-created objects
#   - runtime application   : LOGIN, restricted, owns nothing, NOT an owner member
#   - control-plane         : LOGIN, restricted, owns nothing, NOT an owner member
#   - short-lived migration : LOGIN, restricted, CONNECTION LIMIT 1, VALID UNTIL <expiry>,
#                             the ONLY role granted owner MEMBERSHIP + automatic SET ROLE,
#                             so it applies canonical migrations AS the stable owner.
# No blanket privilege grants. Superuser only creates roles + transfers ownership of the
# pre-existing empty public schema (never pre-creates a migration object). Superuser never
# applies migrations. Runtime/control-plane are NOT owner members (cannot assume the owner).
set -euo pipefail
SUPER_FILE="/run/secrets/mi_superuser"; CONTROL_FILE="/run/secrets/mi_control"; MIG_FILE="/run/secrets/mi_migration"
for f in "$SUPER_FILE" "$CONTROL_FILE" "$MIG_FILE"; do
  [ -f "$f" ] && [ ! -L "$f" ] || { echo "bootstrap: secret $f missing/not-regular" >&2; exit 3; }
done
: "${PGHOST:?}" "${PGPORT:?}" "${MI_ADMIN_USER:?}" "${MI_DB:?}" "${MI_VALID_UNTIL:?}"

PGPASSFILE="$(mktemp)"; export PGPASSFILE; chmod 600 "$PGPASSFILE"
trap 'rm -f "$PGPASSFILE" 2>/dev/null || true' EXIT INT TERM
printf '%s:%s:*:%s:%s\n' "$PGHOST" "$PGPORT" "$MI_ADMIN_USER" "$(cat "$SUPER_FILE")" > "$PGPASSFILE"
export PGHOST PGPORT PGDATABASE="$MI_DB" PGUSER="$MI_ADMIN_USER"
MI_CONTROL_PW="$(cat "$CONTROL_FILE")"; export MI_CONTROL_PW
MI_MIGRATION_PW="$(cat "$MIG_FILE")"; export MI_MIGRATION_PW
# connection budget for the migration login: 1 for a plain migration (2D); 2 for the
# controlled path (2E) that HOLDS an advisory-lock session while sqlx migrates.
MI_CONN_LIMIT="${MI_CONN_LIMIT:-1}"; export MI_CONN_LIMIT
export MI_VALID_UNTIL

echo "bootstrap: establishing short-lived migration-login model on disposable db"

psql -v ON_ERROR_STOP=1 --no-psqlrc -q <<'SQL'
\getenv control_pw MI_CONTROL_PW
\getenv migration_pw MI_MIGRATION_PW
\getenv valid_until MI_VALID_UNTIL
\getenv conn_limit MI_CONN_LIMIT

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='bl_schema_owner') THEN
    CREATE ROLE bl_schema_owner NOLOGIN;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='bl_app_runtime') THEN
    CREATE ROLE bl_app_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='bl_control_plane') THEN
    CREATE ROLE bl_control_plane LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END $$;
ALTER ROLE bl_control_plane PASSWORD :'control_pw';

-- short-lived least-privilege migration login (single run only)
DROP ROLE IF EXISTS bl_migration;
CREATE ROLE bl_migration LOGIN
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
  CONNECTION LIMIT :conn_limit
  PASSWORD :'migration_pw'
  VALID UNTIL :'valid_until';

-- owner-session for the migration login ONLY: membership + automatic SET ROLE.
GRANT bl_schema_owner TO bl_migration;
ALTER ROLE bl_migration IN DATABASE blueprint_migration_lab SET role = 'bl_schema_owner';

-- minimum privileges for the OWNER to build the canonical schema set (no superuser).
ALTER SCHEMA public OWNER TO bl_schema_owner;
GRANT CREATE, CONNECT ON DATABASE blueprint_migration_lab TO bl_schema_owner;
GRANT CONNECT ON DATABASE blueprint_migration_lab TO bl_migration;
GRANT CONNECT ON DATABASE blueprint_migration_lab TO bl_app_runtime;
GRANT CONNECT ON DATABASE blueprint_migration_lab TO bl_control_plane;

-- runtime and control-plane are deliberately NOT members of the owner (cannot assume it).
SQL

echo "bootstrap: short-lived migration-login model established OK"
