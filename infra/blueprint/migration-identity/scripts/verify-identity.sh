#!/usr/bin/env bash
# Banzami Increment 2D — ownership + privilege-separation verifier (in-container, superuser RO).
# Emits sanitised VERIFY/OWNERSHIP/PRIV lines with counts/booleans only. Runs while the
# short-lived migration login still exists (removal is proven separately by the orchestrator).
set -euo pipefail
SUPER_FILE="/run/secrets/mi_superuser"
: "${EXPECT_COUNT:?}" "${EXPECT_MAXVER:?}"
PGHOST=postgres PGPORT=5432 PGUSER=miadmin PGDATABASE=blueprint_migration_lab
export PGHOST PGPORT PGUSER PGDATABASE
PGPASSFILE="$(mktemp)"; export PGPASSFILE; chmod 600 "$PGPASSFILE"
printf '%s:%s:*:%s:%s\n' "$PGHOST" "$PGPORT" "$PGUSER" "$(cat "$SUPER_FILE")" > "$PGPASSFILE"
trap 'rm -f "$PGPASSFILE" 2>/dev/null || true' EXIT INT TERM
fail=0
q() { psql -tAc "$1" 2>/dev/null | tr -d '[:space:]'; }
rep() { printf '%-10s %-38s %s\n' "$1" "$2" "$3"; [ "$3" = PASS ] || fail=1; }
APP="nspname NOT IN ('pg_catalog','information_schema','pg_toast') AND nspname NOT LIKE 'pg_temp%'"

# ---- integrity ----
[ "$(q "SELECT count(*) FROM _sqlx_migrations")" = "$EXPECT_COUNT" ] && rep VERIFY applied_count_matches PASS || rep VERIFY applied_count_matches FAIL
[ "$(q "SELECT max(version) FROM _sqlx_migrations")" = "$EXPECT_MAXVER" ] && rep VERIFY latest_level_matches PASS || rep VERIFY latest_level_matches FAIL
[ "$(q "SELECT count(*) FROM _sqlx_migrations WHERE success IS DISTINCT FROM true")" = "0" ] && rep VERIFY no_unsuccessful PASS || rep VERIFY no_unsuccessful FAIL

# ---- ownership: stable owner owns everything; no foreign role owns app objects ----
[ "$(q "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE $APP AND c.relkind IN ('r','v','m','S','p','i') AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype='e') AND c.relowner<>'bl_schema_owner'::regrole")" = "0" ] \
  && rep OWNERSHIP relations_owned_by_stable_owner PASS || rep OWNERSHIP relations_owned_by_stable_owner FAIL
[ "$(q "SELECT count(*) FROM pg_namespace n WHERE $APP AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_namespace'::regclass AND d.objid=n.oid AND d.deptype='e') AND n.nspowner<>'bl_schema_owner'::regrole")" = "0" ] \
  && rep OWNERSHIP schemas_owned_by_stable_owner PASS || rep OWNERSHIP schemas_owned_by_stable_owner FAIL
[ "$(q "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE $APP AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e') AND p.proowner<>'bl_schema_owner'::regrole")" = "0" ] \
  && rep OWNERSHIP routines_owned_by_stable_owner PASS || rep OWNERSHIP routines_owned_by_stable_owner FAIL
[ "$(q "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE $APP AND c.relkind IN ('r','v','m','S','p') AND c.relowner IN ('bl_app_runtime'::regrole,'bl_control_plane'::regrole,'bl_migration'::regrole,'miadmin'::regrole)")" = "0" ] \
  && rep OWNERSHIP no_foreign_role_owns_objects PASS || rep OWNERSHIP no_foreign_role_owns_objects FAIL
[ "$(q "SELECT relowner='bl_schema_owner'::regrole FROM pg_class WHERE oid='public._sqlx_migrations'::regclass")" = "t" ] \
  && rep OWNERSHIP metadata_owned_by_stable_owner PASS || rep OWNERSHIP metadata_owned_by_stable_owner FAIL
[ "$(q "SELECT count(*)>0 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE $APP AND c.relkind='r' AND c.relowner='bl_schema_owner'::regrole")" = "t" ] \
  && rep OWNERSHIP stable_owner_owns_tables PASS || rep OWNERSHIP stable_owner_owns_tables FAIL

# ---- short-lived migration login privilege attributes ----
[ "$(q "SELECT (NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls AND rolcanlogin) FROM pg_roles WHERE rolname='bl_migration'")" = "t" ] \
  && rep PRIV migration_login_least_privilege PASS || rep PRIV migration_login_least_privilege FAIL
[ "$(q "SELECT rolconnlimit FROM pg_roles WHERE rolname='bl_migration'")" = "1" ] && rep PRIV migration_login_conn_limit_1 PASS || rep PRIV migration_login_conn_limit_1 FAIL
[ "$(q "SELECT (rolvaliduntil IS NOT NULL AND rolvaliduntil > now()) FROM pg_roles WHERE rolname='bl_migration'")" = "t" ] \
  && rep PRIV migration_login_valid_until_set PASS || rep PRIV migration_login_valid_until_set FAIL

# ---- separation: ONLY the migration login is a member of the stable owner ----
[ "$(q "SELECT count(*) FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.roleid WHERE r.rolname='bl_schema_owner' AND m.member IN ('bl_app_runtime'::regrole,'bl_control_plane'::regrole)")" = "0" ] \
  && rep PRIV runtime_control_not_owner_members PASS || rep PRIV runtime_control_not_owner_members FAIL
[ "$(q "SELECT count(*) FROM pg_auth_members m JOIN pg_roles o ON o.oid=m.roleid JOIN pg_roles mm ON mm.oid=m.member WHERE o.rolname='bl_schema_owner' AND mm.rolname='bl_migration'")" = "1" ] \
  && rep PRIV migration_login_is_owner_member PASS || rep PRIV migration_login_is_owner_member FAIL
# stable owner is NOLOGIN
[ "$(q "SELECT NOT rolcanlogin FROM pg_roles WHERE rolname='bl_schema_owner'")" = "t" ] && rep PRIV stable_owner_nologin PASS || rep PRIV stable_owner_nologin FAIL

echo "VERIFY_IDENTITY_RESULT: $([ "$fail" -eq 0 ] && echo PASS || echo FAIL)"
exit "$fail"
