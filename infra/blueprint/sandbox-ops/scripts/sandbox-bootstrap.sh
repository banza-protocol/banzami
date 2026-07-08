#!/usr/bin/env bash
# Banzami Environment Blueprint — concrete Sandbox bootstrap adapter (orchestrator).
#
# Materialises the declarative Sandbox profile into ONE isolated project: internal-only
# data/app networks, digest-pinned PostgreSQL 16 + Redis with NO host-published ports, the
# validated role model + short-lived migration login, and root-protected secret /
# authorisation / receipt / evidence roots. Fail-closed: every identity, name and root is
# generated per run; ambient overrides are cleared.
#
# `apply` here is the LOCAL REHEARSAL bring-up (disposable). It must NOT be run against the
# VM in the adapter-implementation task; the VM apply is a later authorised operational step.
#
# Subcommands: check | plan | apply | verify | clean | verify-clean | full
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LAB_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$LAB_DIR/../../.." && pwd)"
COMPOSE_FILE="$LAB_DIR/docker-compose.sandbox.yml"
PROFILE="$REPO_ROOT/infra/blueprint/profiles/sandbox/profile.json"
LABEL="com.banzami.blueprint.sandbox"
STATE_BASE="${TMPDIR:-/tmp}/banzami-blueprint-sandbox"
STATE_FILE="$STATE_BASE/current.run"
PG_IMAGE="postgres@sha256:e013e867e712fec275706a6c51c966f0bb0c93cfa8f51000f85a15f9865a28cb"

unset COMPOSE_PROJECT_NAME DATABASE_URL BZSB_PROJECT BZSB_DATA_NET BZSB_APP_NET BZSB_PG_VOL BZSB_REDIS_VOL \
      BZSB_SECRET_ROOT BZSB_VALID_UNTIL PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE PGPASSFILE 2>/dev/null || true

die() { echo "sandbox-bootstrap: $*" >&2; exit 1; }
cap() { docker info >/dev/null 2>&1 || die "docker down"; docker compose version >/dev/null 2>&1 || die "compose v2 missing"; }

new_identity() {
  local rid; rid="$(date +%Y%m%d%H%M%S)-$$-${RANDOM}"
  RUNID="bzsandbox-${rid}"; BZSB_PROJECT="$RUNID"
  BZSB_DATA_NET="bzsb-data-${rid}"; BZSB_APP_NET="bzsb-app-${rid}"
  BZSB_PG_VOL="bzsb-pg-${rid}"; BZSB_REDIS_VOL="bzsb-redis-${rid}"
  SANDBOX_ROOT="$STATE_BASE/root-${rid}"
  BZSB_SECRET_ROOT="$SANDBOX_ROOT/secrets"; AUTHZ_ROOT="$SANDBOX_ROOT/authz"; RECEIPT_ROOT="$SANDBOX_ROOT/receipts"; EVIDENCE_ROOT="$SANDBOX_ROOT/evidence"
  BZSB_VALID_UNTIL=""
  export RUNID BZSB_PROJECT BZSB_DATA_NET BZSB_APP_NET BZSB_PG_VOL BZSB_REDIS_VOL SANDBOX_ROOT BZSB_SECRET_ROOT AUTHZ_ROOT RECEIPT_ROOT EVIDENCE_ROOT BZSB_VALID_UNTIL
}
save_identity() { mkdir -p "$STATE_BASE"; chmod 0700 "$STATE_BASE"
  { for v in RUNID BZSB_PROJECT BZSB_DATA_NET BZSB_APP_NET BZSB_PG_VOL BZSB_REDIS_VOL SANDBOX_ROOT BZSB_SECRET_ROOT AUTHZ_ROOT RECEIPT_ROOT EVIDENCE_ROOT BZSB_VALID_UNTIL; do printf "%s=%q\n" "$v" "${!v}"; done; } > "$STATE_FILE"; }
load_identity() { [ -f "$STATE_FILE" ] || die "no active sandbox run"; . "$STATE_FILE"
  export RUNID BZSB_PROJECT BZSB_DATA_NET BZSB_APP_NET BZSB_PG_VOL BZSB_REDIS_VOL SANDBOX_ROOT BZSB_SECRET_ROOT AUTHZ_ROOT RECEIPT_ROOT EVIDENCE_ROOT BZSB_VALID_UNTIL; }
dc() { docker compose -f "$COMPOSE_FILE" -p "$BZSB_PROJECT" "$@"; }

safe_rm_root() { local d="$1"
  [ -n "$d" ] || return 1
  case "$d" in "$STATE_BASE"/root-*) : ;; *) echo "sandbox-bootstrap: refusing removal — not under approved base" >&2; return 1;; esac
  case "$d" in /|/root|/home|/Users|"$REPO_ROOT"|"$REPO_ROOT"/*) echo "sandbox-bootstrap: refusing removal — root/repo" >&2; return 1;; esac
  [ -L "$d" ] && return 1; [ -e "$d" ] || return 0; [ -d "$d" ] || return 1; rm -rf "$d"; }
future_ts() { date -u -v+30M '+%Y-%m-%d %H:%M:%S+00' 2>/dev/null || date -u -d '+30 min' '+%Y-%m-%d %H:%M:%S+00'; }

# fail-closed profile assertion: sandbox profile, provisioned, banzami_staging, no host port
profile_ok() {
  [ -f "$PROFILE" ] || die "declarative sandbox profile missing"
  node -e '
    const p=require(process.argv[1]);
    if(p.environment!=="sandbox") throw new Error("profile.environment!=sandbox");
    if(p.database.name!=="banzami_staging") throw new Error("profile db!=banzami_staging");
    if(p.database.host_published_port!==null) throw new Error("profile publishes a host port");
    process.stdout.write("profile ok\n");
  ' "$PROFILE"
}

gen_secrets() {
  [ ! -e "$SANDBOX_ROOT" ] || die "sandbox root pre-exists"
  umask 077; mkdir -p "$BZSB_SECRET_ROOT" "$AUTHZ_ROOT" "$RECEIPT_ROOT" "$EVIDENCE_ROOT"
  chmod 0700 "$SANDBOX_ROOT" "$BZSB_SECRET_ROOT" "$AUTHZ_ROOT" "$RECEIPT_ROOT" "$EVIDENCE_ROOT"
  gen() { openssl rand -base64 32 | tr -d '\n/+=' | cut -c1-40; }
  local f
  for f in mi_superuser mi_control mi_migration mi_runtime; do gen > "$BZSB_SECRET_ROOT/$f"; chmod 0600 "$BZSB_SECRET_ROOT/$f"; done
  for f in mi_superuser mi_control mi_migration mi_runtime; do local p="$BZSB_SECRET_ROOT/$f"
    [ -f "$p" ] && [ ! -L "$p" ] && [ -s "$p" ] || die "secret $f invalid"
    [ "$(stat -f '%Lp' "$p" 2>/dev/null || stat -c '%a' "$p")" = "600" ] || die "secret $f mode!=0600"
    [ "$(stat -f '%l' "$p" 2>/dev/null || stat -c '%h' "$p")" = "1" ] || die "secret $f hardlink!=1"; done
  BZSB_VALID_UNTIL="$(future_ts)"; export BZSB_VALID_UNTIL
}

cmd_plan() {
  cap; profile_ok >/dev/null; new_identity
  echo "sandbox-bootstrap PLAN (rehearsal; not applied to VM):"
  echo "  profile: sandbox  target-db: banzami_staging  provisioned: yes  live: unprovisioned"
  echo "  project: <generated>  data/app networks: internal only  pg/redis: NO host port"
  echo "  roots: secret + authorisation + receipt + evidence (root-protected 0700/0600, outside repo)"
  echo "  role model: stable owner (NOLOGIN) + restricted runtime + control-plane + short-lived migration login"
  echo "  rejects uncontrolled overrides for: profile, environment, sandbox root, project, networks, volumes,"
  echo "    database identity, service set, image source, secret/authorisation/receipt/evidence roots"
  echo "sandbox-bootstrap: plan ok"
}

cmd_apply() {
  cap; profile_ok >/dev/null; new_identity
  trap 'echo "sandbox-bootstrap: apply failed — cleaning up"; do_clean >/dev/null 2>&1 || true; exit 1' ERR
  echo "sandbox-bootstrap: apply $RUNID (LOCAL rehearsal; disposable)"
  save_identity; gen_secrets; save_identity
  # materialise the isolated application plane explicitly (no service attaches to it until
  # the deployment adapter lands; compose only auto-creates networks in use).
  docker network create --driver bridge --internal \
    --label "$LABEL=1" --label "$LABEL.kind=app-network" "$BZSB_APP_NET" >/dev/null 2>&1 || true
  dc up -d postgres redis >/dev/null 2>&1
  local cid i=0; cid="$(dc ps -q postgres)"
  until [ "$(docker inspect -f '{{.State.Health.Status}}' "$cid" 2>/dev/null)" = "healthy" ]; do i=$((i+1)); [ "$i" -gt 40 ] && die "postgres not healthy"; sleep 2; done
  local rid2=0; local rc; rc="$(dc ps -q redis)"
  until [ "$(docker inspect -f '{{.State.Health.Status}}' "$rc" 2>/dev/null)" = "healthy" ]; do rid2=$((rid2+1)); [ "$rid2" -gt 40 ] && die "redis not healthy"; sleep 2; done
  echo "sandbox-bootstrap: pg16 + redis healthy (internal, no host port)"
  dc run --rm bootstrap >/dev/null 2>&1 || die "sandbox role bootstrap failed"
  echo "sandbox-bootstrap: role model + short-lived migration login established"
  trap - ERR
}

cmd_verify() {
  load_identity; local rc=0 cid; cid="$(dc ps -q postgres)"; local rc2; rc2="$(dc ps -q redis)"
  { [ -z "$(docker port "$cid" 2>/dev/null)" ] && ! docker inspect -f '{{json .NetworkSettings.Ports}}' "$cid" | grep -q HostPort; } && echo "SANDBOX pg_no_host_port PASS" || { echo "SANDBOX pg_no_host_port FAIL"; rc=1; }
  { [ -z "$(docker port "$rc2" 2>/dev/null)" ] && ! docker inspect -f '{{json .NetworkSettings.Ports}}' "$rc2" | grep -q HostPort; } && echo "SANDBOX redis_no_host_port PASS" || { echo "SANDBOX redis_no_host_port FAIL"; rc=1; }
  [ "$(docker network inspect -f '{{.Internal}}' "$BZSB_DATA_NET" 2>/dev/null)" = "true" ] && [ "$(docker network inspect -f '{{.Internal}}' "$BZSB_APP_NET" 2>/dev/null)" = "true" ] && echo "SANDBOX networks_internal PASS" || { echo "SANDBOX networks_internal FAIL"; rc=1; }
  [ "$(docker inspect -f '{{index .HostConfig.SecurityOpt 0}}' "$cid" 2>/dev/null)" = "no-new-privileges:true" ] && echo "SANDBOX no_new_privileges PASS" || { echo "SANDBOX no_new_privileges FAIL"; rc=1; }
  { docker inspect -f '{{.HostConfig.Privileged}}{{.HostConfig.NetworkMode}}{{.HostConfig.PidMode}}{{.HostConfig.IpcMode}}' "$cid" | grep -qiE 'true|host'; } && { echo "SANDBOX no_host_namespaces FAIL"; rc=1; } || echo "SANDBOX no_host_namespaces PASS"
  # Persistent role model present. Only the three PERSISTENT roles are asserted:
  # bl_migration is a short-lived login the migration adapter deliberately drops
  # after use, so it is legitimately absent post-migration. Its create-and-drop
  # lifecycle is asserted separately by the migration adapter (credential_unusable).
  local roles; roles="$(docker run --rm --network "$BZSB_DATA_NET" -v "$BZSB_SECRET_ROOT/mi_superuser:/s:ro" --entrypoint sh "$PG_IMAGE" -c '
    export PGPASSFILE=/tmp/pp; printf "postgres:5432:*:sbadmin:%s\n" "$(cat /s)" > $PGPASSFILE; chmod 600 $PGPASSFILE
    psql -h postgres -U sbadmin -d banzami_staging -tAc "SELECT count(*) FROM pg_roles WHERE rolname IN ('"'"'bl_schema_owner'"'"','"'"'bl_app_runtime'"'"','"'"'bl_control_plane'"'"')"' 2>/dev/null | tr -d '[:space:]')"
  [ "$roles" = "3" ] && echo "SANDBOX role_model_present PASS" || { echo "SANDBOX role_model_present FAIL"; rc=1; }
  # secret boundary: value absent from inspectable env / compose config / logs
  local sv; sv="$(cat "$BZSB_SECRET_ROOT/mi_superuser")"
  if docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$cid" | grep -qF "$sv" || dc config 2>/dev/null | grep -qF "$sv" || docker logs "$cid" 2>&1 | grep -qF "$sv"; then echo "SANDBOX secret_absent_from_surfaces FAIL"; rc=1; else echo "SANDBOX secret_absent_from_surfaces PASS"; fi
  unset sv
  # roots present + protected
  [ -d "$AUTHZ_ROOT" ] && [ -d "$RECEIPT_ROOT" ] && [ -d "$EVIDENCE_ROOT" ] && echo "SANDBOX authz_receipt_evidence_roots PASS" || { echo "SANDBOX authz_receipt_evidence_roots FAIL"; rc=1; }
  echo "SANDBOX_BOOTSTRAP_VERIFY_RESULT: $([ "$rc" -eq 0 ] && echo PASS || echo FAIL)"; return "$rc"
}

do_clean() {
  docker ps -aq --filter "label=$LABEL" --filter "label=com.docker.compose.project=$BZSB_PROJECT" | xargs -r docker rm -f >/dev/null 2>&1 || true
  dc down --volumes --remove-orphans >/dev/null 2>&1 || true
  [ -n "${BZSB_PG_VOL:-}" ] && docker volume rm -f "$BZSB_PG_VOL" >/dev/null 2>&1 || true
  [ -n "${BZSB_REDIS_VOL:-}" ] && docker volume rm -f "$BZSB_REDIS_VOL" >/dev/null 2>&1 || true
  [ -n "${BZSB_DATA_NET:-}" ] && docker network rm "$BZSB_DATA_NET" >/dev/null 2>&1 || true
  [ -n "${BZSB_APP_NET:-}" ] && docker network rm "$BZSB_APP_NET" >/dev/null 2>&1 || true
  [ -n "${SANDBOX_ROOT:-}" ] && safe_rm_root "$SANDBOX_ROOT" 2>/dev/null || true
  rm -f "$STATE_FILE" 2>/dev/null || true
}
cmd_clean() { load_identity 2>/dev/null || true; echo "sandbox-bootstrap: teardown ${RUNID:-<none>} (scoped)"; do_clean; echo "sandbox-bootstrap: teardown done"; }
cmd_verify_clean() {
  local rc=0 c v n r
  c="$(docker ps -aq --filter "label=$LABEL" 2>/dev/null | grep -c . || true)"
  v="$(docker volume ls -q --filter "label=$LABEL" 2>/dev/null | grep -c . || true)"
  n="$(docker network ls -q --filter "label=$LABEL" 2>/dev/null | grep -c . || true)"
  r="$(ls -d "$STATE_BASE"/root-* 2>/dev/null | grep -c . || true)"
  echo "RESIDUE containers=$c volumes=$v networks=$n roots=$r"
  { [ "$c" = 0 ] && [ "$v" = 0 ] && [ "$n" = 0 ] && [ "$r" = 0 ]; } && echo "RESIDUE_RESULT: PASS" || { echo "RESIDUE_RESULT: FAIL"; rc=1; }; return "$rc"
}
cmd_full() { local rc=0; cmd_apply; cmd_verify || rc=1; cmd_clean; cmd_verify_clean || rc=1
  echo "SANDBOX_BOOTSTRAP_FULL_RESULT: $([ "$rc" -eq 0 ] && echo PASS || echo FAIL)"; return "$rc"; }

case "${1:-}" in
  check) cap; profile_ok ;; plan) cmd_plan ;; apply) cmd_apply ;; verify) cmd_verify ;; clean) cmd_clean ;; verify-clean) cmd_verify_clean ;; full) cmd_full ;;
  *) die "usage: sandbox-bootstrap.sh {check|plan|apply|verify|clean|verify-clean|full}" ;;
esac
