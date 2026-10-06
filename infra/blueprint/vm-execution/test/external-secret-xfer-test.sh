#!/usr/bin/env bash
# Banzami Environment Blueprint — external-secret transfer local validation (synthetic, no VM).
#
# Proves the owner-gated external-secret transfer entirely offline: the pure placement library
# against temp-dir fixtures (allow/deny, path safety, idempotency, atomic write, verify, source
# unchanged, no secret leakage, temp cleanup) and the operator-side input validation + apply guard
# in vm-execute.sh (never contacts a VM — no BZVM_SSH_TARGET is ever set). Zero residue.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VMX_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LIB="$VMX_DIR/lib/external-secret-xfer.sh"
EXEC="$VMX_DIR/vm-execute.sh"
# shellcheck source=../lib/external-secret-xfer.sh
. "$LIB"

RUN="${TMPDIR:-/tmp}/banzami-blueprint-esx-test/run-$$-${RANDOM}"
mkdir -p "$RUN"; chmod 0700 "$RUN"
rc=0
pass() { echo "  PASS  $*"; }
fail() { echo "  FAIL  $*"; rc=1; }
trap 'rm -rf "${TMPDIR:-/tmp}/banzami-blueprint-esx-test" 2>/dev/null || true' EXIT

# Distinctive secret value used to assert it is NEVER echoed to stdout/stderr.
SECRET_CANARY="re_CANARY_$$_do_not_leak_0123456789"
SELF_OWNER="$(id -u):$(id -g)"
OLD_RUNID="bzsandbox-20260708184104-1708617-23807"
NEW_RUNID="bzsandbox-20261006183427-3949590-3982"

# fresh OLD/NEW evidence-root pair; OLD seeded with resend_api_key (the canary) + a decoy.
fixture() {
  local base; base="$RUN/f-${RANDOM}"; mkdir -p "$base/old" "$base/new"
  printf '%s' "$SECRET_CANARY" > "$base/old/resend_api_key"
  printf 'decoy-firebase'      > "$base/old/firebase_credentials_json"
  printf '%s' "$base"
}

echo "== pure placement library =="

# 1. valid apply transfer: file created, verified, PLACED
F="$(fixture)"
OUT="$(external_secret_place apply "$F/old" "$F/new" resend_api_key "$SELF_OWNER" 0644 2>&1)"
{ grep -q 'action=PLACED' <<<"$OUT" && grep -q 'EXTERNAL_SECRET_TRANSFER_APPLY: PASS' <<<"$OUT" \
  && [ -f "$F/new/resend_api_key" ] && cmp -s "$F/old/resend_api_key" "$F/new/resend_api_key" \
  && [ "$(_esx_mode "$F/new/resend_api_key")" = 644 ]; } && pass "valid transfer places, chmods 0644, verifies" || fail "valid transfer"

# 2. only the requested secret is touched (decoy never copied)
[ ! -e "$F/new/firebase_credentials_json" ] && pass "only requested secret transferred (decoy untouched)" || fail "decoy leaked across"

# 3. NO secret value in any output
grep -q "$SECRET_CANARY" <<<"$OUT" && fail "secret VALUE leaked to output" || pass "secret value never printed (apply)"

# 4. plan writes nothing and leaks nothing
F="$(fixture)"
OUT="$(external_secret_place plan "$F/old" "$F/new" resend_api_key "$SELF_OWNER" 0644 2>&1)"
{ grep -q 'action=CREATE' <<<"$OUT" && grep -q 'EXTERNAL_SECRET_TRANSFER_PLAN: PASS' <<<"$OUT" \
  && [ ! -e "$F/new/resend_api_key" ]; } && pass "plan reports CREATE and writes nothing" || fail "plan wrote or mis-reported"
grep -q "$SECRET_CANARY" <<<"$OUT" && fail "secret VALUE leaked to plan output" || pass "secret value never printed (plan)"

# 5. idempotent: identical destination is ALREADY_IDENTICAL and is not rewritten
F="$(fixture)"; external_secret_place apply "$F/old" "$F/new" resend_api_key "$SELF_OWNER" 0644 >/dev/null 2>&1
MT1="$(_esx_fingerprint "$F/new/resend_api_key")"
OUT="$(external_secret_place apply "$F/old" "$F/new" resend_api_key "$SELF_OWNER" 0644 2>&1)"
MT2="$(_esx_fingerprint "$F/new/resend_api_key")"
{ grep -q 'action=ALREADY_IDENTICAL' <<<"$OUT" && [ "$MT1" = "$MT2" ]; } && pass "identical destination is idempotent (not rewritten)" || fail "idempotency"

# 6. destination exists but DIFFERS → BLOCKER, never overwritten
F="$(fixture)"; printf 'a-different-value' > "$F/new/resend_api_key"; BEFORE="$(cat "$F/new/resend_api_key")"
if external_secret_place apply "$F/old" "$F/new" resend_api_key "$SELF_OWNER" 0644 >"$RUN/d.out" 2>&1; then fail "differing destination was overwritten"; else
  { grep -q 'destination_exists_and_differs' "$RUN/d.out" && [ "$(cat "$F/new/resend_api_key")" = "$BEFORE" ]; } && pass "differing destination blocks, no overwrite" || fail "differ-block reason/state"; fi

# 7. source missing → BLOCKER, no write
F="$(fixture)"; rm -f "$F/old/resend_api_key"
if external_secret_place apply "$F/old" "$F/new" resend_api_key "$SELF_OWNER" 0644 >"$RUN/s.out" 2>&1; then fail "missing source proceeded"; else
  { grep -q 'source_missing' "$RUN/s.out" && [ ! -e "$F/new/resend_api_key" ]; } && pass "missing source blocks closed" || fail "missing-source handling"; fi

# 8. source unchanged after a successful transfer
F="$(fixture)"; FP_BEFORE="$(_esx_fingerprint "$F/old/resend_api_key")"
external_secret_place apply "$F/old" "$F/new" resend_api_key "$SELF_OWNER" 0644 >/dev/null 2>&1
[ "$(_esx_fingerprint "$F/old/resend_api_key")" = "$FP_BEFORE" ] && pass "source file unchanged by transfer" || fail "source mutated"

# 9. all-or-nothing preflight: one bad name in the set aborts before ANY write
F="$(fixture)"
if external_secret_place apply "$F/old" "$F/new" resend_api_key,otp_pepper "$SELF_OWNER" 0644 >"$RUN/m.out" 2>&1; then fail "forbidden name in set did not abort"; else
  { grep -q 'secret_name_not_permitted name=otp_pepper' "$RUN/m.out" && [ ! -e "$F/new/resend_api_key" ]; } && pass "forbidden name aborts whole set before any write" || fail "all-or-nothing preflight"; fi

# 10. temp cleanup on failure (destination root not writable → copy fails, no .esx temp left)
F="$(fixture)"; chmod 0500 "$F/new"
external_secret_place apply "$F/old" "$F/new" resend_api_key "$SELF_OWNER" 0644 >"$RUN/t.out" 2>&1 || true
chmod 0700 "$F/new"
[ -z "$(ls -A "$F/new" 2>/dev/null)" ] && pass "no temp file left behind on failure" || fail "temp residue after failure"

echo "== name allow/deny =="
for ok in resend_api_key firebase_credentials_json kyb_storage_endpoint kyb_storage_access_key_id kyb_storage_secret_access_key; do
  esx_valid_name "$ok" || fail "allow-listed name rejected: $ok"
done
pass "all five external secrets are allow-listed"
for bad in otp_pepper rate_limit_pepper mi_superuser mi_runtime db_url_core core_internal_key jwt_secret "../etc/passwd" "resend_api_key;rm" "resend*" "resend/key" "" ; do
  esx_valid_name "$bad" && fail "forbidden/invalid name accepted: '$bad'" || true
done
pass "peppers, mi_*, db_url_*, other minted keys, traversal + wildcards all rejected"

echo "== resolution helpers =="
# NEW resolution: authoritative only when SANDBOX_STATE RUNID == expected
ST="$RUN/state.run"; EVID="$RUN/ev-new"; mkdir -p "$EVID"
printf 'RUNID=%s\nEVIDENCE_ROOT=%s\n' "$NEW_RUNID" "$EVID" > "$ST"
[ "$(esx_new_evidence_root "$ST" "$NEW_RUNID")" = "$EVID" ] && pass "NEW evidence root resolved from current SANDBOX_STATE" || fail "NEW resolution (match)"
esx_new_evidence_root "$ST" "$OLD_RUNID" >/dev/null 2>&1 && fail "NEW resolution accepted a non-current RUNID" || pass "NEW resolution refuses a non-current RUNID"
esx_new_evidence_root "$RUN/nope.run" "$NEW_RUNID" >/dev/null 2>&1 && fail "NEW resolution accepted missing state" || pass "NEW resolution refuses missing SANDBOX_STATE"

# OLD resolution from container binds: exactly one core_internal_key bind
BINDS_OK="$(printf '/srv/x/root-abc/evidence/core_internal_key:/run/secrets/core_internal_key:ro\n/srv/x/root-abc/evidence/jwt_secret:/run/secrets/jwt_secret:ro\n')"
[ "$(esx_evidence_root_from_binds "$BINDS_OK")" = "/srv/x/root-abc/evidence" ] && pass "OLD evidence root located from a single core_internal_key bind" || fail "OLD resolution (single)"
esx_evidence_root_from_binds "$(printf 'a/core_internal_key:/run/secrets/core_internal_key:ro\nb/core_internal_key:/run/secrets/core_internal_key:ro\n')" >/dev/null 2>&1 \
  && fail "OLD resolution accepted ambiguous binds" || pass "OLD resolution fails closed on ambiguity (no head -1)"
esx_evidence_root_from_binds "$(printf 'x/jwt_secret:/run/secrets/jwt_secret:ro\n')" >/dev/null 2>&1 \
  && fail "OLD resolution accepted zero binds" || pass "OLD resolution fails closed with no bind"

echo "== operator-side validation + apply guard (no VM contact) =="
runx() { # run vm-execute with a scrubbed env (never a VM target); capture combined output
  env -u BZVM_SSH_TARGET -u BZVM_REMOTE_ROOT -u BZVM_AUTH_FILE "$@" bash "$EXEC" "$SUBCMD" ${FLAG:-} >"$RUN/op.out" 2>&1
}
expect_refuse() { local msg="$1"; shift; SUBCMD="$1"; FLAG="${2:-}"; shift 2 || true
  if runx "$@"; then fail "$msg (did not refuse)"; else grep -q "$msg" "$RUN/op.out" && pass "refused: $msg" || { fail "wrong refusal for: $msg"; sed 's/^/      /' "$RUN/op.out"; }; fi; }

expect_refuse "BZVM_OLD_RUNID not supplied"                external-secret-transfer-plan ""  BZVM_NEW_RUNID="$NEW_RUNID" BZVM_SECRET_NAMES=resend_api_key
expect_refuse "BZVM_NEW_RUNID not supplied"                external-secret-transfer-plan ""  BZVM_OLD_RUNID="$OLD_RUNID" BZVM_SECRET_NAMES=resend_api_key
expect_refuse "BZVM_SECRET_NAMES not supplied"             external-secret-transfer-plan ""  BZVM_OLD_RUNID="$OLD_RUNID" BZVM_NEW_RUNID="$NEW_RUNID"
expect_refuse "BZVM_OLD_RUNID malformed"                   external-secret-transfer-plan ""  BZVM_OLD_RUNID="not-a-runid" BZVM_NEW_RUNID="$NEW_RUNID" BZVM_SECRET_NAMES=resend_api_key
expect_refuse "OLD_RUNID == NEW_RUNID"                     external-secret-transfer-plan ""  BZVM_OLD_RUNID="$NEW_RUNID" BZVM_NEW_RUNID="$NEW_RUNID" BZVM_SECRET_NAMES=resend_api_key
expect_refuse "secret name not permitted: otp_pepper"      external-secret-transfer-plan ""  BZVM_OLD_RUNID="$OLD_RUNID" BZVM_NEW_RUNID="$NEW_RUNID" BZVM_SECRET_NAMES=otp_pepper
expect_refuse "secret name not permitted: db_url_core"     external-secret-transfer-plan ""  BZVM_OLD_RUNID="$OLD_RUNID" BZVM_NEW_RUNID="$NEW_RUNID" BZVM_SECRET_NAMES=resend_api_key,db_url_core
# valid inputs, plan, but NO VM target → fails closed at require_target
expect_refuse "VM target not supplied"                     external-secret-transfer-plan ""  BZVM_OLD_RUNID="$OLD_RUNID" BZVM_NEW_RUNID="$NEW_RUNID" BZVM_SECRET_NAMES=resend_api_key
# apply without --apply → refused (plan-only default)
expect_refuse "apply requires the explicit --apply flag"   external-secret-transfer-apply ""  BZVM_OLD_RUNID="$OLD_RUNID" BZVM_NEW_RUNID="$NEW_RUNID" BZVM_SECRET_NAMES=resend_api_key
# apply --apply but no authorisation file → refused
expect_refuse "BZVM_AUTH_FILE"                             external-secret-transfer-apply "--apply"  BZVM_OLD_RUNID="$OLD_RUNID" BZVM_NEW_RUNID="$NEW_RUNID" BZVM_SECRET_NAMES=resend_api_key

# apply --apply with a WRONG-scope authorisation → refused
WRONG="$RUN/authz-wrong"; printf 'BZVM_APPLY=yes\nBZVM_APPLY_SCOPE=sandbox-deploy\n' > "$WRONG"; chmod 0600 "$WRONG"
if env -u BZVM_SSH_TARGET -u BZVM_REMOTE_ROOT BZVM_AUTH_FILE="$WRONG" BZVM_OLD_RUNID="$OLD_RUNID" BZVM_NEW_RUNID="$NEW_RUNID" BZVM_SECRET_NAMES=resend_api_key \
   bash "$EXEC" external-secret-transfer-apply --apply >"$RUN/op.out" 2>&1; then fail "wrong-scope authz accepted"; else
   grep -q 'authorisation scope mismatch' "$RUN/op.out" && pass "refused: wrong authorisation scope" || fail "wrong-scope refusal reason"; fi
# apply --apply with correct scope but NO target → guard passes, then fails closed at target
RIGHT="$RUN/authz-ok"; printf 'BZVM_APPLY=yes\nBZVM_APPLY_SCOPE=external-secret-transfer\n' > "$RIGHT"; chmod 0600 "$RIGHT"
if env -u BZVM_SSH_TARGET -u BZVM_REMOTE_ROOT BZVM_AUTH_FILE="$RIGHT" BZVM_OLD_RUNID="$OLD_RUNID" BZVM_NEW_RUNID="$NEW_RUNID" BZVM_SECRET_NAMES=resend_api_key \
   bash "$EXEC" external-secret-transfer-apply --apply >"$RUN/op.out" 2>&1; then fail "authorised apply proceeded without a VM target"; else
   grep -q 'VM target not supplied' "$RUN/op.out" && pass "authorised apply still fails closed without a runtime target" || fail "apply target guard"; fi

echo "EXTERNAL_SECRET_XFER_TEST_RESULT: $([ "$rc" -eq 0 ] && echo PASS || echo FAIL)"
exit "$rc"
