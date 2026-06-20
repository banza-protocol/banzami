#!/usr/bin/env bash
#
# banza-conformance-l0.sh — run the official BANZA conformance suite (Level 0)
# against the Banzami sandbox operator and write evidence into
# evidence/banza-conformance/l0/.
#
# Banzami runs this as an OPERATOR CANDIDATE. The output is conformance
# EVIDENCE, not a certificate. The BANZA protocol owns certification; passing
# this suite does not make Banzami a certified operator and implies nothing
# about production readiness.
#
# Usage:
#   tools/banza-conformance-l0.sh                 # use PyPI tool if present, else Docker
#   URL=https://sandbox.banzami.org tools/banza-conformance-l0.sh
#   RUNNER=docker tools/banza-conformance-l0.sh   # force the pinned GHCR image
#
set -euo pipefail

URL="${URL:-https://sandbox.banzami.org}"
LEVEL="${LEVEL:-0}"
VERSION="${VERSION:-0.1.0}"
IMAGE="${IMAGE:-ghcr.io/banza-protocol/banza-conformance:v0.1.0}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$ROOT/evidence/banza-conformance/l0"
OUT_FILE="$OUT_DIR/banzami-sandbox-l0-report.json"
mkdir -p "$OUT_DIR"

# Pick a runner: explicit RUNNER, else the PyPI CLI if installed, else Docker.
RUNNER="${RUNNER:-auto}"
if [ "$RUNNER" = "auto" ]; then
  if command -v banza-conformance >/dev/null 2>&1; then
    RUNNER=pypi
  elif command -v docker >/dev/null 2>&1; then
    RUNNER=docker
  else
    echo "error: need either 'banza-conformance' (pip install banza-conformance==$VERSION) or Docker" >&2
    exit 1
  fi
fi

echo "BANZA conformance L$LEVEL — target $URL — runner $RUNNER"
echo "Output: $OUT_FILE"
echo

case "$RUNNER" in
  pypi)
    banza-conformance --url "$URL" --level "$LEVEL" --output "$OUT_FILE"
    ;;
  docker)
    docker run --rm -v "$OUT_DIR:/reports" "$IMAGE" \
      --url "$URL" --level "$LEVEL" \
      --output "/reports/$(basename "$OUT_FILE")"
    ;;
  *)
    echo "error: unknown RUNNER '$RUNNER' (use pypi|docker|auto)" >&2
    exit 1
    ;;
esac

echo
echo "Conformance evidence written to $OUT_FILE."
echo "This is evidence, not certification. Banzami is not a certified operator."
