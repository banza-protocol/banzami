#!/usr/bin/env bash
# Is the hosted payer surface answering?
#
# Runs from anywhere, over the public internet, the way a payer reaches it. It
# exists because the surface was down for twelve hours and nothing said so: the
# container had exited 0, so no crash loop, no restart, no log line, and every
# check that asked "is the process there" was looking at the wrong question.
#
# It reads. It never moves money and never authenticates: a monitor that needs a
# credential is a credential deployed somewhere it does not need to be.
#
# Exit 0 when the surface is serving, 1 when it is not — so it can be a cron
# entry, a CI step, or something a person runs when a payer complains.
#
#   bash tools/ops/checkout-monitor.sh
#   bash tools/ops/checkout-monitor.sh --quiet    # exit code only
set -uo pipefail
HOST="${CHECKOUT_HOST:-https://pay.banzami.com}"
QUIET=0; [ "${1:-}" = "--quiet" ] && QUIET=1
say(){ [ "$QUIET" -eq 1 ] || echo "$@"; }

FAIL=0
note(){ FAIL=$((FAIL+1)); say "  ✗ $1"; }
good(){ say "  ✓ $1"; }

say "hosted checkout — $HOST"

# Split into layers so a failure names what broke. "It is down" sends someone
# to read application logs when the certificate expired.
HOSTNAME_ONLY=${HOST#https://}; HOSTNAME_ONLY=${HOSTNAME_ONLY%%/*}
if command -v dig >/dev/null 2>&1; then
  [ -n "$(dig +short "$HOSTNAME_ONLY" | head -1)" ] && good "DNS resolves" || note "DNS does not resolve"
fi

# ssl_verify_result is 0 when curl never connected, so it has to be read
# together with whether a connection happened at all. Reporting "TLS verifies"
# for a host that does not resolve is worse than saying nothing.
TLSINFO=$(curl -s -o /dev/null -w '%{ssl_verify_result} %{http_connect} %{num_connects}' --max-time 15 "$HOST/" 2>/dev/null)
TLS=${TLSINFO%% *}; CONNECTS=${TLSINFO##* }
if [ "${CONNECTS:-0}" = "0" ]; then note "no connection was established — TLS not reached"
elif [ "$TLS" = "0" ]; then good "TLS verifies"
else note "TLS verification returned $TLS"; fi

CODE=$(curl -s -o /tmp/.checkout-probe.$$ -w '%{http_code}' --max-time 20 "$HOST/" 2>/dev/null)
BODY=$(head -c 400 /tmp/.checkout-probe.$$ 2>/dev/null); rm -f /tmp/.checkout-probe.$$

case "$CODE" in
  000) note "no response at all" ;;
  5*)  note "HTTP $CODE — the surface is up in DNS and not serving" ;;
  *)   good "HTTP $CODE" ;;
esac

# A 502 from Cloudflare and a 404 from the application read identically to a
# status-code check, and mean completely different things.
case "$BODY" in
  *"Bad gateway"*|*"Error code 502"*) note "the edge answered, the application did not" ;;
esac

say ""
if [ "$FAIL" -eq 0 ]; then say "✓ hosted checkout is serving"; exit 0; fi
say "✗ hosted checkout is NOT serving — $FAIL problem(s)"
exit 1
