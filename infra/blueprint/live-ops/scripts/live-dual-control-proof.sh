#!/usr/bin/env bash
# §20 — mutation proof for LIVE dual-control. Fully autonomous, disposable keyring
# (test-mode keys, never real approver keys). Proves the quorum FAILS closed for every
# invalid shape and PASSES only for two DISTINCT, valid, correctly-bound approvals.
set -uo pipefail
DC="$(cd "$(dirname "$0")" && pwd)/dual-control.sh"
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
KEYRING="$WORK/keyring"; umask 077
printf 'alice=%s\nbob=%s\ncarol=%s\n' "$(openssl rand -hex 16)" "$(openssl rand -hex 16)" "$(openssl rand -hex 16)" > "$KEYRING"

TARGET=banzami ENV=LIVE REV="$(printf '%040d' 1 | tr '0' 'a')" MIG="$(openssl rand -hex 32)" EXE="sha256:$(openssl rand -hex 32)" SVC="core-api api-gateway public-api developer-api"
pass=0; fail=0
ok(){ echo "  PASS $1"; pass=$((pass+1)); }
no(){ echo "  FAIL $1 -- $2"; fail=$((fail+1)); }
# expect_fail: verify must return non-zero
expect_fail(){ local d="$1" label="$2"; if bash "$DC" verify "$d" "$KEYRING" "$TARGET" "$ENV" "$REV" "$MIG" "$EXE" "$SVC" 2 >/dev/null 2>&1; then no "$label" "quorum unexpectedly MET"; else ok "$label"; fi; }
expect_pass(){ local d="$1" label="$2"; if bash "$DC" verify "$d" "$KEYRING" "$TARGET" "$ENV" "$REV" "$MIG" "$EXE" "$SVC" 2 >/dev/null 2>&1; then ok "$label"; else no "$label" "quorum unexpectedly NOT met"; fi; }
approve(){ bash "$DC" approve "$1" "$KEYRING" "$2" "$TARGET" "$ENV" "$REV" "$MIG" "$EXE" "$SVC" "${3:-3600}" >/dev/null; }

echo "== 1) zero approvals -> FAIL =="
D="$WORK/c1"; mkdir -p "$D"; expect_fail "$D" "zero_approvals"

echo "== 2) one approval -> FAIL =="
D="$WORK/c2"; mkdir -p "$D"; approve "$D" alice; expect_fail "$D" "one_approval"

echo "== 3) same approver twice -> FAIL (1 distinct) =="
D="$WORK/c3"; mkdir -p "$D"; approve "$D" alice
# a second file, same approver identity, correctly signed -> still ONE distinct approver
cp "$D/approval.alice" "$D/approval.alice_dup"
expect_fail "$D" "same_approver_twice"

echo "== 4) expired approval (+valid 2nd) -> FAIL =="
D="$WORK/c4"; mkdir -p "$D"; approve "$D" alice -3600; approve "$D" bob
expect_fail "$D" "expired_approval"

echo "== 5) wrong digest -> FAIL =="
D="$WORK/c5"; mkdir -p "$D"; approve "$D" alice; approve "$D" bob
# verify against a DIFFERENT migration digest than the approvals were bound to
if bash "$DC" verify "$D" "$KEYRING" "$TARGET" "$ENV" "$REV" "$(openssl rand -hex 32)" "$EXE" "$SVC" 2 >/dev/null 2>&1; then no "wrong_digest" "accepted"; else ok "wrong_digest"; fi

echo "== 6) wrong target -> FAIL =="
if bash "$DC" verify "$D" "$KEYRING" banzami_staging "$ENV" "$REV" "$MIG" "$EXE" "$SVC" 2 >/dev/null 2>&1; then no "wrong_target" "accepted"; else ok "wrong_target"; fi

echo "== 7) forged approval (unknown key) -> FAIL =="
D="$WORK/c7"; mkdir -p "$D"; approve "$D" alice
# hand-craft a 2nd approval for 'mallory' who is NOT in the keyring, with a made-up sig
{ echo "kind=approval"; echo "approver_id=mallory"; echo "target=$TARGET"; echo "environment=$ENV"
  echo "source_revision=$REV"; echo "migration_digest=$MIG"; echo "executor_digest=$EXE"
  echo "service_set=$SVC"; echo "issued_epoch=$(date -u +%s)"; echo "expiry_epoch=$(( $(date -u +%s) + 3600 ))"
  echo "state=issued"; echo "sig=deadbeef"; } > "$D/approval.mallory"; chmod 0600 "$D/approval.mallory"
expect_fail "$D" "forged_unknown_key"

echo "== 8) tampered expiry (extend a real approval) -> FAIL =="
D="$WORK/c8"; mkdir -p "$D"; approve "$D" alice; approve "$D" bob
# extend bob's expiry far into the future WITHOUT re-signing -> signature must break
sed -i.bak "s/^expiry_epoch=.*/expiry_epoch=9999999999/" "$D/approval.bob" && rm -f "$D/approval.bob.bak"
# alice still valid (1 distinct) -> quorum of 2 not met
expect_fail "$D" "tampered_expiry_breaks_sig"

echo "== 9) two DISTINCT valid approvals -> PASS =="
D="$WORK/c9"; mkdir -p "$D"; approve "$D" alice; approve "$D" bob
expect_pass "$D" "two_distinct_valid"

echo "== 10) single-use: after consume, re-verify -> FAIL =="
bash "$DC" consume "$D"
expect_fail "$D" "consumed_not_reusable"

echo
echo "LIVE_DUAL_CONTROL_MUTATION_PROOF: pass=$pass fail=$fail"
[ "$fail" -eq 0 ] && echo "RESULT: PASS" || { echo "RESULT: FAIL"; exit 1; }
