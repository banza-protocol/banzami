#!/usr/bin/env bash
# BANZADMIN operator authority, proven from a real operator session — runs ON
# the Sandbox VM.
#
# S16 had no functional harness at all. What it needed was never a login: A01's
# unattended MFA session has existed since Phase B (/root/.banzami/validation).
# What it needed was someone to assert the thing that matters.
#
# A01 is COMPLIANCE, deliberately and permanently. So this suite asks the one
# question the whole Validation Studio rests on:
#
#   can the identity that OPERATES the Studio also START a run?
#
# It must not. Scenario authority (who decides what a run contains) and
# orchestration authority (who may spend real Sandbox money executing it) are
# separate by design — doc 31. If COMPLIANCE could start a run, that separation
# would be a diagram rather than a control.
#
# Every positive is paired with a negative, because a probe where everything is
# refused also refuses nothing in particular: A01 reads what COMPLIANCE owns
# (applications, merchants, the validation surface) and is refused what it does
# not (operators, payout execution, starting a run).
#
# SECRETS. The password and TOTP seed live in /root/.banzami/validation (0600)
# and are read only by a01-lib.sh. Nothing here prints a credential, a cookie,
# or a CSRF token. NEVER run under `bash -x`.
set -uo pipefail

D=/root/.banzami/validation
[ -r "$D/a01-lib.sh" ] || { echo "NO_A01_LIB"; exit 1; }
# shellcheck disable=SC1090
. "$D/a01-lib.sh"

API="${ADMIN_API:-https://admin.banzami.com/api}"

PASS=0; FAIL=0
chk(){ if [ "$2" = "$3" ]; then echo "  $1 PASS ($2)"; PASS=$((PASS+1));
       else echo "  $1 FAIL (got '$2' want '$3')"; FAIL=$((FAIL+1)); fi; }

# Status only. Response bodies are never captured: an admin body can carry
# merchant detail, and this harness has no reason to hold any of it.
get(){  curl -s -o /dev/null -w '%{http_code}' -b "$J" "$API$1"; }
post(){ curl -s -o /dev/null -w '%{http_code}' -X POST -b "$J" \
          -H "X-CSRF-Token: $X" -H 'content-type: application/json' \
          --data-binary "${2:-{\}}" "$API$1"; }

echo "▸ sessão de operador (A01 · COMPLIANCE)"
a01_session || { echo "BANZADMIN_AUTHORITY_E2E: PASS=$PASS FAIL=1"; exit 1; }
chk SESSION_ESTABLISHED "$( [ -s "$J" ] && echo yes || echo no )" "yes"
chk CSRF_ISSUED         "$( [ -n "${X:-}" ] && echo yes || echo no )" "yes"

echo
echo "▸ o que COMPLIANCE possui"
chk READS_APPLICATIONS  "$(get /admin/v1/merchant-applications)" "200"
chk READS_MERCHANTS     "$(get /admin/v1/merchants)"             "200"
chk READS_VALIDATION    "$(get /admin/v1/validation/overview)"   "200"
chk READS_RUNS          "$(get /admin/v1/validation/runs)"       "200"
chk READS_AUDIT         "$(get /admin/v1/audit-log)"             "200"

echo
echo "▸ o que COMPLIANCE não possui"
# No CapOperatorRead: the compliance officer does not administer operators.
chk CANNOT_LIST_OPERATORS "$(get /admin/v1/operators)" "403"
# No CapPayoutManage: deciding a merchant's standing is not moving its money.
chk CANNOT_PROCESS_PAYOUT \
  "$(post /admin/v1/payouts/00000000-0000-4000-8000-000000000000/process)" "403"

echo
echo "▸ separação de autoridade (doc 31)"
# THE assertion. A01 operates the Studio and must not be able to start a run.
# 403 is the only correct answer: not 404 (which would mean the route is gone),
# not 400 (which would mean it got as far as looking at the request).
chk CANNOT_START_A_RUN \
  "$(post /admin/v1/validation/runs/BZV-20260918-0001/start)" "403"
chk CANNOT_PREPARE_A_RUN \
  "$(post /admin/v1/validation/runs '{"profile":"GOLDEN","idempotency_key":"a01-authority-probe"}')" "403"

# And the refusal must be authority, not the absence of a route: the same path
# unauthenticated answers 401, so a 403 above means the request was identified
# and then refused.
chk START_ROUTE_EXISTS \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/admin/v1/validation/runs/BZV-20260918-0001/start")" "401"

echo
echo "▸ a sessão é uma sessão, não um token portador"
# A mutating call without the CSRF header must be refused even with the cookie:
# a lifted cookie is not authority on its own.
chk CSRF_REQUIRED \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST -b "$J" \
      -H 'content-type: application/json' --data-binary '{}' \
      "$API/admin/v1/validation/runs/BZV-20260918-0001/cancel")" "403"

echo
[ "$FAIL" -eq 0 ] && echo "BANZADMIN_AUTHORITY_E2E: PASS=$PASS FAIL=0" \
                  || echo "BANZADMIN_AUTHORITY_E2E: PASS=$PASS FAIL=$FAIL"
exit $([ "$FAIL" -eq 0 ] && echo 0 || echo 1)
