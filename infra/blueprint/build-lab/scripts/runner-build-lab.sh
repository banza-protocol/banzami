#!/usr/bin/env bash
# Banzami Environment Blueprint — migration-runner build laboratory (Increment 2B)
#
# LOCAL · DISPOSABLE · non-Sandbox · non-LIVE · non-production · non-deploying ·
# non-migrating. Builds the existing migration-runner image from canonical source,
# generates REAL SBOM + provenance attestations, validates immutable identity and
# provenance, performs a network-disabled non-migrating image inspection, proves no
# secret leaks into any artefact, then removes every current-run resource.
#
# It NEVER runs SQLx/migrations, starts a database, mounts a credential, invokes the
# migration entrypoint with a secret, contacts a registry, or touches the VM.
#
# Subcommands: capability | build | verify | clean | full
#
# FAIL-CLOSED: run identity, builder, artefact root, image tag, Dockerfile path and
# source revision are derived from validated repository state and the current
# generated run. Uncontrolled environment overrides are cleared.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
RUNNER_DIR="$REPO_ROOT/infra/blueprint/migration-runner"
DOCKERFILE="$RUNNER_DIR/Dockerfile"
DIGESTS_LOCK="$RUNNER_DIR/digests.lock"
SQLX_CONTRACT="$REPO_ROOT/infra/blueprint/base/contracts/sqlx-compat.contract.json"
EVIDENCE_VALIDATOR="$SCRIPT_DIR/validate-evidence.mjs"

LABEL="com.banzami.blueprint.runner-lab"
STATE_BASE="${TMPDIR:-/tmp}/banzami-blueprint-runner-lab"
STATE_FILE="$STATE_BASE/current.run"

# clear anything that could redirect the build lab
unset DOCKER_DEFAULT_PLATFORM BUILDX_BUILDER DATABASE_URL BANZAMI_MIGRATE_URL \
      BZRUNNER_RUNID BZRUNNER_BUILDER BZRUNNER_ARTROOT BZRUNNER_TAG COMPOSE_PROJECT_NAME \
      2>/dev/null || true

die() { echo "runner-lab: $*" >&2; exit 1; }

cap_check() {
  command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1 || { echo "HOLD — LOCAL DOCKER RUNTIME NOT AVAILABLE"; exit 10; }
  docker compose version >/dev/null 2>&1 || { echo "HOLD — LOCAL DOCKER RUNTIME NOT AVAILABLE"; exit 10; }
  docker buildx version >/dev/null 2>&1 || { echo "HOLD — LOCAL BUILDX ATTESTATION SUPPORT NOT AVAILABLE"; exit 11; }
  # attestations require a docker-container (BuildKit) builder — verify one can bootstrap
  local probe="bzrunnercap-$$"
  docker buildx create --name "$probe" --driver docker-container >/dev/null 2>&1 || { echo "HOLD — LOCAL BUILDX ATTESTATION SUPPORT NOT AVAILABLE"; exit 11; }
  if ! docker buildx inspect "$probe" --bootstrap >/dev/null 2>&1; then
    docker buildx rm "$probe" >/dev/null 2>&1 || true
    echo "HOLD — LOCAL BUILDX ATTESTATION SUPPORT NOT AVAILABLE"; exit 11
  fi
  docker buildx rm "$probe" >/dev/null 2>&1 || true
  echo "capability: docker engine + compose v2 + buildx + BuildKit attestation OK"
}

new_identity() {
  local rid; rid="$(date +%Y%m%d%H%M%S)-$$-${RANDOM}"
  RUNID="bzrunnerlab-${rid}"
  BUILDER="$RUNID"
  ARTROOT="$STATE_BASE/artifacts-${rid}"
  IMAGE_TAG="${RUNID}:local"
  OCI_DIR="$ARTROOT/oci"
  export RUNID BUILDER ARTROOT IMAGE_TAG OCI_DIR
}
save_identity() {
  mkdir -p "$STATE_BASE"; chmod 0700 "$STATE_BASE"
  { echo "RUNID=$RUNID"; echo "BUILDER=$BUILDER"; echo "ARTROOT=$ARTROOT"
    echo "IMAGE_TAG=$IMAGE_TAG"; echo "OCI_DIR=$OCI_DIR"; echo "SOURCE_REVISION=$SOURCE_REVISION"; } > "$STATE_FILE"
}
load_identity() {
  [ -f "$STATE_FILE" ] || die "no active build-lab run — run 'build' first"
  # shellcheck disable=SC1090
  . "$STATE_FILE"; export RUNID BUILDER ARTROOT IMAGE_TAG OCI_DIR SOURCE_REVISION
}

# A2-style guarded removal of a generated artefact root
safe_rm_artroot() {
  local d="$1"
  [ -n "$d" ] || return 1
  case "$d" in "$STATE_BASE"/artifacts-*) : ;; *) echo "runner-lab: refusing artroot removal — not under approved base" >&2; return 1 ;; esac
  case "$d" in /|/root|/home|/Users|"$REPO_ROOT"|"$REPO_ROOT"/*) echo "runner-lab: refusing artroot removal — root/repo-like" >&2; return 1 ;; esac
  [ -L "$d" ] && { echo "runner-lab: refusing artroot removal — symlink" >&2; return 1; }
  [ -e "$d" ] || return 0
  [ -d "$d" ] || return 1
  rm -rf "$d"
}

# read a base image digest reference (tag@sha256:...) from digests.lock by role
lock_ref() { # lock_ref <role>
  local role="$1" line tag dig
  line="$(grep -E "^$role " "$DIGESTS_LOCK")" || die "digests.lock missing role $role"
  tag="$(echo "$line" | awk '{print $2}')"; dig="$(echo "$line" | awk '{print $3}')"
  printf '%s@%s' "$tag" "$dig"
}

resolve_inputs() {
  [ -z "$(cd "$REPO_ROOT" && git status --porcelain)" ] || die "worktree not clean — refusing build"
  SOURCE_REVISION="$(cd "$REPO_ROOT" && git rev-parse HEAD)"
  [ "${#SOURCE_REVISION}" -eq 40 ] || die "source revision is not a full 40-char SHA"
  RUST_BUILDER_REF="$(lock_ref rust_builder)"
  RUNTIME_BASE_REF="$(lock_ref runtime_base)"
  case "$RUST_BUILDER_REF" in *@sha256:*) : ;; *) die "rust_builder base not digest-pinned"; esac
  case "$RUNTIME_BASE_REF" in *@sha256:*) : ;; *) die "runtime_base not digest-pinned"; esac
  SQLX_CLI_VERSION="$(node -e 'process.stdout.write(require(process.argv[1]).migration_runner_sqlx_cli_version)' "$SQLX_CONTRACT")"
  # cross-check against locked sqlx in core/Cargo.lock
  local locked; locked="$(grep -A2 'name = "sqlx"' "$REPO_ROOT/core/Cargo.lock" | grep -m1 version | sed -E 's/.*"([0-9.]+)".*/\1/')"
  [ "$SQLX_CLI_VERSION" = "$locked" ] || die "sqlx-cli version ($SQLX_CLI_VERSION) != locked sqlx ($locked)"
  export SOURCE_REVISION RUST_BUILDER_REF RUNTIME_BASE_REF SQLX_CLI_VERSION
}

cmd_build() {
  cap_check >/dev/null
  new_identity
  resolve_inputs
  save_identity
  echo "runner-lab: run $RUNID (local/disposable/non-deploying/non-migrating)"
  trap 'echo "runner-lab: build failed — cleaning up this run"; do_clean >/dev/null 2>&1 || true; exit 1' ERR

  mkdir -p "$ARTROOT"; chmod 0700 "$ARTROOT"
  docker buildx create --name "$BUILDER" --driver docker-container >/dev/null
  docker buildx inspect "$BUILDER" --bootstrap >/dev/null
  echo "runner-lab: dedicated builder ready; building digest-pinned runner image (this compiles sqlx-cli)"

  docker buildx build --builder "$BUILDER" \
    --file "$DOCKERFILE" \
    --build-arg "RUST_BUILDER=$RUST_BUILDER_REF" \
    --build-arg "RUNTIME_BASE=$RUNTIME_BASE_REF" \
    --build-arg "SQLX_CLI_VERSION=$SQLX_CLI_VERSION" \
    --build-arg "SOURCE_REVISION=$SOURCE_REVISION" \
    --label "$LABEL=1" \
    --label "$LABEL.runid=$RUNID" \
    --sbom=true \
    --provenance=mode=max \
    --metadata-file "$ARTROOT/metadata.json" \
    --output "type=oci,tar=false,dest=$OCI_DIR,name=$IMAGE_TAG" \
    "$RUNNER_DIR" > "$ARTROOT/build.log" 2>&1
  echo "runner-lab: build complete; OCI artefact + attestations written to the temp root"

  # load the built OCI image (with attestations) into the local store for inspection
  tar -cf "$ARTROOT/oci.tar" -C "$OCI_DIR" .
  docker load -i "$ARTROOT/oci.tar" > "$ARTROOT/load.log" 2>&1 || die "docker load of built image failed"
  # resolve the loaded image ref (name= makes it load under IMAGE_TAG)
  docker image inspect "$IMAGE_TAG" >/dev/null 2>&1 || {
    local loaded; loaded="$(grep -oE 'Loaded image.*' "$ARTROOT/load.log" | sed -E 's/Loaded image( ID)?: //' | head -1)"
    [ -n "$loaded" ] && docker tag "$loaded" "$IMAGE_TAG"
  }
  docker image inspect "$IMAGE_TAG" >/dev/null 2>&1 || die "loaded runner image not resolvable"
  trap - ERR
  echo "runner-lab: image loaded for inspection"
}

cmd_verify() {
  load_identity
  local rc=0
  echo "== immutable identity & provenance evidence =="
  node "$EVIDENCE_VALIDATOR" "$OCI_DIR" "$SOURCE_REVISION" "$RUNNER_DIR/digests.lock" "$SQLX_CONTRACT" || rc=1
  echo "== non-migrating runner-image inspection =="
  inspect_image || rc=1
  echo "== secret / evidence non-leak =="
  nonleak_scan || rc=1
  echo "RUNNER_VERIFY_RESULT: $([ "$rc" -eq 0 ] && echo PASS || echo FAIL)"
  return "$rc"
}

inspect_image() {
  local ok=0 tag="$IMAGE_TAG"
  # ---- config-level inspection (no run) ----
  local entrypoint; entrypoint="$(docker image inspect "$tag" -f '{{json .Config.Entrypoint}}')"
  [ "$entrypoint" = '["/usr/local/bin/rt04e-migration-runner"]' ] \
    && echo "INSPECT entrypoint_is_approved_runner   PASS" || { echo "INSPECT entrypoint_is_approved_runner   FAIL"; ok=1; }
  local user; user="$(docker image inspect "$tag" -f '{{.Config.User}}')"
  [ "$user" = "runner" ] && echo "INSPECT config_user_non_root            PASS" || { echo "INSPECT config_user_non_root            FAIL"; ok=1; }
  local ports; ports="$(docker image inspect "$tag" -f '{{json .Config.ExposedPorts}}')"
  { [ "$ports" = "null" ] || [ "$ports" = "{}" ]; } && echo "INSPECT no_exposed_ports                PASS" || { echo "INSPECT no_exposed_ports                FAIL"; ok=1; }
  # no secret-like env/label in image config
  if docker image inspect "$tag" -f '{{json .Config.Env}}{{json .Config.Labels}}' | grep -qiE 'password=|secret=|postgres_password|database_url|api[_-]?key|private[_-]?key'; then
    echo "INSPECT no_secret_env_or_label          FAIL"; ok=1
  else echo "INSPECT no_secret_env_or_label          PASS"; fi
  # image history contains no credential material
  if docker history --no-trunc "$tag" 2>/dev/null | grep -qiE 'password=|POSTGRES_PASSWORD|DATABASE_URL|-----BEGIN|api[_-]?key='; then
    echo "INSPECT history_no_credentials          FAIL"; ok=1
  else echo "INSPECT history_no_credentials          PASS"; fi

  # ---- runtime inspection: --network none --read-only, entrypoint overridden, NO secret ----
  local out; out="$(docker run --rm --network none --read-only --tmpfs /tmp \
      --entrypoint sh "$tag" -c 'id -u; sqlx --version 2>/dev/null; command -v psql >/dev/null && psql --version 2>/dev/null | head -1' 2>/dev/null || true)"
  local uid sqlxv; uid="$(echo "$out" | sed -n '1p')"; sqlxv="$(echo "$out" | grep -i '^sqlx' | head -1)"
  [ "$uid" != "0" ] && [ -n "$uid" ] && echo "INSPECT runtime_user_non_root           PASS" || { echo "INSPECT runtime_user_non_root           FAIL"; ok=1; }
  echo "$sqlxv" | grep -qE "$(node -e 'process.stdout.write(require(process.argv[1]).migration_runner_sqlx_cli_version.replace(/\./g,"\\."))' "$SQLX_CONTRACT")" \
    && echo "INSPECT sqlx_cli_present_expected_ver   PASS" || { echo "INSPECT sqlx_cli_present_expected_ver   FAIL"; ok=1; }
  echo "$out" | grep -qi 'psql (PostgreSQL)' \
    && echo "INSPECT psql_client_present             PASS" || { echo "INSPECT psql_client_present             FAIL"; ok=1; }
  return "$ok"
}

nonleak_scan() {
  local ok=0
  # scan build log, load log, metadata, and evidence artefacts for secret patterns
  local SECRET_RE='(postgres(ql)?|mysql|redis|mongodb)://[^/[:space:]"]+:[^@[:space:]"]+@|-----BEGIN [A-Z ]*PRIVATE KEY-----|POSTGRES_PASSWORD=[^[:space:]"]+|DATABASE_URL=[A-Za-z]|password[[:space:]]*[:=][[:space:]]*["'"'"']?[A-Za-z0-9+/=]{8,}'
  local hit=0 f
  for f in "$ARTROOT/build.log" "$ARTROOT/load.log" "$ARTROOT/metadata.json"; do
    [ -f "$f" ] || continue
    if grep -qiE "$SECRET_RE" "$f"; then hit=1; fi
  done
  # scan the OCI evidence blobs (sbom + provenance in-toto) as a whole
  if find "$OCI_DIR" -type f -exec grep -qiE "$SECRET_RE" {} + 2>/dev/null; then hit=1; fi
  [ "$hit" -eq 0 ] && echo "NONLEAK build_and_evidence_clean        PASS" || { echo "NONLEAK build_and_evidence_clean        FAIL"; ok=1; }

  # the real VM host / real endpoints must not appear in any artefact
  if find "$ARTROOT" -type f -exec grep -qE '217\.160\.9\.248|banzami_staging|banzami_live' {} + 2>/dev/null; then
    echo "NONLEAK no_real_binding_leak            FAIL"; ok=1
  else echo "NONLEAK no_real_binding_leak            PASS"; fi
  return "$ok"
}

do_clean() {
  # remove current-run inspection containers (label-scoped)
  docker ps -aq --filter "label=$LABEL.runid=$RUNID" | xargs -r docker rm -f >/dev/null 2>&1 || true
  # remove current-run image tag (and any dangling load alias)
  [ -n "${IMAGE_TAG:-}" ] && docker image rm -f "$IMAGE_TAG" >/dev/null 2>&1 || true
  # remove current-run dedicated builder
  [ -n "${BUILDER:-}" ] && docker buildx rm "$BUILDER" >/dev/null 2>&1 || true
  # remove current-run temporary artefact root (guarded)
  [ -n "${ARTROOT:-}" ] && safe_rm_artroot "$ARTROOT" 2>/dev/null || true
  rm -f "$STATE_FILE" 2>/dev/null || true
}

cmd_clean() {
  load_identity 2>/dev/null || true
  echo "runner-lab: teardown ${RUNID:-<none>} (scoped)"
  do_clean
  echo "runner-lab: teardown done"
}

cmd_verify_clean() {
  local rc=0 rid="${RUNID:-}"
  local c i b
  c="$(docker ps -aq --filter "label=$LABEL" 2>/dev/null | grep -c . || true)"
  i="$(docker image ls -q --filter "label=$LABEL" 2>/dev/null | grep -c . || true)"
  b="$(docker buildx ls 2>/dev/null | grep -c 'bzrunnerlab-' || true)"
  local a; a="$(ls -d "$STATE_BASE"/artifacts-* 2>/dev/null | grep -c . || true)"
  echo "RESIDUE containers=$c images=$i builders=$b artroots=$a"
  [ "$c" = 0 ] && [ "$i" = 0 ] && [ "$b" = 0 ] && [ "$a" = 0 ] \
    && echo "RESIDUE_RESULT: PASS" || { echo "RESIDUE_RESULT: FAIL"; rc=1; }
  return "$rc"
}

cmd_full() {
  local rc=0
  cmd_build
  cmd_verify || rc=1
  cmd_clean
  cmd_verify_clean || rc=1
  echo "RUNNER_LAB_FULL_RESULT: $([ "$rc" -eq 0 ] && echo PASS || echo FAIL)"
  return "$rc"
}

case "${1:-}" in
  capability)   cap_check ;;
  build)        cmd_build ;;
  verify)       cmd_verify ;;
  clean)        cmd_clean ;;
  verify-clean) cmd_verify_clean ;;
  full)         cmd_full ;;
  *) die "usage: runner-build-lab.sh {capability|build|verify|clean|verify-clean|full}" ;;
esac
