#!/usr/bin/env bash
# website-assurance-gate.test.sh
#
# Proves the scope-aware website recovery assurance gate. No Docker, no network,
# no database, no external providers. Runs the gate in BANZAMI_ASSURANCE_ONLY
# mode (evaluates the gate, then exits before any build/deploy).
#
# Asserts:
#   1. website-only assurance PASSES from the authorised repo WITHOUT skip;
#   2. website scope does NOT require the unrelated manifest/SDK/inventory checks
#      and does not depend on top-level tests/ acceptance being special-cased;
#   3. wrong checkout / banzami-canonical still fails (global SSOT guard);
#   4. the full/general gate still runs the stricter check set (structure);
#   5. no local Mac QEMU amd64 build fallback path exists.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
pass=0; fail=0
ok(){ echo "  ok: $1"; pass=$((pass+1)); }
no(){ echo "  FAIL: $1"; fail=$((fail+1)); }

# 1. Website-only assurance passes without BANZAMI_SKIP_ASSURANCE.
out="$(BANZAMI_ASSURANCE_ONLY=1 ./deploy.sh website-frontend 2>&1)"
echo "$out" | grep -q "Website assurance gate passed" \
  && echo "$out" | grep -q "no build/deploy performed" \
  && ok "website-only assurance passes without skip" \
  || no "website-only assurance did not pass cleanly without skip"

# 2a. Website preflight tool passes on its own (website prerequisites present).
node tools/check-website-recovery-preflight.mjs >/dev/null 2>&1 \
  && ok "website recovery preflight passes" || no "website recovery preflight failed"

# 2b. Website scope must NOT invoke the unrelated checks. Structurally assert the
#     website branch of the gate omits manifest/SDK/inventory/docs-claims.
web_branch="$(awk '/website scope/{f=1} f&&/else$/{f=0} f' deploy.sh)"
if echo "$web_branch" | grep -qE "check-assurance-manifest|check-sdk-contract|check-asset-inventory|check-docs-claims"; then
  no "website scope still references an unrelated check"
else
  ok "website scope runs only global-safety + website-specific checks"
fi

# 2c. Repository layout check accepts the legitimate top-level tests/ (no special skip needed).
node tools/check-repository-layout.mjs >/dev/null 2>&1 \
  && ok "repository layout check passes (tests/ accepted)" || no "repository layout check still fails"

# 3. Wrong checkout / banzami-canonical still rejected (guard fires before the gate).
#    Capture output first — the guard exits non-zero by design, so a pipeline into
#    grep under `set -o pipefail` would misreport the intended rejection as a failure.
TMP="$(mktemp -d)"; cp deploy.sh "$TMP/deploy.sh"
mv "$TMP" "${TMP}-banzami-canonical"; TMP="${TMP}-banzami-canonical"
guard_out="$( (cd "$TMP" && bash deploy.sh website-frontend) 2>&1 )"
echo "$guard_out" | grep -q "Wrong Banzami working directory" \
  && ok "banzami-canonical / wrong directory rejected" || no "wrong directory was NOT rejected"
rm -rf "$TMP"

# 4. Full/general gate still runs the stricter set (structure).
full_branch="$(awk '/Deploy-time assurance gate\"/{f=1} f&&/^  fi$/{f=0} f' deploy.sh)"
for chk in check-assurance-manifest check-repository-layout check-asset-inventory check-live-fail-closed check-docs-claims check-sdk-contract; do
  grep -q "$chk" deploy.sh || no "full gate missing $chk"
done
grep -q "Assurance gate passed (manifest · layout · inventory · live-fail-closed)" deploy.sh \
  && ok "full/general gate retains the stricter check set" || no "full gate summary missing"

# 5. No local Mac QEMU amd64 build fallback reintroduced (only refusal patterns allowed).
if grep -rInE "QEMU_FB|local[_-]amd64[_-]build[_-]fallback" deploy.sh infra/blueprint/sandbox-ops/scripts 2>/dev/null \
   | grep -vE "refuse|not supported|unsupported|reject|→ refused|Local Mac linux/amd64 QEMU builds are not"; then
  no "a local QEMU fallback path may have been reintroduced"
else
  ok "no local Mac QEMU amd64 build fallback path exists"
fi

echo "---- website-assurance-gate: pass=$pass fail=$fail ----"
[ "$fail" -eq 0 ]
