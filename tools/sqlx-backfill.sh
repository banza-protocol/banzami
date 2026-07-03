#!/usr/bin/env bash
# =============================================================================
# DEPRECATED — DO NOT USE. RETIRED 2026-07-03.
#
# This tool records migrations as applied WITHOUT running their DDL. It is the
# root cause of the banzami_staging schema drift (0041/0043/0044/0047/0049/0050
# marked applied while their objects were physically absent). History backfill is
# BANNED for new environments and for repairs.
#
# The ONLY approved migration path is `sqlx migrate run` (checksum-verified),
# gated by the physical schema-manifest drift detector (tools/check-schema-manifest.mjs).
# Remediate drift with forward-only, idempotent repair migrations — never a backfill.
# =============================================================================
if [[ "${I_UNDERSTAND_BACKFILL_CAUSED_DRIFT:-}" != "1" ]]; then
  echo "sqlx-backfill.sh is DEPRECATED and disabled (it caused schema drift)." >&2
  echo "Use 'sqlx migrate run' + a forward-only repair migration instead." >&2
  exit 2
fi

# sqlx-backfill.sh — emit SQL that records the ACTIVE migrations in db/migrations/
# as already-applied in a database's _sqlx_migrations table, WITHOUT re-running them.
#
# Used once to adopt sqlx migration tracking on databases that were hand-applied
# before tracking existed (live `banzami`, sandbox `banzami_staging`). The target DB
# MUST already contain the full active schema, otherwise it would be recorded as
# migrated when it is not. After backfill, `sqlx migrate run` is a no-op and becomes
# the official mechanism going forward.
#
# sqlx semantics (verified against sqlx-cli 0.8.6): version = leading digits of the
# filename; description = the rest after the first '_' with '_' → ' ' and '.sql'
# stripped; checksum = sha384(file bytes); success = true.
#
# Usage: tools/sqlx-backfill.sh | psql "$DATABASE_URL"
set -euo pipefail
MIG_DIR="$(cd "$(dirname "$0")/../db/migrations" && pwd)"

sha384() { shasum -a 384 "$1" | awk '{print $1}'; }

cat <<'SQL'
CREATE TABLE IF NOT EXISTS _sqlx_migrations (
    version        BIGINT      PRIMARY KEY,
    description    TEXT        NOT NULL,
    installed_on   TIMESTAMPTZ NOT NULL DEFAULT now(),
    success        BOOLEAN     NOT NULL,
    checksum       BYTEA       NOT NULL,
    execution_time BIGINT      NOT NULL
);
SQL

for f in "$MIG_DIR"/*.sql; do
  base="$(basename "$f" .sql)"
  version="$(echo "$base" | grep -oE '^[0-9]+' | sed 's/^0*//')"   # 0027 → 27
  [ -z "$version" ] && version=0
  desc="$(echo "${base#*_}" | tr '_' ' ')"                          # refunds / merchant kyb documents fk
  ck="$(sha384 "$f")"
  printf "INSERT INTO _sqlx_migrations (version, description, success, checksum, execution_time) VALUES (%s, %s, true, '\\\\x%s', 0) ON CONFLICT (version) DO NOTHING;\n" \
    "$version" "$(printf "%s" "$desc" | sed "s/'/''/g; s/.*/'&'/")" "$ck"
done
