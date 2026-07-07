#!/usr/bin/env bash
# Banzami Environment Blueprint — role-model verifier (Increment 2A)
#
# Runs INSIDE a disposable postgres-image container on the isolated lab network.
# Asserts the Blueprint role contract at runtime and emits ONLY sanitised
# PASS/FAIL lines — never role passwords, SQL, raw rows, URLs, hosts or ports.
set -euo pipefail

PG_SUPER_FILE="/run/secrets/lab_pg_superuser"
RUNTIME_FILE="/run/secrets/lab_runtime_login"
: "${PGHOST:?}" "${PGPORT:?}" "${LAB_ADMIN_USER:?}" "${LAB_DB:?}"

fail=0
report() { # report <label> <PASS|FAIL>
  printf 'ROLE_CHECK %-34s %s\n' "$1" "$2"
  [ "$2" = PASS ] || fail=1
}

# superuser pgpass (in-container only)
SUPER_PASS="$(mktemp)"; chmod 600 "$SUPER_PASS"
printf '%s:%s:*:%s:%s\n' "$PGHOST" "$PGPORT" "$LAB_ADMIN_USER" "$(cat "$PG_SUPER_FILE")" > "$SUPER_PASS"
# runtime-role pgpass (in-container only) for negative capability tests
RUNTIME_PASS="$(mktemp)"; chmod 600 "$RUNTIME_PASS"
printf '%s:%s:*:%s:%s\n' "$PGHOST" "$PGPORT" "bl_app_runtime" "$(cat "$RUNTIME_FILE")" > "$RUNTIME_PASS"
cleanup() { rm -f "$SUPER_PASS" "$RUNTIME_PASS" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

# helper: run a scalar query as superuser, return trimmed value
q() { PGPASSFILE="$SUPER_PASS" psql -h "$PGHOST" -p "$PGPORT" -U "$LAB_ADMIN_USER" -d "$LAB_DB" \
        -tAc "$1" 2>/dev/null | tr -d '[:space:]'; }

# 1. stable schema owner is NOLOGIN
[ "$(q "SELECT rolcanlogin FROM pg_roles WHERE rolname='bl_schema_owner'")" = "f" ] \
  && report owner_is_nologin PASS || report owner_is_nologin FAIL

# 2. runtime role can log in but has no administrative capabilities
[ "$(q "SELECT rolcanlogin FROM pg_roles WHERE rolname='bl_app_runtime'")" = "t" ] \
  && report runtime_can_login PASS || report runtime_can_login FAIL
[ "$(q "SELECT (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls) FROM pg_roles WHERE rolname='bl_app_runtime'")" = "f" ] \
  && report runtime_no_admin_caps PASS || report runtime_no_admin_caps FAIL

# 3. runtime role owns neither the schema nor the synthetic object
[ "$(q "SELECT nspowner::regrole::text FROM pg_namespace WHERE nspname='app'")" = "bl_schema_owner" ] \
  && report schema_owned_by_stable_owner PASS || report schema_owned_by_stable_owner FAIL
[ "$(q "SELECT relowner::regrole::text FROM pg_class WHERE relname='synthetic_marker' AND relnamespace='app'::regnamespace")" = "bl_schema_owner" ] \
  && report object_owned_by_stable_owner PASS || report object_owned_by_stable_owner FAIL
[ "$(q "SELECT count(*) FROM pg_class WHERE relowner='bl_app_runtime'::regrole")" = "0" ] \
  && report runtime_owns_nothing PASS || report runtime_owns_nothing FAIL

# 4. control-plane role: LOGIN, restricted, and NOT granted app-schema access
[ "$(q "SELECT rolcanlogin FROM pg_roles WHERE rolname='bl_control_plane'")" = "t" ] \
  && report control_can_login PASS || report control_can_login FAIL
[ "$(q "SELECT (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls) FROM pg_roles WHERE rolname='bl_control_plane'")" = "f" ] \
  && report control_no_admin_caps PASS || report control_no_admin_caps FAIL
[ "$(q "SELECT has_schema_privilege('bl_control_plane','app','USAGE')")" = "f" ] \
  && report control_isolated_from_app PASS || report control_isolated_from_app FAIL

# 5. no application-style role is superuser (initial bootstrap identity not exposed)
[ "$(q "SELECT count(*) FROM pg_roles WHERE rolname IN ('bl_schema_owner','bl_app_runtime','bl_control_plane') AND rolsuper")" = "0" ] \
  && report no_app_role_is_superuser PASS || report no_app_role_is_superuser FAIL

# 6. NEGATIVE: runtime role cannot create a role or a database
if PGPASSFILE="$RUNTIME_PASS" psql -h "$PGHOST" -p "$PGPORT" -U bl_app_runtime -d "$LAB_DB" \
     -v ON_ERROR_STOP=1 -tAc "CREATE ROLE bl_should_not_exist NOLOGIN" >/dev/null 2>&1; then
  report runtime_cannot_create_role FAIL
else
  report runtime_cannot_create_role PASS
fi
if PGPASSFILE="$RUNTIME_PASS" psql -h "$PGHOST" -p "$PGPORT" -U bl_app_runtime -d "$LAB_DB" \
     -v ON_ERROR_STOP=1 -tAc "CREATE DATABASE bl_should_not_exist_db" >/dev/null 2>&1; then
  report runtime_cannot_create_db FAIL
else
  report runtime_cannot_create_db PASS
fi

echo "ROLE_VERIFY_RESULT: $([ "$fail" -eq 0 ] && echo PASS || echo FAIL)"
exit "$fail"
