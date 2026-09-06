#!/usr/bin/env bash
# Does the remote wrapper actually report what happened over there?
#
# The bug it replaces returned 0 for a failed proof for weeks, in six scripts,
# because ssh reports the status of the last command and the last command was a
# cleanup `rm`. A wrapper that has never been observed to fail is exactly the
# thing that produced that.
#
# Three mutations, each the shape of a real failure:
#
#   the proof fails, cleanup succeeds   → the wrapper must fail with the
#                                         proof's own status, not the cleanup's
#   the proof succeeds                  → the wrapper must succeed
#   the host is not the Sandbox         → the wrapper must refuse, and must
#                                         never fall through to local docker
#
# The first two run against the real Sandbox host, because a locally simulated
# ssh proves nothing about ssh. The third runs here, where the assertion is
# precisely that this is the wrong place.
#
# Usage: bash tools/ops/lib/remote.selftest.sh
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
PASS=0; FAIL=0
chk(){ if [ "$2" = "$3" ]; then echo "  ✓ $1 ($2)"; PASS=$((PASS+1));
       else echo "  ✗ $1 (got '$2' want '$3')"; FAIL=$((FAIL+1)); fi; }

TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT

probe() { # probe <exit-code>
  cat > "$TMP/bz-probe.sh" <<PROBE
#!/usr/bin/env bash
set -uo pipefail
. "\$(cd "\$(dirname "\$0")" && pwd)/remote.sh" 2>/dev/null || . "$HERE/remote.sh"
remote_self_or_continue "\$@"
echo "  (running on \$(hostname))"
exit $1
PROBE
  # The library must travel with it: the copy on the VM sources it by its own
  # directory, which is /tmp there.
  scp -q "$HERE/remote.sh" "${BANZAMI_REMOTE:-root@217.160.9.248}:/tmp/remote.sh" 2>/dev/null
  bash "$TMP/bz-probe.sh"
  echo $?
}

echo "remote execution contract — self-test"

echo
echo "a proof that fails on the far side"
RC=$(probe 42 | tail -1)
chk REMOTE_FAILURE_REACHES_THE_CALLER "$RC" "42"

echo
echo "a proof that succeeds on the far side"
RC=$(probe 0 | tail -1)
chk REMOTE_SUCCESS_REACHES_THE_CALLER "$RC" "0"

echo
echo "the wrong host"
# BANZAMI_ON_VM asserts "you are already there". Here that is false, and the
# wrapper must say so rather than run against whatever docker it can find.
cat > "$TMP/bz-here.sh" <<HERE_PROBE
#!/usr/bin/env bash
set -uo pipefail
. "$HERE/remote.sh"
remote_self_or_continue
echo "REACHED THE BODY"
HERE_PROBE
OUT=$(BANZAMI_ON_VM=1 bash "$TMP/bz-here.sh" 2>&1); RC=$?
chk WRONG_HOST_REFUSED "$RC" "2"
case "$OUT" in *"REACHED THE BODY"*) chk WRONG_HOST_DID_NOT_RUN_THE_BODY "ran" "did not run" ;;
                *) chk WRONG_HOST_DID_NOT_RUN_THE_BODY "did not run" "did not run" ;; esac

echo
[ "$FAIL" -eq 0 ] && echo "REMOTE_CONTRACT_SELFTEST: PASS=$PASS FAIL=0" \
                  || echo "REMOTE_CONTRACT_SELFTEST: PASS=$PASS FAIL=$FAIL"
exit $([ "$FAIL" -eq 0 ] && echo 0 || echo 1)
