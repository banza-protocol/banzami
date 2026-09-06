#!/usr/bin/env bash
# Does the ledger close? — runs ON the VM (or copies itself there).
#
# Double-entry is only a guarantee if something checks it. Balance is asserted
# per posting by the ledger engine, which means the interesting failures are the
# ones the engine cannot see from inside a single posting: a posting whose
# entries were never written, an entry pointing at an account that no longer
# exists, a posting with one leg because the second insert failed after the
# first committed.
#
# So this asks the whole book, not one transaction:
#
#   every posting balances to zero
#   no posting has fewer than two legs
#   no posting is entry-less, no entry is posting-less
#   every entry names an account that exists
#   the sum of every credit and debit in the database is exactly zero
#
# The last one is the real test. Any single missing or duplicated leg anywhere
# in the history makes it non-zero, and no amount of per-posting checking finds
# that if the leg was never inserted at all.
#
# Read-only: SELECT and nothing else.
#
# Usage: bash tests/phase0/ledger-reconciliation.sh
set -uo pipefail
REMOTE="${BANZAMI_REMOTE:-root@217.160.9.248}"

# The canonical remote-execution contract: prove the host, run there, and return
# the proof's own exit status. See tools/ops/lib/remote.sh.
for _p in "$(dirname "$0")/remote.sh" "$(dirname "$0")/lib/remote.sh" \
          "$(dirname "$0")/../lib/remote.sh" "$(dirname "$0")/../../tools/ops/lib/remote.sh"; do
  [ -f "$_p" ] && { . "$_p"; break; }
done
command -v remote_self_or_continue >/dev/null 2>&1 \
  || { echo "✗ tools/ops/lib/remote.sh not found — refusing to run without the host guard" >&2; exit 2; }
remote_self_or_continue 

CORE=$(docker ps --format '{{.Names}}' | grep core-api-staging | head -1)
PG=$(docker ps --format '{{.Names}}' | grep postgres | grep bzsandbox | head -1)
PW=$(docker exec "$CORE" sh -c 'cat /run/secrets/db_url' | sed -E 's#.*://[^:]+:([^@]+)@.*#\1#')
q(){ docker exec -e PGPASSWORD="$PW" "$PG" psql -U bl_app_runtime -d banzami_staging -At -c "$1"; }

PASS=0; FAIL=0
chk(){ if [ "$2" = "$3" ]; then echo "  $1 PASS ($2)"; PASS=$((PASS+1));
       else echo "  $1 FAIL (got '$2' want '$3')"; FAIL=$((FAIL+1)); fi; }

echo "ledger reconciliation — banzami_staging"
echo "  postings: $(q 'select count(*) from ledger_postings')   entries: $(q 'select count(*) from ledger_entries')"

chk UNBALANCED_POSTINGS "$(q "select count(*) from (select posting_id from ledger_entries group by posting_id
  having sum(case when entry_type='CREDIT' then amount_minor else -amount_minor end) <> 0) x")" "0"

chk SINGLE_LEG_POSTINGS "$(q "select count(*) from (select posting_id from ledger_entries group by posting_id
  having count(*) < 2) x")" "0"

chk POSTINGS_WITHOUT_ENTRIES "$(q "select count(*) from ledger_postings p
  where not exists (select 1 from ledger_entries e where e.posting_id = p.id)")" "0"

chk ENTRIES_WITHOUT_POSTING "$(q "select count(*) from ledger_entries e
  where not exists (select 1 from ledger_postings p where p.id = e.posting_id)")" "0"

chk ENTRIES_WITH_UNKNOWN_ACCOUNT "$(q "select count(*) from ledger_entries e
  where not exists (select 1 from ledger_accounts a where a.id = e.account_id)")" "0"

# The whole book, in one number.
chk BOOK_SUMS_TO_ZERO "$(q "select coalesce(sum(case when entry_type='CREDIT' then amount_minor else -amount_minor end),0)
  from ledger_entries")" "0"

echo
[ "$FAIL" -eq 0 ] && echo "LEDGER_RECONCILIATION: PASS=$PASS FAIL=0" || echo "LEDGER_RECONCILIATION: PASS=$PASS FAIL=$FAIL"
exit $([ "$FAIL" -eq 0 ] && echo 0 || echo 1)
