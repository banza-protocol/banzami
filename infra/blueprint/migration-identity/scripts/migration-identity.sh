#!/usr/bin/env bash
# Banzami Environment Blueprint — Increment 2D migration-identity lab (orchestrator).
#
# LOCAL · SYNTHETIC · DISPOSABLE · non-Sandbox · non-LIVE · non-production. Builds the
# attested 2B runner (handoff), captures its immutable parent content digest, builds
# an ATTESTED derived executor (own SBOM + provenance) bound to source revision +
# parent digest + embedded migration digest, applies canonical migrations via a
# SHORT-LIVED least-privilege migration login (owner-session), proves ownership +
# privilege boundaries + login expiry/removal/unusability, then removes every
# current-run resource. Never contacts the VM; never uses banzami_staging/live/prod.
#
# Subcommands: capability | run | verify | clean | verify-clean | full
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LAB_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$LAB_DIR/../../.." && pwd)"
COMPOSE_FILE="$LAB_DIR/docker-compose.migration-identity.yml"
DERIVED_DOCKERFILE="$LAB_DIR/Dockerfile.migrate-attested"
MIG_DIR="$REPO_ROOT/db/migrations"
RUNNER_LAB="$REPO_ROOT/infra/blueprint/build-lab/scripts/runner-build-lab.sh"
RUNNER_STATE="${TMPDIR:-/tmp}/banzami-blueprint-runner-lab/current.run"
EVIDENCE_VALIDATOR="$SCRIPT_DIR/validate-derived-evidence.mjs"

LABEL="com.banzami.blueprint.migration-identity"
STATE_BASE="${TMPDIR:-/tmp}/banzami-blueprint-migration-identity"
STATE_FILE="$STATE_BASE/current.run"
PG_IMAGE="postgres@sha256:e013e867e712fec275706a6c51c966f0bb0c93cfa8f51000f85a15f9865a28cb"

unset COMPOSE_PROJECT_NAME DATABASE_URL BANZAMI_MIGRATE_URL BZMI_PROJECT BZMI_NETWORK \
      BZMI_VOLUME BZMI_SECRET_DIR BZMI_VALID_UNTIL PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE PGPASSFILE \
      2>/dev/null || true

die() { echo "migration-identity: $*" >&2; exit 1; }
hold() { echo "$1"; exit "${2:-20}"; }

cap_check() {
  docker info >/dev/null 2>&1 || hold "HOLD — LOCAL DOCKER RUNTIME NOT AVAILABLE" 10
  docker compose version >/dev/null 2>&1 || hold "HOLD — LOCAL DOCKER RUNTIME NOT AVAILABLE" 10
  docker buildx version >/dev/null 2>&1 || hold "HOLD — LOCAL BUILDX ATTESTATION SUPPORT NOT AVAILABLE" 11
  echo "capability: docker engine + compose v2 + buildx OK"
}

new_identity() {
  local rid; rid="$(date +%Y%m%d%H%M%S)-$$-${RANDOM}"
  RUNID="bzmigrationidentity-${rid}"
  BZMI_PROJECT="$RUNID"; BZMI_NETWORK="bzmi-net-${rid}"; BZMI_VOLUME="bzmi-vol-${rid}"
  BZMI_SECRET_DIR="$STATE_BASE/secrets-${rid}"; ARTROOT="$STATE_BASE/artifacts-${rid}"
  DERIVED_TAG="${RUNID}:migrate"; DERIVED_OCI="$ARTROOT/derived-oci"
  RUNNER_TAG=""; RUNNER_OCI=""; PARENT_DIGEST=""; SOURCE_REVISION=""; MIG_COUNT=0; MIG_MAXVER=0; MIG_DIGEST=""; DOCKERFILE_DIGEST=""
  BZMI_VALID_UNTIL=""
  export RUNID BZMI_PROJECT BZMI_NETWORK BZMI_VOLUME BZMI_SECRET_DIR ARTROOT DERIVED_TAG DERIVED_OCI \
         RUNNER_TAG RUNNER_OCI PARENT_DIGEST SOURCE_REVISION MIG_COUNT MIG_MAXVER MIG_DIGEST DOCKERFILE_DIGEST BZMI_VALID_UNTIL
}
save_identity() {
  mkdir -p "$STATE_BASE"; chmod 0700 "$STATE_BASE"
  { for v in RUNID BZMI_PROJECT BZMI_NETWORK BZMI_VOLUME BZMI_SECRET_DIR ARTROOT DERIVED_TAG DERIVED_OCI \
             RUNNER_TAG RUNNER_OCI PARENT_DIGEST SOURCE_REVISION MIG_COUNT MIG_MAXVER MIG_DIGEST DOCKERFILE_DIGEST BZMI_VALID_UNTIL; do
      printf "%s=%q\n" "$v" "${!v}"; done; } > "$STATE_FILE"
}
load_identity() { [ -f "$STATE_FILE" ] || die "no active run — run 'run' first"; . "$STATE_FILE"
  export RUNID BZMI_PROJECT BZMI_NETWORK BZMI_VOLUME BZMI_SECRET_DIR ARTROOT DERIVED_TAG DERIVED_OCI RUNNER_TAG RUNNER_OCI PARENT_DIGEST SOURCE_REVISION MIG_COUNT MIG_MAXVER MIG_DIGEST DOCKERFILE_DIGEST BZMI_VALID_UNTIL; }

dc() { docker compose -f "$COMPOSE_FILE" -p "$BZMI_PROJECT" "$@"; }

safe_rm_root() { local d="$1" pfx="$2"
  [ -n "$d" ] || return 1
  case "$d" in "$STATE_BASE"/${pfx}-*) : ;; *) echo "migration-identity: refusing removal — not under approved base" >&2; return 1;; esac
  case "$d" in /|/root|/home|/Users|"$REPO_ROOT"|"$REPO_ROOT"/*) echo "migration-identity: refusing removal — root/repo" >&2; return 1;; esac
  [ -L "$d" ] && { echo "migration-identity: refusing removal — symlink" >&2; return 1; }
  [ -e "$d" ] || return 0; [ -d "$d" ] || return 1; rm -rf "$d"; }

future_ts() { # 10 minutes from now, UTC, portable
  date -u -v+10M '+%Y-%m-%d %H:%M:%S+00' 2>/dev/null || date -u -d '+10 min' '+%Y-%m-%d %H:%M:%S+00'; }

resolve_inputs() {
  [ -z "$(cd "$REPO_ROOT" && git status --porcelain)" ] || die "worktree not clean — refusing"
  SOURCE_REVISION="$(cd "$REPO_ROOT" && git rev-parse HEAD)"; [ "${#SOURCE_REVISION}" -eq 40 ] || die "revision not full SHA"
  [ -d "$MIG_DIR" ] || die "canonical migration dir missing"
  MIG_COUNT="$(ls "$MIG_DIR"/*.sql | wc -l | tr -d ' ')"; [ "$MIG_COUNT" -gt 0 ] || die "no migrations"
  MIG_MAXVER="$(ls "$MIG_DIR"/*.sql | sed -E 's#.*/0*([0-9]+)_.*#\1#' | sort -n | tail -1)"
  MIG_DIGEST="$(cat $(ls "$MIG_DIR"/*.sql | sort) | shasum -a 256 | awk '{print $1}')"
  DOCKERFILE_DIGEST="$(shasum -a 256 "$DERIVED_DOCKERFILE" | awk '{print $1}')"
  BZMI_VALID_UNTIL="$(future_ts)"
  export SOURCE_REVISION MIG_COUNT MIG_MAXVER MIG_DIGEST DOCKERFILE_DIGEST BZMI_VALID_UNTIL
}

gen_secrets() {
  [ ! -e "$BZMI_SECRET_DIR" ] || die "secret dir must not pre-exist"
  umask 077; mkdir -p "$BZMI_SECRET_DIR"; chmod 0700 "$BZMI_SECRET_DIR"
  gen() { openssl rand -base64 32 | tr -d '\n/+=' | cut -c1-40; }
  gen > "$BZMI_SECRET_DIR/mi_superuser"; chmod 0600 "$BZMI_SECRET_DIR/mi_superuser"
  local ctl mig; ctl="$(gen)"; mig="$(gen)"
  printf '%s' "$ctl" > "$BZMI_SECRET_DIR/mi_control"; chmod 0600 "$BZMI_SECRET_DIR/mi_control"
  printf '%s' "$mig" > "$BZMI_SECRET_DIR/mi_migration"; chmod 0600 "$BZMI_SECRET_DIR/mi_migration"
  local proto='postgresql://' host='postgres:5432' db='blueprint_migration_lab'
  printf '%sbl_migration:%s@%s/%s' "$proto" "$mig" "$host" "$db" > "$BZMI_SECRET_DIR/mi_migration_url"; chmod 0600 "$BZMI_SECRET_DIR/mi_migration_url"
  ctl=''; mig=''; unset ctl mig
  local f p
  for f in mi_superuser mi_control mi_migration mi_migration_url; do
    p="$BZMI_SECRET_DIR/$f"
    [ -f "$p" ] && [ ! -L "$p" ] && [ -s "$p" ] || die "secret $f invalid"
    [ "$(stat -f '%Lp' "$p" 2>/dev/null || stat -c '%a' "$p")" = "600" ] || die "secret $f mode!=0600"
    [ "$(stat -f '%l' "$p" 2>/dev/null || stat -c '%h' "$p")" = "1" ] || die "secret $f hard-link!=1"
  done
}

capture_parent_digest() {
  PARENT_DIGEST="$(OCI_DIR="$RUNNER_OCI" node -e '
    const fs=require("fs"),path=require("path");const oci=process.env.OCI_DIR;
    const blob=d=>JSON.parse(fs.readFileSync(path.join(oci,"blobs",d.split(":")[0],d.split(":")[1])));
    const top=JSON.parse(fs.readFileSync(path.join(oci,"index.json")));
    let img=null;const visit=d=>{const mt=d.mediaType||"";if(mt.includes("image.index"))blob(d.digest).manifests.forEach(visit);
      else if(mt.includes("image.manifest")&&(d.annotations||{})["vnd.docker.reference.type"]!=="attestation-manifest")img=img||d.digest;};
    top.manifests.forEach(visit);process.stdout.write(img||"");')"
  case "$PARENT_DIGEST" in sha256:*) : ;; *) die "could not capture immutable parent content digest";; esac
  export PARENT_DIGEST
}

build_handoff() {
  echo "migration-identity: 2B handoff — building + verifying attested runner base"
  bash "$RUNNER_LAB" build  > "$ARTROOT/runner-build.log" 2>&1 || die "2B runner build failed"
  bash "$RUNNER_LAB" verify > "$ARTROOT/runner-verify.log" 2>&1 || die "2B runner verify failed"
  RUNNER_TAG="$(. "$RUNNER_STATE"; echo "$IMAGE_TAG")"
  RUNNER_OCI="$(. "$RUNNER_STATE"; echo "$OCI_DIR")"
  local rrev; rrev="$(. "$RUNNER_STATE"; echo "$SOURCE_REVISION")"
  [ "$rrev" = "$SOURCE_REVISION" ] || die "runner revision != identity revision"
  [ -d "$RUNNER_OCI" ] || die "runner OCI layout missing"
  export RUNNER_TAG RUNNER_OCI
  capture_parent_digest
}

build_derived_attested() {
  echo "migration-identity: building ATTESTED derived executor (own SBOM + provenance)"
  local ctx="$ARTROOT/derived-ctx"; mkdir -p "$ctx"
  cp -R "$MIG_DIR" "$ctx/migrations"; cp "$LAB_DIR/scripts/lab-entrypoint.sh" "$ctx/lab-entrypoint.sh"; cp "$DERIVED_DOCKERFILE" "$ctx/Dockerfile"
  docker buildx create --name "$RUNID" --driver docker-container >/dev/null
  docker buildx inspect "$RUNID" --bootstrap >/dev/null
  docker buildx build --builder "$RUNID" \
    --build-context "base-runner=oci-layout://$RUNNER_OCI@$PARENT_DIGEST" \
    --build-arg "SOURCE_REVISION=$SOURCE_REVISION" \
    --build-arg "PARENT_DIGEST=$PARENT_DIGEST" \
    --build-arg "MIGRATIONS_DIGEST=$MIG_DIGEST" \
    --build-arg "DOCKERFILE_DIGEST=$DOCKERFILE_DIGEST" \
    --build-arg "RUN_IDENTITY=$RUNID" \
    --sbom=true --provenance=mode=max \
    --metadata-file "$ARTROOT/derived-metadata.json" \
    --output "type=oci,tar=false,dest=$DERIVED_OCI,name=$DERIVED_TAG" \
    -f "$ctx/Dockerfile" "$ctx" > "$ARTROOT/derived-build.log" 2>&1 || die "attested derived build failed"
  tar -cf "$ARTROOT/derived.tar" -C "$DERIVED_OCI" .
  docker load -i "$ARTROOT/derived.tar" > "$ARTROOT/derived-load.log" 2>&1 || die "derived load failed"
  docker image inspect "$DERIVED_TAG" >/dev/null 2>&1 || die "derived image not resolvable"
}

pg_up_bootstrap() {
  dc up -d postgres > "$ARTROOT/pg-up.log" 2>&1
  local cid i=0; cid="$(dc ps -q postgres)"
  until [ "$(docker inspect -f '{{.State.Health.Status}}' "$cid" 2>/dev/null)" = "healthy" ]; do
    i=$((i+1)); [ "$i" -gt 40 ] && die "postgres not healthy"; sleep 2; done
  echo "migration-identity: pg16 healthy (internal, no host port)"
  dc run --rm bootstrap > "$ARTROOT/bootstrap.log" 2>&1 || die "short-lived migration-login bootstrap failed"
  echo "migration-identity: short-lived migration login provisioned"
}

apply_migrations() {
  echo "migration-identity: applying $MIG_COUNT embedded canonical migrations via short-lived login"
  docker run --rm --network "$BZMI_NETWORK" \
    -v "$BZMI_SECRET_DIR/mi_migration_url:/run/secrets/rt04e_migration_url:ro" \
    --label "$LABEL=1" --label "$LABEL.runid=$RUNID" \
    "$DERIVED_TAG" > "$ARTROOT/migrate.log" 2>&1 || die "canonical migration via short-lived login failed"
  echo "migration-identity: migrations applied by short-lived login"
}

# superuser read-only container: ownership + login privilege + separation checks
run_verify_container() {
  docker run --rm --network "$BZMI_NETWORK" \
    -e "EXPECT_COUNT=$MIG_COUNT" -e "EXPECT_MAXVER=$MIG_MAXVER" \
    -v "$BZMI_SECRET_DIR/mi_superuser:/run/secrets/mi_superuser:ro" \
    -v "$LAB_DIR/scripts/verify-identity.sh:/lab/verify-identity.sh:ro" \
    --label "$LABEL=1" --label "$LABEL.runid=$RUNID" \
    --entrypoint /bin/bash "$PG_IMAGE" /lab/verify-identity.sh
}

# prove short-lived login can authenticate BEFORE removal (positive), then remove + prove unusable
lifecycle_proof() {
  local ok=0
  # positive: migration login authenticates and runs a benign query (via its own pgpass)
  if docker run --rm --network "$BZMI_NETWORK" \
       -v "$BZMI_SECRET_DIR/mi_migration:/s:ro" --entrypoint sh "$PG_IMAGE" -c '
         export PGPASSFILE=/tmp/pp; printf "postgres:5432:*:bl_migration:%s\n" "$(cat /s)" > $PGPASSFILE; chmod 600 $PGPASSFILE
         psql -h postgres -U bl_migration -d blueprint_migration_lab -tAc "SELECT 1" >/dev/null 2>&1' ; then
    echo "LIFECYCLE migration_login_authenticates PASS"
  else echo "LIFECYCLE migration_login_authenticates FAIL"; ok=1; fi

  # remove the short-lived login (superuser), post-run. DROP OWNED BY first revokes any
  # privileges granted to it (e.g. database CONNECT) — it owns no application object, as
  # migrations run AS the stable owner — so the subsequent DROP ROLE succeeds.
  docker run --rm --network "$BZMI_NETWORK" \
    -v "$BZMI_SECRET_DIR/mi_superuser:/s:ro" --entrypoint sh "$PG_IMAGE" -c '
      export PGPASSFILE=/tmp/pp; printf "postgres:5432:*:miadmin:%s\n" "$(cat /s)" > $PGPASSFILE; chmod 600 $PGPASSFILE
      psql -h postgres -U miadmin -d blueprint_migration_lab -v ON_ERROR_STOP=1 -q \
        -c "DROP OWNED BY bl_migration" -c "DROP ROLE bl_migration"' \
    > "$ARTROOT/drop-login.log" 2>&1 || { echo "LIFECYCLE migration_login_removed FAIL"; ok=1; }
  # role absent
  local present; present="$(docker run --rm --network "$BZMI_NETWORK" -v "$BZMI_SECRET_DIR/mi_superuser:/s:ro" --entrypoint sh "$PG_IMAGE" -c '
      export PGPASSFILE=/tmp/pp; printf "postgres:5432:*:miadmin:%s\n" "$(cat /s)" > $PGPASSFILE; chmod 600 $PGPASSFILE
      psql -h postgres -U miadmin -d blueprint_migration_lab -tAc "SELECT count(*) FROM pg_roles WHERE rolname='\''bl_migration'\''"' 2>/dev/null | tr -d '[:space:]')"
  [ "$present" = "0" ] && echo "LIFECYCLE migration_login_removed PASS" || { echo "LIFECYCLE migration_login_removed FAIL"; ok=1; }
  # membership gone
  local mem; mem="$(docker run --rm --network "$BZMI_NETWORK" -v "$BZMI_SECRET_DIR/mi_superuser:/s:ro" --entrypoint sh "$PG_IMAGE" -c '
      export PGPASSFILE=/tmp/pp; printf "postgres:5432:*:miadmin:%s\n" "$(cat /s)" > $PGPASSFILE; chmod 600 $PGPASSFILE
      psql -h postgres -U miadmin -d blueprint_migration_lab -tAc "SELECT count(*) FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member WHERE r.rolname='\''bl_migration'\''"' 2>/dev/null | tr -d '[:space:]')"
  [ "$mem" = "0" ] && echo "LIFECYCLE no_membership_remains PASS" || { echo "LIFECYCLE no_membership_remains FAIL"; ok=1; }
  # credential unusable after removal: login attempt must FAIL
  if docker run --rm --network "$BZMI_NETWORK" -v "$BZMI_SECRET_DIR/mi_migration:/s:ro" --entrypoint sh "$PG_IMAGE" -c '
       export PGPASSFILE=/tmp/pp; printf "postgres:5432:*:bl_migration:%s\n" "$(cat /s)" > $PGPASSFILE; chmod 600 $PGPASSFILE
       psql -h postgres -U bl_migration -d blueprint_migration_lab -tAc "SELECT 1" >/dev/null 2>&1'; then
    echo "LIFECYCLE credential_unusable_after_cleanup FAIL"; ok=1
  else echo "LIFECYCLE credential_unusable_after_cleanup PASS"; fi
  return "$ok"
}

verify_derived_evidence() {
  node "$EVIDENCE_VALIDATOR" "$DERIVED_OCI" "$SOURCE_REVISION" "$PARENT_DIGEST" "$MIG_DIGEST" "$DERIVED_TAG"
}

verify_secret_boundary() {
  local ok=0 cid; cid="$(dc ps -q postgres)"
  local sv; sv="$(cat "$BZMI_SECRET_DIR/mi_migration_url")"
  if docker image inspect "$DERIVED_TAG" -f '{{json .Config.Env}}{{json .Config.Labels}}' | grep -qF "$sv" \
     || docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$cid" | grep -qF "$sv" \
     || dc config 2>/dev/null | grep -qF "$sv" \
     || docker logs "$cid" 2>&1 | grep -qF "$sv" \
     || find "$DERIVED_OCI" -type f -exec grep -qF "$sv" {} + 2>/dev/null; then
    echo "SECRET secret_absent_from_surfaces FAIL"; ok=1
  else echo "SECRET secret_absent_from_surfaces PASS"; fi
  if docker run --rm --network "$BZMI_NETWORK" -u root \
       -v "$BZMI_SECRET_DIR/mi_migration_url:/run/secrets/rt04e_migration_url:ro" \
       --entrypoint sh "$DERIVED_TAG" -c 'echo x > /run/secrets/rt04e_migration_url' >/dev/null 2>&1; then
    echo "SECRET secret_mount_read_only FAIL"; ok=1
  else echo "SECRET secret_mount_read_only PASS"; fi
  unset sv; return "$ok"
}

cmd_run() {
  cap_check >/dev/null; new_identity
  trap 'echo "migration-identity: run failed — cleaning up"; do_clean >/dev/null 2>&1 || true; exit 1' ERR
  echo "migration-identity: run $RUNID (local/synthetic/disposable)"
  resolve_inputs; mkdir -p "$ARTROOT"; chmod 0700 "$ARTROOT"; save_identity
  gen_secrets; build_handoff; save_identity; build_derived_attested; save_identity
  pg_up_bootstrap; apply_migrations
  trap - ERR; echo "migration-identity: build + apply complete"
}

cmd_verify() {
  load_identity; local rc=0
  echo "== derived executor SBOM / provenance / linkage =="; verify_derived_evidence || rc=1
  echo "== ownership + privilege separation =="; run_verify_container || rc=1
  echo "== short-lived login lifecycle =="; lifecycle_proof || rc=1
  echo "== secret boundary =="; verify_secret_boundary || rc=1
  echo "MIGRATION_IDENTITY_VERIFY_RESULT: $([ "$rc" -eq 0 ] && echo PASS || echo FAIL)"; return "$rc"
}

do_clean() {
  docker ps -aq --filter "label=$LABEL.runid=$RUNID" | xargs -r docker rm -f >/dev/null 2>&1 || true
  dc down --volumes --remove-orphans >/dev/null 2>&1 || true
  [ -n "${BZMI_VOLUME:-}" ] && docker volume rm -f "$BZMI_VOLUME" >/dev/null 2>&1 || true
  [ -n "${BZMI_NETWORK:-}" ] && docker network rm "$BZMI_NETWORK" >/dev/null 2>&1 || true
  [ -n "${DERIVED_TAG:-}" ] && docker image rm -f "$DERIVED_TAG" >/dev/null 2>&1 || true
  [ -n "${RUNID:-}" ] && docker buildx rm "$RUNID" >/dev/null 2>&1 || true
  [ -x "$RUNNER_LAB" ] && bash "$RUNNER_LAB" clean >/dev/null 2>&1 || true
  [ -n "${ARTROOT:-}" ] && safe_rm_root "$ARTROOT" artifacts 2>/dev/null || true
  [ -n "${BZMI_SECRET_DIR:-}" ] && safe_rm_root "$BZMI_SECRET_DIR" secrets 2>/dev/null || true
  rm -f "$STATE_FILE" 2>/dev/null || true
}
cmd_clean() { load_identity 2>/dev/null || true; echo "migration-identity: teardown ${RUNID:-<none>} (scoped)"; do_clean; echo "migration-identity: teardown done"; }

cmd_verify_clean() {
  local rc=0 c i n v b a
  c="$(docker ps -aq --filter "label=$LABEL" 2>/dev/null | grep -c . || true)"
  i="$(docker image ls -aq --filter "label=$LABEL" 2>/dev/null | grep -c . || true)"
  n="$(docker network ls -q --filter "label=$LABEL" 2>/dev/null | grep -c . || true)"
  v="$(docker volume ls -q --filter "label=$LABEL" 2>/dev/null | grep -c . || true)"
  b="$(docker buildx ls 2>/dev/null | grep -c 'bzmigrationidentity-' || true)"
  a="$(ls -d "$STATE_BASE"/artifacts-* "$STATE_BASE"/secrets-* 2>/dev/null | grep -c . || true)"
  echo "RESIDUE containers=$c images=$i networks=$n volumes=$v builders=$b roots=$a"
  { [ "$c" = 0 ] && [ "$i" = 0 ] && [ "$n" = 0 ] && [ "$v" = 0 ] && [ "$b" = 0 ] && [ "$a" = 0 ]; } \
    && echo "RESIDUE_RESULT: PASS" || { echo "RESIDUE_RESULT: FAIL"; rc=1; }; return "$rc"
}

cmd_full() { local rc=0; cmd_run; cmd_verify || rc=1; cmd_clean; cmd_verify_clean || rc=1
  echo "MIGRATION_IDENTITY_FULL_RESULT: $([ "$rc" -eq 0 ] && echo PASS || echo FAIL)"; return "$rc"; }

case "${1:-}" in
  capability) cap_check ;; run) cmd_run ;; verify) cmd_verify ;; clean) cmd_clean ;;
  verify-clean) cmd_verify_clean ;; full) cmd_full ;;
  *) die "usage: migration-identity.sh {capability|run|verify|clean|verify-clean|full}" ;;
esac
