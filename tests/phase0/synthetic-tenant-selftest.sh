#!/usr/bin/env bash
# The synthetic tenant a harness builds is a real one while the run lasts, and
# nothing of it is left holding authority or value when the run ends.
#
# Proves tests/phase0/lib/synthetic-tenant.sh and the retirement in
# tests/phase0/lib/e2e-run.sh together: the tenant's key works against the
# public API, its Business is nameable by @banza, its segregated account and
# session exist — and after cleanup the key is revoked, the project archived,
# the session cancelled, the account closed and the Business suspended.
#
# Runs ON the Sandbox VM. Needs no funding. Secrets are never printed.
set -uo pipefail

. "$(cd "$(dirname "$0")" && pwd)/lib/e2e-run.sh"
. "$(cd "$(dirname "$0")" && pwd)/lib/synthetic-tenant.sh"
E2E_RUN_ID="${E2E_RUN_ID:-$(date +%s)$$}"
e2e_begin

PASS=0; FAIL=0
chk(){ if [ "$2" = "$3" ]; then echo "  $1 PASS ($2)"; PASS=$((PASS+1));
       else echo "  $1 FAIL (got '$2' want '$3')"; FAIL=$((FAIL+1)); fi; }
key_call(){ # method path body idem
  st_call "$E2E_GW" 8080 "$1" "$2" "$3" "Authorization: Bearer $ST_KEY"; }

echo "### a tenant of its own"
synthetic_tenant selftest '["wallet_accounts:read","wallet_accounts:create","payment_sessions:read","payment_sessions:write"]' sandbox-default
chk TENANT_BUILT "$([ -n "${ST_MERCHANT:-}" ] && [ -n "${ST_KEY:-}" ] && echo yes)" yes
chk NOT_DOA "$(e2e_sql "select count(*) from developer.dev_projects p join developer.dev_workspaces w on w.id = p.workspace_id where p.id = '$ST_PROJECT' and w.name in ('DOA','DOA workspace')")" "0"
chk HANDLE_ROUTES_TO_THE_BUSINESS "$(e2e_sql "select owner_id from handle_registry where handle = '$ST_HANDLE'")" "$ST_MERCHANT"

echo "### it works through its own key"
key_call POST /v1/wallet-accounts "{\"purpose\":\"CAMPAIGN\",\"reference_type\":\"SELFTEST\",\"reference_id\":\"st-$E2E_SHORT\",\"label\":\"selftest\"}"
chk ACCOUNT_OPENED "$ST_CODE" "201"
ACCT=$(st_get id)
key_call POST /v1/payment-sessions "{\"wallet_account_id\":\"$ACCT\",\"purpose\":\"DONATION\",\"reference_type\":\"SELFTEST\",\"reference_id\":\"ps-$E2E_SHORT\",\"amount_minor\":1000,\"currency\":\"AOA\"}"
chk SESSION_OPENED "$ST_CODE" "201"
SESSION=$(st_get session_id)
e2e_own payment_session "$SESSION" "$ST_MERCHANT"
chk ACCOUNT_BELONGS_TO_THE_TENANT "$(e2e_sql "select merchant_id from wallet_accounts where id = '$ACCT'")" "$ST_MERCHANT"

echo "### the run ends"
e2e_end >/dev/null 2>&1
chk KEY_REVOKED "$(e2e_sql "select status from developer.dev_api_keys where id = '$ST_KEY_ID'")" "REVOKED"
chk PROJECT_ARCHIVED "$(e2e_sql "select status from developer.dev_projects where id = '$ST_PROJECT'")" "ARCHIVED"
chk SESSION_CANCELLED "$(e2e_sql "select status from payment_sessions where id = '$SESSION'")" "CANCELLED"
chk NOTHING_PAYABLE "$(e2e_sql "select count(*) from payment_sessions s left join payment_links l on l.id = s.payment_link_id left join qr_codes q on q.id = s.qr_code_id where s.id = '$SESSION' and (l.status = 'ACTIVE' or q.status = 'ACTIVE')")" "0"
chk ACCOUNT_CLOSED "$(e2e_sql "select status from wallet_accounts where id = '$ACCT'")" "CLOSED"
chk BUSINESS_SUSPENDED "$(e2e_sql "select status from merchants where id = '$ST_MERCHANT'")" "SUSPENDED"
chk MANIFEST_CLEARED "$([ -f "$E2E_MANIFEST" ] && echo kept || echo cleared)" "cleared"

echo
echo "SYNTHETIC_TENANT_SELFTEST: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]
