#!/usr/bin/env bash
# Banzami Environment Blueprint — one-shot role-bootstrap job (Increment 2A)
#
# Runs INSIDE a disposable postgres-image container on the isolated lab network.
# Proves the Blueprint role model at runtime: a stable schema owner (NOLOGIN), a
# minimal runtime application role (LOGIN), and an isolated control-plane role
# (LOGIN, reserved). Does NOT create the short-lived migration role (Increment 2D)
# and does NOT apply canonical migrations or application schema.
#
# The credential value is read ONLY from the read-only mounted secret files. It is
# never taken from argv, Compose environment, image args or labels, and is passed
# to psql via an in-container PGPASSFILE (path) and psql \getenv — never printed.
set -euo pipefail

PG_SUPER_FILE="/run/secrets/lab_pg_superuser"
RUNTIME_FILE="/run/secrets/lab_runtime_login"
CONTROL_FILE="/run/secrets/lab_control_login"

for f in "$PG_SUPER_FILE" "$RUNTIME_FILE" "$CONTROL_FILE"; do
  [ -f "$f" ] && [ ! -L "$f" ] || { echo "bootstrap: secret $f missing/not-regular — refusing" >&2; exit 3; }
done

: "${PGHOST:?}" "${PGPORT:?}" "${LAB_ADMIN_USER:?}" "${LAB_DB:?}"

# in-container-only pgpass built from the mounted superuser secret file (value
# read in-process, never echoed). PGPASSFILE is a path, not a secret.
PGPASSFILE="$(mktemp)"; export PGPASSFILE
chmod 600 "$PGPASSFILE"
cleanup() { rm -f "$PGPASSFILE" 2>/dev/null || true; }
trap cleanup EXIT INT TERM
printf '%s:%s:*:%s:%s\n' "$PGHOST" "$PGPORT" "$LAB_ADMIN_USER" "$(cat "$PG_SUPER_FILE")" > "$PGPASSFILE"

export PGHOST PGPORT PGDATABASE="$LAB_DB" PGUSER="$LAB_ADMIN_USER"
# role login secrets exported for psql \getenv (in-container only)
LAB_RUNTIME_PW="$(cat "$RUNTIME_FILE")"; export LAB_RUNTIME_PW
LAB_CONTROL_PW="$(cat "$CONTROL_FILE")"; export LAB_CONTROL_PW

echo "bootstrap: applying role model to disposable lab database"

psql -v ON_ERROR_STOP=1 --no-psqlrc -q <<'SQL'
\getenv runtime_pw LAB_RUNTIME_PW
\getenv control_pw LAB_CONTROL_PW

-- Idempotent within a fresh disposable db; guards make re-runs safe.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bl_schema_owner') THEN
    -- stable schema owner: NOLOGIN, not a runtime/migration identity
    CREATE ROLE bl_schema_owner NOLOGIN;
  END IF;
END $$;

-- runtime application role: LOGIN, least privilege, no ownership/administration
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bl_app_runtime') THEN
    CREATE ROLE bl_app_runtime LOGIN
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END $$;
ALTER ROLE bl_app_runtime PASSWORD :'runtime_pw';

-- control-plane role: LOGIN, isolated, reserved for future controlled lifecycle
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bl_control_plane') THEN
    CREATE ROLE bl_control_plane LOGIN
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END $$;
ALTER ROLE bl_control_plane PASSWORD :'control_pw';

-- synthetic schema + object OWNED BY the stable owner (never the runtime role)
CREATE SCHEMA IF NOT EXISTS app AUTHORIZATION bl_schema_owner;
SET ROLE bl_schema_owner;
CREATE TABLE IF NOT EXISTS app.synthetic_marker (id integer PRIMARY KEY, note text);
RESET ROLE;

-- minimal, explicit (non-ownership) access for the runtime role — no blanket privileges
GRANT USAGE ON SCHEMA app TO bl_app_runtime;
GRANT SELECT ON app.synthetic_marker TO bl_app_runtime;

-- control-plane role is NOT granted application access (kept isolated from runtime)
REVOKE ALL ON SCHEMA app FROM bl_control_plane;
SQL

echo "bootstrap: role model applied OK"
