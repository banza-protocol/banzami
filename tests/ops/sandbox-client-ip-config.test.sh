#!/usr/bin/env bash
# The deploy tells the four Go services which peer may name the client
# (A9-09): the Sandbox edge, as the one address it holds on the app network —
# never the app subnet, which would trust every container on it. The Gateway
# alone also learns the host's public address, from which the website forwards
# a proof reader (A9-08). Runs client_ip_config with docker and ip stubbed.
set -uo pipefail
SRC="$(cd "$(dirname "$0")/../.." && pwd)/infra/blueprint/sandbox-ops/scripts/sandbox-deploy.sh"
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
pass=0; fail=0
ok() { echo "  ok: $1"; pass=$((pass+1)); }
no() { echo "  FAIL: $1"; fail=$((fail+1)); }

sed -n '/^client_ip_config() {/,/^}/p' "$SRC" > "$WORK/f.sh"
[ -s "$WORK/f.sh" ] || { echo "client_ip_config not found in $SRC"; exit 1; }
# shellcheck disable=SC1091
. "$WORK/f.sh"

EDGE_UP=1
docker() {
  case "$1" in
    ps) [ "$EDGE_UP" = 1 ] && printf '%s\n' bzsandbox-x-api-gateway-staging bzsbedge-sandbox-edge ;;
    inspect) printf '%s\n' "bzsb-edge-ingress 172.21.0.2" "bzsb-app-20260708 172.18.0.6" "bzsb-sink 172.22.0.3" ;;
  esac
}
ip() { echo "1.1.1.1 via 217.160.9.1 dev ens6 src 217.160.9.248 uid 0"; }

out="$(client_ip_config api-gateway-staging)"
printf '%s\n' "$out" | grep -qx 'TRUSTED_PROXY_CIDRS=172.18.0.6/32' \
  && ok "the gateway trusts the edge's own app-network address" \
  || no "the gateway's trusted proxy is not the edge's /32: $out"
printf '%s\n' "$out" | grep -qx 'PROOF_READER_FORWARDER_CIDRS=217.160.9.248/32' \
  && ok "the gateway believes proof readers forwarded from the host's public address" \
  || no "the gateway has no proof-reader forwarder: $out"

out="$(client_ip_config public-api-staging)"
printf '%s\n' "$out" | grep -qx 'TRUSTED_PROXY_CIDRS=172.18.0.6/32' && ! printf '%s\n' "$out" | grep -q PROOF_READER \
  && ok "public-api trusts the edge and nothing else" \
  || no "public-api's client-IP config is wrong: $out"

printf '%s\n' "$(client_ip_config admin-api)$(client_ip_config developer-api)" | grep -Eq '/(8|12|16|24)$' \
  && no "a service trusts a subnet" || ok "no service trusts a subnet"

EDGE_UP=0
out="$(client_ip_config admin-api)"
[ -z "$out" ] && ok "with no edge running, nothing is trusted" || no "trusted something with no edge: $out"

echo
echo "  $pass passed, $fail failed"
[ "$fail" -eq 0 ]
