#!/usr/bin/env bash
# PAYMENT-REQUEST-002 — SQL ledger verification script
#
# Verifies ledger invariants and security properties for a completed consumer
# pay link payment directly in the PostgreSQL database.
#
# Requires:
#   - psql available in PATH
#   - Local dev database running on port 5433 (make dev-up)
#   - A PAID consumer_pay_link present (run after a real or seeded payment)
#
# Usage:
#   ./tools/verify-consumer-pay-link.sh                  # uses LINK_CODE env var or latest paid link
#   LINK_CODE=TESTCODE1 ./tools/verify-consumer-pay-link.sh

set -euo pipefail

DB_URL="${DATABASE_URL:-postgres://banzami:banzami_dev@localhost:5433/banzami_dev}"
LINK_CODE="${LINK_CODE:-}"

PASS=0
FAIL=0

green()  { printf '\033[0;32m✓ %s\033[0m\n' "$1"; }
red()    { printf '\033[0;31m✗ %s\033[0m\n' "$1"; }
header() { printf '\n\033[1m%s\033[0m\n' "$1"; }

pass() { green "$1"; PASS=$((PASS+1)); }
fail() { red "$1";   FAIL=$((FAIL+1)); }

psqlq() { PGPASSWORD=banzami_dev psql -h localhost -p 5433 -U banzami -d banzami_dev -tAq -c "$1"; }

# ---------------------------------------------------------------------------
# Resolve link code
# ---------------------------------------------------------------------------
header "Resolving link code..."

if [ -z "$LINK_CODE" ]; then
  LINK_CODE=$(psqlq "SELECT link_code FROM consumer_pay_links WHERE status = 'PAID' ORDER BY paid_at DESC LIMIT 1;")
  if [ -z "$LINK_CODE" ]; then
    echo "No PAID consumer pay links found. Pay a link first, then run this script."
    exit 1
  fi
  echo "Using most recently paid link: $LINK_CODE"
else
  echo "Using link code: $LINK_CODE"
fi

# ---------------------------------------------------------------------------
# Fetch link details
# ---------------------------------------------------------------------------
header "Fetching link record..."

LINK_ROW=$(psqlq "
SELECT
  cpl.id,
  cpl.link_code,
  cpl.status,
  cpl.amount_minor,
  cpl.locked,
  cpl.receiver_consumer_id,
  cpl.payer_consumer_id,
  cpl.transfer_id
FROM consumer_pay_links cpl
WHERE cpl.link_code = '$LINK_CODE';")

if [ -z "$LINK_ROW" ]; then
  echo "Link $LINK_CODE not found in database."
  exit 1
fi

LINK_ID=$(psqlq "SELECT id FROM consumer_pay_links WHERE link_code = '$LINK_CODE';")
LINK_STATUS=$(psqlq "SELECT status FROM consumer_pay_links WHERE link_code = '$LINK_CODE';")
LINK_AMOUNT=$(psqlq "SELECT amount_minor FROM consumer_pay_links WHERE link_code = '$LINK_CODE';")
LINK_LOCKED=$(psqlq "SELECT locked FROM consumer_pay_links WHERE link_code = '$LINK_CODE';")
LINK_TRANSFER_ID=$(psqlq "SELECT transfer_id FROM consumer_pay_links WHERE link_code = '$LINK_CODE';")
LINK_RECEIVER_ID=$(psqlq "SELECT receiver_consumer_id FROM consumer_pay_links WHERE link_code = '$LINK_CODE';")
LINK_PAYER_ID=$(psqlq "SELECT payer_consumer_id FROM consumer_pay_links WHERE link_code = '$LINK_CODE';")

printf "  link_id:     %s\n" "$LINK_ID"
printf "  status:      %s\n" "$LINK_STATUS"
printf "  amount:      %s\n" "$LINK_AMOUNT"
printf "  locked:      %s\n" "$LINK_LOCKED"
printf "  transfer_id: %s\n" "$LINK_TRANSFER_ID"
printf "  receiver_id: %s\n" "$LINK_RECEIVER_ID"
printf "  payer_id:    %s\n" "$LINK_PAYER_ID"

# ---------------------------------------------------------------------------
# 1. Link status is PAID
# ---------------------------------------------------------------------------
header "1. Link status transition"

if [ "$LINK_STATUS" = "PAID" ]; then
  pass "consumer_pay_links.status = PAID"
else
  fail "consumer_pay_links.status = '$LINK_STATUS' (expected PAID)"
fi

PAID_AT=$(psqlq "SELECT paid_at FROM consumer_pay_links WHERE link_code = '$LINK_CODE';")
if [ -n "$PAID_AT" ] && [ "$PAID_AT" != "" ]; then
  pass "paid_at is set: $PAID_AT"
else
  fail "paid_at is NULL — should be set after payment"
fi

if [ -n "$LINK_PAYER_ID" ] && [ "$LINK_PAYER_ID" != "" ]; then
  pass "payer_consumer_id is set: $LINK_PAYER_ID"
else
  fail "payer_consumer_id is NULL — should be set after payment"
fi

# ---------------------------------------------------------------------------
# 2. Exactly one ledger posting for this link
# ---------------------------------------------------------------------------
header "2. Idempotency — single ledger posting"

EXPECTED_KEY="consumer-pay-link-$LINK_ID"
POSTING_COUNT=$(psqlq "SELECT COUNT(*) FROM ledger_postings WHERE idempotency_key = '$EXPECTED_KEY';")

if [ "$POSTING_COUNT" = "1" ]; then
  pass "Exactly one ledger_posting with idempotency_key=consumer-pay-link-$LINK_ID"
else
  fail "Expected 1 ledger_posting, found $POSTING_COUNT"
fi

POSTING_ID=$(psqlq "SELECT id FROM ledger_postings WHERE idempotency_key = '$EXPECTED_KEY';")
printf "  posting_id: %s\n" "$POSTING_ID"

# ---------------------------------------------------------------------------
# 3. Exactly one DEBIT and one CREDIT entry on that posting
# ---------------------------------------------------------------------------
header "3. Double-entry correctness"

ENTRY_COUNT=$(psqlq "SELECT COUNT(*) FROM ledger_entries WHERE posting_id = '$POSTING_ID';")
if [ "$ENTRY_COUNT" = "2" ]; then
  pass "Exactly 2 ledger entries (debit + credit)"
else
  fail "Expected 2 ledger entries, found $ENTRY_COUNT"
fi

DEBIT_COUNT=$(psqlq "SELECT COUNT(*) FROM ledger_entries WHERE posting_id = '$POSTING_ID' AND entry_type = 'DEBIT';")
CREDIT_COUNT=$(psqlq "SELECT COUNT(*) FROM ledger_entries WHERE posting_id = '$POSTING_ID' AND entry_type = 'CREDIT';")

if [ "$DEBIT_COUNT" = "1" ]; then
  pass "Exactly 1 DEBIT entry"
else
  fail "Expected 1 DEBIT, found $DEBIT_COUNT"
fi

if [ "$CREDIT_COUNT" = "1" ]; then
  pass "Exactly 1 CREDIT entry"
else
  fail "Expected 1 CREDIT, found $CREDIT_COUNT"
fi

# ---------------------------------------------------------------------------
# 4. Zero-sum: debit amount == credit amount
# ---------------------------------------------------------------------------
header "4. Zero-sum invariant"

DEBIT_AMOUNT=$(psqlq "SELECT amount_minor FROM ledger_entries WHERE posting_id = '$POSTING_ID' AND entry_type = 'DEBIT';")
CREDIT_AMOUNT=$(psqlq "SELECT amount_minor FROM ledger_entries WHERE posting_id = '$POSTING_ID' AND entry_type = 'CREDIT';")

printf "  debit:  %s\n" "$DEBIT_AMOUNT"
printf "  credit: %s\n" "$CREDIT_AMOUNT"

if [ "$DEBIT_AMOUNT" = "$CREDIT_AMOUNT" ]; then
  pass "Debit == Credit (zero-sum posting)"
else
  fail "Debit ($DEBIT_AMOUNT) ≠ Credit ($CREDIT_AMOUNT) — NOT zero-sum"
fi

# ---------------------------------------------------------------------------
# 5. Amounts equal the link's locked amount
# ---------------------------------------------------------------------------
header "5. Locked amount integrity"

if [ -n "$LINK_AMOUNT" ] && [ "$LINK_AMOUNT" != "" ]; then
  if [ "$DEBIT_AMOUNT" = "$LINK_AMOUNT" ]; then
    pass "Debit amount ($DEBIT_AMOUNT) matches link.amount_minor ($LINK_AMOUNT)"
  else
    fail "Debit ($DEBIT_AMOUNT) ≠ link.amount_minor ($LINK_AMOUNT) — AMOUNT TAMPER POSSIBLE"
  fi
  if [ "$CREDIT_AMOUNT" = "$LINK_AMOUNT" ]; then
    pass "Credit amount ($CREDIT_AMOUNT) matches link.amount_minor ($LINK_AMOUNT)"
  else
    fail "Credit ($CREDIT_AMOUNT) ≠ link.amount_minor ($LINK_AMOUNT) — AMOUNT TAMPER POSSIBLE"
  fi
else
  echo "  (open link — amount not locked, skipping locked amount check)"
fi

# ---------------------------------------------------------------------------
# 6. Debit is on payer's account, credit is on receiver's account
# ---------------------------------------------------------------------------
header "6. Direction correctness — payer debited, receiver credited"

PAYER_WALLET=$(psqlq "
SELECT available_account_id FROM consumer_wallets
WHERE consumer_id = '$LINK_PAYER_ID' AND currency = 'AOA' AND status = 'ACTIVE' LIMIT 1;")

RECEIVER_WALLET=$(psqlq "
SELECT available_account_id FROM consumer_wallets
WHERE consumer_id = '$LINK_RECEIVER_ID' AND currency = 'AOA' AND status = 'ACTIVE' LIMIT 1;")

printf "  payer_account_id:    %s\n" "$PAYER_WALLET"
printf "  receiver_account_id: %s\n" "$RECEIVER_WALLET"

DEBIT_ACCOUNT=$(psqlq "
SELECT account_id FROM ledger_entries
WHERE posting_id = '$POSTING_ID' AND entry_type = 'DEBIT';")

CREDIT_ACCOUNT=$(psqlq "
SELECT account_id FROM ledger_entries
WHERE posting_id = '$POSTING_ID' AND entry_type = 'CREDIT';")

if [ "$DEBIT_ACCOUNT" = "$PAYER_WALLET" ]; then
  pass "DEBIT is on payer's available_account_id"
else
  fail "DEBIT account ($DEBIT_ACCOUNT) ≠ payer wallet ($PAYER_WALLET) — wrong direction"
fi

if [ "$CREDIT_ACCOUNT" = "$RECEIVER_WALLET" ]; then
  pass "CREDIT is on receiver's available_account_id"
else
  fail "CREDIT account ($CREDIT_ACCOUNT) ≠ receiver wallet ($RECEIVER_WALLET) — wrong direction"
fi

# ---------------------------------------------------------------------------
# 7. Exactly one transfer record
# ---------------------------------------------------------------------------
header "7. Exactly one transfer"

if [ -n "$LINK_TRANSFER_ID" ] && [ "$LINK_TRANSFER_ID" != "" ]; then
  TRANSFER_COUNT=$(psqlq "SELECT COUNT(*) FROM transfers WHERE id = '$LINK_TRANSFER_ID';")
  if [ "$TRANSFER_COUNT" = "1" ]; then
    pass "Exactly one transfers record (id=$LINK_TRANSFER_ID)"
  else
    fail "Expected 1 transfer, found $TRANSFER_COUNT"
  fi

  TRANSFER_AMOUNT=$(psqlq "SELECT amount_minor FROM transfers WHERE id = '$LINK_TRANSFER_ID';")
  TRANSFER_STATUS=$(psqlq "SELECT status FROM transfers WHERE id = '$LINK_TRANSFER_ID';")
  TRANSFER_SENDER=$(psqlq "SELECT sender_id FROM transfers WHERE id = '$LINK_TRANSFER_ID';")
  TRANSFER_RECIPIENT=$(psqlq "SELECT recipient_id FROM transfers WHERE id = '$LINK_TRANSFER_ID';")

  printf "  transfer.status:    %s\n" "$TRANSFER_STATUS"
  printf "  transfer.amount:    %s\n" "$TRANSFER_AMOUNT"
  printf "  transfer.sender_id: %s\n" "$TRANSFER_SENDER"

  if [ "$TRANSFER_STATUS" = "COMPLETED" ]; then
    pass "Transfer.status = COMPLETED"
  else
    fail "Transfer.status = $TRANSFER_STATUS (expected COMPLETED)"
  fi

  if [ -n "$LINK_AMOUNT" ] && [ "$LINK_AMOUNT" != "" ]; then
    if [ "$TRANSFER_AMOUNT" = "$LINK_AMOUNT" ]; then
      pass "Transfer.amount_minor ($TRANSFER_AMOUNT) matches link.amount_minor ($LINK_AMOUNT)"
    else
      fail "Transfer.amount_minor ($TRANSFER_AMOUNT) ≠ link.amount_minor ($LINK_AMOUNT)"
    fi
  fi

  if [ "$TRANSFER_SENDER" = "$LINK_PAYER_ID" ]; then
    pass "Transfer.sender_id matches payer"
  else
    fail "Transfer.sender_id ($TRANSFER_SENDER) ≠ payer ($LINK_PAYER_ID)"
  fi

  if [ "$TRANSFER_RECIPIENT" = "$LINK_RECEIVER_ID" ]; then
    pass "Transfer.recipient_id matches receiver"
  else
    fail "Transfer.recipient_id ($TRANSFER_RECIPIENT) ≠ receiver ($LINK_RECEIVER_ID)"
  fi

  TRANSFER_POSTING=$(psqlq "SELECT ledger_posting_id FROM transfers WHERE id = '$LINK_TRANSFER_ID';")
  if [ "$TRANSFER_POSTING" = "$POSTING_ID" ]; then
    pass "Transfer.ledger_posting_id linked to the correct posting"
  else
    fail "Transfer posting link broken: $TRANSFER_POSTING ≠ $POSTING_ID"
  fi
else
  fail "consumer_pay_links.transfer_id is NULL after payment"
fi

# ---------------------------------------------------------------------------
# 8. No duplicate ledger movements (additional postings with similar description)
# ---------------------------------------------------------------------------
header "8. No duplicate payments"

DUPLICATE_POSTINGS=$(psqlq "
SELECT COUNT(*) FROM ledger_postings
WHERE idempotency_key LIKE 'consumer-pay-link-$LINK_ID%';")

if [ "$DUPLICATE_POSTINGS" = "1" ]; then
  pass "No duplicate ledger postings for this link"
else
  fail "Found $DUPLICATE_POSTINGS postings for link $LINK_ID — expected exactly 1"
fi

# ---------------------------------------------------------------------------
# 9. Payer ≠ receiver (no self-payment)
# ---------------------------------------------------------------------------
header "9. No self-payment"

if [ "$LINK_PAYER_ID" != "$LINK_RECEIVER_ID" ]; then
  pass "Payer ≠ receiver"
else
  fail "Payer = receiver — self-payment must be blocked at the API layer"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
printf '\n'
printf '━%.0s' {1..50}
printf '\n'
printf '\033[1mResults: %d passed, %d failed\033[0m\n' "$PASS" "$FAIL"

if [ "$FAIL" -gt 0 ]; then
  printf '\033[0;31mFAIL — ledger invariants violated\033[0m\n'
  exit 1
else
  printf '\033[0;32mPASS — all ledger invariants hold\033[0m\n'
  exit 0
fi
