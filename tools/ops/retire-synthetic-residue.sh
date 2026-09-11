#!/usr/bin/env bash
# Retire every synthetic artifact the harnesses and assurance runs left on the
# Sandbox — merchants, consumers, their credentials, links, projects, their
# segregated accounts and the synthetic value they hold — through the operator's
# own lifecycles. Owner decision 2026-09-11: nothing synthetic stays active.
#
# SELECTION IS POSITIVE. An object is retired only when something about it says
# a machine made it: a harness name shape, a test email domain, a machine-
# numbered handle with no display name, an exact id. Everything unmatched
# survives and is listed, so a wrong pattern leaves a fixture alive rather than
# touching a real account. The real accounts (Doa, fm65, oxfannio, priscila —
# and anything else a person named) match none of the shapes and are excluded
# by name as well.
#
# NOTHING IS DELETED AND NO ROW IS EDITED. Every change goes through an API:
#   synthetic funds  POST core /internal/v1/sandbox/retire-funds   (balanced posting back to transit)
#   accounts         POST core /internal/v1/wallet-accounts/:id/close
#   payouts          POST core /internal/v1/payouts/:id/fail        (the payout lifecycle reverses)
#   links            DELETE gateway /v1/payment-links/:id           (as the owning merchant)
#   sessions         POST core /internal/v1/payment-sessions/:id/cancel (session, link and QR)
#   API keys         DELETE core /internal/v1/merchants/:m/api-keys/:id
#   webhooks         DELETE gateway /v1/webhooks/endpoints/:id
#   merchants        POST core /internal/v1/merchants/:id/suspend
#   consumers        POST core /internal/v1/consumers/:id/suspend
#   projects         POST developer-api /internal/v1/projects/:id/retire   (archives, revokes its keys)
# Ledger history stays; retirement is a new posting, not an erased one.
#
# Usage:  bash tools/ops/retire-synthetic-residue.sh [--apply]
#         (runs on the Sandbox VM; copies itself there when started elsewhere)
# NEVER run under `bash -x`: it reads the JWT secret and internal keys.
set -uo pipefail

APPLY=0; [ "${1:-}" = "--apply" ] && APPLY=1

for _p in "$(dirname "$0")/remote.sh" "$(dirname "$0")/lib/remote.sh" \
          "$(dirname "$0")/../lib/remote.sh" "$(dirname "$0")/../../tools/ops/lib/remote.sh"; do
  [ -f "$_p" ] && { . "$_p"; break; }
done
command -v remote_self_or_continue >/dev/null 2>&1 \
  || { echo "✗ tools/ops/lib/remote.sh not found — refusing to run without the host guard" >&2; exit 2; }
remote_self_or_continue "$@"

CORE=$(docker ps --format '{{.Names}}' | grep core-api-staging | head -1)
GW=$(docker ps --format '{{.Names}}' | grep api-gateway-staging | head -1)
DEV=$(docker ps --format '{{.Names}}' | grep developer-api | head -1)
PG=$(docker ps --format '{{.Names}}' | grep postgres | grep bzsandbox | head -1)
[ -n "$CORE" ] && [ -n "$GW" ] && [ -n "$DEV" ] && [ -n "$PG" ] || { echo "✗ Sandbox containers not found" >&2; exit 2; }
PW=$(docker exec "$CORE" sh -c 'cat /run/secrets/db_url' | sed -E 's#.*://[^:]+:([^@]+)@.*#\1#')
# Read-only: selection and counts. Every change below goes through an API.
q(){ docker exec -e PGPASSWORD="$PW" -e PGOPTIONS="-c default_transaction_read_only=on" "$PG" \
       psql -U bl_app_runtime -d banzami_staging -At -F'|' -c "$1" 2>/dev/null; }

RUN="rsr-$(date +%s)"

# ── the shapes ───────────────────────────────────────────────────────────────
# DOA's own workspaces are out of scope as a whole: the canonical @doa tenant
# and DOA's earlier project both live there, and what DOA holds is DOA's data.
# The legacy "Doa" merchant is excluded by name as well.
DOA_WS="SELECT id FROM developer.dev_workspaces WHERE name IN ('DOA','DOA workspace')"
DOA_MERCHANTS="SELECT b.merchant_id FROM developer.dev_project_sandbox_binding b
                 JOIN developer.dev_projects dp ON dp.id = b.project_id
                WHERE dp.workspace_id IN ($DOA_WS)
               UNION SELECT owner_id FROM handle_registry WHERE handle = 'doa' AND owner_type = 'MERCHANT'
               UNION SELECT id FROM merchants WHERE name = 'Doa'"
# Workspaces and projects the harnesses and assurance runs create. The cleanroom
# and setup-probe projects were created inside the owner's own workspaces during
# assurance runs: the projects are retired, the workspaces and identities stay.
WSFIX="^(DevPlatform [0-9]+ workspace|Synthetic Platform [0-9]+ workspace|gj-[ab]-[0-9a-f]{8} workspace|readiness-[ab]-[0-9]+ workspace|webhook-retry-[0-9]+ workspace|onb-ws-|onbui-ws-|rcpt-ws-)"
PFIX="^(DevPlatform |Synthetic Platform |Phase0 |adr055-|wa-unbound-|wa-other-|wh-unbound-|wh-other-|rt[0-9]{2}-|seal-test|gj-[ab]-|refund-other-|rfpub-b-|tr-other-|e2e-|dp-|sdk-|k-[0-9]+$|onbui?-[ab]-|readiness-|webhook-retry-|isolation-|Cleanroom (Sandbox|Setup Probe|Control [0-9]+)$|External Cleanroom (Sandbox|Settlement)$|Final Cleanroom [0-9a-f]{8}$|Setup Probe Two$)"
P_SHAPE="dp.workspace_id NOT IN ($DOA_WS) AND (dp.name ~ '$PFIX' OR dp.workspace_id IN (SELECT id FROM developer.dev_workspaces WHERE name ~ '$WSFIX'))"
P_SEL="p.status = 'ACTIVE' AND EXISTS (SELECT 1 FROM developer.dev_projects dp WHERE dp.id = p.id AND $P_SHAPE)"
# Merchants: a harness name shape, a test email domain (never the Console's
# projects.banzami.test — every Console project's merchant carries it), or a
# binding to a harness project.
FIX="^(E2E |SYN |SYNTHETIC |E0[0-9] |E1 |E2 |[A-Z]{2,4}[0-9]{4,}$|M[0-9]+$|smoke-|refund-|rf-|seal-|proof-|rcpt-|fixture-|economic-|settle-|pricing-unpriced-|Negocio (Existente|Consola) |Sessao [AB] |Loja Genérica |Recibo [0-9]+$|KYB Atencao |Sandbox · (Cleanroom |External Cleanroom |Final Cleanroom |Setup Probe|readiness-|webhook-retry-|isolation-))"
MAIL="@(synthetic\\.test|banzami-e2e\\.test|t\\.test|x\\.test|example\\.test)$"
M_SEL="m.id NOT IN ($DOA_MERCHANTS)
       AND (m.name ~ '$FIX' OR m.email ~* '$MAIL' OR EXISTS (
            SELECT 1 FROM developer.dev_project_sandbox_binding b JOIN developer.dev_projects dp ON dp.id = b.project_id
             WHERE b.merchant_id = m.id AND $P_SHAPE))"
# Consumers: a machine-numbered handle with no display name, or the two harness
# families that set one (receipt-assurance ra<run>s<n>; the receipt E2E payers
# rc[ab]m<run>). Real users choose a handle and a name.
C_SEL="((c.handle ~ '^[a-z]{1,4}[0-9]{4,}[a-z0-9]*\$' AND c.display_name IS NULL)
        OR c.handle ~ '^ra[0-9]+s[0-9]+\$' OR c.handle ~ '^rc[ab]m[a-z0-9]{7}\$')
       AND c.handle NOT IN ('fm65','oxfannio','priscila')"
# The demo campaign accounts tests/phase0/campaign-payment-segregation.sh opened
# in DOA's tenants — ten under the canonical @doa project (2026-09-09..11) and
# eighteen under DOA's earlier "DOA Sandbox" project (2026-09-08). Selected by
# the harness's own signature: its two labels AND its seg-<a|b>-<run> reference
# AND a DOA-workspace owner. The harness writes nothing to DOA's datastore.
DEMO_SEL="wa.merchant_id IN ($DOA_MERCHANTS)
          AND wa.label IN ('Campanha A — demo','Campanha B — demo')
          AND wa.reference_type = 'DOA_CAMPAIGN' AND wa.reference_id ~ '^seg-[ab]-[0-9]+\$'
          AND wa.purpose = 'CAMPAIGN'"

bal="COALESCE((SELECT SUM(CASE WHEN e.entry_type='CREDIT' THEN e.amount_minor ELSE -e.amount_minor END) FROM ledger_entries e WHERE e.account_id = %s), 0)"

inventory(){
  echo "  synthetic merchants active        $(q "SELECT count(*) FROM merchants m WHERE m.status='ACTIVE' AND $M_SEL")"
  echo "  synthetic merchant value (minor)  $(q "SELECT COALESCE(SUM($(printf "$bal" 'w.available_account_id')),0) FROM wallets w JOIN merchants m ON m.id=w.merchant_id WHERE $M_SEL")"
  echo "  synthetic segregated value        $(q "SELECT COALESCE(SUM($(printf "$bal" 'wa.account_id')),0) FROM wallet_accounts wa JOIN merchants m ON m.id=wa.merchant_id WHERE wa.purpose<>'PRIMARY' AND $M_SEL")"
  echo "  synthetic segregated accts active $(q "SELECT count(*) FROM wallet_accounts wa JOIN merchants m ON m.id=wa.merchant_id WHERE wa.purpose<>'PRIMARY' AND wa.status<>'CLOSED' AND $M_SEL")"
  echo "  synthetic live API keys           $(q "SELECT count(*) FROM api_keys k JOIN merchants m ON m.id=k.merchant_id WHERE k.revoked_at IS NULL AND $M_SEL")"
  echo "  synthetic active webhooks         $(q "SELECT count(*) FROM webhook_endpoints h JOIN merchants m ON m.id=h.merchant_id WHERE h.active AND $M_SEL")"
  echo "  synthetic open payment links      $(q "SELECT count(*) FROM payment_links l JOIN merchants m ON m.id=l.merchant_id WHERE l.status='ACTIVE' AND $M_SEL")"
  echo "  synthetic open payment sessions   $(q "SELECT count(*) FROM payment_sessions s JOIN merchants m ON m.id=s.merchant_id WHERE s.status IN ('CREATED','ACTIVE') AND $M_SEL")"
  echo "  synthetic pending payouts         $(q "SELECT count(*) FROM payouts po JOIN merchants m ON m.id=po.merchant_id WHERE po.status IN ('PENDING','PROCESSING','SENT') AND $M_SEL")"
  echo "  synthetic consumers active        $(q "SELECT count(*) FROM consumers c WHERE c.status='ACTIVE' AND $C_SEL")"
  echo "  synthetic consumer value (minor)  $(q "SELECT COALESCE(SUM($(printf "$bal" 'cw.available_account_id')),0) FROM consumer_wallets cw JOIN consumers c ON c.id=cw.consumer_id WHERE $C_SEL")"
  echo "  synthetic projects active         $(q "SELECT count(*) FROM developer.dev_projects p WHERE $P_SEL")"
  echo "  DOA demo accounts not closed      $(q "SELECT count(*) FROM wallet_accounts wa WHERE $DEMO_SEL AND wa.status<>'CLOSED'")"
  echo "  DOA demo value (minor)            $(q "SELECT COALESCE(SUM($(printf "$bal" 'wa.account_id')),0) FROM wallet_accounts wa WHERE $DEMO_SEL")"
}

echo "synthetic residue on the Sandbox — $(date -u +%FT%TZ)"
[ "$APPLY" -eq 1 ] && echo "mode: APPLY ($RUN)" || echo "mode: dry run"
echo; echo "BEFORE"; inventory
echo
echo "merchants that SURVIVE active or holding value (no shape matched) — name, email domain"
q "SELECT '  ' || rpad(m.name, 34) || ' @' || split_part(m.email,'@',2) || ' ' || m.status FROM merchants m
    WHERE NOT ($M_SEL) AND (m.status = 'ACTIVE' OR EXISTS (SELECT 1 FROM wallets w WHERE w.merchant_id = m.id
      AND $(printf "$bal" 'w.available_account_id') <> 0)) ORDER BY m.created_at"
echo "consumers that SURVIVE with a balance — handle"
q "SELECT '  ' || c.handle FROM consumers c JOIN consumer_wallets cw ON cw.consumer_id=c.id
    WHERE NOT ($C_SEL) AND $(printf "$bal" 'cw.available_account_id') <> 0 ORDER BY c.created_at"
echo "projects that SURVIVE — name"
q "SELECT '  ' || p.name FROM developer.dev_projects p WHERE p.status='ACTIVE' AND NOT ($P_SEL) ORDER BY p.created_at"

if [ "$APPLY" -eq 0 ]; then echo; echo "dry run — nothing changed. Re-run with --apply."; exit 0; fi

# ── apply ────────────────────────────────────────────────────────────────────
JWTSEC=$(docker exec "$GW" sh -c 'cat /run/secrets/jwt_secret')
DEVKEY=$(docker exec "$DEV" sh -c 'cat /run/secrets/developer_internal_key 2>/dev/null')
[ -n "$JWTSEC" ] && [ -n "$DEVKEY" ] || { echo "✗ credentials unavailable" >&2; exit 2; }
mint(){ SECRET="$JWTSEC" M="$1" node -e 'const c=require("crypto");const b=o=>Buffer.from(typeof o==="string"?o:JSON.stringify(o)).toString("base64url");const n=Math.floor(Date.now()/1000);const cl={merchant_id:process.env.M,scopes:["*"],environment:"SANDBOX",iat:n,exp:n+300};const h=b({alg:"HS256",typ:"JWT"}),p=b(cl);process.stdout.write(h+"."+p+"."+c.createHmac("sha256",process.env.SECRET).update(h+"."+p).digest("base64url"));'; }
# Core over its own loopback (the operator path); gateway as the owning merchant.
core(){ # method path json -> status
  local body='{}'; [ -n "${3:-}" ] && body=$3
  printf '%s' "$body" | docker exec -i "$CORE" curl -s -o /dev/null -w '%{http_code}' -X "$1" \
    -H 'Content-Type: application/json' --data @- "http://localhost:8081$2" 2>/dev/null; }
gw(){ # method path merchant -> status
  docker exec "$GW" curl -s -o /dev/null -w '%{http_code}' -X "$1" "http://localhost:8080$2" \
    -H "Authorization: Bearer $(mint "$3")" 2>/dev/null; }
dev(){ printf '%s' "$2" | docker exec -i -e IK="$DEVKEY" "$DEV" sh -c \
    "curl -s -o /dev/null -w '%{http_code}' -X POST -H \"X-Internal-Key: \$IK\" -H 'Content-Type: application/json' --data @- 'http://localhost:8086$1'" 2>/dev/null; }

declare -A OK FAIL
tally(){ case "$2" in 2*|404) OK[$1]=$(( ${OK[$1]:-0} + 1 ));; *) FAIL[$1]=$(( ${FAIL[$1]:-0} + 1 )); echo "    ✗ $1 $3 → HTTP ${2:-none}";; esac; }
REASON='synthetic fixture — retired by tools/ops/retire-synthetic-residue.sh (owner decision 2026-09-11)'

echo; echo "applying"
# 1. Payouts of synthetic merchants that are still in flight end through their lifecycle.
while IFS='|' read -r id; do [ -n "$id" ] || continue
  tally payout_fail "$(core POST "/internal/v1/payouts/$id/fail" "{\"reason\":\"$REASON\"}")" "$id"
done < <(q "SELECT po.id FROM payouts po JOIN merchants m ON m.id=po.merchant_id WHERE po.status IN ('PENDING','PROCESSING','SENT') AND $M_SEL")

# 2. Open links of synthetic merchants are cancelled by their owner.
while IFS='|' read -r id mid; do [ -n "$id" ] || continue
  tally link_cancel "$(gw DELETE "/v1/payment-links/$id" "$mid")" "$id"
done < <(q "SELECT l.id, l.merchant_id FROM payment_links l JOIN merchants m ON m.id=l.merchant_id WHERE l.status='ACTIVE' AND $M_SEL")

# 3. Open sessions of synthetic merchants end as a whole (session, link, QR) —
#    an open session keeps its account from closing.
while IFS='|' read -r sid mid; do [ -n "$sid" ] || continue
  tally session_cancel "$(core POST "/internal/v1/payment-sessions/$sid/cancel" "{\"merchant_id\":\"$mid\"}")" "$sid"
done < <(q "SELECT s.id, s.merchant_id FROM payment_sessions s JOIN merchants m ON m.id=s.merchant_id WHERE s.status IN ('CREATED','ACTIVE') AND $M_SEL")

# 4. Segregated accounts: value retired, then the account closed.
while IFS='|' read -r id mid; do [ -n "$id" ] || continue
  tally wa_funds "$(core POST /internal/v1/sandbox/retire-funds "{\"owner_type\":\"WALLET_ACCOUNT\",\"owner_id\":\"$id\",\"reason\":\"$REASON\",\"retired_by\":\"retire-synthetic-residue\",\"idempotency_key\":\"$RUN-wa-$id\"}")" "$id"
  tally wa_close "$(core POST "/internal/v1/wallet-accounts/$id/close" "{\"reason\":\"$REASON\",\"closed_by\":\"retire-synthetic-residue\",\"merchant_id\":\"$mid\"}")" "$id"
done < <(q "SELECT wa.id, wa.merchant_id FROM wallet_accounts wa JOIN merchants m ON m.id=wa.merchant_id WHERE wa.purpose<>'PRIMARY' AND wa.status<>'CLOSED' AND $M_SEL")

# 5. The DOA demo accounts — exact ids, the same two steps, scoped to DOA.
while IFS='|' read -r id mid; do [ -n "$id" ] || continue
  tally doa_demo_funds "$(core POST /internal/v1/sandbox/retire-funds "{\"owner_type\":\"WALLET_ACCOUNT\",\"owner_id\":\"$id\",\"reason\":\"synthetic demo account left by campaign-payment-segregation.sh — owner decision 2026-09-11\",\"retired_by\":\"retire-synthetic-residue\",\"idempotency_key\":\"$RUN-demo-$id\"}")" "$id"
  tally doa_demo_close "$(core POST "/internal/v1/wallet-accounts/$id/close" "{\"reason\":\"synthetic demo account left by campaign-payment-segregation.sh — owner decision 2026-09-11\",\"closed_by\":\"retire-synthetic-residue\",\"merchant_id\":\"$mid\"}")" "$id"
done < <(q "SELECT wa.id, wa.merchant_id FROM wallet_accounts wa WHERE $DEMO_SEL AND wa.status<>'CLOSED'")

# 6. Primary balances of synthetic merchants, then their credentials, then the merchant.
while IFS='|' read -r mid; do [ -n "$mid" ] || continue
  tally merchant_funds "$(core POST /internal/v1/sandbox/retire-funds "{\"owner_type\":\"MERCHANT\",\"owner_id\":\"$mid\",\"reason\":\"$REASON\",\"retired_by\":\"retire-synthetic-residue\",\"idempotency_key\":\"$RUN-m-$mid\"}")" "$mid"
done < <(q "SELECT m.id FROM merchants m JOIN wallets w ON w.merchant_id=m.id WHERE $M_SEL AND $(printf "$bal" 'w.available_account_id') > 0")
while IFS='|' read -r kid mid; do [ -n "$kid" ] || continue
  tally api_key_revoke "$(core DELETE "/internal/v1/merchants/$mid/api-keys/$kid")" "$kid"
done < <(q "SELECT k.id, k.merchant_id FROM api_keys k JOIN merchants m ON m.id=k.merchant_id WHERE k.revoked_at IS NULL AND $M_SEL")
while IFS='|' read -r hid mid; do [ -n "$hid" ] || continue
  tally webhook_off "$(gw DELETE "/v1/webhooks/endpoints/$hid" "$mid")" "$hid"
done < <(q "SELECT h.id, h.merchant_id FROM webhook_endpoints h JOIN merchants m ON m.id=h.merchant_id WHERE h.active AND $M_SEL")
while IFS='|' read -r pid; do [ -n "$pid" ] || continue
  tally project_retire "$(dev "/internal/v1/projects/$pid/retire" "{\"reason\":\"$REASON\",\"created_by\":\"retire-synthetic-residue\"}")" "$pid"
done < <(q "SELECT p.id FROM developer.dev_projects p WHERE $P_SEL")
while IFS='|' read -r mid; do [ -n "$mid" ] || continue
  tally merchant_suspend "$(core POST "/internal/v1/merchants/$mid/suspend" '{}')" "$mid"
done < <(q "SELECT m.id FROM merchants m WHERE m.status='ACTIVE' AND $M_SEL")

# 7. Synthetic consumers: value retired, then the consumer suspended.
while IFS='|' read -r cid; do [ -n "$cid" ] || continue
  tally consumer_funds "$(core POST /internal/v1/sandbox/retire-funds "{\"owner_type\":\"CONSUMER\",\"owner_id\":\"$cid\",\"reason\":\"$REASON\",\"retired_by\":\"retire-synthetic-residue\",\"idempotency_key\":\"$RUN-c-$cid\"}")" "$cid"
done < <(q "SELECT c.id FROM consumers c JOIN consumer_wallets cw ON cw.consumer_id=c.id WHERE $C_SEL AND $(printf "$bal" 'cw.available_account_id') > 0")
while IFS='|' read -r cid; do [ -n "$cid" ] || continue
  tally consumer_suspend "$(core POST "/internal/v1/consumers/$cid/suspend" "{\"notes\":\"$REASON\"}")" "$cid"
done < <(q "SELECT c.id FROM consumers c WHERE c.status='ACTIVE' AND $C_SEL")

echo; echo "results"
for k in payout_fail link_cancel session_cancel wa_funds wa_close doa_demo_funds doa_demo_close merchant_funds api_key_revoke webhook_off project_retire merchant_suspend consumer_funds consumer_suspend; do
  printf '  %-18s ok=%-5s failed=%s\n' "$k" "${OK[$k]:-0}" "${FAIL[$k]:-0}"
done
echo; echo "AFTER"; inventory
