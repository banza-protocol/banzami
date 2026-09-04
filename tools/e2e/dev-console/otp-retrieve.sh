#!/usr/bin/env bash
#
# otp-retrieve.sh <email>
#
# INTERNAL DIAGNOSTIC — OTP recovery for SYNTHETIC E2E identities only.
#
# The isolation and lifecycle suites provision throwaway tenants at addresses
# like `rt02-a-<stamp>@banzami-e2e.test`. No inbox exists for those, and none
# should: creating real mailboxes to prove tenant isolation would be absurd. So
# for synthetic identities this reads the code the deployed system ACTUALLY
# generated — latest non-consumed code_hash from the deployed store, recovered
# by HMAC-SHA256 over the 10^6 space using the deployed pepper, all SERVER-SIDE.
# It exercises the genuine deployed verify path (single-use, expiry, rate limit).
#
# It is NOT the canonical golden-journey evidence. The external journey for the
# real developer account (contact@doadoa.app) reads the actual delivered mail
# over read-only IMAP; a code recovered from the sender's own database proves
# delivery of nothing. This script REFUSES real (non-synthetic) addresses so the
# two can never be quietly interchanged.
#
# Prints ONLY the 6-digit code. The pepper is never printed; the code is never
# written to evidence.
#
# SANDBOX ONLY. Requires SSH to the sandbox host.
set -euo pipefail
EMAIL="${1:?usage: otp-retrieve.sh <email>}"
REMOTE="${BANZAMI_SSH:-root@217.160.9.248}"

# Fail closed on anything that could be a real mailbox. Synthetic E2E identities
# live only under the reserved, undeliverable .test domain.
case "$EMAIL" in
  *@banzami-e2e.test) ;;
  *) echo "otp-retrieve: refusing non-synthetic address '$EMAIL' — the canonical journey must read the real mailbox over IMAP, not the sender's own database" >&2; exit 4 ;;
esac

ssh -o BatchMode=yes "$REMOTE" bash -s <<REMOTE_SCRIPT
set -euo pipefail

# Container names carry a per-deployment project prefix, so pinning them makes
# this script rot silently at the next rollout — which is exactly what happened.
# Discover them instead, and say so plainly when discovery fails.
DEV_API="\$(docker ps --format '{{.Names}}' | grep -E 'developer-api' | head -1)"
[ -n "\$DEV_API" ] || { echo "no running developer-api container" >&2; exit 5; }

# Read the SERVICE PROCESS's environment, not a fresh exec's. The deployment
# injects configuration into the entrypoint rather than the image config, so
# \`docker exec printenv\` sees a near-empty environment while the running
# process holds the real one — which is why this script previously concluded
# there was no pepper and gave up. /proc/1/environ is the process that is
# actually serving traffic.
readenv() { docker exec "\$DEV_API" sh -c "tr '\\0' '\\n' < /proc/1/environ | grep '^\$1=' | cut -d= -f2-"; }

PEPPER="\$(readenv OTP_PEPPER)"
[ -n "\$PEPPER" ] || { echo "developer-api process has no OTP_PEPPER" >&2; exit 6; }

# Same source for the database credential: ask the service what it connects to
# rather than hardcoding a password anywhere.
DBURL="\$(readenv DATABASE_URL)"
[ -n "\$DBURL" ] || { echo "developer-api process has no DATABASE_URL" >&2; exit 7; }
DBPASS="\$(printf '%s' "\$DBURL" | sed -E 's#^[^:]+://[^:]+:([^@]*)@.*#\1#')"
DBUSER="\$(printf '%s' "\$DBURL" | sed -E 's#^[^:]+://([^:]+):.*#\1#')"
DBNAME="\$(printf '%s' "\$DBURL" | sed -E 's#.*/([^/?]+)(\?.*)?\$#\1#')"

# The identity store may sit on either the legacy or the sandbox-project
# Postgres depending on the rollout; ask each rather than assuming.
HASH=""
for PG in \$(docker ps --format '{{.Names}}' | grep -E 'postgres'); do
  H="\$(docker exec -e PGPASSWORD="\$DBPASS" "\$PG" psql -U "\$DBUSER" -d "\$DBNAME" -Atc \
    "SELECT code_hash FROM account_identity.identity_otp_codes \
     WHERE email = lower('${EMAIL}') AND consumed_at IS NULL AND expires_at > now() \
     ORDER BY created_at DESC LIMIT 1" 2>/dev/null || true)"
  if [ -n "\$H" ]; then HASH="\$H"; break; fi
done
[ -n "\$HASH" ] || { echo "NO_OTP" >&2; exit 3; }

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
