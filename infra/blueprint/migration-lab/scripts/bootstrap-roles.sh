#!/usr/bin/env bash
# Banzami Increment 2C — owner-session role bootstrap (runs in-container, superuser).
#
# Establishes the approved 2A role model on the disposable migration database and a
# controlled owner-session so canonical migrations apply AS the stable schema owner:
#   - stable schema owner : NOLOGIN, owns the migration target schemas/objects
#   - runtime application  : LOGIN, restricted, owns nothing
#   - control-plane        : LOGIN, restricted, NOT the runtime role; granted owner
#                            MEMBERSHIP + automatic `SET ROLE` to the owner so that
#                            objects it creates during migration are owned by the owner
# No blanket privilege grants. No superuser is used to APPLY migrations (superuser here only creates
# the roles and transfers ownership of the pre-existing empty `public` schema — it
# never pre-creates any migration object).
set -euo pipefail

SUPER_FILE="/run/secrets/ml_superuser"
CONTROL_FILE="/run/secrets/ml_control"
for f in "$SUPER_FILE" "$CONTROL_FILE"; do
  [ -f "$f" ] && [ ! -L "$f" ] || { echo "bootstrap: secret $f missing/not-regular" >&2; exit 3; }
done
: "${PGHOST:?}" "${PGPORT:?}" "${ML_ADMIN_USER:?}" "${ML_DB:?}"

PGPASSFILE="$(mktemp)"; export PGPASSFILE; chmod 600 "$PGPASSFILE"
trap 'rm -f "$PGPASSFILE" 2>/dev/null || true' EXIT INT TERM
printf '%s:%s:*:%s:%s\n' "$PGHOST" "$PGPORT" "$ML_ADMIN_USER" "$(cat "$SUPER_FILE")" > "$PGPASSFILE"
export PGHOST PGPORT PGDATABASE="$ML_DB" PGUSER="$ML_ADMIN_USER"
ML_CONTROL_PW="$(cat "$CONTROL_FILE")"; export ML_CONTROL_PW

echo "bootstrap: establishing owner-session role model on disposable migration db"

psql -v ON_ERROR_STOP=1 --no-psqlrc -q <<'SQL'
\getenv control_pw ML_CONTROL_PW

-- stable schema owner: NOLOGIN, not a runtime/migration login identity
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='bl_schema_owner') THEN
    CREATE ROLE bl_schema_owner NOLOGIN;
  END IF;
END $$;

-- runtime application role: LOGIN, least privilege, owns nothing
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='bl_app_runtime') THEN
    CREATE ROLE bl_app_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END $$;

-- control-plane role: LOGIN, restricted, distinct from the runtime role
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='bl_control_plane') THEN
    CREATE ROLE bl_control_plane LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END $$;
ALTER ROLE bl_control_plane PASSWORD :'control_pw';

-- owner-session: control-plane may act AS the owner and does so automatically
GRANT bl_schema_owner TO bl_control_plane;
ALTER ROLE bl_control_plane IN DATABASE blueprint_migration_lab SET role = 'bl_schema_owner';

-- minimum privileges for the OWNER to build the canonical schema set (no superuser).
-- Transfer ownership of the pre-existing empty public schema (NOT a migration object)
-- and allow the owner to create the migration-declared schemas.
ALTER SCHEMA public OWNER TO bl_schema_owner;
GRANT CREATE, CONNECT ON DATABASE blueprint_migration_lab TO bl_schema_owner;
GRANT CONNECT ON DATABASE blueprint_migration_lab TO bl_control_plane;

-- runtime role: connect only; never an owner, never an administrator
GRANT CONNECT ON DATABASE blueprint_migration_lab TO bl_app_runtime;
SQL

echo "bootstrap: owner-session role model established OK"
