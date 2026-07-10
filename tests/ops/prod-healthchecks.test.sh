#!/usr/bin/env bash
# prod-healthchecks.test.sh
#
# Static validation of the production Postgres/Redis healthcheck fix (Stage C
# readiness drift D5/D6). No Docker, no network, no database.
#
# Asserts:
#   1. the versioned production override exists and its Postgres healthcheck
#      targets the database that exists in the production cluster — and no
#      longer references the nonexistent database name;
#   2. the Postgres healthcheck actually opens the database (SELECT 1), not
#      just pg_isready;
#   3. the production Redis healthcheck authenticates and passes only on PONG —
#      NOAUTH/auth failure can no longer read as healthy;
#   4. local compose Redis healthchecks also require PONG (fail-closed parity);
#   5. no secret literal is committed in the override;
#   6. the override opens no application service restore path (postgres/redis
#      healthcheck+env only — no build/image/ports/volumes/other services);
#   7. the deploy authority gate still blocks unsupported services.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
OVR="infra/docker/production-healthchecks.override.yml"
pass=0; fail=0
ok(){ echo "  ok: $1"; pass=$((pass+1)); }
no(){ echo "  FAIL: $1"; fail=$((fail+1)); }

# 1. Override exists; Postgres probes the existing database, not the nonexistent one.
if [ -f "$OVR" ] && grep -q "pg_isready -U banzami -d banzami_staging" "$OVR" \
   && ! grep -E "pg_isready[^&|]*-d banzami(['\" ]|$)" "$OVR" | grep -vq banzami_staging; then
  ok "postgres healthcheck targets the existing database (banzami_staging)"
else
  no "postgres healthcheck still references a nonexistent database or override missing"
fi

# 2. Postgres healthcheck proves the database opens (read-only SELECT 1).
grep -q "SELECT 1" "$OVR" \
  && ok "postgres healthcheck opens the database (SELECT 1)" \
  || no "postgres healthcheck does not verify the database opens"

# 3. Production Redis healthcheck: authenticated + PONG-required.
hc="$(grep -A1 '^  redis:' -n "$OVR"; grep 'redis-cli' "$OVR")"
if grep 'redis-cli' "$OVR" | grep -q -- '-a' && grep 'redis-cli' "$OVR" | grep -q 'grep -q PONG'; then
  ok "production redis healthcheck authenticates and requires PONG (NOAUTH fails)"
else
  no "production redis healthcheck can still false-positive on auth failure"
fi

# 4. Local compose Redis healthchecks require PONG too.
bad=0
for f in infra/docker/docker-compose.yml infra/docker/docker-compose.full.yml; do
  if grep -q '"CMD", "redis-cli", "ping"' "$f"; then bad=1; fi
  grep 'redis-cli' "$f" | grep -q 'grep -q PONG' || bad=1
done
[ "$bad" -eq 0 ] && ok "local redis healthchecks require PONG (fail-closed parity)" \
  || no "a local redis healthcheck still treats any exit-0 ping as healthy"

# 5. No secret literal in the override (env interpolation/runtime env only).
if grep -iE "(password|secret|token)\s*[:=]\s*['\"]?[A-Za-z0-9]" "$OVR" | grep -vE '\$\{|\$\$'; then
  no "a secret-like literal may be committed in the override"
else
  ok "no secret literal committed (interpolation/runtime env only)"
fi

# 6. Override opens no service restore path: only postgres/redis, only
#    healthcheck/environment keys — no build/image/ports/volumes/command/deploy keys.
svcs="$(grep -E '^  [a-z0-9-]+:' "$OVR" | tr -d ' :')"
if [ "$(echo "$svcs" | sort | tr '\n' ' ' | sed 's/ $//')" = "postgres redis" ] \
   && ! grep -qE '^\s+(build|image|ports|volumes|command|depends_on|deploy):' "$OVR"; then
  ok "override touches only postgres/redis healthcheck+env — no restore path opened"
else
  no "override contains more than postgres/redis healthcheck+env"
fi

# 7. Deploy authority gate still blocks unsupported services (spot check).
out="$( ./deploy.sh core-api 2>&1 )"; rc=$?
[ "$rc" -ne 0 ] && echo "$out" | grep -q "NOT approved for restore/deploy" \
  && ok "deploy authority gate still blocks unsupported services" \
  || no "deploy authority gate no longer blocks core-api (rc=$rc)"

echo "---- prod-healthchecks: pass=$pass fail=$fail ----"
[ "$fail" -eq 0 ]
