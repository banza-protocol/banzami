#!/usr/bin/env bash
# The hosted payer surface must be a process that stays alive — runs ON the VM.
#
# It once was not. The container was created with `exec node` and no script, so
# Node opened a non-interactive REPL, found no stdin, and exited 0 in under a
# second. pay.banzami.com answered 502 to every payer for twelve hours.
#
# The exit code is the whole lesson. Nothing crashed, nothing restarted, nothing
# was logged; a deployment check that asks "did the container start" would have
# said yes. So this asks the questions that distinguish a running service from a
# process that ran:
#
#   the command names a script, not a bare interpreter
#   the container is running, and has been for longer than a REPL survives
#   it is configured to come back if it dies
#   Docker's own healthcheck says healthy, and actually probes a route
#   a real route answers over the public internet
#
# Usage (on the VM): bash pay-frontend-lifecycle-e2e.sh
set -uo pipefail
PUBLIC="${PUBLIC:-https://pay.banzami.com}"

PASS=0; FAIL=0
chk(){ if [ "$2" = "$3" ]; then echo "  $1 PASS ($2)"; PASS=$((PASS+1)); else echo "  $1 FAIL (got '$2' want '$3')"; FAIL=$((FAIL+1)); fi; }

C=$(docker ps -a --format '{{.Names}}' | grep pay-frontend | head -1)
[ -n "$C" ] || { echo "no pay-frontend container"; exit 2; }
echo "container: $C"

CMD=$(docker inspect "$C" --format '{{join .Config.Cmd " "}}')
echo "  command: $CMD"

# `node` alone is a REPL. Any interpreter without a script is the same defect
# wearing a different name, so this asks for an argument rather than for one
# specific string.
case "$CMD" in
  node|*" node"|node\ -*) chk COMMAND_NAMES_A_SCRIPT "bare-interpreter" "script" ;;
  *node*\ *.js*|*npm\ *start*|*node\ server.js*) chk COMMAND_NAMES_A_SCRIPT "script" "script" ;;
  *) chk COMMAND_NAMES_A_SCRIPT "unrecognised:$CMD" "script" ;;
esac

chk CONTAINER_RUNNING "$(docker inspect "$C" --format '{{.State.Status}}')" "running"

# A REPL exits in well under a second. Surviving a minute is not proof of
# health, but it is proof the process did not fall straight through.
STARTED=$(docker inspect "$C" --format '{{.State.StartedAt}}')
AGE=$(( $(date +%s) - $(date -d "$STARTED" +%s 2>/dev/null || echo 0) ))
chk ALIVE_LONGER_THAN_A_REPL "$([ "$AGE" -gt 60 ] && echo yes || echo "no(${AGE}s)")" "yes"

RESTART=$(docker inspect "$C" --format '{{.HostConfig.RestartPolicy.Name}}')
chk RESTART_POLICY_SET "$([ "$RESTART" != "no" ] && [ -n "$RESTART" ] && echo yes || echo "no($RESTART)")" "yes"

HEALTH=$(docker inspect "$C" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}')
chk DOCKER_REPORTS_HEALTHY "$HEALTH" "healthy"

# A healthy healthcheck is only meaningful if it asks something. `exit 0` is
# also always healthy, and is the same class of defect as a container that
# exits 0: a green signal that was never connected to the thing it reports on.
HCTEST=$(docker inspect "$C" --format '{{if .Config.Healthcheck}}{{join .Config.Healthcheck.Test " "}}{{end}}')
case "$HCTEST" in
  *http*|*curl*|*wget*) chk HEALTHCHECK_PROBES_A_ROUTE "yes" "yes" ;;
  "")                   chk HEALTHCHECK_PROBES_A_ROUTE "none-configured" "yes" ;;
  *)                    chk HEALTHCHECK_PROBES_A_ROUTE "does-not-probe:$HCTEST" "yes" ;;
esac

EXTERNAL=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$PUBLIC/" 2>/dev/null)
chk ANSWERS_PUBLICLY "$([ "$EXTERNAL" -lt 500 ] 2>/dev/null && echo yes || echo "no($EXTERNAL)")" "yes"

echo
[ "$FAIL" -eq 0 ] && echo "PAY_FRONTEND_LIFECYCLE: PASS=$PASS FAIL=0" \
                  || echo "PAY_FRONTEND_LIFECYCLE: PASS=$PASS FAIL=$FAIL"
exit $([ "$FAIL" -eq 0 ] && echo 0 || echo 1)
