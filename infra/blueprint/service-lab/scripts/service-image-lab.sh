#!/usr/bin/env bash
# Banzami Environment Blueprint — attested Sandbox service-image lab (orchestrator).
#
# LOCAL · DISPOSABLE · non-deploying. Builds attested immutable images for EXACTLY the
# four approved Sandbox services (allowlist-enforced), generates real SBOM + provenance,
# performs a network-disabled non-deploying inspection, proves the secret boundary, and
# tears everything down. Never contacts the VM, never deploys, never uses a database,
# banzami_staging, LIVE credentials or a payment rail. Public dependency/base resolution
# only (crates.io / Go proxy / Docker Hub).
#
# Subcommands: capability | run | verify | clean | verify-clean | full
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LAB_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$LAB_DIR/../../.." && pwd)"
EVIDENCE="$SCRIPT_DIR/validate-service-evidence.mjs"
LABEL="com.banzami.blueprint.service-lab"
STATE_BASE="${TMPDIR:-/tmp}/banzami-blueprint-service-lab"
STATE_FILE="$STATE_BASE/current.run"

# APPROVED ALLOWLIST — exactly four services. name|context|dockerfile|binary|port
# The Go services share the services/common module, so their build context is services/
# (the Dockerfiles COPY common/ and <svc>/). core-api builds from the core/ context.
ALLOWLIST=(
  "core-api-staging|core|core/Dockerfile|core-api|8081"
  "api-gateway-staging|services|services/api-gateway/Dockerfile|api-gateway|8080"
  "developer-api|services|services/developer-api/Dockerfile|developer-api|8086"
  "public-api-staging|services|services/public-api/Dockerfile|public-api|8083"
)

unset DOCKER_DEFAULT_PLATFORM BUILDX_BUILDER DATABASE_URL BZSVC_RUNID BZSVC_ARTROOT BZSVC_BUILDER 2>/dev/null || true
die() { echo "service-lab: $*" >&2; exit 1; }
hold() { echo "$1"; exit "${2:-30}"; }
cap_check() { docker info >/dev/null 2>&1 || hold "BLOCKER — SERVICE IMAGE BUILD OR ATTESTATION FAILED" 31; docker buildx version >/dev/null 2>&1 || hold "BLOCKER — SERVICE IMAGE BUILD OR ATTESTATION FAILED" 31; echo "capability OK"; }

new_identity() {
  local rid; rid="$(date +%Y%m%d%H%M%S)-$$-${RANDOM}"
  RUNID="bzservicelab-${rid}"; BUILDER="$RUNID"; ARTROOT="$STATE_BASE/artifacts-${rid}"; SOURCE_REVISION=""
  export RUNID BUILDER ARTROOT SOURCE_REVISION
}
save_identity() { mkdir -p "$STATE_BASE"; chmod 0700 "$STATE_BASE"
  { echo "RUNID=$RUNID"; echo "BUILDER=$BUILDER"; echo "ARTROOT=$ARTROOT"; echo "SOURCE_REVISION=$SOURCE_REVISION"; } > "$STATE_FILE"; }
load_identity() { [ -f "$STATE_FILE" ] || die "no active run"; . "$STATE_FILE"; export RUNID BUILDER ARTROOT SOURCE_REVISION; }

safe_rm_root() { local d="$1"; [ -n "$d" ] || return 1
  case "$d" in "$STATE_BASE"/artifacts-*) : ;; *) echo "service-lab: refusing removal" >&2; return 1;; esac
  case "$d" in /|/root|/home|/Users|"$REPO_ROOT"|"$REPO_ROOT"/*) echo "service-lab: refusing removal — root/repo" >&2; return 1;; esac
  [ -L "$d" ] && return 1; [ -e "$d" ] || return 0; [ -d "$d" ] || return 1; rm -rf "$d"; }

svc_tag() { echo "${RUNID}-$1:local"; }   # run-scoped, non-deployment tag

resolve_inputs() {
  [ -z "$(cd "$REPO_ROOT" && git status --porcelain)" ] || die "worktree not clean"
  SOURCE_REVISION="$(cd "$REPO_ROOT" && git rev-parse HEAD)"; [ "${#SOURCE_REVISION}" -eq 40 ] || die "revision not full SHA"
  export SOURCE_REVISION
}

allow_ok() { local n="$1" e; for e in "${ALLOWLIST[@]}"; do [ "${e%%|*}" = "$n" ] && return 0; done; return 1; }

cmd_run() {
  cap_check >/dev/null; new_identity
  trap 'echo "service-lab: run failed — cleaning up"; do_clean >/dev/null 2>&1 || true; exit 1' ERR
  echo "service-lab: run $RUNID (local/disposable/non-deploying)"
  resolve_inputs; mkdir -p "$ARTROOT"; chmod 0700 "$ARTROOT"; save_identity
  docker buildx create --name "$BUILDER" --driver docker-container >/dev/null
  docker buildx inspect "$BUILDER" --bootstrap >/dev/null
  local e name ctx df
  for e in "${ALLOWLIST[@]}"; do
    IFS='|' read -r name ctx df _bin _port <<<"$e"
    allow_ok "$name" || die "service $name not in approved allowlist"
    # no :latest base in the service Dockerfile (immutability precondition)
    grep -qE '^\s*FROM .*:latest(\s|$)' "$REPO_ROOT/$df" && die "$name Dockerfile uses a mutable :latest base"
    echo "service-lab: building attested image for $name (public deps/bases only, no DB/VM/secret)"
    local oci="$ARTROOT/$name.oci" tag; tag="$(svc_tag "$name")"
    docker buildx build --builder "$BUILDER" \
      --file "$REPO_ROOT/$df" \
      --label "org.opencontainers.image.revision=$SOURCE_REVISION" \
      --label "$LABEL=1" --label "$LABEL.service=$name" --label "$LABEL.run=$RUNID" \
      --sbom=true --provenance=mode=max \
      --metadata-file "$ARTROOT/$name.metadata.json" \
      --output "type=oci,tar=false,dest=$oci,name=$tag" \
      "$REPO_ROOT/$ctx" > "$ARTROOT/$name.build.log" 2>&1 || { echo "  BUILD $name FAILED"; tail -20 "$ARTROOT/$name.build.log"; hold "BLOCKER — SERVICE IMAGE BUILD OR ATTESTATION FAILED" 31; }
    tar -cf "$ARTROOT/$name.tar" -C "$oci" .; docker load -i "$ARTROOT/$name.tar" > "$ARTROOT/$name.load.log" 2>&1 || hold "BLOCKER — SERVICE IMAGE BUILD OR ATTESTATION FAILED" 31
    docker image inspect "$tag" >/dev/null 2>&1 || hold "BLOCKER — SERVICE IMAGE BUILD OR ATTESTATION FAILED" 31
    echo "service-lab: $name built + loaded"
  done
  trap - ERR; echo "service-lab: all four approved service images built"
}

cmd_verify() {
  load_identity; local rc=0 e name binary port tag oci
  for e in "${ALLOWLIST[@]}"; do
    IFS='|' read -r name _ctx _df binary port <<<"$e"
    tag="$(svc_tag "$name")"; oci="$ARTROOT/$name.oci"
    echo "== $name =="
    allow_ok "$name" && echo "  ALLOWLIST service_approved PASS" || { echo "  ALLOWLIST service_approved FAIL"; rc=1; }
    # evidence (SBOM + provenance + revision + service linkage + no secret)
    node "$EVIDENCE" "$oci" "$SOURCE_REVISION" "$name" || rc=1
    # inspection: network none, read-only, no secret, no source mount, entrypoint overridden
    inspect_service "$tag" "$binary" "$port" || rc=1
  done
  echo "SERVICE_LAB_VERIFY_RESULT: $([ "$rc" -eq 0 ] && echo PASS || echo FAIL)"; return "$rc"
}

inspect_service() { # <tag> <binary> <expose_port>
  local tag="$1" binary="$2" port="$3" ok=0
  # config identity + revision
  [ "$(docker image inspect "$tag" -f '{{index .Config.Labels "com.banzami.blueprint.service-lab.service"}}')" != "" ] && echo "  INSPECT service_identity_bound PASS" || { echo "  INSPECT service_identity_bound FAIL"; ok=1; }
  [ "$(docker image inspect "$tag" -f '{{index .Config.Labels "org.opencontainers.image.revision"}}')" = "$SOURCE_REVISION" ] && echo "  INSPECT revision_label_present PASS" || { echo "  INSPECT revision_label_present FAIL"; ok=1; }
  # no secret-like env / label / history
  if docker image inspect "$tag" -f '{{range .Config.Env}}{{println .}}{{end}}{{json .Config.Labels}}' | grep -qiE 'password=|secret=|postgres_password|database_url|api[_-]?key=|private[_-]?key'; then echo "  INSPECT no_secret_env_or_label FAIL"; ok=1; else echo "  INSPECT no_secret_env_or_label PASS"; fi
  if docker history --no-trunc "$tag" 2>/dev/null | grep -qiE 'password=|POSTGRES_PASSWORD|DATABASE_URL=[A-Za-z]|-----BEGIN|api[_-]?key='; then echo "  INSPECT history_no_credentials FAIL"; ok=1; else echo "  INSPECT history_no_credentials PASS"; fi
  # no real VM / sandbox / live binding in metadata
  if docker image inspect "$tag" -f '{{json .Config}}' | grep -qE '217\.160\.9\.248|banzami_staging|banzami_live'; then echo "  INSPECT no_real_binding FAIL"; ok=1; else echo "  INSPECT no_real_binding PASS"; fi
  # no migration-only / migration-control state embedded
  if docker image inspect "$tag" -f '{{json .Config.Labels}}' | grep -qiE 'migration-control|rt04e_migration_url'; then echo "  INSPECT no_migration_state FAIL"; ok=1; else echo "  INSPECT no_migration_state PASS"; fi
  # runtime inspection: network none, read-only, entrypoint overridden — binary present + effective user
  local out; out="$(docker run --rm --network none --read-only --tmpfs /tmp --entrypoint sh "$tag" -c "id -u; command -v $binary >/dev/null && echo BIN_OK || echo BIN_MISSING" 2>/dev/null || true)"
  local uid; uid="$(echo "$out" | sed -n '1p')"
  echo "$out" | grep -q BIN_OK && echo "  INSPECT service_binary_present PASS" || { echo "  INSPECT service_binary_present FAIL"; ok=1; }
  # non-root where supported (Go services USER banzami); core-api runs as root — reported honestly
  local cfguser; cfguser="$(docker image inspect "$tag" -f '{{.Config.User}}')"
  if [ -n "$cfguser" ] && [ "$cfguser" != "root" ] && [ "$cfguser" != "0" ]; then echo "  INSPECT runtime_user_non_root PASS (user set)"; else echo "  INSPECT runtime_user_non_root NOTE (image runs as root; service does not set USER)"; fi
  return "$ok"
}

do_clean() {
  local e name
  for e in "${ALLOWLIST[@]}"; do name="${e%%|*}"; [ -n "${RUNID:-}" ] && docker image rm -f "$(svc_tag "$name")" >/dev/null 2>&1 || true; done
  docker ps -aq --filter "label=$LABEL.run=$RUNID" | xargs -r docker rm -f >/dev/null 2>&1 || true
  [ -n "${BUILDER:-}" ] && docker buildx rm "$BUILDER" >/dev/null 2>&1 || true
  [ -n "${ARTROOT:-}" ] && safe_rm_root "$ARTROOT" 2>/dev/null || true
  rm -f "$STATE_FILE" 2>/dev/null || true
}
cmd_clean() { load_identity 2>/dev/null || true; echo "service-lab: teardown ${RUNID:-<none>} (scoped)"; do_clean; echo "service-lab: teardown done"; }
cmd_verify_clean() {
  local rc=0 c i b a
  c="$(docker ps -aq --filter "label=$LABEL" 2>/dev/null | grep -c . || true)"
  i="$(docker image ls -aq --filter "label=$LABEL" 2>/dev/null | grep -c . || true)"
  b="$(docker buildx ls 2>/dev/null | grep -c 'bzservicelab-' || true)"
  a="$(ls -d "$STATE_BASE"/artifacts-* 2>/dev/null | grep -c . || true)"
  echo "RESIDUE containers=$c images=$i builders=$b roots=$a"
  { [ "$c" = 0 ] && [ "$i" = 0 ] && [ "$b" = 0 ] && [ "$a" = 0 ]; } && echo "RESIDUE_RESULT: PASS" || { echo "RESIDUE_RESULT: FAIL"; rc=1; }; return "$rc"
}
cmd_full() { local rc=0; cmd_run; cmd_verify || rc=1; cmd_clean; cmd_verify_clean || rc=1
  echo "SERVICE_LAB_FULL_RESULT: $([ "$rc" -eq 0 ] && echo PASS || echo FAIL)"; return "$rc"; }

case "${1:-}" in
  capability) cap_check ;; run) cmd_run ;; verify) cmd_verify ;; clean) cmd_clean ;; verify-clean) cmd_verify_clean ;; full) cmd_full ;;
  *) die "usage: service-image-lab.sh {capability|run|verify|clean|verify-clean|full}" ;;
esac
