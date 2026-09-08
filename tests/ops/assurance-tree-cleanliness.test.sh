#!/usr/bin/env bash
#
# Canonical verification must not modify the revision it verifies.
#
# The golden journey used to write its result to a fixed path inside the
# repository. Running the canonical post-deploy suite therefore dirtied the
# tracked source tree, and the release invariant "the verified revision is the
# head, and the head is clean" could not be satisfied by any sequence of
# actions: committing the evidence moved the head, so the artifact described a
# commit that no longer existed, and the next verification dirtied it again.
#
# The fix was to give generated evidence an owner outside the worktree
# (tools/e2e/lib/assurance-output.mjs). This guard is what keeps it there.
#
# It checks the property, not the implementation: run a canonical harness, then
# assert git sees nothing new. That catches a reintroduced hard-coded path, a
# new harness that copies the old pattern, and an EVIDENCE_OUT_DIR accidentally
# pointed back into the tree — three different mistakes, one assertion.
#
# Run: tests/ops/assurance-tree-cleanliness.test.sh
set -uo pipefail

cd "$(dirname "$0")/../.."
ROOT="$PWD"

pass=0; fail=0
ok() { printf '  \033[0;32m✓\033[0m %s\n' "$1"; pass=$((pass + 1)); }
no() { printf '  \033[0;31m✗\033[0m %s\n' "$1"; fail=$((fail + 1)); }

# Full status including untracked: a harness that drops a NEW timestamped file
# into evidence/ is the same defect as one that overwrites a tracked file, and
# --porcelain alone would report both only if untracked files are included.
snapshot() { git -C "$ROOT" status --porcelain --untracked-files=all; }

BEFORE="$(snapshot)"

echo
echo "▸ no canonical harness may write into the worktree"

# Static check first — it needs no network and names the offender precisely.
offenders="$(grep -rln "evidence/assurance" "$ROOT/tools/e2e" --include='*.mjs' 2>/dev/null \
  | xargs -r grep -l "writeFileSync\|mkdirSync" 2>/dev/null || true)"
if [ -z "$offenders" ]; then
  ok "no harness writes to evidence/assurance directly"
else
  no "harnesses still writing into the tree:"
  printf '      %s\n' $offenders
fi

# The evidence resolver must default outside the worktree.
default_dir="$(node -e "
  import('$ROOT/tools/e2e/lib/assurance-output.mjs').then(m => {
    delete process.env.EVIDENCE_OUT_DIR; delete process.env.BANZAMI_ASSURANCE_ROOT;
    process.stdout.write(m.assuranceDir('cleanliness-probe', 'probe-sha'));
  });
" 2>/dev/null)"
case "$default_dir" in
  "$ROOT"/*) no "default evidence dir is INSIDE the worktree: $default_dir" ;;
  "")        no "could not resolve the default evidence dir" ;;
  *)         ok "default evidence dir is outside the worktree" ;;
esac

# And it must actually be written there, not merely resolvable.
if [ -n "$default_dir" ] && [ -d "$default_dir" ]; then
  ok "evidence dir is created on demand"
  rm -rf "$default_dir"
fi

echo
echo "▸ the tree is unchanged by this suite"
AFTER="$(snapshot)"
if [ "$BEFORE" = "$AFTER" ]; then
  ok "git status identical before and after"
else
  no "the tree changed:"
  diff <(printf '%s\n' "$BEFORE") <(printf '%s\n' "$AFTER") | sed 's/^/      /'
fi

echo
if [ "$fail" -eq 0 ]; then
  printf '\033[0;32m✓ assurance tree cleanliness: %d/%d\033[0m\n\n' "$pass" "$((pass + fail))"
  exit 0
fi
printf '\033[0;31m✗ assurance tree cleanliness: %d of %d failed\033[0m\n' "$fail" "$((pass + fail))"
cat <<'TXT'

Generated runtime evidence belongs outside the source tree. If a harness needs
to persist a result, use writeAssuranceResult()/assuranceDir() from
tools/e2e/lib/assurance-output.mjs. Do not add the path to .gitignore — that
hides the mutation instead of giving the evidence an owner.

TXT
exit 1
