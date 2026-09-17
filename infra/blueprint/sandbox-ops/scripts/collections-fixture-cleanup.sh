#!/usr/bin/env bash
# COLLECTIONS-PROTOCOL-AND-PRODUCT-001 §2 — canonical fixture-cleanup boundary.
#
# DELETE is permitted ONLY for explicitly disposable, NON-FINANCIAL Collections
# fixtures. A Collection or share that has ANY economic history — surfaced into a
# PaymentIntent, paid, settled into a Transfer, or advanced past OPEN — MUST NOT be
# deleted as E2E cleanup. This script enforces that boundary in-database: it asserts
# the whole matched set is disposable inside one transaction and RAISES (rolling the
# whole thing back, deleting nothing) if a single row carries economic history.
#
# It writes through the least-privileged operator role (bl_app_runtime, authorised
# for non-financial tables only — WALLET-NATIVE-001). It never touches the ledger,
# wallets, payment_intents or transfers; those are Core-owned and immutable.
#
# Usage (on the Sandbox host, root@217.160.9.248):
#   collections-fixture-cleanup.sh --title '<marker>' [--env SANDBOX] --confirm
#   collections-fixture-cleanup.sh --title '<marker>' --env SANDBOX   # dry-run (no --confirm)
#
# Disposable ⇔ collection.status ∈ {DRAFT,OPEN,CANCELLED,EXPIRED} AND every share is
# PENDING with payment_intent_id IS NULL AND transfer_id IS NULL AND paid_at IS NULL.
set -euo pipefail

TITLE=""; ENVN="SANDBOX"; CONFIRM=0
while [ $# -gt 0 ]; do
  case "$1" in
    --title) TITLE="$2"; shift 2;;
    --env) ENVN="$2"; shift 2;;
    --confirm) CONFIRM=1; shift;;
    *) echo "unknown arg: $1" >&2; exit 2;;
  esac
done
[ -n "$TITLE" ] || { echo "ABORT: --title <marker> is required (never a blanket delete)"; exit 2; }
case "$ENVN" in SANDBOX|LIVE) ;; *) echo "ABORT: --env must be SANDBOX or LIVE"; exit 2;; esac
[ "$ENVN" = "LIVE" ] && { echo "ABORT: fixture cleanup is Sandbox-only; refusing LIVE"; exit 2; }

URLFILE=/root/.banzami/operator_db_url
[ -f "$URLFILE" ] || { echo "ABORT: operator db url not found ($URLFILE)"; exit 1; }
PG="$(docker ps --format '{{.Names}}' | grep -m1 'bzsandbox-.*-postgres-1')"
[ -n "$PG" ] || { echo "ABORT: sandbox postgres container not found"; exit 1; }

# The disposability assertion + delete. $$-quoting is avoided (the SQL is delivered
# as a file so no shell/PID expansion can corrupt it). Idempotency-safe: a no-op set
# deletes nothing and still passes.
SQL_FILE="$(mktemp)"; trap 'rm -f "$SQL_FILE"' EXIT
ACTION="ROLLBACK"; [ "$CONFIRM" = 1 ] && ACTION="COMMIT"
# Values are inlined as SQL string literals (single quotes doubled). psql does NOT
# substitute :'vars' inside a dollar-quoted DO block, so inlining is required there;
# doing it everywhere keeps one escaping rule. TITLE/ENVN are operator-supplied args.
sqlq() { printf "%s" "$1" | sed "s/'/''/g"; }
T="$(sqlq "$TITLE")"; E="$(sqlq "$ENVN")"
cat > "$SQL_FILE" <<SQL
BEGIN;
DO \$boundary\$
DECLARE
  bad_collections INT;
  bad_shares      INT;
  n_coll          INT;
  n_share         INT;
BEGIN
  SELECT count(*) INTO n_coll
    FROM collections WHERE title = '${T}' AND environment = '${E}';
  SELECT count(*) INTO n_share
    FROM collection_shares s
    WHERE s.collection_id IN (SELECT id FROM collections WHERE title = '${T}' AND environment = '${E}');

  -- A collection past OPEN carries economic progression -> NOT disposable.
  SELECT count(*) INTO bad_collections
    FROM collections
    WHERE title = '${T}' AND environment = '${E}'
      AND status NOT IN ('DRAFT','OPEN','CANCELLED','EXPIRED');

  -- Any share that was surfaced (payment_intent_id), settled (transfer_id),
  -- paid (paid_at / status PAID) carries economic history -> NOT disposable.
  SELECT count(*) INTO bad_shares
    FROM collection_shares s
    WHERE s.collection_id IN (SELECT id FROM collections WHERE title = '${T}' AND environment = '${E}')
      AND ( s.payment_intent_id IS NOT NULL
         OR s.transfer_id       IS NOT NULL
         OR s.paid_at           IS NOT NULL
         OR s.status <> 'PENDING' );

  RAISE NOTICE 'fixture-cleanup boundary: matched % collection(s), % share(s); non_disposable_collections=%, non_disposable_shares=%',
    n_coll, n_share, bad_collections, bad_shares;

  IF bad_collections > 0 OR bad_shares > 0 THEN
    RAISE EXCEPTION 'FIXTURE_CLEANUP_BOUNDARY_VIOLATION: % collection(s) and % share(s) carry economic/surfaced/paid history; refusing to delete', bad_collections, bad_shares;
  END IF;
END
\$boundary\$;

DELETE FROM collection_shares
  WHERE collection_id IN (SELECT id FROM collections WHERE title = '${T}' AND environment = '${E}');
DELETE FROM collections
  WHERE title = '${T}' AND environment = '${E}';
${ACTION};
SELECT (SELECT count(*) FROM collections WHERE title = '${T}' AND environment = '${E}') AS collections_remaining;
SQL

echo "== collections fixture cleanup (title='$TITLE' env=$ENVN action=$ACTION) =="
docker cp "$SQL_FILE" "$PG":/tmp/fc.sql >/dev/null
URL="$(cat "$URLFILE")"
docker exec -e FCURL="$URL" "$PG" sh -c 'psql "$FCURL" -v ON_ERROR_STOP=1 -f /tmp/fc.sql; rc=$?; rm -f /tmp/fc.sql; exit $rc'
[ "$CONFIRM" = 1 ] && echo "COLLECTIONS_FIXTURE_CLEANUP=DONE" || echo "COLLECTIONS_FIXTURE_CLEANUP=DRY_RUN (pass --confirm to delete)"
