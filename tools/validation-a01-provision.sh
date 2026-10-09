#!/bin/sh
# Provision Validation Actor A01 on the Sandbox host — the operator the
# Validation Studio signs in as (quality/validation/actors.yaml, doc 31).
#
#   ssh root@<sandbox-host> sh -s < tools/validation-a01-provision.sh
#
# WHEN. A01 is an ordinary BANZADMIN operator row. A Sandbox rebuilt from empty
# (2026-10-06) has no such row, and every guard that needs an operator session
# fails at sign-in. This recreates the canonical actor, not an approximation:
#
#   email   admin02@banzami-e2e.test      (reserved TLD: reaches no person)
#   role    COMPLIANCE                    (never SUPER_ADMIN — doc 31: A01 reads
#                                          what COMPLIANCE owns and is refused
#                                          operators, payouts and starting a run)
#   factor  a real, confirmed TOTP        (BANZADMIN MFA is not weakened)
#
# HOW. Through the product's own doors, and nothing else:
#
#   1. identity   admin-bootstrap, the operator-creation command the admin-api
#                 image ships. It creates an INVITED operator and emails an
#                 activation link. No SQL, no password set on anyone's behalf.
#   2. link       read back from the mail provider's sent-message API — the
#                 message Banzami itself sent (doc 06 §2b). Never a database
#                 read, never a log.
#   3. password   set by the invited operator through /auth/password-reset.
#                 Generated here, on this host, and stored 0600.
#   4. factor     /auth/mfa/enrol → the seed is stored BEFORE it is confirmed,
#                 then proven by computing the confirming code from the stored
#                 file → recovery codes stored → acknowledged.
#
# AUTHORITY. Creating an operator is an owner decision. Run this only on the
# owner's explicit instruction; it is not part of any routine run.
#
# SECRETS. Nothing here prints a password, a seed, a recovery code, an
# activation link or a token. Never run it under `sh -x`.
#
# Idempotent where it can be: an A01 that already signs in is left alone, and
# an identity left INVITED by an interrupted run is re-invited, not recreated.
set -eu
umask 077

D=/root/.banzami/validation
API="${ADMIN_API:-https://admin.banzami.com/api}"
EMAIL=admin02@banzami-e2e.test
NAME="Validation Operator A01"
ROLE=COMPLIANCE

say()  { printf '%s\n' "$*"; }
stop() { say "A01_PROVISION: BLOCKED — $*"; exit 1; }

[ -d "$D" ] || stop "$D does not exist"
[ -x "$D/totp.py" ] || [ -r "$D/totp.py" ] || stop "$D/totp.py is missing"
[ -r "$D/a01-lib.sh" ] || stop "$D/a01-lib.sh is missing"

W=$(mktemp -d)
trap 'rm -rf "$W" /tmp/a01.jar /tmp/l.json' EXIT

# The one running Sandbox stack. None, or more than one, is not guessed at.
ADM=$(docker ps --format '{{.Names}}' | grep -E '^bzsandbox-[0-9]+-[0-9]+-[0-9]+-admin-api$' || true)
[ "$(printf '%s\n' "$ADM" | grep -c .)" = "1" ] || stop "expected exactly one running admin-api, found: ${ADM:-none}"

# ── 0. An A01 that already works is left exactly as it is ────────────────────
if [ -s "$D/a01_password" ] && [ -s "$D/a01_totp_seed" ]; then
  # shellcheck disable=SC1090
  . "$D/a01-lib.sh"
  if a01_session >/dev/null 2>&1; then
    say "A01 already signs in — nothing to do"
    say "A01_PROVISION: ALREADY_PROVISIONED"
    exit 0
  fi
fi

json() { python3 -c 'import json,sys
try: print(json.load(open(sys.argv[1])).get(sys.argv[2]) or "")
except Exception: print("")' "$1" "$2"; }

boot() {
  docker exec "$ADM" sh -c \
    'DATABASE_URL=$(cat /run/secrets/db_url_admin_api) RESEND_API_KEY=$(cat /run/secrets/resend_api_key) exec admin-bootstrap "$@"' \
    sh "$@"
}

# ── 1. The identity ──────────────────────────────────────────────────────────
STARTED=$(date -u +%s)
if boot --email "$EMAIL" --full-name "$NAME" --role "$ROLE" >"$W/boot.out" 2>"$W/boot.err"; then
  say "▸ identity created: $ROLE, INVITED"
elif grep -q 'already exists' "$W/boot.err"; then
  boot --email "$EMAIL" --resend-invite >"$W/boot.out" 2>"$W/boot.err" \
    || stop "the operator exists and could not be re-invited: $(head -c 200 "$W/boot.err")"
  say "▸ identity already existed — activation link re-issued"
else
  stop "admin-bootstrap failed: $(head -c 200 "$W/boot.err")"
fi

# ── 2. The activation link, from the message Banzami sent ────────────────────
# The provider key goes to curl in a header FILE, never on a command line.
{ printf 'Authorization: Bearer '; docker exec "$ADM" cat /run/secrets/resend_api_key; } >"$W/k"
TOKEN=""
for _ in 1 2 3 4 5 6 7 8 9 10; do
  curl -s --max-time 25 -H @"$W/k" \
    'https://api.resend.com/emails?limit=50' -o "$W/list.json" || true
  ID=$(python3 - "$W/list.json" "$EMAIL" "$STARTED" <<'PY'
import json, sys, datetime
try:
    data = json.load(open(sys.argv[1])).get("data") or []
except Exception:
    data = []
since = int(sys.argv[3]) - 120
for m in data:                                   # newest first
    if sys.argv[2] not in (m.get("to") or []):
        continue
    try:
        when = datetime.datetime.fromisoformat(m["created_at"].replace("Z", "+00:00").replace(" ", "T"))
        if when.timestamp() < since:
            continue
    except Exception:
        pass                                     # an unreadable date is not a reason to miss it
    print(m["id"]); break
PY
)
  if [ -n "$ID" ]; then
    curl -s --max-time 25 -H @"$W/k" \
      "https://api.resend.com/emails/$ID" -o "$W/msg.json" || true
    TOKEN=$(python3 - "$W/msg.json" <<'PY'
import json, re, sys
try:
    m = json.load(open(sys.argv[1]))
except Exception:
    m = {}
hit = re.search(r"reset-password\?token=([A-Za-z0-9_\-\.~%]+)", (m.get("html") or "") + "\n" + (m.get("text") or ""))
print(hit.group(1) if hit else "")
PY
)
    [ -n "$TOKEN" ] && break
  fi
  sleep 3
done
rm -f "$W/k"
[ -n "$TOKEN" ] || stop "the activation message was not found in the provider's sent-message API"
say "▸ activation link read back from the sent message"

# ── 3. The password, chosen here and set through the product ─────────────────
python3 -c 'import secrets,string
a=string.ascii_letters+string.digits
print("".join(secrets.choice(a) for _ in range(28)),end="")' >"$W/pw"

printf '{"token":"%s"}' "$TOKEN" \
  | curl -s --max-time 25 -X POST -H 'content-type: application/json' --data-binary @- \
      -o /dev/null -w '%{http_code}' "$API/admin/v1/auth/password-reset/validate" >"$W/st"
[ "$(cat "$W/st")" = "200" ] || stop "the activation link was refused ($(cat "$W/st"))"

printf '{"token":"%s","new_password":"%s"}' "$TOKEN" "$(cat "$W/pw")" \
  | curl -s --max-time 25 -X POST -H 'content-type: application/json' --data-binary @- \
      -o /dev/null -w '%{http_code}' "$API/admin/v1/auth/password-reset/complete" >"$W/st"
case "$(cat "$W/st")" in 200|204) ;; *) stop "setting the password was refused ($(cat "$W/st"))" ;; esac

STAMP=$(date -u +%Y%m%dT%H%M%SZ)
for f in a01_password a01_totp_seed a01_recovery_codes; do
  [ -e "$D/$f" ] && mv "$D/$f" "$D/$f.superseded-$STAMP"
done
cp "$W/pw" "$D/a01_password"; chmod 600 "$D/a01_password"
say "▸ password set and stored"

# ── 4. The second factor ─────────────────────────────────────────────────────
printf '{"email":"%s","password":"%s"}' "$EMAIL" "$(cat "$W/pw")" \
  | curl -s --max-time 25 -X POST -H 'content-type: application/json' --data-binary @- \
      -o "$W/login.json" -w '%{http_code}' "$API/admin/v1/auth/login" >"$W/st"
CH=$(json "$W/login.json" challenge_token)
[ -n "$CH" ] || stop "sign-in after activation returned no challenge ($(cat "$W/st"))"

curl -s --max-time 25 -X POST -H "Authorization: Bearer $CH" \
  -o "$W/enrol.json" -w '%{http_code}' "$API/admin/v1/auth/mfa/enrol" >"$W/st"
[ "$(cat "$W/st")" = "200" ] || stop "MFA enrolment was refused ($(cat "$W/st"))"
ENROL=$(json "$W/enrol.json" enrolment_token); [ -n "$ENROL" ] || ENROL="$CH"

# Stored BEFORE confirmation: a seed confirmed and then lost is an operator
# nobody can sign in as (that is what happened to admin01).
python3 -c 'import json,sys
print(json.load(open(sys.argv[1]))["secret"],end="")' "$W/enrol.json" >"$D/a01_totp_seed"
chmod 600 "$D/a01_totp_seed"
[ -s "$D/a01_totp_seed" ] || stop "enrolment returned no secret"

ST=""
for _ in 1 2; do
  CODE=$(python3 "$D/totp.py" a01)
  ST=$(printf '{"code":"%s"}' "$CODE" \
    | curl -s --max-time 25 -X POST -H 'content-type: application/json' \
        -H "Authorization: Bearer $ENROL" --data-binary @- \
        -o "$W/confirm.json" -w '%{http_code}' "$API/admin/v1/auth/mfa/enrol/confirm")
  [ "$ST" = "200" ] && break
  sleep $((31 - $(date -u +%s) % 30))
done
[ "$ST" = "200" ] || stop "the confirming code computed from the stored seed was refused ($ST)"

python3 -c 'import json,sys
print("\n".join(json.load(open(sys.argv[1])).get("recovery_codes") or []))' "$W/confirm.json" >"$D/a01_recovery_codes"
chmod 600 "$D/a01_recovery_codes"
[ -s "$D/a01_recovery_codes" ] || stop "confirmation issued no recovery codes"

ACK=$(json "$W/confirm.json" acknowledge_token)
curl -s --max-time 25 -X POST -H "Authorization: Bearer $ACK" \
  -o /dev/null -w '%{http_code}' "$API/admin/v1/auth/mfa/enrol/acknowledge" >"$W/st"
[ "$(cat "$W/st")" = "200" ] || stop "acknowledging the recovery codes was refused ($(cat "$W/st"))"
say "▸ TOTP enrolled from the stored seed; recovery codes stored and acknowledged"

# ── 5. Proof: it signs in unattended, as COMPLIANCE and nothing more ─────────
# A fresh code: the one that confirmed enrolment cannot be replayed.
sleep $((31 - $(date -u +%s) % 30))
# shellcheck disable=SC1090
. "$D/a01-lib.sh"
a01_session >/dev/null 2>&1 || stop "A01 was provisioned but does not sign in"
curl -s -b "$J" -o "$W/me.json" "$API/admin/v1/auth/me"
GOT_ROLE=$(python3 -c 'import json,sys
d=json.load(open(sys.argv[1])); print((d.get("operator") or d.get("user") or d).get("role",""))' "$W/me.json" 2>/dev/null || true)
OPS=$(curl -s -b "$J" -o /dev/null -w '%{http_code}' "$API/admin/v1/operators")
say "  role=$GOT_ROLE  GET /operators=$OPS (must be 403)"
[ "$GOT_ROLE" = "$ROLE" ] || stop "A01 holds role '$GOT_ROLE', not $ROLE"
[ "$OPS" = "403" ] || stop "A01 can read operators ($OPS) — its authority is wider than COMPLIANCE"
say "A01_PROVISION: PROVISIONED"
