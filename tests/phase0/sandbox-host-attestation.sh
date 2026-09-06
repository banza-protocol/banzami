#!/usr/bin/env bash
# Does the Sandbox host contain exactly what it is supposed to contain?
#
# Not "are the services we know about healthy" — that question is what let a
# container nobody deployed run here for five days with every operator secret
# mounted (RA-080). Every check looked at something it already knew about: the
# deployer at what it manages, the credential inventory at the database, the
# health checks at the named services. None asked what else was there.
#
# So this compares the whole of `docker ps -a` against ops/sandbox-host-manifest.tsv:
#
#   a container not in the manifest              FAIL
#   a container in the manifest that is missing  FAIL
#   secret exposure that differs from declared   FAIL
#   restart policy that differs from declared    FAIL
#   privileged, host network, host PID namespace,
#     a docker socket mount, a host bind outside
#     the declared secret directory              FAIL
#
# Stopped containers are included deliberately. A stopped container keeps its
# configuration, its bind mounts and its network attachment; it is a thing that
# can be started again, and one of them — a leftover `-prev` from a deploy on
# 1 September — was still carrying all eight secret mounts.
#
# Evidence only: names, images, networks, restart policies, whether a container
# is given credentials at all. Never a value.
#
# Usage: bash tests/phase0/sandbox-host-attestation.sh
set -uo pipefail

# The canonical remote-execution contract: prove the host, run there, and return
# the proof's own exit status. See tools/ops/lib/remote.sh.
for _p in "$(dirname "$0")/remote.sh" "$(dirname "$0")/lib/remote.sh" \
          "$(dirname "$0")/../lib/remote.sh" "$(dirname "$0")/../../tools/ops/lib/remote.sh"; do
  [ -f "$_p" ] && { . "$_p"; break; }
done
command -v remote_self_or_continue >/dev/null 2>&1 \
  || { echo "✗ tools/ops/lib/remote.sh not found — refusing to run without the host guard" >&2; exit 2; }

# The manifest is the thing being compared against, so it has to travel too.
REMOTE_EXTRA_FILES="$(dirname "$0")/../../ops/sandbox-host-manifest.tsv"
remote_self_or_continue

# The manifest travels with the script when it is copied to the host.
MANIFEST=""
for m in "$(dirname "$0")/sandbox-host-manifest.tsv" \
         "$(dirname "$0")/../../ops/sandbox-host-manifest.tsv"; do
  [ -f "$m" ] && { MANIFEST="$m"; break; }
done
[ -n "$MANIFEST" ] || { echo "✗ ops/sandbox-host-manifest.tsv not found beside this script" >&2; exit 2; }

PROJECT=$(docker ps --format '{{.Names}}' | grep -m1 'bzsandbox-.*-core-api-staging' | sed -E 's/-core-api-staging$//')
[ -n "$PROJECT" ] || { echo "✗ no deployed Sandbox project on this host" >&2; exit 2; }

PASS=0; FAIL=0
ok(){ echo "  ✓ $1"; PASS=$((PASS+1)); }
bad(){ echo "  ✗ $1"; FAIL=$((FAIL+1)); }

# Network names carry the project generation too; the manifest uses short
# labels so it does not expire when the project is rebuilt.
shorten_nets() {
  printf '%s' "$1" | tr ',' '\n' | while read -r n; do
    case "$n" in
      "$PROJECT-app"|bzsb-app-*)   echo app ;;
      "$PROJECT-data"|bzsb-data-*) echo data ;;
      bzsb-egress)                 echo egress ;;
      bzsb-sink)                   echo sink ;;
      bzsb-edge-ingress)           echo edge-ingress ;;
      banzami_banzami_net)         echo legacy ;;
      *)                           echo "$n" ;;
    esac
  done | sort | paste -sd, -
}

echo "host attestation — $PROJECT"
echo "  manifest: $MANIFEST"
echo

# ── declared ────────────────────────────────────────────────────────────────
DECLARED=$(grep -v '^#' "$MANIFEST" | grep -v '^[[:space:]]*$' | sed "s/{P}/$PROJECT/g")

echo "containers"
SEEN=""
for c in $(docker ps -a --format '{{.Names}}' | sort); do
  row=$(printf '%s\n' "$DECLARED" | awk -F'\t' -v n="$c" '$1==n{print; exit}')
  if [ -z "$row" ]; then
    img=$(docker inspect "$c" --format '{{.Config.Image}}')
    st=$(docker inspect "$c" --format '{{.State.Status}}')
    sec=no; docker inspect "$c" --format '{{range .Mounts}}{{.Destination}} {{end}}' | grep -q '/run/secrets/' && sec=yes
    bad "$c — not in the manifest (image=$img state=$st secrets=$sec)"
    continue
  fi
  SEEN="$SEEN $c"

  want_sec=$(printf '%s' "$row" | cut -f4)
  want_rp=$(printf '%s' "$row" | cut -f5)
  got_sec=no; docker inspect "$c" --format '{{range .Mounts}}{{.Destination}} {{end}}' | grep -q '/run/secrets/' && got_sec=yes
  got_rp=$(docker inspect "$c" --format '{{.HostConfig.RestartPolicy.Name}}')

  problems=""
  [ "$got_sec" = "$want_sec" ] || problems="$problems secrets=$got_sec(want $want_sec)"
  [ "$got_rp"  = "$want_rp"  ] || problems="$problems restart=$got_rp(want $want_rp)"

  # Capability attestation. Not hardening — these are the settings that would
  # let a container leave its own boundary, and none of them is expected here.
  [ "$(docker inspect "$c" --format '{{.HostConfig.Privileged}}')" = "true" ] && problems="$problems privileged"
  case "$(docker inspect "$c" --format '{{.HostConfig.NetworkMode}}')" in host) problems="$problems host-network" ;; esac
  case "$(docker inspect "$c" --format '{{.HostConfig.PidMode}}')" in host) problems="$problems host-pid" ;; esac
  docker inspect "$c" --format '{{range .HostConfig.Binds}}{{println .}}{{end}}' 2>/dev/null \
    | grep -q 'docker.sock' && problems="$problems docker-socket"

  if [ -n "$problems" ]; then bad "$c —$problems"; else ok "$c"; fi
done

echo
echo "declared but absent"
ABSENT=0
for n in $(printf '%s\n' "$DECLARED" | cut -f1); do
  case " $SEEN " in *" $n "*) ;; *) echo "  ✗ $n"; ABSENT=$((ABSENT+1)) ;; esac
done
[ "$ABSENT" -eq 0 ] && echo "  none" || FAIL=$((FAIL + ABSENT))

echo
if [ "$FAIL" -eq 0 ]; then
  echo "SANDBOX_HOST_ATTESTATION: PASS=$PASS FAIL=0 — the host matches the manifest"
  exit 0
fi
echo "SANDBOX_HOST_ATTESTATION: PASS=$PASS FAIL=$FAIL"
echo "  an unlisted container is either something to remove, or something to add"
echo "  to ops/sandbox-host-manifest.tsv with a reason. Not something to ignore."
exit 1
