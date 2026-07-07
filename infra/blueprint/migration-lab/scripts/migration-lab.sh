#!/usr/bin/env bash
# Banzami Environment Blueprint — disposable canonical migration database lab (2C).
#
# LOCAL · SYNTHETIC · DISPOSABLE · non-Sandbox · non-LIVE · non-production ·
# non-deploying. Builds the attested 2B runner (handoff), embeds the canonical
# migration set into a derived lab image, applies it to a throwaway PostgreSQL 16,
# and proves migration integrity/level/checksum-drift and stable-owner ownership —
# then removes every current-run resource. Never contacts the VM, never uses
# banzami_staging/live/prod, never invokes the production RT04E entrypoint.
#
# Subcommands: capability | run | verify | clean | verify-clean | full
#
# FAIL-CLOSED: run identity, builder, artefact/secret roots, image tags, network,
# volume, database target and role identities derive from validated repo state and
# the current generated run; ambient overrides are cleared.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LAB_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$LAB_DIR/../../.." && pwd)"
COMPOSE_FILE="$LAB_DIR/docker-compose.migration-lab.yml"
DERIVED_DOCKERFILE="$LAB_DIR/Dockerfile.migrate"
MIG_DIR="$REPO_ROOT/db/migrations"
RUNNER_LAB="$REPO_ROOT/infra/blueprint/build-lab/scripts/runner-build-lab.sh"
RUNNER_STATE="${TMPDIR:-/tmp}/banzami-blueprint-runner-lab/current.run"

LABEL="com.banzami.blueprint.migration-lab"
STATE_BASE="${TMPDIR:-/tmp}/banzami-blueprint-migration-lab"
STATE_FILE="$STATE_BASE/current.run"
PG_IMAGE="postgres@sha256:e013e867e712fec275706a6c51c966f0bb0c93cfa8f51000f85a15f9865a28cb"

unset COMPOSE_PROJECT_NAME DATABASE_URL BANZAMI_MIGRATE_URL BZML_PROJECT BZML_NETWORK \
      BZML_VOLUME BZML_SECRET_DIR PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE PGPASSFILE \
      2>/dev/null || true

die() { echo "migration-lab: $*" >&2; exit 1; }
hold() { echo "$1"; exit "${2:-20}"; }

cap_check() {
  docker info >/dev/null 2>&1 || hold "HOLD — LOCAL DOCKER RUNTIME NOT AVAILABLE" 10
  docker compose version >/dev/null 2>&1 || hold "HOLD — LOCAL DOCKER RUNTIME NOT AVAILABLE" 10
  docker buildx version >/dev/null 2>&1 || hold "HOLD — LOCAL BUILDX ATTESTATION SUPPORT NOT AVAILABLE" 11
  echo "capability: docker engine + compose v2 + buildx OK"
}

new_identity() {
  local rid; rid="$(date +%Y%m%d%H%M%S)-$$-${RANDOM}"
  RUNID="bzmigrationlab-${rid}"
  BZML_PROJECT="$RUNID"
  BZML_NETWORK="bzml-net-${rid}"
  BZML_VOLUME="bzml-vol-${rid}"
  BZML_SECRET_DIR="$STATE_BASE/secrets-${rid}"
  ARTROOT="$STATE_BASE/artifacts-${rid}"
  DERIVED_TAG="${RUNID}:migrate"
  export RUNID BZML_PROJECT BZML_NETWORK BZML_VOLUME BZML_SECRET_DIR ARTROOT DERIVED_TAG
}
save_identity() {
  mkdir -p "$STATE_BASE"; chmod 0700 "$STATE_BASE"
  { echo "RUNID=$RUNID"; echo "BZML_PROJECT=$BZML_PROJECT"; echo "BZML_NETWORK=$BZML_NETWORK"
    echo "BZML_VOLUME=$BZML_VOLUME"; echo "BZML_SECRET_DIR=$BZML_SECRET_DIR"; echo "ARTROOT=$ARTROOT"
    echo "DERIVED_TAG=$DERIVED_TAG"; echo "SOURCE_REVISION=$SOURCE_REVISION"
    echo "RUNNER_TAG=$RUNNER_TAG"; echo "RUNNER_RUNID=$RUNNER_RUNID"
    echo "MIG_COUNT=$MIG_COUNT"; echo "MIG_MAXVER=$MIG_MAXVER"; echo "MIG_DIGEST=$MIG_DIGEST"; } > "$STATE_FILE"
}
load_identity() {
  [ -f "$STATE_FILE" ] || die "no active migration-lab run — run 'run' first"
  # shellcheck disable=SC1090
  . "$STATE_FILE"
  export RUNID BZML_PROJECT BZML_NETWORK BZML_VOLUME BZML_SECRET_DIR ARTROOT DERIVED_TAG SOURCE_REVISION RUNNER_TAG RUNNER_RUNID MIG_COUNT MIG_MAXVER MIG_DIGEST
}

dc() { docker compose -f "$COMPOSE_FILE" -p "$BZML_PROJECT" "$@"; }

# A2-style guarded removals
safe_rm_root() { # safe_rm_root <dir> <prefix>
  local d="$1" pfx="$2"
  [ -n "$d" ] || return 1
  case "$d" in "$STATE_BASE"/${pfx}-*) : ;; *) echo "migration-lab: refusing removal — not under approved base" >&2; return 1 ;; esac
  case "$d" in /|/root|/home|/Users|"$REPO_ROOT"|"$REPO_ROOT"/*) echo "migration-lab: refusing removal — root/repo-like" >&2; return 1 ;; esac
  [ -L "$d" ] && { echo "migration-lab: refusing removal — symlink" >&2; return 1; }
  [ -e "$d" ] || return 0
  [ -d "$d" ] || return 1
  rm -rf "$d"
}

resolve_inputs() {
  [ -z "$(cd "$REPO_ROOT" && git status --porcelain)" ] || die "worktree not clean — refusing"
  SOURCE_REVISION="$(cd "$REPO_ROOT" && git rev-parse HEAD)"
  [ "${#SOURCE_REVISION}" -eq 40 ] || die "source revision not a full 40-char SHA"
  [ -d "$MIG_DIR" ] || die "canonical migration dir missing"
  MIG_COUNT="$(ls "$MIG_DIR"/*.sql | wc -l | tr -d ' ')"
  [ "$MIG_COUNT" -gt 0 ] || die "no canonical migrations discovered"
  MIG_MAXVER="$(ls "$MIG_DIR"/*.sql | sed -E 's#.*/0*([0-9]+)_.*#\1#' | sort -n | tail -1)"
  MIG_DIGEST="$(cat $(ls "$MIG_DIR"/*.sql | sort) | shasum -a 256 | awk '{print $1}')"
  export SOURCE_REVISION MIG_COUNT MIG_MAXVER MIG_DIGEST
}

gen_secrets() {
  [ ! -e "$BZML_SECRET_DIR" ] || die "secret dir must not pre-exist"
  umask 077; mkdir -p "$BZML_SECRET_DIR"; chmod 0700 "$BZML_SECRET_DIR"
  local gen; gen() { openssl rand -base64 32 | tr -d '\n/+=' | cut -c1-40; }
  gen > "$BZML_SECRET_DIR/ml_superuser"; chmod 0600 "$BZML_SECRET_DIR/ml_superuser"
  local ctl; ctl="$(gen)"; printf '%s' "$ctl" > "$BZML_SECRET_DIR/ml_control"; chmod 0600 "$BZML_SECRET_DIR/ml_control"
  # migration DB URL (control-plane login → owner-session); secret, file-only.
  # Assembled from components so no credentialed-URL literal exists in source.
  local proto='postgresql://' host='postgres:5432' db='blueprint_migration_lab'
  printf '%sbl_control_plane:%s@%s/%s' "$proto" "$ctl" "$host" "$db" \
    > "$BZML_SECRET_DIR/ml_migration_url"; chmod 0600 "$BZML_SECRET_DIR/ml_migration_url"
  ctl=''; unset ctl
  # fail-closed secret-file assertions (2A A1 hardening parity)
  local f
  for f in ml_superuser ml_control ml_migration_url; do
    local p="$BZML_SECRET_DIR/$f"
    [ -f "$p" ] && [ ! -L "$p" ] && [ -s "$p" ] || die "secret $f invalid"
    [ "$(stat -f '%Lp' "$p" 2>/dev/null || stat -c '%a' "$p")" = "600" ] || die "secret $f mode != 0600"
    [ "$(stat -f '%l' "$p" 2>/dev/null || stat -c '%h' "$p")" = "1" ] || die "secret $f hard-link != 1"
  done
}

build_handoff() {
  echo "migration-lab: 2B handoff — building + verifying attested runner base image"
  bash "$RUNNER_LAB" build  > "$ARTROOT/runner-build.log" 2>&1 || die "2B runner build failed"
  bash "$RUNNER_LAB" verify > "$ARTROOT/runner-verify.log" 2>&1 || die "2B runner verify (SBOM/provenance/inspect) failed"
  [ -f "$RUNNER_STATE" ] || die "runner state missing after handoff"
  # shellcheck disable=SC1090
  RUNNER_TAG="$(. "$RUNNER_STATE"; echo "$IMAGE_TAG")"
  RUNNER_RUNID="$(. "$RUNNER_STATE"; echo "$RUNID")"
  local rrev; rrev="$(. "$RUNNER_STATE"; echo "$SOURCE_REVISION")"
  [ "$rrev" = "$SOURCE_REVISION" ] || die "runner revision != migration-lab revision"
  docker image inspect "$RUNNER_TAG" >/dev/null 2>&1 || die "runner base image not loaded"
  export RUNNER_TAG RUNNER_RUNID
}

build_derived() {
  echo "migration-lab: building derived image (embeds canonical migrations onto attested runner)"
  local ctx="$ARTROOT/derived-ctx"
  mkdir -p "$ctx"
  cp -R "$MIG_DIR" "$ctx/migrations"
  cp "$LAB_DIR/scripts/lab-entrypoint.sh" "$ctx/lab-entrypoint.sh"
  # default builder sees the locally-loaded base image; derived is a thin lab wrapper
  docker build \
    --file "$DERIVED_DOCKERFILE" \
    --build-arg "BASE_RUNNER=$RUNNER_TAG" \
    --build-arg "SOURCE_REVISION=$SOURCE_REVISION" \
    --build-arg "MIGRATIONS_DIGEST=$MIG_DIGEST" \
    -t "$DERIVED_TAG" \
    "$ctx" > "$ARTROOT/derived-build.log" 2>&1 || die "derived migrate image build failed"
  docker image inspect "$DERIVED_TAG" >/dev/null 2>&1 || die "derived image not built"
}

pg_up_bootstrap() {
  dc up -d postgres > "$ARTROOT/pg-up.log" 2>&1
  local cid i=0; cid="$(dc ps -q postgres)"
  until [ "$(docker inspect -f '{{.State.Health.Status}}' "$cid" 2>/dev/null)" = "healthy" ]; do
    i=$((i+1)); [ "$i" -gt 40 ] && die "postgres not healthy"; sleep 2
  done
  echo "migration-lab: PostgreSQL 16 healthy (internal net, no host port)"
  dc run --rm bootstrap > "$ARTROOT/bootstrap.log" 2>&1 || die "role bootstrap failed"
  echo "migration-lab: owner-session role model bootstrapped"
}

apply_migrations() {
  echo "migration-lab: applying $MIG_COUNT embedded canonical migrations (owner-session, file-only secret)"
  docker run --rm --network "$BZML_NETWORK" \
    -v "$BZML_SECRET_DIR/ml_migration_url:/run/secrets/rt04e_migration_url:ro" \
    --label "$LABEL=1" --label "$LABEL.runid=$RUNID" \
    "$DERIVED_TAG" run > "$ARTROOT/migrate.log" 2>&1 || die "canonical migration application failed"
  echo "migration-lab: canonical migrations applied"
}

# run a superuser read-only verification query container; emits VERIFY/OWNERSHIP lines
run_verify_container() {
  docker run --rm --network "$BZML_NETWORK" \
    -e "EXPECT_COUNT=$MIG_COUNT" -e "EXPECT_MAXVER=$MIG_MAXVER" \
    -v "$BZML_SECRET_DIR/ml_superuser:/run/secrets/ml_superuser:ro" \
    -v "$LAB_DIR/scripts/verify-db.sh:/lab/verify-db.sh:ro" \
    --label "$LABEL=1" --label "$LABEL.runid=$RUNID" \
    --entrypoint /bin/bash "$PG_IMAGE" /lab/verify-db.sh
}

drift_probe() {
  echo "migration-lab: controlled checksum-drift probe"
  local drift="$ARTROOT/drift/migrations"
  mkdir -p "$drift"
  cp "$MIG_DIR"/*.sql "$drift"/
  # deterministic harmless byte-level change to exactly one already-applied migration
  local one; one="$(ls "$drift"/*.sql | sort | head -1)"
  printf '\n-- bz-drift-probe deterministic marker\n' >> "$one"
  # a modified workspace MUST be rejected by SQLx checksum verification
  docker run --rm --network "$BZML_NETWORK" \
    -v "$BZML_SECRET_DIR/ml_migration_url:/run/secrets/rt04e_migration_url:ro" \
    -v "$ARTROOT/drift/migrations:/drift/migrations:ro" \
    --label "$LABEL=1" --label "$LABEL.runid=$RUNID" \
    "$DERIVED_TAG" run-drift > "$ARTROOT/drift.log" 2>&1
  local rc=$?
  rm -rf "$ARTROOT/drift" 2>/dev/null || true   # remove drift workspace immediately after probe
  if [ "$rc" -eq 0 ]; then echo "DRIFT drift_rejected PASS"; return 0
  else echo "DRIFT drift_rejected FAIL"; return 1; fi
}

verify_boundary() {
  local ok=0 cid; cid="$(dc ps -q postgres)"
  # no host port on postgres
  { [ -z "$(docker port "$cid" 2>/dev/null)" ] && ! docker inspect -f '{{json .NetworkSettings.Ports}}' "$cid" | grep -q 'HostPort'; } \
    && echo "BOUNDARY pg_no_host_port PASS" || { echo "BOUNDARY pg_no_host_port FAIL"; ok=1; }
  # network internal + labelled
  [ "$(docker network inspect -f '{{.Internal}}' "$BZML_NETWORK" 2>/dev/null)" = "true" ] \
    && echo "BOUNDARY network_internal PASS" || { echo "BOUNDARY network_internal FAIL"; ok=1; }
  [ "$(docker network inspect -f '{{index .Labels "'"$LABEL"'"}}' "$BZML_NETWORK" 2>/dev/null)" = "1" ] \
    && echo "BOUNDARY network_labelled PASS" || { echo "BOUNDARY network_labelled FAIL"; ok=1; }
  # pg only on the lab network
  [ "$(docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' "$cid" | tr -s ' ' | tr ' ' '\n' | grep -c .)" = "1" ] \
    && echo "BOUNDARY pg_single_network PASS" || { echo "BOUNDARY pg_single_network FAIL"; ok=1; }
  # pg image digest-pinned + major 16
  docker image inspect "$PG_IMAGE" -f '{{.Config.Image}}{{.RepoTags}}' >/dev/null 2>&1
  docker inspect -f '{{.Config.Image}}' "$cid" | grep -q '@sha256:[0-9a-f]\{64\}' \
    && echo "BOUNDARY pg_image_digest_pinned PASS" || { echo "BOUNDARY pg_image_digest_pinned FAIL"; ok=1; }
  # runner base carries the current full source revision + migrations digest agrees
  [ "$(docker image inspect "$RUNNER_TAG" -f '{{index .Config.Labels "org.opencontainers.image.revision"}}')" = "$SOURCE_REVISION" ] \
    && echo "BOUNDARY runner_revision_current PASS" || { echo "BOUNDARY runner_revision_current FAIL"; ok=1; }
  [ "$(docker image inspect "$DERIVED_TAG" -f '{{index .Config.Labels "com.banzami.blueprint.migration-lab.migrations-digest"}}')" = "$MIG_DIGEST" ] \
    && echo "BOUNDARY embedded_digest_agrees_source PASS" || { echo "BOUNDARY embedded_digest_agrees_source FAIL"; ok=1; }
  # embedded migration content identity == checked-out canonical source
  local emb; emb="$(docker run --rm --entrypoint sh "$DERIVED_TAG" -c 'cat $(ls /work/db/migrations/*.sql | sort) | sha256sum | cut -d" " -f1')"
  [ "$emb" = "$MIG_DIGEST" ] && echo "BOUNDARY embedded_content_matches_source PASS" || { echo "BOUNDARY embedded_content_matches_source FAIL"; ok=1; }
  # secret value absent from pg inspectable env / compose config / logs
  local sv; sv="$(cat "$BZML_SECRET_DIR/ml_migration_url")"
  if docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$cid" | grep -qF "$sv" \
     || dc config 2>/dev/null | grep -qF "$sv" \
     || docker logs "$cid" 2>&1 | grep -qF "$sv"; then
    echo "BOUNDARY secret_absent_from_surfaces FAIL"; ok=1
  else echo "BOUNDARY secret_absent_from_surfaces PASS"; fi
  # secret mount effectively read-only in a migrate container
  if docker run --rm --network "$BZML_NETWORK" -u root \
       -v "$BZML_SECRET_DIR/ml_migration_url:/run/secrets/rt04e_migration_url:ro" \
       --entrypoint sh "$DERIVED_TAG" -c 'echo x > /run/secrets/rt04e_migration_url' >/dev/null 2>&1; then
    echo "BOUNDARY secret_mount_read_only FAIL"; ok=1
  else echo "BOUNDARY secret_mount_read_only PASS"; fi
  unset sv
  return "$ok"
}

cmd_run() {
  cap_check >/dev/null
  new_identity
  resolve_inputs
  mkdir -p "$ARTROOT"; chmod 0700 "$ARTROOT"
  save_identity
  echo "migration-lab: run $RUNID (local/synthetic/disposable; target blueprint_migration_lab)"
  trap 'echo "migration-lab: run failed — cleaning up"; do_clean >/dev/null 2>&1 || true; exit 1' ERR
  gen_secrets
  build_handoff
  build_derived
  pg_up_bootstrap
  apply_migrations
  trap - ERR
  echo "migration-lab: build + apply complete"
}

cmd_verify() {
  load_identity
  local rc=0
  echo "== migration integrity / level / pending / ownership =="
  run_verify_container || rc=1
  echo "== checksum-drift probe =="
  drift_probe || rc=1
  echo "== network / image / secret boundary =="
  verify_boundary || rc=1
  echo "MIGRATION_LAB_VERIFY_RESULT: $([ "$rc" -eq 0 ] && echo PASS || echo FAIL)"
  return "$rc"
}

do_clean() {
  docker ps -aq --filter "label=$LABEL.runid=$RUNID" | xargs -r docker rm -f >/dev/null 2>&1 || true
  dc down --volumes --remove-orphans >/dev/null 2>&1 || true
  [ -n "${BZML_VOLUME:-}" ] && docker volume rm -f "$BZML_VOLUME" >/dev/null 2>&1 || true
  [ -n "${BZML_NETWORK:-}" ] && docker network rm "$BZML_NETWORK" >/dev/null 2>&1 || true
  [ -n "${DERIVED_TAG:-}" ] && docker image rm -f "$DERIVED_TAG" >/dev/null 2>&1 || true
  # runner handoff teardown (removes its builder/image/artroot)
  [ -x "$RUNNER_LAB" ] && bash "$RUNNER_LAB" clean >/dev/null 2>&1 || true
  [ -n "${ARTROOT:-}" ] && safe_rm_root "$ARTROOT" artifacts 2>/dev/null || true
  [ -n "${BZML_SECRET_DIR:-}" ] && safe_rm_root "$BZML_SECRET_DIR" secrets 2>/dev/null || true
  rm -f "$STATE_FILE" 2>/dev/null || true
}

cmd_clean() { load_identity 2>/dev/null || true; echo "migration-lab: teardown ${RUNID:-<none>} (scoped)"; do_clean; echo "migration-lab: teardown done"; }

cmd_verify_clean() {
  local rc=0
  local c i n v a
  c="$(docker ps -aq --filter "label=$LABEL" 2>/dev/null | grep -c . || true)"
  i="$(docker image ls -aq --filter "label=$LABEL" 2>/dev/null | grep -c . || true)"
  n="$(docker network ls -q --filter "label=$LABEL" 2>/dev/null | grep -c . || true)"
  v="$(docker volume ls -q --filter "label=$LABEL" 2>/dev/null | grep -c . || true)"
  a="$(ls -d "$STATE_BASE"/artifacts-* "$STATE_BASE"/secrets-* 2>/dev/null | grep -c . || true)"
  echo "RESIDUE containers=$c images=$i networks=$n volumes=$v roots=$a"
  { [ "$c" = 0 ] && [ "$i" = 0 ] && [ "$n" = 0 ] && [ "$v" = 0 ] && [ "$a" = 0 ]; } \
    && echo "RESIDUE_RESULT: PASS" || { echo "RESIDUE_RESULT: FAIL"; rc=1; }
  return "$rc"
}

cmd_full() {
  local rc=0
  cmd_run
  cmd_verify || rc=1
  cmd_clean
  cmd_verify_clean || rc=1
  echo "MIGRATION_LAB_FULL_RESULT: $([ "$rc" -eq 0 ] && echo PASS || echo FAIL)"
  return "$rc"
}

case "${1:-}" in
  capability)   cap_check ;;
  run)          cmd_run ;;
  verify)       cmd_verify ;;
  clean)        cmd_clean ;;
  verify-clean) cmd_verify_clean ;;
  full)         cmd_full ;;
  *) die "usage: migration-lab.sh {capability|run|verify|clean|verify-clean|full}" ;;
esac
