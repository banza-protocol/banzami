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

# 6. Every mounted secret must be readable by the non-root service user.
#
# All five services run non-root and a bind mount preserves the host's
# permissions, so a root-only file is unreadable inside the container — and
# nothing crashes. The service starts, logs one warning, and runs without the
# credential. admin-api came up healthy with operator login disabled and no
# mailer, and the only symptom was a correct password being refused.
sed -n '/^assert_secret_modes() {/,/^}/p' "$SRC" > "$WORK/modes.sh"
# shellcheck disable=SC1090
. "$WORK/modes.sh"

MD="$WORK/secrets"; mkdir -p "$MD"
printf 'x' > "$MD/root_only";  chmod 0600 "$MD/root_only"
printf 'x' > "$MD/dir_style";  chmod 0700 "$MD/dir_style"
printf 'x' > "$MD/already_ok"; chmod 0644 "$MD/already_ok"
assert_secret_modes "$MD" >/dev/null

allok=1
for f in root_only dir_style already_ok; do
  m="$(stat -c '%a' "$MD/$f" 2>/dev/null || stat -f '%Lp' "$MD/$f" 2>/dev/null)"
  [ "$m" = 644 ] || { no "$f left at mode $m — the service user cannot read it"; allok=0; }
done
[ "$allok" = 1 ] && ok "every mounted secret is readable by the non-root service user"

# And the keep path must not leave a kept secret unreadable either.
printf 'kept-value' > "$F"; chmod 0600 "$F"
keep_or_mint "$F" api_key_pepper >/dev/null
m="$(stat -c '%a' "$F" 2>/dev/null || stat -f '%Lp' "$F" 2>/dev/null)"
[ "$m" = 644 ] && [ "$(cat "$F")" = "kept-value" ] \
  && ok "keeping a credential re-asserts its mode without changing its value" \
  || no "a kept credential stayed at mode $m"

# 7. A service with NO secret mounts must still deploy.
#
# The script runs under `set -euo pipefail`. Resolving the secret directory
# greps the container's binds, and for pay-frontend or admin-frontend that grep
# matches nothing — making the ASSIGNMENT the failing command and aborting the
# deploy before it starts. Two admin-frontend deploys rolled back a perfectly
# good image because of it.
sed -n '/^cmd_deploy_one() {/,/^  local prev pf/p' "$SRC" | grep -A 3 'local sd' > "$WORK/sd.txt"
grep -q '|| true)"' "$WORK/sd.txt" \
  && ok "the secret-directory lookup tolerates a service with no secret mounts" \
  || no "the secret-directory assignment can abort the deploy under set -e"

# And the shape itself, so the guard is not merely present but correct.
if bash -c 'set -euo pipefail; f() { local sd; sd="$(printf "" | grep x | head -1 || true)"; [ -z "$sd" ]; }; f' 2>/dev/null; then
  ok "an empty match yields an empty value instead of aborting"
else
  no "the guarded form still aborts on an empty match"
fi

# 8. A frontend health check must exercise the application, not the process.
#
# The qrcode regression is the argument: a module-scope import of a
# browser-only dependency made / throw on the server, and the container still
# printed "Ready in 62ms". A liveness probe would have called that healthy. The
# check fetching / is what caught it.
for df in "$ROOT/apps/admin/Dockerfile" "$ROOT/apps/pay/Dockerfile"; do
  name="$(basename "$(dirname "$df")")"
  if grep -A 2 '^HEALTHCHECK' "$df" | grep -qE 'CMD .*(wget|curl).*127\.0\.0\.1:[0-9]+/'; then
    ok "$name health check requests a page, not just the process"
  else
    no "$name health check does not exercise an application path"
  fi
done

# 9. Redeploy must export everything first-create exports.
#
# This is the shape of two separate outages, and it will be the shape of the
# next one. A service's FIRST create writes its own entrypoint and exports the
# variables it needs; every REDEPLOY rebuilds the entrypoint from one shared
# list. A variable in the first but not the second disappears on the first
# redeploy, and nothing reports it — the container is healthy, the process is
# up, and only a feature is gone.
#
#   admin_jwt_secret / resend_api_key   → operator login 503, no mail
#   INTERNAL_API_KEY / STAGING_INTERNAL_API_KEY
#                                       → the Gateway ran InternalAuth("") and
#                                         answered 503 to its whole internal
#                                         route group; Business applications and
#                                         KYB review were permanently 502 in the
#                                         operator console
#
# So the two are compared directly rather than reviewed.
first_create_vars="$(grep -oE 'export [A-Z_]+=' "$SRC" | sed -E 's/export ([A-Z_]+)=/\1/' | sort -u)"
redeploy_list="$(sed -n 's/.*local ep=.for s in \(.*\); do f=.*/\1/p' "$SRC")"
missing=""
for v in $first_create_vars; do
  # DATABASE_URL and friends are exported by name in both places; the redeploy
  # list names them after the colon.
  case "$redeploy_list" in
    *":$v "*|*":$v"*) : ;;
    *) missing="$missing $v" ;;
  esac
done
if [ -z "$missing" ]; then
  ok "every variable a first create exports is also in the redeploy entrypoint list"
else
  no "redeploy would drop:$missing"
fi

# 8. The at-rest encryption keys (A5-04/A6-10). A rotation would orphan every
#    secret encrypted under them, so BZSB_ROTATE_SECRETS must not touch them; a
#    minted key is 32 bytes of base64 (what services/common/webhookprov reads);
#    and the webhook key reaches only the services that store webhook secrets.
sed -n '/^keep_or_mint_key32() {/,/^}/p' "$SRC" > "$WORK/key32.sh"
# shellcheck disable=SC1090
. "$WORK/key32.sh"
K="$WORK/key32"; rm -f "$K"
keep_or_mint_key32 "$K" test_key >/dev/null
[ "$(base64 -d < "$K" 2>/dev/null | wc -c | tr -d ' ')" = 32 ] \
  && ok "a minted encryption key is 32 bytes of base64" \
  || no "a minted encryption key is not 32 bytes of base64"
before="$(cat "$K")"
BZSB_ROTATE_SECRETS=1 keep_or_mint_key32 "$K" test_key >/dev/null
[ "$(cat "$K")" = "$before" ] \
  && ok "an encryption key survives a secret rotation" \
  || no "a rotation replaced an encryption key — every secret under it is now unreadable"
grep -q 'api-gateway-staging|developer-api) key_args=(-v "$WEBHOOK_KEY_FILE' "$SRC" \
  && grep -q 'api-gateway-staging|developer-api) kf="webhook_encryption_key"' "$SRC" \
  && ok "the webhook key is mounted only where webhook secrets are stored" \
  || no "the webhook key is not scoped to the gateway and developer-api"

echo
echo "  $pass passed, $fail failed"
[ "$fail" -eq 0 ]
