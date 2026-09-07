#!/usr/bin/env bash
# Run one tests/phase0 harness ON the Sandbox VM and return ITS verdict.
#
# The harnesses read Docker secrets and query banzami_staging, so they run on
# the server, not here. Two ways a wrapper like this silently discards the
# result, both of which have happened in this repository before:
#
#   the remote command string ends with the cleanup `rm`, and ssh returns THAT
#   status — so a failing harness reports success;
#
#   the output is piped through `tail`, and the pipeline returns tail's status
#   — same outcome.
#
# So the harness status is captured before cleanup and re-raised as this
# script's own exit code.
#
#   tools/ops/run-sandbox-smoke.sh tests/phase0/pricing-refusal-smoke.sh
set -uo pipefail

HARNESS="${1:?usage: run-sandbox-smoke.sh <path/to/harness.sh> [VAR=value ...]}"
shift || true
[ -f "$HARNESS" ] || { echo "no such harness: $HARNESS" >&2; exit 2; }

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
REMOTE="${BANZAMI_SANDBOX_SSH:-$(grep -E '^REMOTE=' "$REPO_ROOT/deploy.sh" | head -1 | sed -E 's/^REMOTE=//; s/^"//; s/"$//')}"
[ -n "$REMOTE" ] || { echo "server target not resolved (set BANZAMI_SANDBOX_SSH)" >&2; exit 2; }

NAME="$(basename "$HARNESS")"
DIR="/tmp/smoke-$$"
ENVPREFIX=""
for kv in "$@"; do ENVPREFIX="$ENVPREFIX $kv"; done

scp -o BatchMode=yes "$HARNESS" "$REPO_ROOT/tests/phase0/lib/e2e-run.sh" "$REMOTE:/tmp/" >/dev/null || {
  echo "transfer failed" >&2; exit 3; }

ssh -o BatchMode=yes "$REMOTE" "
  mkdir -p $DIR/lib &&
  mv /tmp/$NAME $DIR/ &&
  mv /tmp/e2e-run.sh $DIR/lib/ &&
  rc=0
  env $ENVPREFIX bash $DIR/$NAME || rc=\$?
  rm -rf $DIR
  exit \$rc
"
rc=$?
echo
if [ "$rc" -eq 0 ]; then echo "SMOKE $NAME: PASS"; else echo "SMOKE $NAME: FAIL (exit $rc)"; fi
exit "$rc"
