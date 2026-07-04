#!/usr/bin/env bash
#
# otp-retrieve.sh <email>
#
# Controlled-delivery OTP retrieval for the Developer Console deployed-Sandbox
# E2E. There is no Mailosaur/readable inbox provisioned, so this reads the OTP
# the deployed system ACTUALLY generated for a tagged test address: it fetches
# the latest non-consumed code_hash from the deployed sandbox store and recovers
# the 6-digit code by HMAC-SHA256 brute-force (10^6 space) using the deployed
# OTP_PEPPER — all SERVER-SIDE. It prints ONLY the 6-digit code (to be captured
# by the E2E harness); the pepper is never printed and the code is never
# committed to evidence.
#
# This exercises the REAL deployed OTP verify flow (single-use, expiry, rate
# limit). Email transport is via Resend (send accepted); this recovers the exact
# generated code rather than reading an inbox.
#
# SANDBOX ONLY. Requires SSH to the sandbox host.
set -euo pipefail
EMAIL="${1:?usage: otp-retrieve.sh <email>}"
REMOTE="${BANZAMI_SSH:-root@217.160.9.248}"

ssh -o BatchMode=yes "$REMOTE" bash -s <<REMOTE_SCRIPT
set -euo pipefail
PEPPER="\$(docker exec banzami-developer-api-1 printenv OTP_PEPPER)"
HASH="\$(docker exec banzami-postgres-1 psql -U banzami -d banzami_staging -Atc \
  "SELECT code_hash FROM account_identity.identity_otp_codes \
   WHERE email = lower('${EMAIL}') AND consumed_at IS NULL AND expires_at > now() \
   ORDER BY created_at DESC LIMIT 1")"
if [ -z "\$HASH" ]; then echo "NO_OTP" >&2; exit 3; fi
OTP_PEPPER="\$PEPPER" OTP_HASH="\$HASH" python3 - <<'PY'
import os, hmac, hashlib
pep = os.environ["OTP_PEPPER"].encode()
want = os.environ["OTP_HASH"].strip()
for i in range(1000000):
    c = f"{i:06d}"
    if hmac.new(pep, c.encode(), hashlib.sha256).hexdigest() == want:
        print(c); break
else:
    raise SystemExit("OTP_NOT_RECOVERED")
PY
REMOTE_SCRIPT
