#!/usr/bin/env bash
# sandbox-source-deploy.sh — Local operator orchestrator for the fast Sandbox deploy.
#
# Creates a SOURCE BUNDLE from the exact local commit, transfers only the bundle +
# manifest + checksum to the Sandbox server, and the server builds the selected
# service(s) NATIVELY on amd64 (no Mac QEMU) and deploys only those services.
#
# Git stays ONLY on the operator machine. The server receives no .git, no repository
# history and no GitHub credentials. Secrets are never bundled (git archive ships only
# committed files; .env / secret / runtime files are untracked and excluded).
#
# Usage (normally invoked via ./deploy.sh <service>):
#   sandbox-source-deploy.sh <service> [<service> ...] [flags]
#   sandbox-source-deploy.sh --all [flags]
# Flags:
#   --all                            build/deploy all Sandbox services (explicit)
#   --allow-dirty                    allow a dirty worktree (default: require clean)
#   --dry-run                        create the bundle + plan only; no transfer/build/deploy
#   --build-only                     bundle -> transfer -> native build; NO deploy
#   --deploy-only-from-existing-build  skip build; deploy from the last built image on the server
#   --run-e2e                        after deploy, run the developer-platform E2E (opt-in)
#   --local-amd64-build-fallback     use the local attested QEMU build (fallback), not server-native
# The server target is read from $BANZAMI_SANDBOX_SSH, or from the REMOTE= line of the
# repository deploy.sh at runtime. No server address is stored in this file.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
SANDBOX_SERVICES=(core-api-staging api-gateway-staging developer-api public-api-staging)
REMOTE_ROOT="banzami-source-deploy"   # server-side home-relative root (staging + releases)

die(){ printf '\033[0;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
info(){ printf '  %s\n' "$*"; }
step(){ printf '\n\033[1;36m[%s]\033[0m %s\n' "$1" "$2"; }

is_sandbox_svc(){ local s; for s in "${SANDBOX_SERVICES[@]}"; do [ "$s" = "$1" ] && return 0; done; return 1; }
resolve_remote(){ if [ -n "${BANZAMI_SANDBOX_SSH:-}" ]; then printf '%s' "$BANZAMI_SANDBOX_SSH"; else grep -E '^REMOTE=' "$REPO_ROOT/deploy.sh" | head -1 | sed -E 's/^REMOTE=//; s/^"//; s/"$//'; fi; }

# ---- args ----
SERVICES=(); ALL=0; ALLOW_DIRTY=0; DRY=0; BUILD_ONLY=0; DEPLOY_ONLY=0; RUN_E2E=0; QEMU_FB=0
for a in "$@"; do case "$a" in
  --all) ALL=1 ;;
  --allow-dirty) ALLOW_DIRTY=1 ;;
  --dry-run) DRY=1 ;;
  --build-only) BUILD_ONLY=1 ;;
  --deploy-only-from-existing-build) DEPLOY_ONLY=1 ;;
  --run-e2e) RUN_E2E=1 ;;
  --local-amd64-build-fallback) QEMU_FB=1 ;;
  --*) die "unknown flag: $a" ;;
  *) SERVICES+=("$a") ;;
esac; done
if [ "$ALL" = 1 ]; then SERVICES=("${SANDBOX_SERVICES[@]}"); fi
[ "${#SERVICES[@]}" -gt 0 ] || die "no service selected (pass a service name or --all)"
for s in "${SERVICES[@]}"; do is_sandbox_svc "$s" || die "not a Sandbox service: $s (expected one of: ${SANDBOX_SERVICES[*]})"; done
SVCTAG="$([ "$ALL" = 1 ] && echo all || { [ "${#SERVICES[@]}" -gt 1 ] && echo multi || echo "${SERVICES[0]}"; })"

# ---- Step 1-3: local git validation + commit ----
step 1 "validate local Git checkout"
git -C "$REPO_ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1 || die "not a Git checkout"
if [ "$ALLOW_DIRTY" != 1 ]; then
  [ -z "$(git -C "$REPO_ROOT" status --porcelain)" ] || die "worktree not clean (commit, or pass --allow-dirty)"
  info "worktree clean"
else info "worktree cleanliness NOT enforced (--allow-dirty)"; fi
COMMIT="$(git -C "$REPO_ROOT" rev-parse HEAD)"; SHORT="${COMMIT:0:12}"
info "commit: $SHORT  services: ${SERVICES[*]}  fallback-QEMU: $([ "$QEMU_FB" = 1 ] && echo yes || echo no)"

# ---- local QEMU fallback path (explicit only) ----
if [ "$QEMU_FB" = 1 ]; then
  step FB "local amd64 QEMU attested build (fallback path — NOT the routine flow)"
  info "delegating to the formal attested build: make sandbox-release-package (+ gated transfer/deploy)"
  info "run: (cd $REPO_ROOT && make sandbox-release-package && make sandbox-release-package-verify)"
  die "fallback path is manual by design; re-run without --local-amd64-build-fallback for the native-server flow"
fi

# ---- Step 4-6: source bundle + manifest + checksum + local receipt ----
OUT="${TMPDIR:-/tmp}/banzami-source-deploy"; mkdir -p "$OUT"
BUNDLE="$OUT/banzami-source-$SHORT-$SVCTAG.tar.gz"
MANIFEST="$OUT/banzami-source-$SHORT-$SVCTAG.manifest.json"
SHAFILE="$OUT/banzami-source-$SHORT-$SVCTAG.sha256"
RECEIPT="$OUT/banzami-source-$SHORT-$SVCTAG.receipt.txt"
DEPLOY_MODE="$([ "$BUILD_ONLY" = 1 ] && echo build-only || { [ "$DEPLOY_ONLY" = 1 ] && echo deploy-only || echo build-and-deploy; })"

step 4 "create source bundle from commit $SHORT (git archive; excludes .git and untracked files)"
# git archive ships ONLY committed files at $COMMIT — no .git, no untracked .env/secret/runtime state.
git -C "$REPO_ROOT" archive --format=tar.gz -o "$BUNDLE" "$COMMIT"
SUM="$(shasum -a 256 "$BUNDLE" | awk '{print $1}')"
printf '%s  %s\n' "$SUM" "$(basename "$BUNDLE")" > "$SHAFILE"
node -e 'const fs=require("fs");const m={schema:"banzami-source-bundle/v1",commit:process.argv[1],services:process.argv[2].split(","),deploy_mode:process.argv[3],bundle:process.argv[4],sha256:process.argv[5],generated_at_note:"stamped server-side"};fs.writeFileSync(process.argv[6],JSON.stringify(m,null,2)+"\n")' \
  "$COMMIT" "$(IFS=,; echo "${SERVICES[*]}")" "$DEPLOY_MODE" "$(basename "$BUNDLE")" "$SUM" "$MANIFEST" 2>/dev/null \
  || printf '{\n  "schema": "banzami-source-bundle/v1",\n  "commit": "%s",\n  "services": "%s",\n  "deploy_mode": "%s",\n  "bundle": "%s",\n  "sha256": "%s"\n}\n' "$COMMIT" "${SERVICES[*]}" "$DEPLOY_MODE" "$(basename "$BUNDLE")" "$SUM" > "$MANIFEST"
{ echo "banzami source-bundle receipt"; echo "commit: $COMMIT"; echo "services: ${SERVICES[*]}"; echo "deploy_mode: $DEPLOY_MODE"; echo "bundle: $(basename "$BUNDLE")"; echo "sha256: $SUM"; } > "$RECEIPT"
info "bundle: $(basename "$BUNDLE") ($(du -h "$BUNDLE" | awk '{print $1}'))"
info "manifest + sha256 + local receipt written (no secrets, no server address)"

if [ "$DRY" = 1 ]; then
  step DRY "dry-run — plan only"
  info "would transfer: bundle + manifest + checksum (NOT .git, NOT history, NOT images, NOT secrets)"
  info "would then, on the amd64 server: verify checksum -> unpack to releases/$SHORT -> build [${SERVICES[*]}] natively -> $([ "$BUILD_ONLY" = 1 ] && echo 'stop (build-only)' || echo 'deploy selected + healthcheck') -> sanitised receipt"
  info "migration: NEVER part of this command · E2E: $([ "$RUN_E2E" = 1 ] && echo 'requested' || echo 'not run')"
  echo "SANDBOX_SOURCE_DEPLOY: DRY-RUN OK"; exit 0
fi

# ---- Step 6-7: transfer only bundle + manifest + checksum ----
REMOTE="$(resolve_remote)"; [ -n "$REMOTE" ] || die "server target not resolved (set BANZAMI_SANDBOX_SSH)"
step 6 "transfer bundle + manifest + checksum (only) to the Sandbox server"
ssh -o BatchMode=yes "$REMOTE" "mkdir -p ~/$REMOTE_ROOT/staging ~/$REMOTE_ROOT/releases" >/dev/null 2>&1 || die "cannot prepare server staging"
scp -o BatchMode=yes "$BUNDLE" "$MANIFEST" "$SHAFILE" "$REMOTE:~/$REMOTE_ROOT/staging/" >/dev/null 2>&1 || die "transfer failed"
info "transferred (no .git / history / images / secrets)"

# ---- Step 7-11: server verifies + unpacks + native build + selected-service deploy ----
step 7 "server: verify checksum -> unpack versioned release -> native amd64 build -> deploy selected"
SVCS_CSV="$(IFS=,; echo "${SERVICES[*]}")"   # comma-separated, space-free (ssh re-splits on spaces)
# Bootstrap on the server: verify sha256, unpack (versioned; keep previous), then exec the
# unpacked remote build script. The script itself ships inside the bundle (no Git on server).
# Only space-free values are passed (ssh does not preserve arg boundaries).
ssh -o BatchMode=yes "$REMOTE" bash -s -- "$REMOTE_ROOT" "$SHORT" "$(basename "$BUNDLE")" "$SVCS_CSV" "$DEPLOY_MODE" <<'REMOTE_BOOTSTRAP' || die "server build/deploy failed"
set -euo pipefail
ROOT="$1"; SHORT="$2"; BUNDLE="$3"; SVCS="$4"; MODE="$5"
cd "$HOME/$ROOT/staging"
shasum -a 256 -c "${BUNDLE%.tar.gz}.sha256" >/dev/null 2>&1 || { echo "  checksum_verify FAIL"; exit 2; }
echo "  checksum_verify PASS"
REL="$HOME/$ROOT/releases/$SHORT"
if [ ! -d "$REL" ]; then mkdir -p "$REL"; tar -xzf "$BUNDLE" -C "$REL"; fi
[ -L "$HOME/$ROOT/current" ] && cp -P "$HOME/$ROOT/current" "$HOME/$ROOT/previous" 2>/dev/null || true
RB="$REL/infra/blueprint/sandbox-ops/scripts/remote-native-build.sh"
[ -f "$RB" ] || { echo "  remote-native-build.sh missing from bundle"; exit 3; }
bash "$RB" --release "$REL" --root "$HOME/$ROOT" --commit "$SHORT" --services "$SVCS" --mode "$MODE"
REMOTE_BOOTSTRAP

# ---- optional E2E (opt-in) ----
if [ "$RUN_E2E" = 1 ] && [ "$BUILD_ONLY" != 1 ]; then
  step E2E "run developer-platform E2E (--run-e2e)"
  scp -o BatchMode=yes "$REPO_ROOT/tests/phase0/developer-platform-e2e.sh" "$REMOTE:/tmp/dpe2e.sh" >/dev/null 2>&1 && \
  ssh -o BatchMode=yes "$REMOTE" 'bash /tmp/dpe2e.sh 2>&1 | tail -3; rm -f /tmp/dpe2e.sh' || info "E2E harness not run"
fi

echo "SANDBOX_SOURCE_DEPLOY: OK (commit $SHORT, services ${SERVICES[*]}, mode $DEPLOY_MODE)"
