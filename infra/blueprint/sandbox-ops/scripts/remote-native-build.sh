#!/usr/bin/env bash
# remote-native-build.sh — Server-side native amd64 build + selected-service deploy.
#
# Runs ON the Sandbox server, INSIDE an unpacked, checksum-verified source release
# (no Git, no repository history, no .git on the server). It builds only the selected
# service(s) natively on amd64 with BuildKit cache, records the image digest, runs a
# secret-free image check, and (unless build-only) deploys/restarts only those services
# via the gated per-service deploy (reusing the Sandbox's file-only secrets + config).
#
# It NEVER runs a database migration, NEVER resets the VM and NEVER prunes unrelated
# Docker resources. Output is sanitised.
#
# Usage: remote-native-build.sh --release <dir> --root <dir> --commit <short> \
#          --services <csv> --mode <build-only|deploy-only|build-and-deploy>
set -euo pipefail

REL=""; ROOT=""; COMMIT=""; SERVICES_CSV=""; MODE="build-and-deploy"
while [ $# -gt 0 ]; do case "$1" in
  --release) REL="$2"; shift 2 ;;
  --root) ROOT="$2"; shift 2 ;;
  --commit) COMMIT="$2"; shift 2 ;;
  --services) SERVICES_CSV="$2"; shift 2 ;;
  --mode) MODE="$2"; shift 2 ;;
  *) echo "unknown arg: $1" >&2; exit 2 ;;
esac; done
[ -d "$REL" ] || { echo "release dir missing" >&2; exit 2; }
IFS=',' read -r -a SERVICES <<< "$SERVICES_CSV"
DEPLOY="$REL/infra/blueprint/sandbox-ops/scripts/sandbox-deploy.sh"
RECEIPTS="$ROOT/receipts"; mkdir -p "$RECEIPTS"
RECEIPT="$RECEIPTS/deploy-$COMMIT.txt"

# service -> "context|dockerfile|port" (contexts mirror the committed Dockerfiles)
svc_build_spec() {
  case "$1" in
    core-api-staging)      echo "$REL/core|$REL/core/Dockerfile|8081" ;;
    api-gateway-staging)   echo "$REL/services|$REL/services/api-gateway/Dockerfile|8080" ;;
    developer-api)         echo "$REL/services|$REL/services/developer-api/Dockerfile|8086" ;;
    public-api-staging)    echo "$REL/services|$REL/services/public-api/Dockerfile|8083" ;;
    # The hosted payer surface. Its build context is its own app directory, and
    # the gateway origin is baked in: NEXT_PUBLIC_* is read by client bundles at
    # build time, so it cannot be supplied at run time.
    pay-frontend)          echo "$REL/apps/pay|$REL/apps/pay/Dockerfile|3002" ;;
    # The operator console. admin-api reads the same Sandbox database every other
    # service does; admin-frontend is a browser app and, like pay-frontend, bakes
    # its API origin at build time because NEXT_PUBLIC_* is read by client bundles.
    admin-api)             echo "$REL/services|$REL/services/admin-api/Dockerfile|8082" ;;
    admin-frontend)        echo "$REL/apps/admin|$REL/apps/admin/Dockerfile|3002" ;;
    *) return 1 ;;
  esac
}

echo "== native build/deploy (commit $COMMIT, mode $MODE) ==" | tee "$RECEIPT"

# amd64 gate — routine Sandbox build must be native.
ARCH="$(uname -m)"
if [ "$ARCH" = "x86_64" ] || [ "$ARCH" = "amd64" ]; then echo "  arch_amd64 PASS" | tee -a "$RECEIPT"
else echo "  arch_amd64 FAIL (got $ARCH)" | tee -a "$RECEIPT"; exit 3; fi

export DOCKER_BUILDKIT=1
declare -a BUILT_SVC BUILT_TAG
for svc in "${SERVICES[@]}"; do
  spec="$(svc_build_spec "$svc")" || { echo "  $svc unknown service" | tee -a "$RECEIPT"; exit 4; }
  ctx="${spec%%|*}"; rest="${spec#*|}"; df="${rest%%|*}"; port="${rest##*|}"
  tag="banzami-sandbox/$svc:$COMMIT"
  [ "$MODE" = "deploy-only" ] && { echo "  $svc build skipped (deploy-only)" | tee -a "$RECEIPT"; BUILT_SVC+=("$svc"); BUILT_TAG+=("$tag"); continue; }
  echo "  building $svc natively (BuildKit cache)..." | tee -a "$RECEIPT"
  bargs=(--build-arg BUILD_COMMIT="$COMMIT")
  [ "$svc" = "pay-frontend" ] && bargs+=(--build-arg NEXT_PUBLIC_GATEWAY_URL="${PAY_GATEWAY_URL:-https://sandbox-api.banzami.com}")
  if docker build "${bargs[@]}" -f "$df" -t "$tag" "$ctx" >/dev/null 2>&1; then echo "  $svc build PASS" | tee -a "$RECEIPT"
  else echo "  $svc build FAIL" | tee -a "$RECEIPT"; exit 5; fi
  # record digest (image id) — sanitised, no build log
  DIG="$(docker image inspect "$tag" --format '{{.Id}}' 2>/dev/null | cut -c1-19)"
  echo "  $svc image_id ${DIG}…" | tee -a "$RECEIPT"
  # secret-free image check (env/labels carry no secret)
  if docker image inspect "$tag" -f '{{json .Config.Env}}{{json .Config.Labels}}' 2>/dev/null | grep -qiE 'password=|secret=|database_url=[a-z]|private[_-]?key'; then
    echo "  $svc image_secret_free FAIL" | tee -a "$RECEIPT"; exit 6
  else echo "  $svc image_secret_free PASS" | tee -a "$RECEIPT"; fi
  BUILT_SVC+=("$svc"); BUILT_TAG+=("$tag")
done

if [ "$MODE" = "build-only" ]; then
  echo "REMOTE_NATIVE_BUILD: BUILD-ONLY OK" | tee -a "$RECEIPT"; exit 0
fi

# deploy each selected service (reusing the Sandbox's file-only secrets + config),
# with rollback to the previous image on health failure. No migration, no VM reset,
# no prune.
[ -f "$DEPLOY" ] || { echo "  sandbox-deploy.sh missing" | tee -a "$RECEIPT"; exit 7; }
i=0
for svc in "${BUILT_SVC[@]}"; do
  tag="${BUILT_TAG[$i]}"; i=$((i+1))
  echo "  deploying $svc -> $tag (selected-service only)" | tee -a "$RECEIPT"
  if bash "$DEPLOY" deploy-one "$svc" "$tag" >/dev/null 2>&1; then echo "  $svc deployed_and_healthy PASS" | tee -a "$RECEIPT"
  else echo "  $svc deployed_and_healthy FAIL — attempting rollback" | tee -a "$RECEIPT"
    bash "$DEPLOY" deploy-one "$svc" "$tag" --rollback >/dev/null 2>&1 || true
    echo "  $svc ROLLBACK attempted" | tee -a "$RECEIPT"; exit 8
  fi
done
echo "REMOTE_NATIVE_BUILD: DEPLOY OK ($COMMIT)" | tee -a "$RECEIPT"
