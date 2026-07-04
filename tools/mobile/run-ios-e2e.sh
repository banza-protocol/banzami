#!/usr/bin/env bash
#
# run-ios-e2e.sh <consumer|merchant|cross-app>
#
# Runs the deployed-Sandbox iOS Simulator E2E matrix for a Banzami mobile app
# (docs/quality/MOBILE_E2E_REQUIREMENTS.md). It boots a simulator, builds the
# sandbox flavor, and runs the app's integration_test suite against the
# deployed Sandbox, then registers evidence under evidence/assurance/mobile/.
#
# FAIL-CLOSED: until the integration_test suites exist and evidence is produced,
# this script EXITS NON-ZERO so `make assure-sandbox-launch` correctly HOLDS the
# mobile surface. It never fakes a pass.
#
# Requirements to actually pass (tracked): apps/mobile/integration_test/ suites
# for the target, a booted iOS simulator, and the deployed Sandbox reachable.
set -euo pipefail

TARGET="${1:-}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MOBILE="$ROOT/apps/mobile"
IT_DIR="$MOBILE/integration_test"
EVID="$ROOT/evidence/assurance/mobile"

case "$TARGET" in consumer|merchant|cross-app) ;; *)
  echo "usage: run-ios-e2e.sh <consumer|merchant|cross-app>" >&2; exit 2;; esac

echo "── Mobile iOS Simulator E2E: $TARGET ──"

# 1. Config-isolation static pre-check (necessary, not sufficient).
node "$ROOT/tools/check-mobile-sandbox-config.mjs" >/dev/null || {
  echo "✗ mobile config-isolation check failed" >&2; exit 1; }

# 2. Require the integration_test suite for this target. Until authored, HOLD.
suite="$IT_DIR/${TARGET//-/_}_e2e_test.dart"
if [ ! -f "$suite" ]; then
  echo "✗ HOLD: $suite not found."
  echo "  The deployed-Sandbox iOS Simulator E2E matrix for '$TARGET' is not yet"
  echo "  authored. Per docs/quality/MOBILE_E2E_REQUIREMENTS.md this app stays"
  echo "  'quarantined' (not distributed / not claimed available) and the FULL"
  echo "  external Sandbox launch gate HOLDS. Author the integration_test suite,"
  echo "  run it on a booted simulator against deployed Sandbox, and register"
  echo "  evidence under evidence/assurance/mobile/ to lift the HOLD."
  exit 1
fi

# 3. Require a booted simulator.
if ! xcrun simctl list devices booted 2>/dev/null | grep -qi iphone; then
  echo "✗ no booted iOS simulator (xcrun simctl boot 'iPhone 17')" >&2; exit 1
fi

# 4. Run the suite against deployed Sandbox (integration_test on the simulator).
mkdir -p "$EVID"
echo "  running flutter integration test: $suite"
( cd "$MOBILE" && flutter test "$suite" \
    --dart-define=ENVIRONMENT=sandbox \
    --dart-define=PUBLIC_API_URL=https://sandbox-api.banzami.com/consumer \
    -d "$(xcrun simctl list devices booted | grep -oiE '[0-9A-F-]{36}' | head -1)" )

echo "✓ $TARGET iOS Simulator E2E passed — register evidence under $EVID"
