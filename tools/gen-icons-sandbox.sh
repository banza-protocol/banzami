#!/usr/bin/env bash
# gen-icons-sandbox.sh — generate sandbox app icons (amber "S" badge on production icon).
#
# Run this before building a TestFlight IPA to swap in the sandbox icon.
# Run with --restore to revert to the production icon afterwards.
#
# Usage:
#   ./tools/gen-icons-sandbox.sh           # generate sandbox icons in-tree
#   ./tools/gen-icons-sandbox.sh --restore # restore production icons
#
# SAFETY: only modifies icon files under apps/mobile/. No database or API access.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MOBILE="$REPO_ROOT/apps/mobile"

GREEN='\033[1;32m'; YELLOW='\033[1;33m'; RED='\033[1;31m'; RESET='\033[0m'
log()  { printf "${GREEN}[icons]${RESET} %s\n" "$1"; }
warn() { printf "${YELLOW}[icons]${RESET} %s\n" "$1"; }
err()  { printf "${RED}[icons]${RESET} %s\n" "$1" >&2; exit 1; }

restore_production() {
  log "Restoring production icon from git..."
  git -C "$REPO_ROOT" checkout -- \
    apps/mobile/android/app/src/main/res/mipmap-*/ic_launcher*.png \
    apps/mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/
  log "Production icons restored."
}

case "${1:-generate}" in
  --restore)
    restore_production
    ;;
  generate|"")
    log "Generating sandbox app icon..."
    python3 "$REPO_ROOT/tools/make-sandbox-icon.py"

    log "Running flutter_launcher_icons with sandbox config..."
    (cd "$MOBILE" && dart run flutter_launcher_icons:main -f flutter_launcher_icons-sandbox.yaml)

    log "Sandbox icons generated."
    warn "Remember to run --restore before committing or building production."
    ;;
  *)
    err "Usage: $0 [--restore]"
    ;;
esac
