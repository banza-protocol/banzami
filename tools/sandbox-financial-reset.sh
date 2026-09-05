#!/usr/bin/env bash
# Clean pre-launch Sandbox financial reset. Runs ON the Sandbox VM.
#
# WHY
#
# Two problems, one operation:
#
#   1. Ten `[SANDBOX] Merchant wallet top-up` postings are single-legged — a
#      CREDIT with no counter-DEBIT, written by a sandbox_credit that did not
#      balance its posting (RA-060, fixed in 93efe54b). The ledger is
#      append-only, so they cannot be edited, and correcting them one at a time
#      is precisely what append-only forbids.
#
#   2. Funds-in-circulation had reached 49,175,000 against a 50,000,000 pilot
#      cap, accumulated over months of E2E runs. That cap is a compliance
#      control: raising it to make tests pass would disable the thing being
#      tested. The only legitimate way back under it is to remove the synthetic
#      funds.
#
# A reset resolves both and leaves an unambiguous baseline. It is safe here and
# only here: this is Sandbox, pre-launch, and every balance in it is synthetic.
# NEVER run this against LIVE — the environment guard below refuses.
#
# WHAT IT KEEPS
#
# Structural entities: merchants, wallets, wallet_accounts, consumers,
# consumer_wallets, ledger_accounts, developer projects and bindings. The
# canonical DOA project, its binding and its campaign wallet accounts all
# survive; only the money in them returns to zero.
#
# FORENSICS
#
# The complete pre-reset ledger is exported to a timestamped directory on the VM
# before anything is deleted, including a separate file listing exactly the
# postings that failed the balance invariant. Kept on the VM, never in Git.
set -uo pipefail

CORE=$(docker ps --format '{{.Names}}' | grep core-api-staging | head -1)
PG=$(docker ps  --format '{{.Names}}' | grep postgres | grep bzsandbox | head -1)
[ -n "$CORE" ] && [ -n "$PG" ] || { echo "CONTAINERS_NOT_FOUND"; exit 1; }

# Environment guard. The reset is defined only for a synthetic ledger; in LIVE
# these rows are the record of real money and deleting them is unthinkable.
ENVIRONMENT=$(docker exec "$CORE" printenv ENVIRONMENT 2>/dev/null)
case "$(printf '%s' "$ENVIRONMENT" | tr 'A-Z' 'a-z')" in
  sandbox|staging|test) ;;
  *) echo "REFUSING: core reports ENVIRONMENT='$ENVIRONMENT' — this script is Sandbox-only"; exit 1;;
esac

PW=$(docker exec "$CORE" sh -c 'cat /run/secrets/db_url' | sed -E 's#.*://[^:]+:([^@]+)@.*#\1#')
psql_(){ docker exec -e PGPASSWORD="$PW" "$PG" psql -U bl_app_runtime -d banzami_staging -At -F'|' -c "$1" 2>&1; }
copy_(){ docker exec -e PGPASSWORD="$PW" "$PG" psql -U bl_app_runtime -d banzami_staging -c "$1" 2>/dev/null; }

# A posting balances when its DEBIT and CREDIT legs cancel. Summing raw amounts
# without signing by entry_type reports every correct posting as broken — an
# error that badly overstated the scope of RA-060 before it was caught.
SIGNED="SUM(CASE e.entry_type WHEN 'DEBIT' THEN -e.amount_minor ELSE e.amount_minor END)"
AGG="SELECT COALESCE(SUM(CASE WHEN le.entry_type='CREDIT' THEN le.amount_minor ELSE -le.amount_minor END),0) FROM ledger_entries le WHERE le.account_id IN (SELECT available_account_id FROM wallets UNION SELECT available_account_id FROM consumer_wallets)"
UNBAL="SELECT COUNT(*) FROM (SELECT p.id FROM ledger_postings p JOIN ledger_entries e ON e.posting_id=p.id GROUP BY p.id HAVING $SIGNED <> 0) x"

STAMP=$(date -u +%Y%m%dT%H%M%SZ)
OUT="/var/backups/banzami-sandbox-ledger-$STAMP"
mkdir -p "$OUT"

echo "### before"
echo "  postings       = $(psql_ 'SELECT COUNT(*) FROM ledger_postings')"
echo "  entries        = $(psql_ 'SELECT COUNT(*) FROM ledger_entries')"
echo "  unbalanced     = $(psql_ "$UNBAL")"
echo "  funds in circ. = $(psql_ "$AGG")"

echo "### forensic export -> $OUT (retained on the VM, never in Git)"
copy_ "\\copy (SELECT * FROM ledger_postings ORDER BY created_at) TO STDOUT WITH CSV HEADER" > "$OUT/ledger_postings.csv"
copy_ "\\copy (SELECT * FROM ledger_entries ORDER BY created_at) TO STDOUT WITH CSV HEADER" > "$OUT/ledger_entries.csv"
copy_ "\\copy (SELECT p.id, p.description, p.idempotency_key, p.created_at, COUNT(e.id) AS legs, $SIGNED AS net_minor FROM ledger_postings p JOIN ledger_entries e ON e.posting_id = p.id GROUP BY p.id, p.description, p.idempotency_key, p.created_at HAVING $SIGNED <> 0 ORDER BY p.created_at) TO STDOUT WITH CSV HEADER" > "$OUT/unbalanced_postings.csv"
echo "  postings=$(($(wc -l < "$OUT/ledger_postings.csv") - 1)) entries=$(($(wc -l < "$OUT/ledger_entries.csv") - 1)) unbalanced=$(($(wc -l < "$OUT/unbalanced_postings.csv") - 1))"

echo "### reset — bulk, one transaction, no row edited"
psql_ "BEGIN; DELETE FROM ledger_entries; DELETE FROM ledger_postings; COMMIT;" >/dev/null

echo "### after"
AFTER_U=$(psql_ "$UNBAL"); AFTER_A=$(psql_ "$AGG")
echo "  postings       = $(psql_ 'SELECT COUNT(*) FROM ledger_postings')"
echo "  entries        = $(psql_ 'SELECT COUNT(*) FROM ledger_entries')"
echo "  unbalanced     = $AFTER_U"
echo "  funds in circ. = $AFTER_A"

echo "### structure preserved"
for t in merchants wallets wallet_accounts consumers consumer_wallets ledger_accounts; do
  echo "  $t = $(psql_ "SELECT COUNT(*) FROM $t")"
done
echo "  DOA project binding = $(psql_ "SELECT state FROM developer.dev_project_sandbox_binding WHERE project_id='6367749d-ba77-47b6-80bd-982382ddd1c9'")"

# An empty ledger is the point; a non-empty one means the delete did not apply
# and everything downstream would be measuring the old state.
[ "$AFTER_U" = "0" ] && [ "$AFTER_A" = "0" ] || { echo "RESET_INCOMPLETE"; exit 1; }
echo
echo "SANDBOX_FINANCIAL_RESET: OK (forensics at $OUT)"
