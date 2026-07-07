#!/usr/bin/env bash
# Banzami Environment Blueprint — disposable runtime-lab orchestrator (Increment 2A)
#
# LOCAL · DISPOSABLE · SYNTHETIC · non-Sandbox · non-LIVE · non-production.
# Never contacts, inspects, modifies or depends on the VM. Manages ONLY resources
# it labels `com.banzami.blueprint.lab` under a per-run generated Compose project.
#
# Subcommands: up | verify | down | verify-clean | full | resolve-image
#
# FAIL-CLOSED: the Compose project, network name, volume name, secret root and
# lab database identity are generated internally per run. Ambient/uncontrolled
# environment overrides (COMPOSE_PROJECT_NAME, BZLAB_*, DATABASE_URL, PG*) are
# explicitly cleared so they can never redirect the lab.
set -euo pipefail

LAB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$LAB_DIR/docker-compose.lab.yml"
LABEL="com.banzami.blueprint.lab"
STATE_BASE="${TMPDIR:-/tmp}/banzami-blueprint-lab"
STATE_FILE="$STATE_BASE/current.run"

# clear anything that could redirect the lab from uncontrolled environment
unset COMPOSE_PROJECT_NAME DATABASE_URL BANZAMI_MIGRATE_URL PGHOST PGPORT PGUSER \
      PGPASSWORD PGDATABASE PGPASSFILE BZLAB_PROJECT BZLAB_NETWORK BZLAB_VOLUME \
      BZLAB_SECRET_DIR 2>/dev/null || true

die() { echo "lab: $*" >&2; exit 1; }
require_compose() {
  command -v docker >/dev/null 2>&1 || die "docker unavailable"
  docker info >/dev/null 2>&1 || die "docker engine not running"
  docker compose version >/dev/null 2>&1 || die "docker compose v2 unavailable"
}

new_run_identity() {
  local rid; rid="$(date +%Y%m%d%H%M%S)-$$-${RANDOM}"
  BZLAB_PROJECT="bzlab-${rid}"
  BZLAB_NETWORK="bzlab-net-${rid}"
  BZLAB_VOLUME="bzlab-vol-${rid}"
  BZLAB_SECRET_DIR="$STATE_BASE/secrets-${rid}"
  export BZLAB_PROJECT BZLAB_NETWORK BZLAB_VOLUME BZLAB_SECRET_DIR
}
load_run_identity() {
  [ -f "$STATE_FILE" ] || die "no active lab run (state file absent) — run 'up' first"
  # state file holds only non-secret identifiers/paths
  # shellcheck disable=SC1090
  . "$STATE_FILE"
  export BZLAB_PROJECT BZLAB_NETWORK BZLAB_VOLUME BZLAB_SECRET_DIR
}
save_run_identity() {
  mkdir -p "$STATE_BASE"; chmod 0700 "$STATE_BASE"
  { echo "BZLAB_PROJECT=$BZLAB_PROJECT"
    echo "BZLAB_NETWORK=$BZLAB_NETWORK"
    echo "BZLAB_VOLUME=$BZLAB_VOLUME"
    echo "BZLAB_SECRET_DIR=$BZLAB_SECRET_DIR"; } > "$STATE_FILE"
}

dc() { docker compose -f "$COMPOSE_FILE" -p "$BZLAB_PROJECT" "$@"; }

resolve_image() { # re-resolve the pinned digest (does not modify image.lock)
  require_compose
  docker pull -q postgres:16-alpine >/dev/null
  docker inspect --format '{{index .RepoDigests 0}}' postgres:16-alpine
}

remove_labelled() { # remove containers/volumes/networks for THIS run's project only
  local proj="$1"
  # containers
  docker ps -aq --filter "label=$LABEL" --filter "label=com.docker.compose.project=$proj" \
    | xargs -r docker rm -f >/dev/null 2>&1 || true
  # volume + network by exact generated name (label-scoped)
  [ -n "${BZLAB_VOLUME:-}" ] && docker volume rm -f "$BZLAB_VOLUME" >/dev/null 2>&1 || true
  [ -n "${BZLAB_NETWORK:-}" ] && docker network rm "$BZLAB_NETWORK" >/dev/null 2>&1 || true
}

cmd_up() {
  require_compose
  new_run_identity
  save_run_identity
  echo "lab: run project=$BZLAB_PROJECT (disposable/synthetic/local)"
  # trap: any failure during bring-up tears down this run's resources + secrets
  trap 'echo "lab: up failed — cleaning up this run"; dc down --volumes --remove-orphans >/dev/null 2>&1 || true; remove_labelled "$BZLAB_PROJECT"; rm -rf "$BZLAB_SECRET_DIR" 2>/dev/null || true; exit 1' ERR

  "$LAB_DIR/scripts/gen-lab-secrets.sh" "$BZLAB_SECRET_DIR" >/dev/null
  echo "lab: secrets generated (protected 0700/0600, outside repo)"

  dc up -d postgres
  echo "lab: waiting for PostgreSQL health..."
  local cid; cid="$(dc ps -q postgres)"
  local i=0
  until [ "$(docker inspect -f '{{.State.Health.Status}}' "$cid" 2>/dev/null)" = "healthy" ]; do
    i=$((i+1)); [ "$i" -gt 40 ] && die "postgres did not become healthy"
    sleep 2
  done
  echo "lab: PostgreSQL healthy"

  dc run --rm bootstrap
  trap - ERR
  echo "lab: bootstrap complete"
}

cmd_verify() {
  require_compose
  load_run_identity
  echo "== role model =="
  dc run --rm verify
  echo "== isolation / no-host-port / secret-boundary =="
  verify_infra
}

verify_infra() {
  local cid proj="$BZLAB_PROJECT" ok=0
  cid="$(dc ps -q postgres)"; [ -n "$cid" ] || die "postgres container not found for $proj"

  # no host port PUBLISHED (an EXPOSEd-but-unpublished port has a null binding /
  # no HostPort and is reported empty by `docker port`)
  if [ -z "$(docker port "$cid" 2>/dev/null)" ] \
     && ! docker inspect -f '{{json .NetworkSettings.Ports}}' "$cid" | grep -q 'HostPort'; then
    echo "INFRA_CHECK no_host_port                    PASS"
  else echo "INFRA_CHECK no_host_port                    FAIL"; ok=1; fi

  # postgres attached ONLY to the lab network
  local nets; nets="$(docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' "$cid" | tr -s ' ')"
  if [ "$(echo "$nets" | tr ' ' '\n' | grep -c .)" = "1" ] && echo "$nets" | grep -q "$BZLAB_NETWORK"; then
    echo "INFRA_CHECK single_isolated_lab_network      PASS"
  else echo "INFRA_CHECK single_isolated_lab_network      FAIL"; ok=1; fi

  # lab network carries the blueprint-lab label (is our generated network, not a shared one)
  if [ "$(docker network inspect -f '{{index .Labels "'"$LABEL"'"}}' "$BZLAB_NETWORK" 2>/dev/null)" = "1" ]; then
    echo "INFRA_CHECK network_is_blueprint_lab_labelled PASS"
  else echo "INFRA_CHECK network_is_blueprint_lab_labelled FAIL"; ok=1; fi

  # image digest-pinned
  if docker inspect -f '{{.Config.Image}}' "$cid" | grep -q '@sha256:[0-9a-f]\{64\}'; then
    echo "INFRA_CHECK image_digest_pinned              PASS"
  else echo "INFRA_CHECK image_digest_pinned              FAIL"; ok=1; fi

  # secret mounted read-only; no POSTGRES_PASSWORD env value
  if docker inspect -f '{{json .Mounts}}' "$cid" | grep -q '/run/secrets/lab_pg_superuser'; then
    echo "INFRA_CHECK secret_file_mounted              PASS"
  else echo "INFRA_CHECK secret_file_mounted              FAIL"; ok=1; fi
  if docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$cid" | grep -q '^POSTGRES_PASSWORD='; then
    echo "INFRA_CHECK no_password_env_value            FAIL"; ok=1
  else echo "INFRA_CHECK no_password_env_value            PASS"; fi

  # secret value must not appear in inspectable env, compose config or logs
  local sv; sv="$(cat "$BZLAB_SECRET_DIR/lab_pg_superuser")"
  if docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$cid" | grep -qF "$sv"; then
    echo "INFRA_CHECK secret_absent_from_env           FAIL"; ok=1
  else echo "INFRA_CHECK secret_absent_from_env           PASS"; fi
  if dc config 2>/dev/null | grep -qF "$sv"; then
    echo "INFRA_CHECK secret_absent_from_compose_config FAIL"; ok=1
  else echo "INFRA_CHECK secret_absent_from_compose_config PASS"; fi
  if docker logs "$cid" 2>&1 | grep -qF "$sv"; then
    echo "INFRA_CHECK secret_absent_from_logs          FAIL"; ok=1
  else echo "INFRA_CHECK secret_absent_from_logs          PASS"; fi
  unset sv

  echo "INFRA_VERIFY_RESULT: $([ "$ok" -eq 0 ] && echo PASS || echo FAIL)"
  return "$ok"
}

cmd_down() {
  require_compose
  load_run_identity
  echo "lab: tearing down project=$BZLAB_PROJECT (scoped)"
  dc down --volumes --remove-orphans >/dev/null 2>&1 || true
  remove_labelled "$BZLAB_PROJECT"
  rm -rf "$BZLAB_SECRET_DIR" 2>/dev/null || true
  rm -f "$STATE_FILE" 2>/dev/null || true
  echo "lab: teardown done"
}

cmd_verify_clean() {
  local proj="${BZLAB_PROJECT:-}"
  [ -n "$proj" ] || { [ -f "$STATE_FILE" ] && . "$STATE_FILE"; proj="${BZLAB_PROJECT:-}"; }
  local rc=0
  local c; c="$(docker ps -aq --filter "label=$LABEL" --filter "label=com.docker.compose.project=$proj" 2>/dev/null | grep -c . || true)"
  local v; v="$(docker volume ls -q --filter "label=$LABEL" 2>/dev/null | grep -c . || true)"
  local n; n="$(docker network ls -q --filter "label=$LABEL" 2>/dev/null | grep -c . || true)"
  echo "RESIDUE containers=$c volumes=$v networks=$n"
  [ "$c" = 0 ] || { echo "RESIDUE_CHECK containers PASS_expected_0 -> FAIL"; rc=1; }
  [ "$v" = 0 ] || { echo "RESIDUE_CHECK volumes    -> FAIL"; rc=1; }
  [ "$n" = 0 ] || { echo "RESIDUE_CHECK networks   -> FAIL"; rc=1; }
  if [ -n "${BZLAB_SECRET_DIR:-}" ] && [ -e "$BZLAB_SECRET_DIR" ]; then
    echo "RESIDUE_CHECK secret_dir -> FAIL (still present)"; rc=1
  else
    echo "RESIDUE_CHECK secret_dir PASS (absent)"
  fi
  echo "RESIDUE_RESULT: $([ "$rc" -eq 0 ] && echo PASS || echo FAIL)"
  return "$rc"
}

cmd_full() {
  local rc=0
  cmd_up
  cmd_verify || rc=1
  # capture identity before down wipes the state file
  local sdir="$BZLAB_SECRET_DIR" proj="$BZLAB_PROJECT"
  cmd_down
  BZLAB_PROJECT="$proj" BZLAB_SECRET_DIR="$sdir" cmd_verify_clean || rc=1
  echo "LAB_FULL_RESULT: $([ "$rc" -eq 0 ] && echo PASS || echo FAIL)"
  return "$rc"
}

case "${1:-}" in
  up)            cmd_up ;;
  verify)        cmd_verify ;;
  down)          cmd_down ;;
  verify-clean)  cmd_verify_clean ;;
  full)          cmd_full ;;
  resolve-image) resolve_image ;;
  *) die "usage: lab.sh {up|verify|down|verify-clean|full|resolve-image}" ;;
esac
