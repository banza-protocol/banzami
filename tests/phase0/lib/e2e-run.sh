#!/usr/bin/env bash
# Fixture ownership and guaranteed cleanup for the Sandbox harnesses.
#
# THE PROBLEM THIS EXISTS FOR
#
# Every harness here mints operator authority — merchants, projects, API keys,
# webhook endpoints, application PINs — and none of them took it back. Twice now
# that residue had to be swept by hand (RA-075: 156 developer keys; RA-077: 169
# merchant keys, 55 active webhook endpoints, 169 unlocked PINs, one of them
# posting signed events at the live product's webhook route). Sweeping is a
# cure. This is the fix: a harness cleans up after itself, and something checks.
#
# THE MODEL
#
# One run id. Everything a run creates is written to that run's manifest as it
# is created, by exact id — never by name pattern, never by "everything that
# looks like a test". Cleanup reads the manifest and retires exactly those
# objects. If ownership is unknown, nothing is touched: a cleaner that guesses
# is how you delete the key that takes donations.
#
# Cleanup runs from a trap on EXIT, INT and TERM, so a failed assertion, a
# Ctrl-C and a timeout all clean up. That is the whole point — the runs that
# leak are the ones that failed.
#
# If the machine dies outright, the manifest survives on disk and
# tools/ops/cleanup-e2e-run.sh can finish the job from it. Manifests hold ids
# only: no secrets, ever.
#
# RETIREMENT, NOT DELETION
#
# Keys are revoked, endpoints deactivated, sessions and links cancelled,
# projects disabled, merchants and consumers suspended — each through the
# canonical operator route a person would use. Nothing is deleted with SQL.
#
# The money a run was given goes back too. A merchant's segregated accounts and
# its primary balance, and a consumer's balance, are retired to the Sandbox
# funding source by a balanced posting (core /internal/v1/sandbox/retire-funds),
# and the emptied segregated accounts are closed. Without that every run left
# its funding behind, and the pilot funding cap filled up with value nobody
# would ever spend (2026-09-11: 505 000 Kz against a 500 000 Kz cap). The operator's domain model keeps history on
# purpose, and an audit needs to see that a credential existed and when it
# stopped working.
#
# ADR-055 is not touched. A sealed binding stays sealed; the disposable thing is
# the project that holds it, which is retired as a whole.
#
# USE
#
#   source "$(dirname "$0")/lib/e2e-run.sh"
#   e2e_begin                                  # ids, manifest, trap
#   NAME=$(e2e_name refund)                    # run-tagged, collision-free
#   ...create something...
#   e2e_own fixture_key   "$KEY_ID"
#   e2e_own webhook_endpoint "$EP_ID" "$MERCHANT_ID"
#   e2e_own merchant      "$MERCHANT_ID"         # funds retired, accounts closed, suspended
#   e2e_own consumer      "$CONSUMER_ID"         # funds retired, suspended
#   e2e_own merchant_application "$APP_ID"       # rejected if still undecided
#   # cleanup happens on the way out, however the script exits
#
# Set E2E_NO_CLEANUP=1 to deliberately leak — used by the mutation test that
# proves the hygiene gate can actually fail. Nothing else may set it.
#
# A harness with its own tidying (a temp directory, say) must NOT install a
# second `trap ... EXIT`: the shell keeps one handler per signal, so the later
# trap replaces this one and cleanup stops happening — silently, which is the
# failure this whole file exists to end. Put the command in E2E_ALSO instead
# and it runs as part of the same handler.
#
#   E2E_ALSO='rm -rf "$WORK"'

E2E_STATE_DIR="${E2E_STATE_DIR:-/var/tmp/banzami-e2e}"

# ── context ─────────────────────────────────────────────────────────────────
# Everything retirement needs, discovered in ONE place.
#
# The recovery path (tools/ops/cleanup-e2e-run.sh) used to assemble its own
# subset and left out E2E_PG / E2E_CORE / E2E_PW. Retirement reads the database
# to decide whether a link is still live, so under `set -u` recovery died on an
# unbound variable — and without it, e2e_sql returned empty, which reads as
# "not ACTIVE", which reads as "nothing to retire". A live payable fixture URL
# would have been reported as cleaned up. Two callers, one context.
e2e_discover() {
  E2E_PG=$(docker ps   --format '{{.Names}}' | grep postgres | grep bzsandbox | head -1)
  E2E_CORE=$(docker ps --format '{{.Names}}' | grep core-api-staging | head -1)
  E2E_PW=$(docker exec "$E2E_CORE" sh -c 'cat /run/secrets/db_url 2>/dev/null' 2>/dev/null | sed -E 's#.*://[^:]+:([^@]+)@.*#\1#')
  E2E_GW=$(docker ps  --format '{{.Names}}' | grep api-gateway-staging | head -1)
  E2E_DEV=$(docker ps --format '{{.Names}}' | grep developer-api       | head -1)
  E2E_INTKEY=$(docker exec "$E2E_DEV" sh -c 'cat /run/secrets/developer_internal_key 2>/dev/null' 2>/dev/null)
  E2E_JWTSEC=$(docker exec "$E2E_GW"  sh -c 'cat /run/secrets/jwt_secret 2>/dev/null' 2>/dev/null)
  E2E_GWKEY=$(docker exec "$E2E_GW" sh -c 'tr "\0" "\n" < /proc/1/environ | sed -n "s/^INTERNAL_API_KEY=//p"' 2>/dev/null)
}

# ── identity ────────────────────────────────────────────────────────────────
e2e_begin() {
  E2E_RUN_ID="${E2E_RUN_ID:-$(date +%s)$$}"
  E2E_SHORT="${E2E_RUN_ID: -8}"
  mkdir -p "$E2E_STATE_DIR"
  E2E_MANIFEST="$E2E_STATE_DIR/$E2E_RUN_ID.tsv"
  : > "$E2E_MANIFEST"

  e2e_discover

  # A trap on EXIT alone misses Ctrl-C in some shells and misses TERM always.
  trap 'e2e_end' EXIT
  trap 'e2e_end; exit 130' INT
  trap 'e2e_end; exit 143' TERM
  echo "  e2e run $E2E_RUN_ID (manifest $E2E_MANIFEST)"
}

# A name nobody else will pick, carrying the run it belongs to. Used for
# forensic attribution when a manifest is lost — never as the cleanup key.
e2e_name() { printf 'e2e-%s-%s' "$1" "$E2E_SHORT"; }

# ── ownership ───────────────────────────────────────────────────────────────
# e2e_own <kind> <id> [owner]   — record it the moment it exists, before it is
# used. A resource created and then recorded after an assertion that might fail
# is a resource that leaks exactly when it matters.
e2e_own() {
  [ -n "${2:-}" ] || return 0
  printf '%s\t%s\t%s\n' "$1" "$2" "${3:-}" >> "$E2E_MANIFEST"
}

# ── retirement ──────────────────────────────────────────────────────────────
# Addressing only — never retirement. A payment session does not carry its
# link's id, and the canonical cancel route takes an id, so the slug is resolved
# here and the cancelling is still done through the API.
e2e_sql() {
  docker exec -e PGPASSWORD="$E2E_PW" "$E2E_PG" psql -U bl_app_runtime -d banzami_staging -At -c "$1" 2>/dev/null
}

e2e_jwt() {
  SECRET="$E2E_JWTSEC" K="$1" V="$2" node -e 'const c=require("crypto");const b=o=>Buffer.from(typeof o==="string"?o:JSON.stringify(o)).toString("base64url");const n=Math.floor(Date.now()/1000);const cl={scopes:["*"],environment:"SANDBOX",iat:n,exp:n+900};cl[process.env.K]=process.env.V;const h=b({alg:"HS256",typ:"JWT"}),p=b(cl);process.stdout.write(h+"."+p+"."+c.createHmac("sha256",process.env.SECRET).update(h+"."+p).digest("base64url"));'
}

# Returns the HTTP status so cleanup can report what it could not retire rather
# than reporting success for having tried.
e2e_http() { # container port method path auth-header
  docker exec "$1" curl -s -o /dev/null -w '%{http_code}' -X "$3" \
    "http://localhost:$2$4" -H "$5" 2>/dev/null
}

# Core's operator routes, over Core's own loopback — the path the operator
# uses, and the only one that needs no credential. Returns the HTTP status.
e2e_core() { # method path json
  printf '%s' "$3" | docker exec -i "$E2E_CORE" curl -s -o /dev/null -w '%{http_code}' -X "$1" \
    -H 'Content-Type: application/json' --data @- "http://localhost:8081$2" 2>/dev/null
}

# Retire what a merchant holds: each segregated account's value, then the
# account itself, then the primary balance. Returns the first failing status,
# or 204. The @doa authority is never a fixture, whatever a manifest says.
e2e_retire_merchant_funds() { # merchant
  local m="$1" wa code why="e2e fixture $E2E_RUN_ID"
  [ -n "$(e2e_sql "select 1 from handle_registry where owner_id = '$m' and handle = 'doa'")" ] && { echo 409; return; }
  # A payout still in flight holds value the merchant no longer shows. Failing
  # it through the payout lifecycle returns that value first — otherwise every
  # run that made a payout left it PENDING, and its money out of reach.
  local po
  while read -r po; do
    [ -n "$po" ] || continue
    code=$(e2e_core POST "/internal/v1/payouts/$po/fail" "{\"reason\":\"$why\"}")
    case "$code" in 2*) ;; *) echo "$code"; return ;; esac
  done < <(e2e_sql "select id from payouts where merchant_id = '$m' and status in ('PENDING','PROCESSING','SENT')")
  while read -r wa; do
    [ -n "$wa" ] || continue
    code=$(e2e_core POST /internal/v1/sandbox/retire-funds "{\"owner_type\":\"WALLET_ACCOUNT\",\"owner_id\":\"$wa\",\"reason\":\"$why\",\"retired_by\":\"e2e-run\",\"idempotency_key\":\"e2e-$E2E_RUN_ID-wa-$wa\"}")
    case "$code" in 2*) ;; *) echo "$code"; return ;; esac
    code=$(e2e_core POST "/internal/v1/wallet-accounts/$wa/close" "{\"reason\":\"$why\",\"closed_by\":\"e2e-run\",\"merchant_id\":\"$m\"}")
    case "$code" in 2*) ;; *) echo "$code"; return ;; esac
  done < <(e2e_sql "select id from wallet_accounts where merchant_id = '$m' and purpose <> 'PRIMARY' and status <> 'CLOSED'")
  if [ -n "$(e2e_sql "select 1 from wallets where merchant_id = '$m'")" ]; then
    code=$(e2e_core POST /internal/v1/sandbox/retire-funds "{\"owner_type\":\"MERCHANT\",\"owner_id\":\"$m\",\"reason\":\"$why\",\"retired_by\":\"e2e-run\",\"idempotency_key\":\"e2e-$E2E_RUN_ID-m-$m\"}")
    case "$code" in 2*) ;; *) echo "$code"; return ;; esac
  fi
  echo 204
}

e2e_end() {
  trap - EXIT INT TERM
  # The harness's own tidying, run first: it touches local files, not operator
  # state, and it must happen even if retirement below fails.
  [ -n "${E2E_ALSO:-}" ] && eval "$E2E_ALSO"

  [ -n "${E2E_MANIFEST:-}" ] && [ -f "$E2E_MANIFEST" ] || return 0
  if [ "${E2E_NO_CLEANUP:-0}" = "1" ]; then
    echo "  cleanup SKIPPED (E2E_NO_CLEANUP=1) — manifest kept at $E2E_MANIFEST"
    return 0
  fi

  local failed=0 done=0
  echo "  cleaning up run $E2E_RUN_ID"

  # Dependency order. Payment links and endpoints belong to a merchant, keys
  # belong to a project or a merchant, and the merchant is retired last —
  # suspending it first would refuse every call that follows.
  local kind id owner code
  for kind in payment_session payment_link webhook_endpoint merchant_key fixture_key fixture_project merchant consumer merchant_application; do
    while IFS=$'\t' read -r k id owner; do
      [ "$k" = "$kind" ] || continue
      case "$kind" in
        payment_session)
          # An unpaid session is a live link and QR anyone can pay into a
          # fixture account, and an open session keeps its account from ever
          # closing. It is cancelled as a whole — session, link and QR. A paid
          # one needs nothing.
          case "$(e2e_sql "select status from payment_sessions where id = '$id'")" in
            PAID|PARTIALLY_PAID|CANCELLED|EXPIRED|FAILED) code=204 ;;
            *) code=$(e2e_core POST "/internal/v1/payment-sessions/$id/cancel" "{\"merchant_id\":\"$owner\"}") ;;
          esac ;;
        payment_link)
          # Only an ACTIVE link holds live authority. A USED one has already
          # been paid and cannot be expired — the API refuses with 422, which is
          # the API being right, not the cleanup failing. Counting that as a
          # failure meant every run that actually paid a link ended with a red
          # line and a kept manifest, which is how an alarm stops being read.
          #
          # Same reasoning as the payment_session branch above, which already
          # said so and then only applied it to itself.
          # Fail OPEN toward deleting, not toward assuming terminal: an
          # unreadable status must attempt the delete, because the cost of a
          # needless 422 is a log line and the cost of a wrong "already
          # terminal" is a live payable URL nobody is watching.
          case "$(e2e_sql "select status from payment_links where id = '$id'")" in
            USED|EXPIRED|CANCELLED)
              code=204 ;;
            *)
              code=$(e2e_http "$E2E_GW" 8080 DELETE "/v1/payment-links/$id" "Authorization: Bearer $(e2e_jwt merchant_id "$owner")") ;;
          esac ;;
        webhook_endpoint)
          code=$(e2e_http "$E2E_GW" 8080 DELETE "/v1/webhooks/endpoints/$id" "Authorization: Bearer $(e2e_jwt merchant_id "$owner")") ;;
        merchant_key)
          code=$(e2e_http "$E2E_GW" 8080 DELETE "/v1/merchants/$owner/api-keys/$id" "Authorization: Bearer $(e2e_jwt merchant_id "$owner")") ;;
        fixture_key)
          code=$(e2e_http "$E2E_DEV" 8086 POST "/internal/v1/fixture-keys/$id/revoke" "X-Internal-Key: $E2E_INTKEY") ;;
        fixture_project)
          code=$(e2e_http "$E2E_DEV" 8086 POST "/internal/v1/fixture-projects/$id/retire" "X-Internal-Key: $E2E_INTKEY") ;;
        merchant)
          # Its value first (an account that holds money cannot close), then
          # the merchant. A merchant the run only suspended keeps nothing.
          code=$(e2e_retire_merchant_funds "$id")
          case "$code" in
            2*) code=$(e2e_http "$E2E_GW" 8080 POST "/v1/merchants/$id/suspend" "Authorization: Bearer $(e2e_jwt merchant_id "$id")") ;;
          esac ;;
        merchant_application)
          # An application nobody decided sits in the operator's queue for
          # good. Rejected through the operator route; a decided one needs
          # nothing.
          case "$(e2e_sql "select status from merchant_applications where id = '$id'")" in
            REJECTED|APPROVED|CANCELLED|"") code=204 ;;
            *) code=$(printf '{"reviewed_by":"e2e-run","admin_notes":"e2e fixture %s","merchant_message":"Candidatura de teste encerrada."}' "$E2E_RUN_ID" \
                 | docker exec -i -e IK="$E2E_GWKEY" "$E2E_GW" sh -c "curl -s -o /dev/null -w '%{http_code}' -X POST -H \"X-Internal-Key: \$IK\" -H 'Content-Type: application/json' --data @- 'http://localhost:8080/internal/v1/merchant-applications/$id/reject'" 2>/dev/null) ;;
          esac ;;
        consumer)
          code=$(e2e_core POST /internal/v1/sandbox/retire-funds "{\"owner_type\":\"CONSUMER\",\"owner_id\":\"$id\",\"reason\":\"e2e fixture $E2E_RUN_ID\",\"retired_by\":\"e2e-run\",\"idempotency_key\":\"e2e-$E2E_RUN_ID-c-$id\"}")
          case "$code" in
            2*) code=$(e2e_core POST "/internal/v1/consumers/$id/suspend" "{\"notes\":\"e2e fixture $E2E_RUN_ID\"}") ;;
          esac ;;
      esac
      # 404 counts as retired: the object is not there to hold authority. Any
      # other non-2xx is a real failure and the manifest is kept for recovery.
      case "$code" in
        2*|404) done=$((done+1)) ;;
        *) failed=$((failed+1)); echo "    ✗ $kind $id → HTTP ${code:-none}" ;;
      esac
    done < "$E2E_MANIFEST"
  done

  if [ "$failed" -eq 0 ]; then
    rm -f "$E2E_MANIFEST"
    echo "  retired $done resource(s); manifest cleared"
  else
    echo "  retired $done, FAILED $failed — manifest kept: $E2E_MANIFEST"
    echo "  recover with: bash tools/ops/cleanup-e2e-run.sh $E2E_RUN_ID --apply"
  fi
}
