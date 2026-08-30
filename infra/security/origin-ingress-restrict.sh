#!/usr/bin/env bash
# Banzami — restricted origin ingress for the SANDBOX edge (Stage D).
#
# Keeps the perimeter as designed:
#
#     Internet → Cloudflare → origin:2053 → sandbox-edge → sandbox services
#
# and not:
#
#     Internet → origin:2053
#
# WHY THIS IS NOT ufw
# -------------------
# ufw does not govern Docker-published ports on this host. Docker's own rules sit
# at the top of FORWARD (DOCKER-USER, DOCKER-FORWARD) and the ufw forward chains
# below them show zero packets. The live proof is port 8443: it is reachable from
# the Internet and appears in no ufw rule at all. `ufw status` therefore describes
# only non-Docker traffic — a genuinely misleading picture of this host's
# perimeter, first measured in RA-005 and re-confirmed in Stage D.
#
# DOCKER-USER is the chain Docker guarantees is traversed first and never flushes,
# so it is the only correct place for this control.
#
# WHY conntrack AND NOT --dport
# -----------------------------
# nat/PREROUTING DNATs 2053 to the container's :443 BEFORE filter/FORWARD runs, so
# by the time a packet reaches DOCKER-USER its destination port is 443 and its
# destination address is the container's. A `--dport 2053` rule here matches
# nothing and silently protects nothing — a rule that looks right in `iptables -S`
# and does nothing at all. `--ctorigdstport 2053` matches the ORIGINAL
# pre-translation port, and does not depend on the container IP, which changes on
# every recreate.
#
# WHY --ctdir ORIGINAL IS NOT OPTIONAL
# ------------------------------------
# `--ctorigdstport` matches a property of the CONNECTION, so it is true of packets
# flowing in BOTH directions. Without `--ctdir ORIGINAL` the container's replies
# traverse this chain too, and their source is the container — not Cloudflare — so
# they hit the default DROP. Requests arrive, responses vanish. Measured during
# Stage D: the allowlist RETURN matched 6 packets while the DROP matched 8, the
# extra 8 being the replies. The visible symptom would have been a Cloudflare 522
# appearing the instant the port was opened, above an origin that looks perfectly
# healthy from the host.
#
# SSH SAFETY
# ----------
# These rules live in FORWARD only. SSH terminates on the host and is evaluated in
# INPUT, which this script never touches. It cannot lock anyone out.
#
# Idempotent: safe to re-run. Rebuilds only its own chain.
set -euo pipefail

CHAIN="BANZAMI-ORIGIN-2053"
PORT="2053"
RANGES_V4="/etc/banzami/cloudflare-ipv4.txt"
RANGES_V6="/etc/banzami/cloudflare-ipv6.txt"

log() { printf '%s\n' "$*"; }

[[ -s "$RANGES_V4" ]] || { log "FATAL: $RANGES_V4 missing or empty — refusing to build an empty allowlist"; exit 1; }

# An empty or truncated allowlist would DROP Cloudflare too, taking the sandbox
# offline. A partial one is worse than none, so sanity-check before applying.
count_v4=$(grep -cE '^[0-9]+\.' "$RANGES_V4" || true)
[[ "$count_v4" -ge 10 ]] || { log "FATAL: only $count_v4 IPv4 ranges — refusing to apply a suspiciously short allowlist"; exit 1; }

build() {
  local ipt="$1" ranges="$2" family="$3"
  [[ -s "$ranges" ]] || { log "  $family: no ranges file, skipping"; return 0; }

  $ipt -N "$CHAIN" 2>/dev/null || true
  $ipt -F "$CHAIN"

  local n=0
  while read -r cidr; do
    [[ -n "$cidr" && "$cidr" != \#* ]] || continue
    $ipt -A "$CHAIN" -s "$cidr" -j RETURN
    n=$((n + 1))
  done < "$ranges"

  # Anything that is not Cloudflare is dropped, not rejected: a silent timeout
  # gives a scanner less than an immediate refusal.
  $ipt -A "$CHAIN" -j DROP

  # Hook it into DOCKER-USER exactly once.
  if ! $ipt -C DOCKER-USER -p tcp -m conntrack --ctorigdstport "$PORT" --ctdir ORIGINAL -j "$CHAIN" 2>/dev/null; then
    $ipt -I DOCKER-USER 1 -p tcp -m conntrack --ctorigdstport "$PORT" --ctdir ORIGINAL -j "$CHAIN"
  fi

  # Remove the direction-blind form if an earlier run installed it. Leaving it
  # in place would keep dropping replies no matter how correct the rule above is.
  while $ipt -C DOCKER-USER -p tcp -m conntrack --ctorigdstport "$PORT" -j "$CHAIN" 2>/dev/null; do
    $ipt -D DOCKER-USER -p tcp -m conntrack --ctorigdstport "$PORT" -j "$CHAIN"
  done
  log "  $family: $n allowed ranges + default DROP on origin port $PORT"
}

log "Restricting origin port $PORT to Cloudflare ranges:"
build iptables  "$RANGES_V4" "IPv4"

# The host has no global IPv6 address today, so no IPv6 traffic can arrive. The
# mirror is applied anyway: if IPv6 is ever enabled, the port must not become
# open by default because nobody remembered this file.
if ip6tables -S DOCKER-USER >/dev/null 2>&1; then
  build ip6tables "$RANGES_V6" "IPv6"
fi

log "Done."
