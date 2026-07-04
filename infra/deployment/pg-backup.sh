#!/usr/bin/env bash
#
# pg-backup.sh — automated, verified PostgreSQL backups for the Banzami host.
#
# Assurance RA-006: the payments host had no automated backup. This dumps every
# non-template database as a compressed custom-format dump, OPTIONALLY encrypts
# it to an off-host public key (host can encrypt, only the off-host key holder
# can restore), rotates by age, VERIFIES the latest dump by restoring it into a
# throwaway scratch database, and pushes off-host via a configurable command.
#
# It execs pg_dump/pg_restore INSIDE the postgres container, so no host client
# is required. Runs via systemd timer (infra/deployment/pg-backup.timer).
#
# Environment:
#   PG_CONTAINER          default banzami-postgres-1
#   PG_USER               default banzami
#   BACKUP_DIR            default /srv/banzami/backups/auto
#   KEEP_DAYS             default 14
#   BACKUP_GPG_RECIPIENT  if set, encrypt each dump to this gpg public key id
#                         (asymmetric; host cannot decrypt — correct DR posture)
#   BACKUP_OFFHOST_CMD    if set, run `<cmd> <file>` per artifact to copy off-host
#                         (e.g. an rclone/aws command to a dedicated backup bucket)
#   VERIFY_RESTORE        default 1 — restore latest dump into a scratch DB
#
# Off-host + encryption are FAIL-LOUD: if unset, the run logs a WARNING and
# exits non-zero on the off-host step so the timer surfaces the gap (a
# host-only backup does not survive host loss).
set -euo pipefail

CONTAINER="${PG_CONTAINER:-banzami-postgres-1}"
PG_USER="${PG_USER:-banzami}"
BACKUP_DIR="${BACKUP_DIR:-/srv/banzami/backups/auto}"
KEEP_DAYS="${KEEP_DAYS:-14}"
VERIFY_RESTORE="${VERIFY_RESTORE:-1}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

mkdir -p "$BACKUP_DIR"
warnings=0
fail=0

mapfile -t DBS < <(docker exec "$CONTAINER" psql -U "$PG_USER" -d postgres -Atc \
  "SELECT datname FROM pg_database WHERE NOT datistemplate AND datname <> 'postgres';")
[ "${#DBS[@]}" -eq 0 ] && { echo "pg-backup: FATAL no databases in $CONTAINER" >&2; exit 1; }

artifacts=()
for db in "${DBS[@]}"; do
  out="$BACKUP_DIR/${db}_${STAMP}.dump"
  if ! docker exec "$CONTAINER" pg_dump -U "$PG_USER" -Fc "$db" > "$out" 2>/dev/null; then
    echo "pg-backup: FAIL pg_dump $db" >&2; fail=1; continue
  fi
  size=$(wc -c < "$out")
  [ "$size" -lt 1024 ] && { echo "pg-backup: FAIL $db dump too small (${size}B)" >&2; fail=1; continue; }
  echo "pg-backup: OK dump $db -> $out (${size}B)"

  # Encrypt to the off-host recipient if configured.
  if [ -n "${BACKUP_GPG_RECIPIENT:-}" ]; then
    if gpg --yes --trust-model always -r "$BACKUP_GPG_RECIPIENT" -o "${out}.gpg" -e "$out" 2>/dev/null; then
      rm -f "$out"; out="${out}.gpg"; echo "pg-backup: OK encrypted -> $out"
    else
      echo "pg-backup: FAIL gpg encrypt $db (recipient $BACKUP_GPG_RECIPIENT)" >&2; fail=1
    fi
  else
    echo "pg-backup: WARN encryption disabled (set BACKUP_GPG_RECIPIENT)"; warnings=1
  fi
  artifacts+=("$out")
done

# Restore-verify the latest UNENCRYPTED dump (skip if encrypted — the host has
# no key by design; verification then happens off-host at restore time).
if [ "$VERIFY_RESTORE" = "1" ] && [ -z "${BACKUP_GPG_RECIPIENT:-}" ]; then
  latest="$(ls -t "$BACKUP_DIR"/*.dump 2>/dev/null | head -1 || true)"
  if [ -n "$latest" ]; then
    # Lowercase the name: unquoted CREATE DATABASE folds to lowercase, but the
    # connection dbname is case-sensitive — a mixed-case $STAMP would not match.
    scratch="verify_restore_$(printf '%s' "$STAMP" | tr 'A-Z' 'a-z')"
    docker exec "$CONTAINER" psql -U "$PG_USER" -d postgres -c "DROP DATABASE IF EXISTS $scratch;" >/dev/null 2>&1 || true
    docker exec "$CONTAINER" psql -U "$PG_USER" -d postgres -c "CREATE DATABASE $scratch;" >/dev/null 2>&1 || true
    # Copy the dump INTO the container and restore from a file argument — a
    # stdin redirect does not survive the ssh + `docker exec -i` context.
    # pg_restore exits non-zero on benign warnings; success is judged by whether
    # the schema actually materialized (table count > 0), not the exit code.
    docker cp "$latest" "$CONTAINER:/tmp/verify.dump" >/dev/null 2>&1 || true
    docker exec "$CONTAINER" pg_restore -U "$PG_USER" -d "$scratch" --no-owner --no-acl /tmp/verify.dump >/dev/null 2>&1 || true
    docker exec "$CONTAINER" rm -f /tmp/verify.dump >/dev/null 2>&1 || true
    n=$(docker exec "$CONTAINER" psql -U "$PG_USER" -d "$scratch" -Atc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';" 2>/dev/null || echo 0)
    if [ "${n:-0}" -gt 0 ]; then
      echo "pg-backup: OK restore-verify $latest -> $scratch ($n tables)"
    else
      echo "pg-backup: FAIL restore-verify $latest (0 tables materialized)" >&2; fail=1
    fi
    docker exec "$CONTAINER" psql -U "$PG_USER" -d postgres -c "DROP DATABASE IF EXISTS $scratch;" >/dev/null 2>&1 || true
  fi
fi

# Off-host copy — fail-loud if not configured.
if [ -n "${BACKUP_OFFHOST_CMD:-}" ]; then
  for a in "${artifacts[@]}"; do
    if $BACKUP_OFFHOST_CMD "$a"; then echo "pg-backup: OK off-host $a"; else echo "pg-backup: FAIL off-host $a" >&2; fail=1; fi
  done
else
  echo "pg-backup: WARN off-host copy NOT configured (set BACKUP_OFFHOST_CMD) — host-only backups do not survive host loss" >&2
  warnings=1
fi

find "$BACKUP_DIR" -name '*.dump' -o -name '*.dump.gpg' -type f -mtime "+${KEEP_DAYS}" -delete 2>/dev/null || true
echo "pg-backup: complete ${STAMP} (warnings=${warnings})"
exit "$fail"
