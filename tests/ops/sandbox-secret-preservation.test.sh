#!/usr/bin/env bash
# sandbox-secret-preservation.test.sh
#
# The gated Sandbox apply regenerated every synthetic credential on every run.
# For most of them that only breaks the run in progress. For api_key_pepper it
# breaks other people's production: every API key ever issued is hashed with it,
# nothing fails at deploy time, and each key stops verifying the moment
# developer-api restarts — including keys installed in environments that cannot
# read them back and have to be reissued by hand.
#
# So an apply must preserve what is already provisioned, and rotation must be an
# act someone chose. No Docker, no network: keep_or_mint is extracted from the
# deploy script and exercised against a scratch directory.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SRC="$ROOT/infra/blueprint/sandbox-ops/scripts/sandbox-deploy.sh"
pass=0; fail=0
ok(){ echo "  ok: $1"; pass=$((pass+1)); }
no(){ echo "  FAIL: $1"; fail=$((fail+1)); }

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# Extract just the two functions under test, so nothing else in the script runs.
# uuid() is a one-liner; keep_or_mint is a block.
grep '^uuid() {' "$SRC"                              >  "$WORK/lib.sh"
sed -n '/^keep_or_mint() {/,/^}/p' "$SRC"            >> "$WORK/lib.sh"
grep -q 'keep_or_mint()' "$WORK/lib.sh" \
  && ok "keep_or_mint is extractable from the deploy script" \
  || { no "keep_or_mint not found in $SRC"; echo "  $pass passed, $((fail+1)) failed"; exit 1; }
# shellcheck disable=SC1090
. "$WORK/lib.sh"

F="$WORK/api_key_pepper"

# 1. First provisioning mints a value.
keep_or_mint "$F" api_key_pepper >/dev/null
first="$(cat "$F")"
[ -n "$first" ] && ok "an unprovisioned credential is minted" || no "nothing was written"

# 2. Re-applying keeps it. This is the whole point: a second apply must not
#    invalidate every API key that exists.
keep_or_mint "$F" api_key_pepper >/dev/null
[ "$(cat "$F")" = "$first" ] \
  && ok "re-applying preserves an existing credential" \
  || no "re-applying regenerated the credential — every issued API key would stop verifying"

# 3. An empty file is not a provisioned credential.
: > "$F"
keep_or_mint "$F" api_key_pepper >/dev/null
[ -s "$F" ] && [ "$(cat "$F")" != "$first" ] \
  && ok "an empty file is treated as unprovisioned and minted" \
  || no "an empty credential file was kept"
second="$(cat "$F")"

# 4. Rotation is available, and only when asked for.
BZSB_ROTATE_SECRETS=1 keep_or_mint "$F" api_key_pepper >/dev/null
[ "$(cat "$F")" != "$second" ] \
  && ok "BZSB_ROTATE_SECRETS=1 rotates deliberately" \
  || no "rotation did not happen when it was asked for"

# 5. Every credential the apply writes goes through it — a new one added later
#    must not quietly reintroduce unconditional regeneration.
for label in jwt_secret core_internal_key api_key_pepper developer_internal_key \
             core_payee_validation_key session_secret otp_pepper; do
  grep -q "keep_or_mint .*$label" "$SRC" \
    && ok "$label is preserved across applies" \
    || no "$label is not written through keep_or_mint"
done

echo
echo "  $pass passed, $fail failed"
[ "$fail" -eq 0 ]
