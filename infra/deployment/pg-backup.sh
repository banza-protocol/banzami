#!/usr/bin/env bash
#
# pg-backup.sh — automated full-data PostgreSQL backups for the Banzami host.
#
# Assurance RA-006: the payments host had no automated backup. This dumps every
# non-template database (banzami live + banzami_staging) as a compressed,
# consistent custom-format dump, rotates by age, and logs an evidence line.
#
# Runs on the VM via systemd timer (infra/deployment/pg-backup.timer). It execs
# pg_dump *inside* the postgres container, so no host client is required.
#
# Retention: keeps ${KEEP_DAYS:-14} days locally. Off-host replication is a
# separate follow-up (needs a storage-target decision) — see REPAIR_LOG RA-006.
#
# Manual run:  BACKUP_DIR=/srv/banzami/backups/auto bash pg-backup.sh
set -euo pipefail

CONTAINER="${PG_CONTAINER:-banzami-postgres-1}"
PG_USER="${PG_USER:-banzami}"
BACKUP_DIR="${BACKUP_DIR:-/srv/banzami/backups/auto}"
KEEP_DAYS="${KEEP_DAYS:-14}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

mkdir -p "$BACKUP_DIR"

# Discover databases from the running container (never hard-code the list).
mapfile -t DBS < <(docker exec "$CONTAINER" psql -U "$PG_USER" -d postgres -Atc \
  "SELECT datname FROM pg_database WHERE NOT datistemplate AND datname <> 'postgres';")

if [ "${#DBS[@]}" -eq 0 ]; then
  echo "pg-backup: FATAL no databases discovered in $CONTAINER" >&2
  exit 1
fi

fail=0
for db in "${DBS[@]}"; do
  out="$BACKUP_DIR/${db}_${STAMP}.dump"
  # Custom format (-Fc): compressed, supports selective/parallel restore.
  if docker exec "$CONTAINER" pg_dump -U "$PG_USER" -Fc "$db" > "$out" 2>/dev/null; then
    size=$(wc -c < "$out")
    if [ "$size" -lt 1024 ]; then
      echo "pg-backup: FAIL $db dump suspiciously small (${size}B)" >&2
      fail=1
    else
      echo "pg-backup: OK $db -> $out (${size}B)"
    fi
  else
    echo "pg-backup: FAIL pg_dump $db" >&2
    fail=1
  fi
done

# Rotation: delete dumps older than KEEP_DAYS.
find "$BACKUP_DIR" -name '*.dump' -type f -mtime "+${KEEP_DAYS}" -delete 2>/dev/null || true

echo "pg-backup: complete ${STAMP} (kept ${KEEP_DAYS}d, dir=$BACKUP_DIR)"
exit "$fail"
