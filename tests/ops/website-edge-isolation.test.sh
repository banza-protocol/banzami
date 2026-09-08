#!/usr/bin/env bash
# website-edge-isolation.test.sh
#
# Stage C Decision 3: the website edge must never gain sandbox/payment/admin
# upstreams. Stage D added admin.banzami.com and it is served by the SANDBOX
# edge, so the decision stands unamended — and this asserts it instead of
# trusting it, because the first attempt did put the admin vhost here.
#
#   1. the banzami.com / www block proxies only the website;
#   2. no admin vhost exists on this edge at all;
#   3. every upstream on this edge is a website upstream;
#   4. no LIVE payment hostname appears here.
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

# 2. No admin vhost on this edge. The console belongs on the sandbox edge, which
#    is already on the Sandbox application network; putting it here would give
#    the website's nginx a dependency on the payment stack.
if [ -e "$ADMIN" ]; then
  no "an admin vhost is back on the website edge ($ADMIN)"
else
  ok "the website edge carries no admin vhost"
fi

# 3. Nothing else on this edge proxies anywhere but the website.
stray="$(grep -rlE '^\s*proxy_pass' "$ROOT/infra/nginx"/website*.conf 2>/dev/null | xargs -r grep -hE '^\s*proxy_pass' | grep -vE 'website-frontend' || true)"
[ -z "$stray" ] \
  && ok "every website-edge upstream is the website itself" \
  || no "a website-edge config proxies elsewhere: $stray"

# 4. No LIVE payment hostname on this edge.
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
