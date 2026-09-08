#!/usr/bin/env bash
# website-edge-isolation.test.sh
#
# Stage C Decision 3 said the website edge must never gain sandbox/payment/admin
# upstreams. Stage D amended that for exactly one hostname —
# admin.banzami.com, because Cloudflare routes hostnames without an Origin Rule
# to the default origin port, which this container owns, and no credential on
# the host can write a Cloudflare ruleset.
#
# The amendment is bounded, and this asserts the bounds rather than the slogan:
#
#   1. the banzami.com / www block still proxies only the website;
#   2. the admin vhost holds every upstream in a VARIABLE. A literal proxy_pass
#      host is resolved at config load, so one absent container would stop nginx
#      starting — and that nginx also serves banzami.com. Through a variable a
#      missing admin container is a 502 on admin.banzami.com and nothing else;
#   3. no LIVE payment hostname appears on this edge at all.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
pass=0; fail=0
ok(){ echo "  ok: $1"; pass=$((pass+1)); }
no(){ echo "  FAIL: $1"; fail=$((fail+1)); }

WEB="$ROOT/infra/nginx/website.conf"
ADMIN="$ROOT/infra/nginx/zz-admin.conf"

# 1. The website block's upstreams.
if [ -f "$WEB" ]; then
  bad="$(grep -E '^\s*proxy_pass' "$WEB" | grep -vE 'website-frontend' || true)"
  [ -z "$bad" ] \
    && ok "the website vhost proxies only website-frontend" \
    || no "the website vhost gained a non-website upstream: $bad"
else
  no "infra/nginx/website.conf is missing"
fi

# 2. The admin vhost cannot take the edge down with it.
if [ -f "$ADMIN" ]; then
  if grep -qE '^\s*proxy_pass\s+http://\$' "$ADMIN" \
     && ! grep -E '^\s*proxy_pass' "$ADMIN" | grep -qvE 'http://\$'; then
    ok "every admin upstream is resolved at request time, not config load"
  else
    no "an admin upstream is a literal host — one absent container would stop nginx serving banzami.com"
  fi
  grep -q 'resolver 127.0.0.11' "$ADMIN" \
    && ok "the admin vhost declares Docker's resolver (variables need one)" \
    || no "the admin vhost uses variable upstreams with no resolver — every request 502s"
else
  no "infra/nginx/zz-admin.conf is missing"
fi

# 3. No LIVE payment hostname on this edge.
for f in "$WEB" "$ADMIN"; do
  [ -f "$f" ] || continue
  if grep -qE '^\s*server_name\s+api\.banzami\.com' "$f"; then
    no "$(basename "$f") serves the LIVE gateway hostname"
  fi
done
ok "no LIVE payment hostname is served by the website edge"

echo
echo "  $pass passed, $fail failed"
[ "$fail" -eq 0 ]
