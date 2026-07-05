#!/usr/bin/env bash
# =============================================================================
# RT04E rollout runner — harmless canary / lock / revision harness (NO real secret)
# =============================================================================
# Verifies the REAL runner's security behavior against a clearly-FAKE canary and a
# fully STUBBED command chain, in an isolated temp dir. It NEVER connects to a
# database, VM, Docker daemon or Sandbox service, NEVER modifies the runner, and
# introduces NO --dry-run backdoor into the runner (it only stubs the external
# commands via PATH + REPO_ROOT and relocates the lock file, all of which are
# ordinary test isolation, not changes to the runner's security logic).
#
# Exit 0 = all cases pass. Cleans up all temp material.
set -uo pipefail

RUNNER="$(cd "$(dirname "$0")/../.." && pwd)/infra/deployment/rt04e-secure-rollout.sh"
[ -f "$RUNNER" ] || { echo "runner not found: $RUNNER"; exit 1; }

# Clearly-fake sentinel tokens — must NEVER appear in any output/file the runner produces.
CANARY_USER='CANARY_USER_zzz'
CANARY_PW='CANARY_PW_zzz'
CANARY_HOST='canary-host-zzz'
CANARY_URL="postgres://${CANARY_USER}:${CANARY_PW}@${CANARY_HOST}:5432/banzami_staging"
APPROVED_REV='0123456789abcdef0123456789abcdef01234567'

WORK="$(mktemp -d "${TMPDIR:-/tmp}/rt04e-verify.XXXXXX")"
cleanup() { rm -rf "$WORK"; }
trap cleanup EXIT INT TERM
fails=0
ok()   { printf '  ✓ %s\n' "$1"; }
bad()  { printf '  ✗ %s\n' "$1"; fails=$((fails+1)); }

# ── build an isolated stubbed REPO_ROOT + stub PATH ──────────────────────────
STUB="$WORK/stub"; REPO="$WORK/repo"
mkdir -p "$STUB" "$REPO/tools/e2e/dev-console" "$REPO/db/migrations"

# stub flock: honour FLOCK_FAIL to simulate contention (macOS has no flock).
cat >"$STUB/flock" <<'S'
#!/usr/bin/env bash
[ "${FLOCK_FAIL:-0}" = "1" ] && exit 1 || exit 0
S
# stub git: control HEAD + dirty state via env.
cat >"$STUB/git" <<'S'
#!/usr/bin/env bash
case "$*" in
  "status --porcelain") [ "${GIT_DIRTY:-0}" = "1" ] && echo " M some/file" || true ;;
  "rev-parse HEAD")     printf '%s\n' "${GIT_HEAD:-0000000000000000000000000000000000000000}" ;;
  *) exit 0 ;;
esac
S
chmod +x "$STUB/flock" "$STUB/git"

# stub migrate-and-verify: DELIBERATELY over-shares its DATABASE_URL to stdout, to
# prove the runner DISCARDS the subprocess output (the canary must not surface).
cat >"$REPO/tools/migrate-and-verify.sh" <<'S'
#!/usr/bin/env bash
echo "STUB migrate connecting with DATABASE_URL=${DATABASE_URL:-unset}"
echo "migrate: applied 0100 (stub)"
exit 0
S
# stub deploy.sh + e2e — harmless, no real services.
cat >"$REPO/deploy.sh" <<'S'
#!/usr/bin/env bash
echo "STUB deploy: $* ok"
S
cat >"$REPO/tools/e2e/dev-console/rt04e-payment-e2e.sh" <<'S'
#!/usr/bin/env bash
echo "STUB e2e: 58/58 ok"
S
# non-destructive fake migration.
printf 'CREATE TABLE developer.dev_project_sandbox_binding (id uuid);\n' \
  >"$REPO/db/migrations/0100_dev_project_sandbox_binding.sql"
chmod +x "$REPO/tools/migrate-and-verify.sh" "$REPO/deploy.sh" "$REPO/tools/e2e/dev-console/rt04e-payment-e2e.sh"

# run the REAL runner with the stubbed environment; capture stdout+stderr together.
run_runner() { # $1=stdin-content ; extra env via caller; prints combined output; sets RC
  local out; out="$WORK/out.$$"
  PATH="$STUB:$PATH" TMPDIR="$WORK" \
  BANZAMI_REPO_ROOT="$REPO" RT04E_LOCK_FILE="$WORK/lock" \
  BANZAMI_DB_TARGET="${BANZAMI_DB_TARGET:-banzami_staging}" \
  RT04E_RELEASE_REV="${RT04E_RELEASE_REV:-$APPROVED_REV}" \
  GIT_HEAD="${GIT_HEAD:-$APPROVED_REV}" GIT_DIRTY="${GIT_DIRTY:-0}" FLOCK_FAIL="${FLOCK_FAIL:-0}" \
    bash "$RUNNER" ${1:+"$@"} >"$out" 2>&1 <<<"${STDIN_CONTENT:-}"
  RC=$?; CAP="$(cat "$out")"; rm -f "$out"
}

canary_absent() { # scan captured output AND every temp file for the canary tokens
  local where="$1" body="$2" leak=0 t
  for t in "$CANARY_PW" "$CANARY_USER" "$CANARY_HOST"; do
    printf '%s' "$body" | grep -qF "$t" && { bad "$where: canary token '$t' leaked to output"; leak=1; }
  done
  if grep -rqF "$CANARY_PW" "$WORK" 2>/dev/null; then bad "$where: canary leaked into a temp file under the work dir"; leak=1; fi
  [ "$leak" = 0 ] && ok "$where: canary absent from stdout, stderr and all temp files"
}

echo "── Test 1: canary happy-path — no leak, migrate output discarded ──"
STDIN_CONTENT="$CANARY_URL" run_runner
[ "$RC" = 0 ] && ok "runner completed (exit 0) with stubbed chain" || bad "expected exit 0, got $RC"
grep -q "migration 0100 applied" <<<"$CAP" && ok "sanitised status present (migration applied)" || bad "missing sanitised migration status"
grep -q "runtime-exposure=absent" <<<"$CAP" && ok "credential status is sanitised (no value)" || bad "missing sanitised credential status"
canary_absent "T1" "$CAP"

echo "── Test 2: lock contention — fail closed ──"
STDIN_CONTENT="$CANARY_URL" FLOCK_FAIL=1 run_runner
{ [ "$RC" = 10 ] && grep -q "another rollout is already in progress" <<<"$CAP"; } \
  && ok "concurrent rollout refused (exit 10, no host path leaked)" || bad "lock contention not failed-closed (rc=$RC)"
canary_absent "T2" "$CAP"

echo "── Test 3: revision mismatch — fail closed ──"
STDIN_CONTENT="$CANARY_URL" RT04E_RELEASE_REV="deadbeefdeadbeefdeadbeefdeadbeefdeadbeef" GIT_HEAD="$APPROVED_REV" run_runner
{ [ "$RC" = 11 ] && grep -q "does not match the approved release revision" <<<"$CAP"; } \
  && ok "unapproved revision refused (exit 11)" || bad "revision mismatch not failed-closed (rc=$RC)"

echo "── Test 4: dirty worktree — fail closed ──"
STDIN_CONTENT="$CANARY_URL" GIT_DIRTY=1 run_runner
{ [ "$RC" = 11 ] && grep -q "worktree is dirty" <<<"$CAP"; } \
  && ok "dirty worktree refused (exit 11)" || bad "dirty worktree not failed-closed (rc=$RC)"

echo "── Test 5: argv-smuggled secret — refused before anything ──"
STDIN_CONTENT="$CANARY_URL" run_runner "$CANARY_URL"
{ [ "$RC" = 2 ] && grep -q "must NOT be passed as an argument" <<<"$CAP"; } \
  && ok "argv secret refused (exit 2)" || bad "argv secret not refused (rc=$RC)"
canary_absent "T5" "$CAP"

echo "── Test 6: absent stdin credential — fail closed ──"
STDIN_CONTENT="" run_runner
{ [ "$RC" != 0 ] && grep -qE "credential absent|no credential" <<<"$CAP"; } \
  && ok "absent credential refused (fail closed)" || bad "absent credential not failed-closed (rc=$RC)"

echo
if [ "$fails" = 0 ]; then echo "✓ rt04e-rollout-verify: all cases pass (no canary leak)"; exit 0; fi
echo "✗ rt04e-rollout-verify: $fails failure(s)"; exit 1
