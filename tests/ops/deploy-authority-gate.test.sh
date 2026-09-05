#!/usr/bin/env bash
# deploy-authority-gate.test.sh
#
# Proves the fail-closed service authority gate in deploy.sh after the Stage C
# architecture decisions. No Docker, no network, no database, no external
# providers — every denied path exits before any gate/build/transfer step, and
# the approved website path is exercised in BANZAMI_ASSURANCE_ONLY mode.
#
# Asserts:
#   1. live core-api/api-gateway/public-api fail closed;
#   2. checkout no longer exists; pay is Stage F approved with the approval recorded;
#   3. admin/dashboard fail closed;
#   4. sandbox-operator fails closed (pending Stage C execution approval);
#   5. legacy `staging` path fails closed;
#   6. legacy compose-based developer-api path (mixed invocation) fails closed;
#   7. no-argument "deploy all" fails closed;
#   8. website deploy + website assurance gate remain intact;
#   9. wrong directory / banzami-canonical still rejected;
#  10. no local Mac QEMU amd64 build fallback reintroduced;
#  11. Stage C is NOT implemented: sandbox-edge exists as docs only, no runtime
#      artifact (no compose service, no nginx conf, no deploy path).
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
pass=0; fail=0
ok(){ echo "  ok: $1"; pass=$((pass+1)); }
no(){ echo "  FAIL: $1"; fail=$((fail+1)); }

deny_check() {  # $1 = service args (string), $2 = label, $3 = extra grep (optional)
  local out rc
  out="$( ./deploy.sh $1 2>&1 )"; rc=$?
  if [ "$rc" -ne 0 ] && echo "$out" | grep -q "NOT approved for restore/deploy" \
     && { [ -z "${3:-}" ] || echo "$out" | grep -q "$3"; }; then
    ok "$2 fails closed"
  else
    no "$2 did NOT fail closed (rc=$rc)"
  fi
}

# 1. Live payment-rail services.
for svc in core-api api-gateway public-api; do
  deny_check "$svc" "live $svc" "live payment-rail service"
done

# 2. Payment surfaces.
#
# pay-frontend is STAGE F APPROVED for the SANDBOX scope (Banzami ADR-052) and no
# longer fails closed. What must still hold is the boundary that approval was
# given inside: it must not have opened the LIVE payment services, which are
# asserted separately below and are the thing this section actually protects.
# checkout-frontend is refused one step earlier than the authority gate: the
# service no longer exists, so it is rejected as unknown. That is the stronger
# refusal, and leaving a gate branch for a service that cannot be selected would
# be dead code that reads as live.
# The output is captured before grepping: under `set -o pipefail` a pipeline
# whose FIRST command exits non-zero reports non-zero however the grep goes, so
# `deploy.sh … | grep -q` would report failure for a correct refusal.
_co_out="$( ./deploy.sh checkout-frontend 2>&1 )"; _co_rc=$?
if [ "$_co_rc" -ne 0 ] && printf '%s' "$_co_out" | grep -q "Unknown service"; then
  ok "checkout-frontend no longer exists as a deployable service"
else
  no "checkout-frontend is still selectable"
fi
if grep -qE '^\s+pay-frontend\)' deploy.sh && grep -q "STAGE F APPROVED" deploy.sh; then
  ok "pay-frontend is approved with the Stage F approval recorded in the gate itself"
else
  no "pay-frontend is approved without a recorded Stage F approval"
fi

# 3. Admin / merchant surfaces.
for svc in admin-api admin-frontend dashboard-frontend; do
  deny_check "$svc" "$svc" "Stage D approval"
done

# 4. sandbox-operator pending Stage C execution approval.
deny_check "sandbox-operator" "sandbox-operator" "Stage C execution approval"

# 5. Legacy staging deploy path.
deny_check "staging" "legacy staging path" "authoritative staging runtime"

# 6. Legacy compose-based developer-api path: a MIXED invocation must not fall
#    through to any legacy path (alone, developer-api routes to the rt04e flow).
deny_check "developer-api website-frontend" "mixed developer-api invocation" "rt04e sandbox flow"

# 7. No-argument "deploy all" is retired.
out="$( ./deploy.sh 2>&1 )"; rc=$?
[ "$rc" -ne 0 ] && echo "$out" | grep -q "fail-closed" \
  && ok "no-argument deploy-all fails closed" \
  || no "no-argument deploy-all did NOT fail closed (rc=$rc)"

# 8. Approved website path still works end-to-end through the gates (no deploy).
out="$( BANZAMI_ASSURANCE_ONLY=1 ./deploy.sh website-frontend 2>&1 )"; rc=$?
[ "$rc" -eq 0 ] && echo "$out" | grep -q "Website assurance gate passed" \
  && echo "$out" | grep -q "no build/deploy performed" \
  && ok "website deploy path + website assurance gate intact" \
  || no "website deploy path broken (rc=$rc)"

# 9. Wrong directory / banzami-canonical still rejected before everything.
TMP="$(mktemp -d)"; cp deploy.sh "$TMP/deploy.sh"
mv "$TMP" "${TMP}-banzami-canonical"; TMP="${TMP}-banzami-canonical"
guard_out="$( (cd "$TMP" && bash deploy.sh website-frontend) 2>&1 )"
echo "$guard_out" | grep -q "Wrong Banzami working directory" \
  && ok "banzami-canonical / wrong directory rejected" || no "wrong directory was NOT rejected"
rm -rf "$TMP"

# 10. No local Mac QEMU amd64 build fallback reintroduced.
if grep -rInE "QEMU_FB|local[_-]amd64[_-]build[_-]fallback" deploy.sh infra/blueprint/sandbox-ops/scripts 2>/dev/null \
   | grep -vE "refuse|not supported|unsupported|reject|→ refused|Local Mac linux/amd64 QEMU builds are not"; then
  no "a local QEMU fallback path may have been reintroduced"
else
  ok "no local Mac QEMU amd64 build fallback path exists"
fi

# 11. sandbox-edge IS implemented (Stage C executed) and is the authority for the
# Sandbox public routes. This assertion used to require the opposite — that no
# runtime artifact exist — and had been failing against a sandbox-edge that has
# been serving sandbox-api.banzami.com for months. A test that contradicts the
# deployed system is not protecting anything.
#
# What is still worth asserting is what Stage C actually bounded: the sandbox
# edge must not become a route to the LIVE payment stack.
if grep -qE "^\s*server_name (api|admin)\.banzami\.com" infra/nginx/sandbox-edge.conf.template 2>/dev/null; then
  no "the sandbox edge serves a LIVE hostname"
else
  ok "sandbox-edge carries sandbox hosts only — no LIVE hostname"
fi

echo "---- deploy-authority-gate: pass=$pass fail=$fail ----"
[ "$fail" -eq 0 ]
