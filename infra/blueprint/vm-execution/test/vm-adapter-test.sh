#!/usr/bin/env bash
# Banzami Environment Blueprint — VM execution adapter local validation (synthetic, no VM).
#
# Proves the safety-critical classification, delete-plan generation, plan-by-default and
# apply-guard behaviour entirely offline against a synthetic fake inventory. NEVER contacts a
# VM (no BZVM_SSH_TARGET is set). Zero residue.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VMX_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
FIXTURE="$SCRIPT_DIR/fixtures/synthetic-inventory.tsv"
EXEC="$VMX_DIR/vm-execute.sh"
# shellcheck source=../lib/classify.sh
. "$VMX_DIR/lib/classify.sh"

RUN="${TMPDIR:-/tmp}/banzami-blueprint-vmx-test/run-$$-${RANDOM}"
mkdir -p "$RUN"; chmod 0700 "$RUN"
rc=0
pass() { echo "  PASS  $*"; }
fail() { echo "  FAIL  $*"; rc=1; }
cleanup() { rm -rf "${TMPDIR:-/tmp}/banzami-blueprint-vmx-test" 2>/dev/null || true; }
trap cleanup EXIT

MAN="$RUN/manifest.tsv"; EXC="$RUN/excluded.tsv"; PLAN="$RUN/plan.txt"
classify_inventory "$FIXTURE" "$MAN" "$EXC"
gen_delete_plan "$MAN" "$PLAN"

in_man()  { grep -Eq "^[a-z]+\t$1\t" "$MAN"; }
in_exc()  { grep -Eq "^[a-z]+\t$1\t.*\tEXCLUDED\t$2$" "$EXC"; }
in_plan() { grep -Eq "(^| )$1( |$)" "$PLAN"; }

echo "== classification =="
# 1. authorised Banzami / BANZA / BanzAI selected
{ in_man c001 && in_man c009 && in_man c010; } && pass "Banzami + BANZA + BanzAI resources selected" || fail "family selection"
# 2. old LIVE / staging / shared / settlement Banzami selected
{ in_man c003 && in_man c006 && in_man c011 && in_man v002 && in_man n002; } && pass "old LIVE/staging/settlement Banzami resources selected" || fail "legacy Banzami selection"
# 3. unrelated third-party excluded
{ in_exc u001 UNRELATED && in_exc u002 UNRELATED && in_exc u003 UNRELATED; } && pass "unrelated third-party workloads excluded (UNRELATED)" || fail "unrelated exclusion"
# 4. ambiguous non-Banzami excluded
{ in_exc a001 AMBIGUOUS && in_exc a002 AMBIGUOUS; } && pass "ambiguous non-Banzami workloads excluded (AMBIGUOUS)" || fail "ambiguous exclusion"
# 5. delete commands only for manifest resources
{ in_plan c001 && in_plan c011 && ! in_plan u001 && ! in_plan u002 && ! in_plan a001; } && pass "delete plan references only in-scope resources" || fail "delete-plan scope"
# 6. no global prune command generated
grep -Eiq 'prune|system' "$PLAN" && fail "prune present in plan" || pass "no prune command generated"
# 7. no unscoped deletion generated (every line is exactly '<kind> <id>')
if awk 'NF!=2 || $1 !~ /^(container|image|volume|network)$/ {bad=1} END{exit bad?1:0}' "$PLAN"; then pass "every delete line is a scoped '<kind> <id>' token"; else fail "unscoped/malformed delete line"; fi
# 8. sanitised evidence: categories + counts only, no ids/names
SUM="$RUN/sum.txt"; summarise "$MAN" > "$SUM"
if grep -Eq 'c0[0-9][0-9]|u0[0-9][0-9]|a0[0-9][0-9]|banzami-postgres|acme-crm' "$SUM"; then fail "summary leaks ids/names"; else pass "summary is categories + counts only"; fi

echo "== plan-by-default + apply guard (no VM contact) =="
# reset-plan runs offline against the fixture and must PASS without a target
if BZVM_INVENTORY_FILE="$FIXTURE" bash "$EXEC" legacy-reset-plan >"$RUN/plan.out" 2>&1 && grep -q 'VM_LEGACY_RESET_PLAN: PASS' "$RUN/plan.out"; then pass "legacy-reset-plan runs offline and PASSes"; else fail "legacy-reset-plan offline"; fi
# plan output must not leak ids/names either
if grep -Eq 'c0[0-9][0-9]|acme-crm|banzami-postgres|otherapp' "$RUN/plan.out"; then fail "plan output leaks ids/names"; else pass "plan output sanitised"; fi
# apply without --apply flag → refused (plan-only default)
if BZVM_INVENTORY_FILE="$FIXTURE" bash "$EXEC" legacy-reset-apply >"$RUN/a1.out" 2>&1; then fail "apply ran without --apply"; else grep -q 'apply requires the explicit --apply flag' "$RUN/a1.out" && pass "apply refused without --apply flag" || fail "apply refusal reason (flag)"; fi
# apply with --apply but no authorisation file → refused
if BZVM_INVENTORY_FILE="$FIXTURE" bash "$EXEC" legacy-reset-apply --apply >"$RUN/a2.out" 2>&1; then fail "apply ran without authorisation file"; else grep -q 'BZVM_AUTH_FILE' "$RUN/a2.out" && pass "apply refused without authorisation file" || fail "apply refusal reason (authz)"; fi
# apply with --apply + valid authz but NO runtime target → guard passes, then fails closed at target (no deletion possible)
AUTH="$RUN/authz"; printf 'BZVM_APPLY=yes\nBZVM_APPLY_SCOPE=legacy-reset\n' > "$AUTH"; chmod 0600 "$AUTH"
if BZVM_INVENTORY_FILE="$FIXTURE" BZVM_AUTH_FILE="$AUTH" bash "$EXEC" legacy-reset-apply --apply >"$RUN/a3.out" 2>&1; then fail "apply proceeded without a runtime VM target"; else grep -q 'VM target not supplied' "$RUN/a3.out" && pass "authorised apply still fails closed without a runtime target" || fail "apply target guard"; fi

echo "== evidence secret-mode contract (regression: transfer must not clobber NEW evidence modes) =="
SBScripts="$(cd "$VMX_DIR/../sandbox-ops/scripts" && pwd)"
# A) release-transfer scopes its chmod to the tmp + release-state dirs, never a recursive chmod of
#    the Sandbox evidence tree (a `chmod -R` of $vmtmp clobbered every evidence secret to 0700).
if grep -Eq "chmod -R[^\n]*\\\$vmtmp" "$EXEC"; then fail "release-transfer still does a recursive chmod of \$vmtmp (would clobber NEW evidence modes)"; else pass "release-transfer chmod does not recurse into the Sandbox evidence tree"; fi
grep -Eq "chmod 0700 '\\\$vmtmp' '\\\$vmtmp/banzami-blueprint-release'" "$EXEC" && pass "release-transfer chmod is scoped to tmp + release-state dirs" || fail "release-transfer scoped chmod missing"
# B) the ceremony apply path asserts evidence modes before mounting them into the four services.
awk '/cmd_apply\(\)/{a=1} /cmd_verify\(\)/{a=0} a' "$SBScripts/sandbox-deploy.sh" | grep -Eq 'assert_secret_modes "\$EVIDENCE_ROOT"' \
  && pass "ceremony cmd_apply asserts evidence secret modes (0644) before deploy" || fail "cmd_apply does not assert_secret_modes on \$EVIDENCE_ROOT"
# C) runtime-authority forces 0644 on the final db_url file (cat>existing preserves the old mode).
grep -Eq 'chmod 0644 "\$EV/\$file"' "$SBScripts/runtime-authority.sh" \
  && pass "runtime-authority forces 0644 on the final db_url file" || fail "runtime-authority does not force 0644 on the final db_url file"

echo "VM_ADAPTER_TEST_RESULT: $([ "$rc" -eq 0 ] && echo PASS || echo FAIL)"
exit "$rc"
