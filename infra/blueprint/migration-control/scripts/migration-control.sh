#!/usr/bin/env bash
# Banzami Environment Blueprint — Increment 2E controlled-migration lab (orchestrator).
#
# LOCAL · SYNTHETIC · DISPOSABLE · non-Sandbox · non-LIVE · non-production. Proves the
# full controlled migration lifecycle: attested derived executor (2D), single-use
# authorisation record, migration receipt (pending→consumed), REAL advisory-lock
# concurrency, file-only execution via the short-lived migration login, plus the
# rejection matrix and a controlled failure path. Never contacts the VM; never uses
# banzami_staging as an actual database (the target BINDING is banzami_staging, but the
# disposable lab db is blueprint_migration_lab — proving the contract without a real target).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LAB_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$LAB_DIR/../../.." && pwd)"
COMPOSE_FILE="$LAB_DIR/docker-compose.migration-control.yml"
DERIVED_DOCKERFILE="$LAB_DIR/Dockerfile.migrate-control"
MIG_DIR="$REPO_ROOT/db/migrations"
RUNNER_LAB="$REPO_ROOT/infra/blueprint/build-lab/scripts/runner-build-lab.sh"
RUNNER_STATE="${TMPDIR:-/tmp}/banzami-blueprint-runner-lab/current.run"
EVIDENCE_VALIDATOR="$REPO_ROOT/infra/blueprint/migration-identity/scripts/validate-derived-evidence.mjs"
VERIFY_IDENTITY="$REPO_ROOT/infra/blueprint/migration-identity/scripts/verify-identity.sh"
AUTHZ="$SCRIPT_DIR/authz.sh"
# shellcheck source=/dev/null
. "$AUTHZ"

LABEL="com.banzami.blueprint.migration-control"
STATE_BASE="${TMPDIR:-/tmp}/banzami-blueprint-migration-control"
STATE_FILE="$STATE_BASE/current.run"
PG_IMAGE="postgres@sha256:e013e867e712fec275706a6c51c966f0bb0c93cfa8f51000f85a15f9865a28cb"
SERVICE_SET="core-api-staging api-gateway-staging developer-api public-api-staging"
LOCK_KEY="47710025"

unset COMPOSE_PROJECT_NAME DATABASE_URL BANZAMI_MIGRATE_URL BZMC_PROJECT BZMC_NETWORK BZMC_VOLUME \
      BZMC_SECRET_DIR BZMC_VALID_UNTIL PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE PGPASSFILE 2>/dev/null || true

die() { echo "migration-control: $*" >&2; exit 1; }
cap_check() { docker info >/dev/null 2>&1 || die "docker down"; docker buildx version >/dev/null 2>&1 || die "buildx missing"; echo "capability OK"; }

new_identity() {
  local rid; rid="$(date +%Y%m%d%H%M%S)-$$-${RANDOM}"
  RUNID="bzmigrationcontrol-${rid}"
  BZMC_PROJECT="$RUNID"; BZMC_NETWORK="bzmc-net-${rid}"; BZMC_VOLUME="bzmc-vol-${rid}"
  BZMC_SECRET_DIR="$STATE_BASE/secrets-${rid}"; ARTROOT="$STATE_BASE/artifacts-${rid}"; STATEROOT="$STATE_BASE/state-${rid}"
  DERIVED_TAG="${RUNID}:migrate"; DERIVED_OCI="$ARTROOT/derived-oci"
  RUNNER_TAG=""; RUNNER_OCI=""; PARENT_DIGEST=""; EXECUTOR_DIGEST=""; SOURCE_REVISION=""
  MIG_COUNT=0; MIG_MAXVER=0; MIG_DIGEST=""; DOCKERFILE_DIGEST=""; BZMC_VALID_UNTIL=""
  export RUNID BZMC_PROJECT BZMC_NETWORK BZMC_VOLUME BZMC_SECRET_DIR ARTROOT STATEROOT DERIVED_TAG DERIVED_OCI \
         RUNNER_TAG RUNNER_OCI PARENT_DIGEST EXECUTOR_DIGEST SOURCE_REVISION MIG_COUNT MIG_MAXVER MIG_DIGEST DOCKERFILE_DIGEST BZMC_VALID_UNTIL
}
save_identity() { mkdir -p "$STATE_BASE"; chmod 0700 "$STATE_BASE"
  { for v in RUNID BZMC_PROJECT BZMC_NETWORK BZMC_VOLUME BZMC_SECRET_DIR ARTROOT STATEROOT DERIVED_TAG DERIVED_OCI \
             RUNNER_TAG RUNNER_OCI PARENT_DIGEST EXECUTOR_DIGEST SOURCE_REVISION MIG_COUNT MIG_MAXVER MIG_DIGEST DOCKERFILE_DIGEST BZMC_VALID_UNTIL; do
      printf "%s=%q\n" "$v" "${!v}"; done; } > "$STATE_FILE"; }
load_identity() { [ -f "$STATE_FILE" ] || die "no active run"; . "$STATE_FILE"
  export RUNID BZMC_PROJECT BZMC_NETWORK BZMC_VOLUME BZMC_SECRET_DIR ARTROOT STATEROOT DERIVED_TAG DERIVED_OCI RUNNER_TAG RUNNER_OCI PARENT_DIGEST EXECUTOR_DIGEST SOURCE_REVISION MIG_COUNT MIG_MAXVER MIG_DIGEST DOCKERFILE_DIGEST BZMC_VALID_UNTIL; }

dc() { docker compose -f "$COMPOSE_FILE" -p "$BZMC_PROJECT" "$@"; }
safe_rm_root() { local d="$1" pfx="$2"; [ -n "$d" ] || return 1
  case "$d" in "$STATE_BASE"/${pfx}-*) : ;; *) echo "migration-control: refusing removal — not under base" >&2; return 1;; esac
  case "$d" in /|/root|/home|/Users|"$REPO_ROOT"|"$REPO_ROOT"/*) echo "migration-control: refusing removal — root/repo" >&2; return 1;; esac
  [ -L "$d" ] && { echo "migration-control: refusing removal — symlink" >&2; return 1; }
  [ -e "$d" ] || return 0; [ -d "$d" ] || return 1; rm -rf "$d"; }
future_ts() { date -u -v+10M '+%Y-%m-%d %H:%M:%S+00' 2>/dev/null || date -u -d '+10 min' '+%Y-%m-%d %H:%M:%S+00'; }

resolve_inputs() {
  [ -z "$(cd "$REPO_ROOT" && git status --porcelain)" ] || die "worktree not clean"
  SOURCE_REVISION="$(cd "$REPO_ROOT" && git rev-parse HEAD)"; [ "${#SOURCE_REVISION}" -eq 40 ] || die "revision not full SHA"
  MIG_COUNT="$(ls "$MIG_DIR"/*.sql | wc -l | tr -d ' ')"; [ "$MIG_COUNT" -gt 0 ] || die "no migrations"
  MIG_MAXVER="$(ls "$MIG_DIR"/*.sql | sed -E 's#.*/0*([0-9]+)_.*#\1#' | sort -n | tail -1)"
  MIG_DIGEST="$(cat $(ls "$MIG_DIR"/*.sql | sort) | shasum -a 256 | awk '{print $1}')"
  DOCKERFILE_DIGEST="$(shasum -a 256 "$DERIVED_DOCKERFILE" | awk '{print $1}')"; BZMC_VALID_UNTIL="$(future_ts)"
  export SOURCE_REVISION MIG_COUNT MIG_MAXVER MIG_DIGEST DOCKERFILE_DIGEST BZMC_VALID_UNTIL
}
gen_secrets() {
  [ ! -e "$BZMC_SECRET_DIR" ] || die "secret dir pre-exists"; umask 077; mkdir -p "$BZMC_SECRET_DIR"; chmod 0700 "$BZMC_SECRET_DIR"
  mkdir -p "$STATEROOT"; chmod 0700 "$STATEROOT"
  gen() { openssl rand -base64 32 | tr -d '\n/+=' | cut -c1-40; }
  gen > "$BZMC_SECRET_DIR/mi_superuser"; chmod 0600 "$BZMC_SECRET_DIR/mi_superuser"
  local ctl mig; ctl="$(gen)"; mig="$(gen)"
  printf '%s' "$ctl" > "$BZMC_SECRET_DIR/mi_control"; chmod 0600 "$BZMC_SECRET_DIR/mi_control"
  printf '%s' "$mig" > "$BZMC_SECRET_DIR/mi_migration"; chmod 0600 "$BZMC_SECRET_DIR/mi_migration"
  local proto='postgresql://' host='postgres:5432' db='blueprint_migration_lab'
  printf '%sbl_migration:%s@%s/%s' "$proto" "$mig" "$host" "$db" > "$BZMC_SECRET_DIR/mi_migration_url"; chmod 0600 "$BZMC_SECRET_DIR/mi_migration_url"
  ctl=''; mig=''; unset ctl mig
  local f p
  for f in mi_superuser mi_control mi_migration mi_migration_url; do p="$BZMC_SECRET_DIR/$f"
    [ -f "$p" ] && [ ! -L "$p" ] && [ -s "$p" ] || die "secret $f invalid"
    [ "$(stat -c '%a' "$p" 2>/dev/null || stat -f '%Lp' "$p")" = "600" ] || die "secret $f mode!=0600"
    [ "$(stat -c '%h' "$p" 2>/dev/null || stat -f '%l' "$p")" = "1" ] || die "secret $f hardlink!=1"; done
}
capture_parent_digest() {
  PARENT_DIGEST="$(OCI_DIR="$RUNNER_OCI" node -e '
    const fs=require("fs"),path=require("path");const oci=process.env.OCI_DIR;
    const blob=d=>JSON.parse(fs.readFileSync(path.join(oci,"blobs",d.split(":")[0],d.split(":")[1])));
    const top=JSON.parse(fs.readFileSync(path.join(oci,"index.json")));let img=null;
    const v=d=>{const m=d.mediaType||"";if(m.includes("image.index"))blob(d.digest).manifests.forEach(v);
      else if(m.includes("image.manifest")&&(d.annotations||{})["vnd.docker.reference.type"]!=="attestation-manifest")img=img||d.digest;};
    top.manifests.forEach(v);process.stdout.write(img||"");')"
  case "$PARENT_DIGEST" in sha256:*) : ;; *) die "could not capture parent digest";; esac; export PARENT_DIGEST
}
build_handoff() {
  echo "migration-control: 2B handoff — building + verifying attested runner base"
  bash "$RUNNER_LAB" build  > "$ARTROOT/runner-build.log" 2>&1 || die "runner build failed"
  bash "$RUNNER_LAB" verify > "$ARTROOT/runner-verify.log" 2>&1 || die "runner verify failed"
  RUNNER_TAG="$(. "$RUNNER_STATE"; echo "$IMAGE_TAG")"; RUNNER_OCI="$(. "$RUNNER_STATE"; echo "$OCI_DIR")"
  [ "$(. "$RUNNER_STATE"; echo "$SOURCE_REVISION")" = "$SOURCE_REVISION" ] || die "runner revision mismatch"
  [ -d "$RUNNER_OCI" ] || die "runner OCI missing"; export RUNNER_TAG RUNNER_OCI; capture_parent_digest
}
build_derived_attested() {
  echo "migration-control: building ATTESTED control executor"
  local ctx="$ARTROOT/derived-ctx"; mkdir -p "$ctx"
  cp -R "$MIG_DIR" "$ctx/migrations"; cp "$SCRIPT_DIR/control-entrypoint.sh" "$ctx/control-entrypoint.sh"; cp "$DERIVED_DOCKERFILE" "$ctx/Dockerfile"
  docker buildx create --name "$RUNID" --driver docker-container >/dev/null; docker buildx inspect "$RUNID" --bootstrap >/dev/null
  docker buildx build --builder "$RUNID" \
    --build-context "base-runner=oci-layout://$RUNNER_OCI@$PARENT_DIGEST" \
    --build-arg "SOURCE_REVISION=$SOURCE_REVISION" --build-arg "PARENT_DIGEST=$PARENT_DIGEST" \
    --build-arg "MIGRATIONS_DIGEST=$MIG_DIGEST" --build-arg "DOCKERFILE_DIGEST=$DOCKERFILE_DIGEST" --build-arg "RUN_IDENTITY=$RUNID" \
    --sbom=true --provenance=mode=max --metadata-file "$ARTROOT/derived-metadata.json" \
    --output "type=oci,tar=false,dest=$DERIVED_OCI,name=$DERIVED_TAG" \
    -f "$ctx/Dockerfile" "$ctx" > "$ARTROOT/derived-build.log" 2>&1 || die "attested control executor build failed"
  tar -cf "$ARTROOT/derived.tar" -C "$DERIVED_OCI" .; docker load -i "$ARTROOT/derived.tar" > "$ARTROOT/derived-load.log" 2>&1 || die "derived load failed"
  docker image inspect "$DERIVED_TAG" >/dev/null 2>&1 || die "derived not resolvable"
  # executor content digest (image manifest) for authz/receipt binding
  EXECUTOR_DIGEST="$(OCI_DIR="$DERIVED_OCI" node -e '
    const fs=require("fs"),path=require("path");const oci=process.env.OCI_DIR;
    const blob=d=>JSON.parse(fs.readFileSync(path.join(oci,"blobs",d.split(":")[0],d.split(":")[1])));
    const top=JSON.parse(fs.readFileSync(path.join(oci,"index.json")));let img=null;
    const v=d=>{const m=d.mediaType||"";if(m.includes("image.index"))blob(d.digest).manifests.forEach(v);
      else if(m.includes("image.manifest")&&(d.annotations||{})["vnd.docker.reference.type"]!=="attestation-manifest")img=img||d.digest;};
    top.manifests.forEach(v);process.stdout.write(img||"");')"
  case "$EXECUTOR_DIGEST" in sha256:*) : ;; *) die "could not capture executor digest";; esac; export EXECUTOR_DIGEST
}
pg_up_bootstrap() {
  dc up -d postgres > "$ARTROOT/pg-up.log" 2>&1
  local cid i=0; cid="$(dc ps -q postgres)"
  until [ "$(docker inspect -f '{{.State.Health.Status}}' "$cid" 2>/dev/null)" = "healthy" ]; do i=$((i+1)); [ "$i" -gt 40 ] && die "pg not healthy"; sleep 2; done
  dc run --rm bootstrap > "$ARTROOT/bootstrap.log" 2>&1 || die "bootstrap failed"
  echo "migration-control: pg16 healthy + short-lived login bootstrapped"
}
exec_migrate() { # <mode> -> runs the control executor; returns its exit code
  docker run --rm --network "$BZMC_NETWORK" -e "BZMC_LOCK_KEY=$LOCK_KEY" \
    -v "$BZMC_SECRET_DIR/mi_migration_url:/run/secrets/rt04e_migration_url:ro" \
    --label "$LABEL=1" --label "$LABEL.runid=$RUNID" "$DERIVED_TAG" "${1:-migrate}"
}

cmd_run() {
  cap_check >/dev/null; new_identity
  trap 'echo "migration-control: run failed — cleaning up"; do_clean >/dev/null 2>&1 || true; exit 1' ERR
  echo "migration-control: run $RUNID (local/synthetic/disposable)"
  resolve_inputs; mkdir -p "$ARTROOT"; chmod 0700 "$ARTROOT"; save_identity
  gen_secrets; build_handoff; save_identity; build_derived_attested; save_identity; pg_up_bootstrap
  # issue single-use authorisation + receipt bound to the immutable identity
  authz_issue "$STATEROOT" "$SOURCE_REVISION" "$PARENT_DIGEST" "$EXECUTOR_DIGEST" "$MIG_DIGEST" "$SERVICE_SET" 600 >/dev/null
  receipt_issue "$STATEROOT" "$SOURCE_REVISION" "$PARENT_DIGEST" "$EXECUTOR_DIGEST" "$MIG_DIGEST" "authz.record" "bl_migration" 600 >/dev/null
  trap - ERR; echo "migration-control: build + bootstrap + authorisation/receipt issued"
}

cmd_verify() {
  load_identity; local rc=0
  local A="$STATEROOT/authz.record" R="$STATEROOT/migration.receipt"
  echo "== derived executor evidence =="
  node "$EVIDENCE_VALIDATOR" "$DERIVED_OCI" "$SOURCE_REVISION" "$PARENT_DIGEST" "$MIG_DIGEST" "$DERIVED_TAG" || rc=1
  # rebind evidence validator's parent/migration to control labels: re-verify control labels
  verify_control_labels || rc=1

  echo "== authorisation-record lifecycle =="
  # valid authorisation validates
  authz_validate "$A" "$SOURCE_REVISION" "$PARENT_DIGEST" "$EXECUTOR_DIGEST" "$MIG_DIGEST" "$SERVICE_SET" >/dev/null 2>&1 && echo "AUTHZ valid_record_accepted PASS" || { echo "AUTHZ valid_record_accepted FAIL"; rc=1; }
  authz_reject_matrix || rc=1

  echo "== file-only advisory-lock migration (valid path) =="
  # valid path: consume authz + receipt, then migrate under the advisory lock
  authz_consume "$A" >/dev/null 2>&1 && echo "AUTHZ single_use_consumed PASS" || { echo "AUTHZ single_use_consumed FAIL"; rc=1; }
  receipt_consume "$R" >/dev/null 2>&1 && echo "RECEIPT consumed PASS" || { echo "RECEIPT consumed FAIL"; rc=1; }
  # re-consume must be rejected
  authz_consume "$A" >/dev/null 2>&1 && { echo "AUTHZ reconsume_rejected FAIL"; rc=1; } || echo "AUTHZ reconsume_rejected PASS"
  receipt_consume "$R" >/dev/null 2>&1 && { echo "RECEIPT reconsume_rejected FAIL"; rc=1; } || echo "RECEIPT reconsume_rejected PASS"
  if exec_migrate migrate > "$ARTROOT/migrate.log" 2>&1; then echo "EXEC migration_under_lock PASS"; else echo "EXEC migration_under_lock FAIL"; rc=1; fi

  echo "== advisory-lock concurrency =="
  concurrency_proof || rc=1

  echo "== controlled failure path (receipt stays consumed) =="
  failure_path_proof || rc=1

  echo "== ownership + privilege (2D verifier) =="
  docker run --rm --network "$BZMC_NETWORK" -e "EXPECT_COUNT=$MIG_COUNT" -e "EXPECT_MAXVER=$MIG_MAXVER" -e "EXPECT_CONNLIMIT=2" \
    -v "$BZMC_SECRET_DIR/mi_superuser:/run/secrets/mi_superuser:ro" -v "$VERIFY_IDENTITY:/lab/verify-identity.sh:ro" \
    --label "$LABEL=1" --label "$LABEL.runid=$RUNID" --entrypoint /bin/bash "$PG_IMAGE" /lab/verify-identity.sh || rc=1

  echo "== migration-login removal + secret boundary =="
  lifecycle_and_secret || rc=1

  echo "MIGRATION_CONTROL_VERIFY_RESULT: $([ "$rc" -eq 0 ] && echo PASS || echo FAIL)"; return "$rc"
}

verify_control_labels() {
  local ok=0
  [ "$(docker image inspect "$DERIVED_TAG" -f '{{index .Config.Labels "com.banzami.blueprint.migration-control.parent-digest"}}')" = "$PARENT_DIGEST" ] && echo "AUTHZ executor_parent_digest_bound PASS" || { echo "AUTHZ executor_parent_digest_bound FAIL"; ok=1; }
  [ "$(docker image inspect "$DERIVED_TAG" -f '{{index .Config.Labels "org.opencontainers.image.revision"}}')" = "$SOURCE_REVISION" ] && echo "AUTHZ executor_revision_bound PASS" || { echo "AUTHZ executor_revision_bound FAIL"; ok=1; }
  return "$ok"
}

authz_reject_matrix() {
  local ok=0 t="$STATEROOT/reject" ; mkdir -p "$t"
  _mk() { authz_issue "$t" "$1" "$2" "$3" "$4" "$SERVICE_SET" "${5:-600}" >/dev/null; }
  # wrong target is impossible to encode (target fixed) — validated by construction; test the rest:
  _mk "$SOURCE_REVISION" "$PARENT_DIGEST" "$EXECUTOR_DIGEST" "$MIG_DIGEST"
  # wrong revision
  ! authz_validate "$t/authz.record" "deadbeef" "$PARENT_DIGEST" "$EXECUTOR_DIGEST" "$MIG_DIGEST" "$SERVICE_SET" >/dev/null 2>&1 && echo "REJECT wrong_revision PASS" || { echo "REJECT wrong_revision FAIL"; ok=1; }
  # wrong parent / executor / migration digest
  ! authz_validate "$t/authz.record" "$SOURCE_REVISION" "sha256:0" "$EXECUTOR_DIGEST" "$MIG_DIGEST" "$SERVICE_SET" >/dev/null 2>&1 && echo "REJECT wrong_parent_digest PASS" || { echo "REJECT wrong_parent_digest FAIL"; ok=1; }
  ! authz_validate "$t/authz.record" "$SOURCE_REVISION" "$PARENT_DIGEST" "sha256:0" "$MIG_DIGEST" "$SERVICE_SET" >/dev/null 2>&1 && echo "REJECT wrong_executor_digest PASS" || { echo "REJECT wrong_executor_digest FAIL"; ok=1; }
  ! authz_validate "$t/authz.record" "$SOURCE_REVISION" "$PARENT_DIGEST" "$EXECUTOR_DIGEST" "deadbeef" "$SERVICE_SET" >/dev/null 2>&1 && echo "REJECT wrong_migration_digest PASS" || { echo "REJECT wrong_migration_digest FAIL"; ok=1; }
  # wrong service set
  ! authz_validate "$t/authz.record" "$SOURCE_REVISION" "$PARENT_DIGEST" "$EXECUTOR_DIGEST" "$MIG_DIGEST" "admin-api" >/dev/null 2>&1 && echo "REJECT wrong_service_set PASS" || { echo "REJECT wrong_service_set FAIL"; ok=1; }
  # expired record (ttl -1)
  _mk "$SOURCE_REVISION" "$PARENT_DIGEST" "$EXECUTOR_DIGEST" "$MIG_DIGEST" "-1"
  ! authz_validate "$t/authz.record" "$SOURCE_REVISION" "$PARENT_DIGEST" "$EXECUTOR_DIGEST" "$MIG_DIGEST" "$SERVICE_SET" >/dev/null 2>&1 && echo "REJECT expired_record PASS" || { echo "REJECT expired_record FAIL"; ok=1; }
  # future-issued record (hand-edit issued_epoch forward)
  _mk "$SOURCE_REVISION" "$PARENT_DIGEST" "$EXECUTOR_DIGEST" "$MIG_DIGEST"
  sed "s/^issued_epoch=.*/issued_epoch=9999999999/" "$t/authz.record" > "$t/authz.record.f"; mv "$t/authz.record.f" "$t/authz.record"; chmod 600 "$t/authz.record"
  ! authz_validate "$t/authz.record" "$SOURCE_REVISION" "$PARENT_DIGEST" "$EXECUTOR_DIGEST" "$MIG_DIGEST" "$SERVICE_SET" >/dev/null 2>&1 && echo "REJECT future_issued PASS" || { echo "REJECT future_issued FAIL"; ok=1; }
  # symlink rejected
  _mk "$SOURCE_REVISION" "$PARENT_DIGEST" "$EXECUTOR_DIGEST" "$MIG_DIGEST"; ln -sf "$t/authz.record" "$t/authz.link"
  ! authz_validate "$t/authz.link" "$SOURCE_REVISION" "$PARENT_DIGEST" "$EXECUTOR_DIGEST" "$MIG_DIGEST" "$SERVICE_SET" >/dev/null 2>&1 && echo "REJECT symlink PASS" || { echo "REJECT symlink FAIL"; ok=1; }
  rm -rf "$t"; return "$ok"
}

concurrency_proof() {
  local ok=0
  # a holder session grabs the advisory lock and keeps it while a second executor tries
  docker run -d --name "${RUNID}-holder" --network "$BZMC_NETWORK" --label "$LABEL=1" --label "$LABEL.runid=$RUNID" \
    -v "$BZMC_SECRET_DIR/mi_superuser:/s:ro" --entrypoint sh "$PG_IMAGE" -c '
      export PGPASSFILE=/tmp/pp; printf "postgres:5432:*:miadmin:%s\n" "$(cat /s)" > $PGPASSFILE; chmod 600 $PGPASSFILE
      psql -h postgres -U miadmin -d blueprint_migration_lab -Atqc "SELECT pg_advisory_lock('"$LOCK_KEY"'); SELECT pg_sleep(30);"' >/dev/null 2>&1
  # allow the holder to acquire
  sleep 3
  # second executor: must be refused (exit 9), no DB mutation
  if exec_migrate migrate > "$ARTROOT/concurrent.log" 2>&1; then
    echo "LOCK second_attempt_refused FAIL"; ok=1
  else
    grep -q 'MIGRATION_LOCK_HELD' "$ARTROOT/concurrent.log" && echo "LOCK second_attempt_refused PASS" || { echo "LOCK second_attempt_refused FAIL"; ok=1; }
  fi
  docker rm -f "${RUNID}-holder" >/dev/null 2>&1 || true
  return "$ok"
}

failure_path_proof() {
  local ok=0 t="$STATEROOT/fail"; mkdir -p "$t"
  # issue a fresh receipt, consume it, then run a controlled executor FAILURE (no SQL)
  receipt_issue "$t" "$SOURCE_REVISION" "$PARENT_DIGEST" "$EXECUTOR_DIGEST" "$MIG_DIGEST" "authz.record" "bl_migration" 600 >/dev/null
  receipt_consume "$t/migration.receipt" >/dev/null 2>&1
  if exec_migrate fail-after-lock > "$ARTROOT/fail.log" 2>&1; then echo "FAIL executor_failed_as_expected FAIL"; ok=1; else echo "FAIL executor_failed_as_expected PASS"; fi
  # receipt must remain consumed (never restored to pending)
  [ "$(grep -E '^state=' "$t/migration.receipt" | cut -d= -f2)" = "consumed" ] && echo "FAIL receipt_stays_consumed PASS" || { echo "FAIL receipt_stays_consumed FAIL"; ok=1; }
  rm -rf "$t"; return "$ok"
}

lifecycle_and_secret() {
  local ok=0
  # remove the short-lived login (superuser) and prove unusable + membership gone
  docker run --rm --network "$BZMC_NETWORK" -v "$BZMC_SECRET_DIR/mi_superuser:/s:ro" --entrypoint sh "$PG_IMAGE" -c '
    export PGPASSFILE=/tmp/pp; printf "postgres:5432:*:miadmin:%s\n" "$(cat /s)" > $PGPASSFILE; chmod 600 $PGPASSFILE
    psql -h postgres -U miadmin -d blueprint_migration_lab -v ON_ERROR_STOP=1 -q -c "DROP OWNED BY bl_migration" -c "DROP ROLE bl_migration"' >/dev/null 2>&1 \
    && echo "LIFECYCLE migration_login_removed PASS" || { echo "LIFECYCLE migration_login_removed FAIL"; ok=1; }
  if docker run --rm --network "$BZMC_NETWORK" -v "$BZMC_SECRET_DIR/mi_migration:/s:ro" --entrypoint sh "$PG_IMAGE" -c '
       export PGPASSFILE=/tmp/pp; printf "postgres:5432:*:bl_migration:%s\n" "$(cat /s)" > $PGPASSFILE; chmod 600 $PGPASSFILE
       psql -h postgres -U bl_migration -d blueprint_migration_lab -tAc "SELECT 1" >/dev/null 2>&1'; then
    echo "LIFECYCLE credential_unusable FAIL"; ok=1; else echo "LIFECYCLE credential_unusable PASS"; fi
  # secret + authz/receipt must be secret-free & file-only
  local sv; sv="$(cat "$BZMC_SECRET_DIR/mi_migration_url")"
  local leak=0
  docker image inspect "$DERIVED_TAG" -f '{{json .Config.Env}}{{json .Config.Labels}}' | grep -qF "$sv" && leak=1
  find "$DERIVED_OCI" "$STATEROOT" -type f -exec grep -qF "$sv" {} + 2>/dev/null && leak=1
  [ "$leak" = 0 ] && echo "SECRET secret_absent_from_surfaces PASS" || { echo "SECRET secret_absent_from_surfaces FAIL"; ok=1; }
  if docker run --rm --network "$BZMC_NETWORK" -u root -v "$BZMC_SECRET_DIR/mi_migration_url:/run/secrets/rt04e_migration_url:ro" \
       --entrypoint sh "$DERIVED_TAG" -c 'echo x > /run/secrets/rt04e_migration_url' >/dev/null 2>&1; then
    echo "SECRET secret_mount_read_only FAIL"; ok=1; else echo "SECRET secret_mount_read_only PASS"; fi
  unset sv; return "$ok"
}

do_clean() {
  docker ps -aq --filter "label=$LABEL.runid=$RUNID" | xargs -r docker rm -f >/dev/null 2>&1 || true
  docker rm -f "${RUNID}-holder" >/dev/null 2>&1 || true
  dc down --volumes --remove-orphans >/dev/null 2>&1 || true
  [ -n "${BZMC_VOLUME:-}" ] && docker volume rm -f "$BZMC_VOLUME" >/dev/null 2>&1 || true
  [ -n "${BZMC_NETWORK:-}" ] && docker network rm "$BZMC_NETWORK" >/dev/null 2>&1 || true
  [ -n "${DERIVED_TAG:-}" ] && docker image rm -f "$DERIVED_TAG" >/dev/null 2>&1 || true
  [ -n "${RUNID:-}" ] && docker buildx rm "$RUNID" >/dev/null 2>&1 || true
  [ -x "$RUNNER_LAB" ] && bash "$RUNNER_LAB" clean >/dev/null 2>&1 || true
  [ -n "${ARTROOT:-}" ] && safe_rm_root "$ARTROOT" artifacts 2>/dev/null || true
  [ -n "${STATEROOT:-}" ] && safe_rm_root "$STATEROOT" state 2>/dev/null || true
  [ -n "${BZMC_SECRET_DIR:-}" ] && safe_rm_root "$BZMC_SECRET_DIR" secrets 2>/dev/null || true
  rm -f "$STATE_FILE" 2>/dev/null || true
}
cmd_clean() { load_identity 2>/dev/null || true; echo "migration-control: teardown ${RUNID:-<none>} (scoped)"; do_clean; echo "migration-control: teardown done"; }
cmd_verify_clean() {
  local rc=0 c i n v b a
  c="$(docker ps -aq --filter "label=$LABEL" 2>/dev/null | grep -c . || true)"; i="$(docker image ls -aq --filter "label=$LABEL" 2>/dev/null | grep -c . || true)"
  n="$(docker network ls -q --filter "label=$LABEL" 2>/dev/null | grep -c . || true)"; v="$(docker volume ls -q --filter "label=$LABEL" 2>/dev/null | grep -c . || true)"
  b="$(docker buildx ls 2>/dev/null | grep -c 'bzmigrationcontrol-' || true)"; a="$(ls -d "$STATE_BASE"/artifacts-* "$STATE_BASE"/secrets-* "$STATE_BASE"/state-* 2>/dev/null | grep -c . || true)"
  echo "RESIDUE containers=$c images=$i networks=$n volumes=$v builders=$b roots=$a"
  { [ "$c" = 0 ] && [ "$i" = 0 ] && [ "$n" = 0 ] && [ "$v" = 0 ] && [ "$b" = 0 ] && [ "$a" = 0 ]; } && echo "RESIDUE_RESULT: PASS" || { echo "RESIDUE_RESULT: FAIL"; rc=1; }; return "$rc"
}
cmd_full() { local rc=0; cmd_run; cmd_verify || rc=1; cmd_clean; cmd_verify_clean || rc=1
  echo "MIGRATION_CONTROL_FULL_RESULT: $([ "$rc" -eq 0 ] && echo PASS || echo FAIL)"; return "$rc"; }

case "${1:-}" in
  capability) cap_check ;; run) cmd_run ;; verify) cmd_verify ;; clean) cmd_clean ;; verify-clean) cmd_verify_clean ;; full) cmd_full ;;
  *) die "usage: migration-control.sh {capability|run|verify|clean|verify-clean|full}" ;;
esac
