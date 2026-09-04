#!/usr/bin/env bash
#
# sandbox-egress.sh — the Sandbox gateway's guarded outbound path.
#
# WHY THIS EXISTS
#
# The Sandbox data and application networks are `internal: true`, and that is
# deliberate: nothing in the stack should be able to reach the internet just
# because it happens to be running. But outbound webhook delivery is, by
# definition, an outbound connection to an address the merchant chooses. With
# both of the gateway's networks internal, it could not resolve or reach any
# destination at all, so CAP-WEBHOOK-001's data plane was inert — the SSRF
# policy passed every test while no webhook could physically leave.
#
# Flipping the application network to non-internal would have fixed delivery by
# giving every service in the stack general internet access. Instead the gateway
# — the only component that must make outbound calls — gets its own network, and
# that network is filtered at the host.
#
# THE GUARD
#
# Application-layer destination policy (RA-023) already refuses loopback,
# RFC1918, link-local and metadata targets. That check is good, but it would be
# the ONLY thing standing between a URL and the private network if egress were
# unfiltered: one parsing bug, one redirect followed, one DNS answer that
# changes between validation and connection, and it is bypassed. So the same
# ranges are DROPped for this subnet at the host, and RA-023 goes back to being
# defence in depth rather than the sole control.
#
# Idempotent. Safe to re-run; run after any host reboot or Docker restart, since
# neither the network attachment nor the filter survives on its own.
set -euo pipefail

EGRESS_NET="${BZSB_EGRESS_NET:-bzsb-egress}"
EGRESS_SUBNET="${BZSB_EGRESS_SUBNET:-172.31.240.0/24}"
BRIDGE_NAME="${BZSB_EGRESS_BRIDGE:-br-bzsb-egr}"
MARK="banzami-egress-guard"

# Private and special-purpose space. The gateway has no business reaching any of
# it from the egress interface; internal service traffic uses the internal
# networks, on different interfaces, and is unaffected.
DENY_RANGES=(
  10.0.0.0/8        # RFC1918
  172.16.0.0/12     # RFC1918 (contains the egress subnet itself)
  192.168.0.0/16    # RFC1918
  169.254.0.0/16    # link-local, incl. cloud metadata at 169.254.169.254
  127.0.0.0/8       # loopback
  100.64.0.0/10     # CGNAT
  192.0.0.0/24      # IETF protocol assignments
  198.18.0.0/15     # benchmarking
  224.0.0.0/4       # multicast
  240.0.0.0/4       # reserved
)

usage() { echo "usage: $0 {apply|verify} [container]"; exit 2; }

ensure_network() {
  if docker network inspect "$EGRESS_NET" >/dev/null 2>&1; then
    echo "egress: network $EGRESS_NET present"
  else
    docker network create --driver bridge \
      --subnet "$EGRESS_SUBNET" \
      --opt "com.docker.network.bridge.name=$BRIDGE_NAME" \
      --label banzami.sandbox.kind=egress-network \
      "$EGRESS_NET" >/dev/null
    echo "egress: network $EGRESS_NET created ($EGRESS_SUBNET)"
  fi
}

apply_filter() {
  # Remove any previous generation of our rules first, so re-running cannot
  # stack duplicates and a changed range list cannot leave an orphan ACCEPT.
  while iptables -S DOCKER-USER | grep -q -- "$MARK"; do
    local n
    n="$(iptables -S DOCKER-USER | grep -n -- "$MARK" | head -1 | cut -d: -f1)"
    iptables -D DOCKER-USER "$((n - 1))"
  done
  for net in "${DENY_RANGES[@]}"; do
    iptables -I DOCKER-USER 1 -s "$EGRESS_SUBNET" -d "$net" \
      -m comment --comment "$MARK" -j DROP
  done
  echo "egress: ${#DENY_RANGES[@]} deny rules applied for $EGRESS_SUBNET"
}

cmd_apply() {
  local container="${1:-}"
  ensure_network
  apply_filter                      # filter BEFORE attaching, never after
  if [ -n "$container" ]; then
    if docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' \
        "$container" | grep -qw "$EGRESS_NET"; then
      echo "egress: $container already attached"
    else
      docker network connect "$EGRESS_NET" "$container"
      echo "egress: $container attached to $EGRESS_NET"
    fi
  fi
}

cmd_verify() {
  local container="${1:-}" rc=0

  [ "$(docker network inspect -f '{{.Internal}}' "$EGRESS_NET" 2>/dev/null)" = "false" ] \
    && echo "EGRESS network_present PASS" || { echo "EGRESS network_present FAIL"; rc=1; }

  local missing=0
  for net in "${DENY_RANGES[@]}"; do
    iptables -C DOCKER-USER -s "$EGRESS_SUBNET" -d "$net" \
      -m comment --comment "$MARK" -j DROP 2>/dev/null || missing=1
  done
  [ "$missing" -eq 0 ] && echo "EGRESS private_ranges_denied PASS" \
    || { echo "EGRESS private_ranges_denied FAIL"; rc=1; }

  # The data/app planes must NOT have gained egress as a side effect.
  for n in $(docker network ls --format '{{.Name}}' | grep -E '^bzsb-(app|data)-'); do
    if [ "$(docker network inspect -f '{{.Internal}}' "$n")" != "true" ]; then
      echo "EGRESS internal_planes_unchanged FAIL ($n is no longer internal)"; rc=1
    fi
  done
  [ "$rc" -eq 0 ] && echo "EGRESS internal_planes_unchanged PASS" || true

  if [ -n "$container" ]; then
    # Reachability is asserted behaviourally: a public host must resolve, and a
    # private one must not be reachable. A rule listing alone would not catch a
    # route that bypasses the chain.
    docker exec "$container" sh -c 'wget -q -O /dev/null --timeout=10 https://banzami.com/ 2>/dev/null' \
      && echo "EGRESS public_reachable PASS" || { echo "EGRESS public_reachable FAIL"; rc=1; }
    if docker exec "$container" sh -c 'wget -q -O /dev/null --timeout=4 http://10.0.0.1/ 2>/dev/null'; then
      echo "EGRESS private_unreachable FAIL"; rc=1
    else
      echo "EGRESS private_unreachable PASS"
    fi
  fi

  echo "SANDBOX_EGRESS_VERIFY_RESULT: $([ "$rc" -eq 0 ] && echo PASS || echo FAIL)"
  return "$rc"
}

case "${1:-}" in
  apply)  shift; cmd_apply  "${1:-}" ;;
  verify) shift; cmd_verify "${1:-}" ;;
  *) usage ;;
esac
