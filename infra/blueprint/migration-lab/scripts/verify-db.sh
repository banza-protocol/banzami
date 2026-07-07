#!/usr/bin/env bash
# Banzami Increment 2C — migration integrity + ownership verifier (runs in-container).
#
# Connects read-only as the superuser to inspect catalog metadata ONLY (never to
# apply migrations). Emits sanitised VERIFY/OWNERSHIP PASS/FAIL lines with counts —
# never object names, role names, URLs or the credential.
set -euo pipefail
SUPER_FILE="/run/secrets/ml_superuser"
: "${EXPECT_COUNT:?}" "${EXPECT_MAXVER:?}"
PGHOST=postgres PGPORT=5432 PGUSER=mladmin PGDATABASE=blueprint_migration_lab
export PGHOST PGPORT PGUSER PGDATABASE
PGPASSFILE="$(mktemp)"; export PGPASSFILE; chmod 600 "$PGPASSFILE"
printf '%s:%s:*:%s:%s\n' "$PGHOST" "$PGPORT" "$PGUSER" "$(cat "$SUPER_FILE")" > "$PGPASSFILE"
trap 'rm -f "$PGPASSFILE" 2>/dev/null || true' EXIT INT TERM

fail=0
q() { psql -tAc "$1" 2>/dev/null | tr -d '[:space:]'; }
rep() { printf '%-12s %-34s %s\n' "$1" "$2" "$3"; [ "$3" = PASS ] || fail=1; }

# 1. migration metadata table exists
[ "$(q "SELECT to_regclass('public._sqlx_migrations') IS NOT NULL")" = "t" ] \
  && rep VERIFY metadata_table_exists PASS || rep VERIFY metadata_table_exists FAIL

# 2/3. applied count == discovered canonical count; each version once (no dupes)
APPLIED="$(q "SELECT count(*) FROM _sqlx_migrations")"
[ "$APPLIED" = "$EXPECT_COUNT" ] && rep VERIFY applied_count_matches PASS || rep VERIFY applied_count_matches FAIL
[ "$(q "SELECT count(*) FROM (SELECT version FROM _sqlx_migrations GROUP BY version HAVING count(*)>1) d")" = "0" ] \
  && rep VERIFY each_version_once PASS || rep VERIFY each_version_once FAIL

# 4. applied highest level == discovered canonical highest level
[ "$(q "SELECT max(version) FROM _sqlx_migrations")" = "$EXPECT_MAXVER" ] \
  && rep VERIFY latest_level_matches PASS || rep VERIFY latest_level_matches FAIL

# 5. no migration recorded as not-successful (sqlx marks success=true)
[ "$(q "SELECT count(*) FROM _sqlx_migrations WHERE success IS DISTINCT FROM true")" = "0" ] \
  && rep VERIFY no_unsuccessful_migration PASS || rep VERIFY no_unsuccessful_migration FAIL

# 6. every applied migration has a checksum recorded (integrity material present)
[ "$(q "SELECT count(*) FROM _sqlx_migrations WHERE checksum IS NULL OR length(checksum)=0")" = "0" ] \
  && rep VERIFY all_checksums_present PASS || rep VERIFY all_checksums_present FAIL

# ---- ownership: every application object owned by the stable schema owner ----
# app namespaces = non-system, non-temp
APP_NS="nspname NOT IN ('pg_catalog','information_schema','pg_toast') AND nspname NOT LIKE 'pg_temp%' AND nspname NOT LIKE 'pg_toast_temp%'"
# non-extension application relations (tables/views/matviews/sequences/partitioned/indexes)
NONOWN_REL="$(q "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE $APP_NS AND c.relkind IN ('r','v','m','S','p','i')
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype='e')
    AND c.relowner <> 'bl_schema_owner'::regrole")"
[ "$NONOWN_REL" = "0" ] && rep OWNERSHIP relations_owned_by_stable_owner PASS || rep OWNERSHIP relations_owned_by_stable_owner FAIL

# application schemas owned by the stable owner (exclude system + extension schemas)
NONOWN_NS="$(q "SELECT count(*) FROM pg_namespace n WHERE $APP_NS
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_namespace'::regclass AND d.objid=n.oid AND d.deptype='e')
    AND n.nspowner <> 'bl_schema_owner'::regrole")"
[ "$NONOWN_NS" = "0" ] && rep OWNERSHIP schemas_owned_by_stable_owner PASS || rep OWNERSHIP schemas_owned_by_stable_owner FAIL

# application routines (functions/procedures) owned by the stable owner
NONOWN_PROC="$(q "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE $APP_NS
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e')
    AND p.proowner <> 'bl_schema_owner'::regrole")"
[ "$NONOWN_PROC" = "0" ] && rep OWNERSHIP routines_owned_by_stable_owner PASS || rep OWNERSHIP routines_owned_by_stable_owner FAIL

# application types (domains/enums/composites) owned by the stable owner
NONOWN_TYP="$(q "SELECT count(*) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
  WHERE $APP_NS AND t.typtype IN ('d','e')
    AND t.typowner <> 'bl_schema_owner'::regrole")"
[ "$NONOWN_TYP" = "0" ] && rep OWNERSHIP types_owned_by_stable_owner PASS || rep OWNERSHIP types_owned_by_stable_owner FAIL

# NO application object owned by runtime / control-plane / bootstrap superuser
FOREIGN="$(q "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE $APP_NS AND c.relkind IN ('r','v','m','S','p','i')
    AND c.relowner IN ('bl_app_runtime'::regrole,'bl_control_plane'::regrole,'mladmin'::regrole)")"
[ "$FOREIGN" = "0" ] && rep OWNERSHIP no_foreign_role_owns_objects PASS || rep OWNERSHIP no_foreign_role_owns_objects FAIL

# stable owner actually owns objects (non-empty proof the migrations created owned objects)
[ "$(q "SELECT count(*)>0 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE $APP_NS AND c.relkind='r' AND c.relowner='bl_schema_owner'::regrole")" = "t" ] \
  && rep OWNERSHIP stable_owner_owns_tables PASS || rep OWNERSHIP stable_owner_owns_tables FAIL

# metadata table owned by the stable owner
[ "$(q "SELECT relowner='bl_schema_owner'::regrole FROM pg_class WHERE oid='public._sqlx_migrations'::regclass")" = "t" ] \
  && rep OWNERSHIP metadata_owned_by_stable_owner PASS || rep OWNERSHIP metadata_owned_by_stable_owner FAIL

echo "VERIFY_DB_RESULT: $([ "$fail" -eq 0 ] && echo PASS || echo FAIL)"
exit "$fail"
