#!/usr/bin/env bash
#
# Do the published Firebase client keys carry an API restriction?
#
# These two keys are public by construction: they ship inside every APK and IPA,
# and they are in this repository because the build requires them there. So the
# question worth asking is not "can a stranger use this key" — a stranger holds
# it already — but "how far does it reach".
#
# That is the API restriction, and it is measured by calling APIs the
# application does not use and reading WHICH LAYER answers:
#
#   no restriction   the target service answers its own complaint about the
#                    empty body — 400 CONFIGURATION_NOT_FOUND, 400
#                    MISSING_GRANT_TYPE, 400 INVALID_ARGUMENT. The call arrived.
#
#   restricted       Google rejects it before the service sees it:
#                    403 API_KEY_SERVICE_BLOCKED, "Requests to this API … are
#                    blocked."
#
# A status code alone does not distinguish these — both are errors, and reading
# only the code is how "400" gets mistaken for "blocked". This asserts on the
# blocked marker, never on the number.
#
# Until the console change is applied this suite is EXPECTED TO FAIL, and it
# says so rather than reporting green on an unrestricted key. Its other job is
# to prove the restriction did not go too far: Installations, FCM and
# Crashlytics must stay reachable, because restricting those breaks push and
# crash reporting on both shipped apps.
#
# Run: tests/security/firebase-key-restrictions.test.sh
set -euo pipefail

cd "$(dirname "$0")/../.."

ANDROID_CFG=apps/mobile/android/app/src/consumer/google-services.json
IOS_CFG=apps/mobile/ios/config/consumer/GoogleService-Info.plist
PROJECT=473654224852

for f in "$ANDROID_CFG" "$IOS_CFG"; do
  [ -f "$f" ] || { echo "missing $f — cannot probe"; exit 1; }
done

# Read into variables and never echo. The keys are public, but printing a
# credential-shaped value into CI logs is a habit worth not having.
KEY_A="$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['client'][0]['api_key'][0]['current_key'])" "$ANDROID_CFG")"
KEY_B="$(python3 -c "import plistlib,sys;print(plistlib.load(open(sys.argv[1],'rb'))['API_KEY'])" "$IOS_CFG")"

pass=0
fail=0
BODY="$(mktemp)"; trap 'rm -f "$BODY"' EXIT

# Echoes "BLOCKED" when Google refused the key for this API, else "REACHED".
# Anything else — no network, an unparseable answer — is "UNKNOWN", which is
# never counted as a pass in either direction.
reach() { # reach <key> <url>
  local code
  code="$(curl -s -o "$BODY" -w '%{http_code}' -m 25 \
            "$2$1" -H 'Content-Type: application/json' -d '{}' || echo 000)"
  [ "$code" = "000" ] && { echo "UNKNOWN"; return; }
  if grep -qE 'API_KEY_SERVICE_BLOCKED|are blocked' "$BODY"; then echo "BLOCKED"; return; fi
  python3 - "$BODY" <<'PY'
import json,sys
try:
    json.load(open(sys.argv[1]))
    print("REACHED")
except Exception:
    print("UNKNOWN")
PY
}

want() { # want <BLOCKED|REACHED> <label> <key> <url>
  local got; got="$(reach "$3" "$4")"
  if [ "$got" = "$1" ]; then
    printf '  \033[0;32m✓\033[0m %-46s %s\n' "$2" "$got"; pass=$((pass + 1))
  else
    printf '  \033[0;31m✗\033[0m %-46s %s (wanted %s)\n' "$2" "$got" "$1"; fail=$((fail + 1))
  fi
}

IDENTITY="https://identitytoolkit.googleapis.com/v1/accounts:signUp?key="
SECURETOKEN="https://securetoken.googleapis.com/v1/token?key="
REMOTECONFIG="https://firebaseremoteconfig.googleapis.com/v1/projects/$PROJECT/namespaces/firebase:fetch?key="
INSTALLATIONS="https://firebaseinstallations.googleapis.com/v1/projects/$PROJECT/installations?key="

for label in A B; do
  if [ "$label" = A ]; then k="$KEY_A"; else k="$KEY_B"; fi
  echo
  echo "▸ key $label — APIs the applications never call must be out of reach"
  want BLOCKED "identity toolkit (would create accounts)" "$k" "$IDENTITY"
  want BLOCKED "secure token (would mint tokens)"         "$k" "$SECURETOKEN"
  want BLOCKED "remote config"                            "$k" "$REMOTECONFIG"
  echo "▸ key $label — what the shipped apps depend on must keep working"
  want REACHED "firebase installations"                   "$k" "$INSTALLATIONS"
done

echo
if [ "$fail" -eq 0 ]; then
  printf '\033[0;32m✓ firebase key restrictions: %d/%d\033[0m\n\n' "$pass" "$((pass + fail))"
  exit 0
fi
printf '\033[0;31m✗ firebase key restrictions: %d of %d failed\033[0m\n' "$fail" "$((pass + fail))"
cat <<'TXT'

A "REACHED" where BLOCKED was wanted means the key still reaches an API the
applications never call — the console change in
evidence/firebase/CLIENT_KEY_RESTRICTIONS.md has not been applied, or was
applied to only one of the two keys.

A "BLOCKED" where REACHED was wanted is the dangerous direction: the restriction
went too far and will break push notifications or crash reporting on both apps.
Widen it back before shipping anything.

TXT
exit 1
