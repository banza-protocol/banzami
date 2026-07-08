#!/usr/bin/env bash
# Banzami Environment Blueprint — verified Sandbox release package (adapter B).
#
# Builds, from the clean canonical revision, a secret-free release package containing: a
# verified immutable source-transfer artifact (git bundle), attested immutable images for
# EXACTLY the four approved services + the attested operational migration executor (with
# SBOM + provenance), a manifest binding every immutable identity, and a checksum set. The
# later VM transfer needs no VM GitHub remote / deploy key / build / registry pull: the
# manifest-recorded content identities are verified before any load/deploy.
#
# Subcommands: build | verify | clean | verify-clean | full
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LAB_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$LAB_DIR/../../.." && pwd)"
MIG_DIR="$REPO_ROOT/db/migrations"
RUNNER_LAB="$REPO_ROOT/infra/blueprint/build-lab/scripts/runner-build-lab.sh"
RUNNER_STATE="${TMPDIR:-/tmp}/banzami-blueprint-runner-lab/current.run"
EXEC_DOCKERFILE="$LAB_DIR/Dockerfile.operational-executor"
SVC_EVIDENCE="$REPO_ROOT/infra/blueprint/service-lab/scripts/validate-service-evidence.mjs"
LABEL="com.banzami.blueprint.release"
STATE_BASE="${TMPDIR:-/tmp}/banzami-blueprint-release"
STATE_FILE="$STATE_BASE/current.run"

# APPROVED four services: name|context|dockerfile
SERVICES=(
  "core-api-staging|core|core/Dockerfile"
  "api-gateway-staging|services|services/api-gateway/Dockerfile"
  "developer-api|services|services/developer-api/Dockerfile"
  "public-api-staging|services|services/public-api/Dockerfile"
)
unset DOCKER_DEFAULT_PLATFORM BUILDX_BUILDER DATABASE_URL BZRP_RUNID BZRP_ROOT 2>/dev/null || true
die() { echo "release-package: $*" >&2; exit 1; }
hold() { echo "$1"; exit "${2:-40}"; }
sha256() { shasum -a 256 "$1" | awk '{print $1}'; }

new_identity() { local rid; rid="$(date +%Y%m%d%H%M%S)-$$-${RANDOM}"
  RUNID="bzrelease-${rid}"; BUILDER="$RUNID"; RELEASE_ROOT="$STATE_BASE/pkg-${rid}"; SOURCE_REVISION=""; PARENT_DIGEST=""; RUNNER_OCI=""
  export RUNID BUILDER RELEASE_ROOT SOURCE_REVISION PARENT_DIGEST RUNNER_OCI; }
save_identity() { mkdir -p "$STATE_BASE"; chmod 0700 "$STATE_BASE"
  { echo "RUNID=$RUNID"; echo "BUILDER=$BUILDER"; echo "RELEASE_ROOT=$RELEASE_ROOT"; echo "SOURCE_REVISION=$SOURCE_REVISION"; echo "PARENT_DIGEST=$PARENT_DIGEST"; echo "RUNNER_OCI=$RUNNER_OCI"; } > "$STATE_FILE"; }
load_identity() { [ -f "$STATE_FILE" ] || die "no active release run"; . "$STATE_FILE"; export RUNID BUILDER RELEASE_ROOT SOURCE_REVISION PARENT_DIGEST RUNNER_OCI; }
safe_rm_root() { local d="$1"; [ -n "$d" ] || return 1
  case "$d" in "$STATE_BASE"/pkg-*) : ;; *) echo "release-package: refusing removal" >&2; return 1;; esac
  case "$d" in /|/root|/home|/Users|"$REPO_ROOT"|"$REPO_ROOT"/*) return 1;; esac
  [ -L "$d" ] && return 1; [ -e "$d" ] || return 0; [ -d "$d" ] || return 1; rm -rf "$d"; }

# image manifest (content) digest from an OCI layout
oci_image_digest() { OCI="$1" node -e '
  const fs=require("fs"),p=require("path");const oci=process.env.OCI;
  const blob=d=>JSON.parse(fs.readFileSync(p.join(oci,"blobs",d.split(":")[0],d.split(":")[1])));
  const top=JSON.parse(fs.readFileSync(p.join(oci,"index.json")));let img=null;
  const v=d=>{const m=d.mediaType||"";if(m.includes("image.index"))blob(d.digest).manifests.forEach(v);
    else if(m.includes("image.manifest")&&(d.annotations||{})["vnd.docker.reference.type"]!=="attestation-manifest")img=img||d.digest;};
  top.manifests.forEach(v);process.stdout.write(img||"");'; }

resolve_inputs() {
  [ -z "$(cd "$REPO_ROOT" && git status --porcelain)" ] || die "worktree not clean"
  SOURCE_REVISION="$(cd "$REPO_ROOT" && git rev-parse HEAD)"; [ "${#SOURCE_REVISION}" -eq 40 ] || die "revision not full SHA"
  MIG_DIGEST="$(cat $(ls "$MIG_DIR"/*.sql | sort) | shasum -a 256 | awk '{print $1}')"
  export SOURCE_REVISION MIG_DIGEST
}

cmd_build() {
  docker info >/dev/null 2>&1 || hold "BLOCKER — RELEASE PACKAGE CONTRACT CANNOT BE VALIDATED" 41
  new_identity; resolve_inputs
  trap 'echo "release-package: build failed — cleaning up"; do_clean >/dev/null 2>&1 || true; exit 1' ERR
  echo "release-package: build $RUNID"
  mkdir -p "$RELEASE_ROOT/images" "$RELEASE_ROOT/evidence"; chmod -R 0700 "$RELEASE_ROOT"; save_identity
  # 1) verified immutable source-transfer artifact
  ( cd "$REPO_ROOT" && git bundle create "$RELEASE_ROOT/source.bundle" HEAD ) >/dev/null 2>&1 || die "git bundle failed"
  ( cd "$REPO_ROOT" && git bundle verify "$RELEASE_ROOT/source.bundle" ) >/dev/null 2>&1 || die "git bundle verify failed"
  # 2) attested runner base (2B handoff) + parent digest
  bash "$RUNNER_LAB" build  > "$RELEASE_ROOT/evidence/runner-build.log" 2>&1 || die "runner build failed"
  bash "$RUNNER_LAB" verify > "$RELEASE_ROOT/evidence/runner-verify.log" 2>&1 || die "runner verify failed"
  RUNNER_OCI="$(. "$RUNNER_STATE"; echo "$OCI_DIR")"; [ -d "$RUNNER_OCI" ] || die "runner OCI missing"
  PARENT_DIGEST="$(oci_image_digest "$RUNNER_OCI")"; case "$PARENT_DIGEST" in sha256:*) : ;; *) die "no parent digest";; esac
  save_identity
  local builder="$BUILDER"
  docker buildx create --name "$builder" --driver docker-container >/dev/null; docker buildx inspect "$builder" --bootstrap >/dev/null
  # 3) attested operational executor (FROM runner, embeds migrations, operational entrypoint)
  local ectx="$RELEASE_ROOT/exec-ctx"; mkdir -p "$ectx"
  cp -R "$MIG_DIR" "$ectx/migrations"; cp "$SCRIPT_DIR/operational-entrypoint.sh" "$ectx/operational-entrypoint.sh"; cp "$EXEC_DOCKERFILE" "$ectx/Dockerfile"
  local edf; edf="$(sha256 "$EXEC_DOCKERFILE")"
  docker buildx build --builder "$builder" \
    --platform "${BZ_TARGET_PLATFORM:-linux/amd64}" \
    --build-context "base-runner=oci-layout://$RUNNER_OCI@$PARENT_DIGEST" \
    --build-arg "SOURCE_REVISION=$SOURCE_REVISION" --build-arg "PARENT_DIGEST=$PARENT_DIGEST" \
    --build-arg "MIGRATIONS_DIGEST=$MIG_DIGEST" --build-arg "DOCKERFILE_DIGEST=$edf" --build-arg "RUN_IDENTITY=$RUNID" \
    --sbom=true --provenance=mode=max \
    --output "type=oci,tar=false,dest=$RELEASE_ROOT/images/sandbox-executor.oci,name=${RUNID}-executor:local" \
    -f "$ectx/Dockerfile" "$ectx" > "$RELEASE_ROOT/evidence/executor-build.log" 2>&1 || die "executor build failed"
  rm -rf "$ectx"
  local exec_digest; exec_digest="$(oci_image_digest "$RELEASE_ROOT/images/sandbox-executor.oci")"
  # 4) four attested service images
  local e name ctx df dfd
  for e in "${SERVICES[@]}"; do
    IFS='|' read -r name ctx df <<<"$e"
    grep -qE '^\s*FROM .*:latest(\s|$)' "$REPO_ROOT/$df" && die "$name uses :latest base"
    dfd="$(sha256 "$REPO_ROOT/$df")"
    echo "release-package: building attested $name"
    docker buildx build --builder "$builder" --file "$REPO_ROOT/$df" \
      --platform "${BZ_TARGET_PLATFORM:-linux/amd64}" \
      --label "org.opencontainers.image.revision=$SOURCE_REVISION" \
      --label "com.banzami.blueprint.service-lab=1" --label "com.banzami.blueprint.service-lab.service=$name" --label "com.banzami.blueprint.service-lab.run=$RUNID" \
      --sbom=true --provenance=mode=max \
      --output "type=oci,tar=false,dest=$RELEASE_ROOT/images/$name.oci,name=${RUNID}-$name:local" \
      "$REPO_ROOT/$ctx" > "$RELEASE_ROOT/evidence/$name-build.log" 2>&1 || { echo "  $name build FAILED"; tail -15 "$RELEASE_ROOT/evidence/$name-build.log"; hold "BLOCKER — RELEASE PACKAGE CONTRACT CANNOT BE VALIDATED" 41; }
    printf '%s\n' "$dfd" > "$RELEASE_ROOT/evidence/$name.dockerfile.sha256"
  done
  docker buildx rm "$builder" >/dev/null 2>&1 || true
  # 5) manifest (secret-free bindings) + checksums
  write_manifest "$exec_digest" "$edf"
  write_checksums
  trap - ERR
  echo "release-package: package built (source bundle + 4 service images + operational executor + manifest + checksums)"
}

write_manifest() { # <exec_digest> <exec_dockerfile_digest>
  local m="$RELEASE_ROOT/manifest.txt" e name
  { echo "kind=banzami-sandbox-release"
    echo "source_revision=$SOURCE_REVISION"
    echo "service_set=core-api-staging api-gateway-staging developer-api public-api-staging"
    echo "executor.image_digest=$1"
    echo "executor.parent_runner_digest=$PARENT_DIGEST"
    echo "executor.migrations_digest=$MIG_DIGEST"
    echo "executor.dockerfile_digest=$2"
    for e in "${SERVICES[@]}"; do IFS='|' read -r name _ctx _df <<<"$e"
      echo "service.$name.image_digest=$(oci_image_digest "$RELEASE_ROOT/images/$name.oci")"
      echo "service.$name.dockerfile_digest=$(cat "$RELEASE_ROOT/evidence/$name.dockerfile.sha256")"
    done
  } > "$m"; chmod 0600 "$m"
}
write_checksums() {
  local c="$RELEASE_ROOT/checksums.txt" f
  : > "$c"
  { echo "$(sha256 "$RELEASE_ROOT/source.bundle")  source.bundle"
    echo "$(sha256 "$RELEASE_ROOT/manifest.txt")  manifest.txt"
    for f in "$RELEASE_ROOT"/images/*.oci; do echo "$(sha256 "$f/index.json")  images/$(basename "$f")/index.json"; done
  } > "$c"; chmod 0600 "$c"
}

cmd_verify() {
  load_identity; local rc=0 m="$RELEASE_ROOT/manifest.txt"
  echo "== release package verification =="
  # source bundle verified + revision match
  ( cd "$REPO_ROOT" && git bundle verify "$RELEASE_ROOT/source.bundle" ) >/dev/null 2>&1 && echo "RELEASE source_bundle_verified PASS" || { echo "RELEASE source_bundle_verified FAIL"; rc=1; }
  [ "$(grep '^source_revision=' "$m" | cut -d= -f2)" = "$SOURCE_REVISION" ] && [ "${#SOURCE_REVISION}" -eq 40 ] && echo "RELEASE revision_bound_full_sha PASS" || { echo "RELEASE revision_bound_full_sha FAIL"; rc=1; }
  # checksums match
  local ok=1 line file sum
  while read -r sum file; do [ -n "$file" ] || continue
    [ "$(sha256 "$RELEASE_ROOT/$file")" = "$sum" ] || { ok=0; }; done < "$RELEASE_ROOT/checksums.txt"
  [ "$ok" = 1 ] && echo "RELEASE checksums_match PASS" || { echo "RELEASE checksums_match FAIL"; rc=1; }
  # exactly the four services; each image present, digest matches manifest, SBOM+provenance valid, secret-free
  local e name d
  for e in "${SERVICES[@]}"; do IFS='|' read -r name _c _df <<<"$e"
    [ -d "$RELEASE_ROOT/images/$name.oci" ] || { echo "RELEASE $name image_present FAIL"; rc=1; continue; }
    d="$(oci_image_digest "$RELEASE_ROOT/images/$name.oci")"
    [ "$d" = "$(grep "^service.$name.image_digest=" "$m" | cut -d= -f2)" ] && echo "RELEASE $name digest_matches_manifest PASS" || { echo "RELEASE $name digest_matches_manifest FAIL"; rc=1; }
    node "$SVC_EVIDENCE" "$RELEASE_ROOT/images/$name.oci" "$SOURCE_REVISION" "$name" >/dev/null 2>&1 && echo "RELEASE $name sbom_provenance_valid PASS" || { echo "RELEASE $name sbom_provenance_valid FAIL"; rc=1; }
  done
  # executor digest matches + present
  [ -d "$RELEASE_ROOT/images/sandbox-executor.oci" ] && [ "$(oci_image_digest "$RELEASE_ROOT/images/sandbox-executor.oci")" = "$(grep '^executor.image_digest=' "$m" | cut -d= -f2)" ] && echo "RELEASE executor_digest_matches PASS" || { echo "RELEASE executor_digest_matches FAIL"; rc=1; }
  # forbidden services / mutable tags / placeholders / secrets rejected
  grep -qiE 'admin-api|website|checkout|dashboard|pay-frontend|banzai|banza-docs' "$m" && { echo "RELEASE no_forbidden_service FAIL"; rc=1; } || echo "RELEASE no_forbidden_service PASS"
  grep -qiE ':latest|<digest>|placeholder' "$m" && { echo "RELEASE no_mutable_or_placeholder FAIL"; rc=1; } || echo "RELEASE no_mutable_or_placeholder PASS"
  if grep -rqiE 'password|://[^ ]*:[^ ]*@|BEGIN [A-Z ]*PRIVATE KEY|DATABASE_URL=[A-Za-z]|217\.160\.9\.248' "$m" "$RELEASE_ROOT/checksums.txt"; then echo "RELEASE secret_free FAIL"; rc=1; else echo "RELEASE secret_free PASS"; fi
  echo "RELEASE_PACKAGE_VERIFY_RESULT: $([ "$rc" -eq 0 ] && echo PASS || echo FAIL)"; return "$rc"
}

do_clean() {
  [ -n "${BUILDER:-}" ] && docker buildx rm "$BUILDER" >/dev/null 2>&1 || true
  bash "$RUNNER_LAB" clean >/dev/null 2>&1 || true
  # remove any run-scoped loaded images
  docker image ls --format '{{.Repository}}:{{.Tag}}' | grep "^${RUNID}-" 2>/dev/null | xargs -r docker image rm -f >/dev/null 2>&1 || true
  [ -n "${RELEASE_ROOT:-}" ] && safe_rm_root "$RELEASE_ROOT" 2>/dev/null || true
  rm -f "$STATE_FILE" 2>/dev/null || true
}
cmd_clean() { load_identity 2>/dev/null || true; echo "release-package: teardown ${RUNID:-<none>}"; do_clean; echo "release-package: teardown done"; }
cmd_verify_clean() {
  local rc=0 b p
  b="$(docker buildx ls 2>/dev/null | grep -c 'bzrelease-\|bzrunnerlab-' || true)"
  p="$(ls -d "$STATE_BASE"/pkg-* 2>/dev/null | grep -c . || true)"
  echo "RESIDUE builders=$b package_roots=$p"
  { [ "$b" = 0 ] && [ "$p" = 0 ]; } && echo "RESIDUE_RESULT: PASS" || { echo "RESIDUE_RESULT: FAIL"; rc=1; }; return "$rc"
}
cmd_full() { local rc=0; cmd_build; cmd_verify || rc=1; cmd_clean; cmd_verify_clean || rc=1
  echo "RELEASE_PACKAGE_FULL_RESULT: $([ "$rc" -eq 0 ] && echo PASS || echo FAIL)"; return "$rc"; }

case "${1:-}" in
  build) cmd_build ;; verify) cmd_verify ;; clean) cmd_clean ;; verify-clean) cmd_verify_clean ;; full) cmd_full ;;
  *) die "usage: sandbox-release-package.sh {build|verify|clean|verify-clean|full}" ;;
esac
