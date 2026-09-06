#!/usr/bin/env bash
# Every container holding operator secrets must be one the deployer put there.
#
# Written because one was not. `silly_swirles` — a Docker-generated name, so an
# ad-hoc `docker run` — had been running for five days with the full secret set
# mounted: the database URL, the JWT secret, the Core internal key, the API key
# pepper, the developer internal key, the session secret and the OTP pepper. An
# old public-api image, unreachable from outside but on the data network, able
# to reach Postgres and Core with real credentials.
#
# It was invisible to everything. The deployment tooling only looks at the
# containers it manages, the credential inventory only looks at the database,
# and a health check only asks whether the services it knows about are up.
# Nothing asked the opposite question: what ELSE is running in here?
#
# So this asks it. The blueprint labels what it deploys; anything holding a
# secret without that label was started by hand and nobody owns it.
#
# Read-only. Exit 1 when something unowned is running.
#
# Usage: bash tests/phase0/sandbox-container-inventory.sh
set -uo pipefail
REMOTE="${BANZAMI_REMOTE:-root@217.160.9.248}"
# The deployer names every container it creates after the generated Sandbox
# project — bzsandbox-<generation>-<service>. It applies no labels, so the name
# is the ownership signal, and the prefix is read from a container that is
# certainly the deployer's rather than hard-coded into this file.

# The canonical remote-execution contract: prove the host, run there, and return
# the proof's own exit status. See tools/ops/lib/remote.sh.
for _p in "$(dirname "$0")/remote.sh" "$(dirname "$0")/lib/remote.sh" \
          "$(dirname "$0")/../lib/remote.sh" "$(dirname "$0")/../../tools/ops/lib/remote.sh"; do
  [ -f "$_p" ] && { . "$_p"; break; }
done
command -v remote_self_or_continue >/dev/null 2>&1 \
  || { echo "✗ tools/ops/lib/remote.sh not found — refusing to run without the host guard" >&2; exit 2; }
remote_self_or_continue 

OWNED_PREFIX=$(docker ps --format '{{.Names}}' | grep core-api-staging | head -1 | sed -E 's/-core-api-staging$//')
[ -n "$OWNED_PREFIX" ] || { echo "✗ cannot identify the deployed Sandbox project" >&2; exit 2; }

PASS=0; FAIL=0
TOTAL=$(docker ps --format '{{.Names}}' | wc -l | tr -d ' ')
echo "containers on the Sandbox host ($TOTAL running)"
echo "  the deployed project is $OWNED_PREFIX"

STRAY=""
for c in $(docker ps --format '{{.Names}}'); do
  # The mounts are the tell, not the command: a secret reaches a container as a
  # file bound under /run/secrets, whatever the entrypoint then does with it.
  mounts=$(docker inspect "$c" --format '{{range .Mounts}}{{.Destination}} {{end}}' 2>/dev/null)
  case "$mounts" in
    */run/secrets/*) holds=yes ;;
    *) holds=no ;;
  esac
  case "$c" in "$OWNED_PREFIX"-*) owned=yes ;; *) owned=no ;; esac
  image=$(docker inspect "$c" --format '{{.Config.Image}}' 2>/dev/null)
  started=$(docker inspect "$c" --format '{{.State.StartedAt}}' 2>/dev/null)

  if [ "$holds" = "yes" ] && [ "$owned" = "no" ]; then
    echo "  ✗ $c — holds operator secrets and the deployer did not put it there"
    echo "      image=$image started=$started"
    STRAY="$STRAY $c"
    FAIL=$((FAIL+1))
  elif [ "$holds" = "yes" ]; then
    echo "  ✓ $c"
    PASS=$((PASS+1))
  fi
done

echo
if [ "$PASS" -eq 0 ] && [ "$FAIL" -eq 0 ]; then
  echo "SANDBOX_CONTAINER_INVENTORY: inspected nothing — no container holds a secret here."
  echo "  That is not a pass. The services carry their credentials as files under"
  echo "  /run/secrets, so finding none means this ran somewhere it should not have."
  exit 2
fi
if [ "$FAIL" -eq 0 ]; then
  echo "SANDBOX_CONTAINER_INVENTORY: PASS=$PASS FAIL=0 — every secret-holding container is owned"
  exit 0
fi
echo "SANDBOX_CONTAINER_INVENTORY: PASS=$PASS FAIL=$FAIL"
echo "  unowned:$STRAY"
echo "  if it is genuinely not needed:  docker stop <name> && docker rm <name>"
exit 1
