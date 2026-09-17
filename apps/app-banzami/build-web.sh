#!/usr/bin/env bash
# Reproducible Flutter Web build for App Banzami (WEB-APP-001 §81/§82).
#
# One build definition, shared by CI and the Docker image. The browser always
# talks to its own origin's BFF (PUBLIC_API_URL=/consumer), so the client bundle
# is environment-agnostic for the URL; sandbox vs live is chosen server-side by
# the BFF's CONSUMER_API_BASE. An unrecognised ENVIRONMENT fails the build
# closed — never a silent default to live.
set -euo pipefail

ENVIRONMENT="${BANZAMI_WEB_ENV:-sandbox}"
PUBLIC_API_URL="${BANZAMI_WEB_API_BASE:-/consumer}"
case "$ENVIRONMENT" in
  sandbox|production) ;;
  *) echo "FATAL: unknown BANZAMI_WEB_ENV='$ENVIRONMENT' (expected sandbox|production)" >&2; exit 1 ;;
esac

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT/apps/mobile"
flutter build web \
  -t lib/main_consumer_web.dart \
  --no-web-resources-cdn \
  --base-href / \
  --dart-define=PUBLIC_API_URL="$PUBLIC_API_URL" \
  --dart-define=ENVIRONMENT="$ENVIRONMENT" \
  --no-wasm-dry-run

DEST="$ROOT/apps/app-banzami/web"
rm -rf "$DEST"; mkdir -p "$DEST"
cp -R build/web/. "$DEST/"

# Content-address the font URLs so a byte change (a new tree-shaken icon subset)
# always produces a new URL — no browser/CDN can serve a stale font subset after a
# deploy (BUSINESS-WEB-ICON defect fix; a build-time content hash, not a runtime
# timestamp). Must run AFTER the bundle is staged into $DEST.
node "$ROOT/apps/app-banzami/scripts/content-address-fonts.mjs" "$DEST"

echo "App Banzami Web bundle staged → $DEST (env=$ENVIRONMENT, api=$PUBLIC_API_URL)"
