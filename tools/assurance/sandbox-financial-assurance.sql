-- sandbox-financial-assurance.sql — read-only global financial assurance counts.
--
-- Every line is a COUNT that must be 0 (or, for the two totals, a number that
-- must match its pair). Run read-only against the Sandbox database:
--
--   SQL=/tmp/assurance.sql /tmp/sbq.sh -At        (on the Sandbox VM)
--
-- No row data is printed: only counts and sums. Nothing here writes.

-- ── Ledger ──────────────────────────────────────────────────────────────────
-- A posting is exactly one DEBIT and one CREDIT of the same amount and currency.
SELECT 'LEDGER_POSTINGS_WITHOUT_BOTH_LEGS', count(*) FROM (
  SELECT p.id FROM ledger_postings p LEFT JOIN ledger_entries e ON e.posting_id = p.id
  GROUP BY p.id
  HAVING count(*) FILTER (WHERE e.entry_type = 'DEBIT') <> 1
      OR count(*) FILTER (WHERE e.entry_type = 'CREDIT') <> 1) x;
SELECT 'LEDGER_POSTINGS_UNBALANCED', count(*) FROM (
  SELECT posting_id FROM ledger_entries GROUP BY posting_id
  HAVING sum(CASE WHEN entry_type = 'DEBIT' THEN amount_minor ELSE -amount_minor END) <> 0
      OR count(DISTINCT currency) <> 1) x;
SELECT 'LEDGER_ENTRY_ACCOUNT_CURRENCY_MISMATCH', count(*)
  FROM ledger_entries e JOIN ledger_accounts a ON a.id = e.account_id WHERE a.currency <> e.currency;
SELECT 'LEDGER_TOTAL_DEBITS_MINUS_CREDITS',
       COALESCE(sum(CASE WHEN entry_type = 'DEBIT' THEN amount_minor ELSE -amount_minor END), 0) FROM ledger_entries;
SELECT 'LEDGER_POSTINGS_TOTAL', count(*) FROM ledger_postings;
SELECT 'LEDGER_ENTRIES_TOTAL', count(*) FROM ledger_entries;

-- ── Balances ────────────────────────────────────────────────────────────────
-- Customer money is a liability: credits minus debits never goes below zero.
SELECT 'NEGATIVE_BUSINESS_WALLET_ACCOUNT_BALANCES', count(*) FROM (
  SELECT wa.account_id FROM wallet_accounts wa JOIN ledger_entries e ON e.account_id = wa.account_id
  GROUP BY wa.account_id
  HAVING sum(CASE WHEN e.entry_type = 'CREDIT' THEN e.amount_minor ELSE -e.amount_minor END) < 0) x;
SELECT 'NEGATIVE_BUSINESS_WALLET_AVAILABLE_BALANCES', count(*) FROM (
  SELECT w.id FROM wallets w JOIN ledger_entries e ON e.account_id = w.available_account_id
  GROUP BY w.id
  HAVING sum(CASE WHEN e.entry_type = 'CREDIT' THEN e.amount_minor ELSE -e.amount_minor END) < 0) x;
SELECT 'NEGATIVE_CONSUMER_WALLET_AVAILABLE_BALANCES', count(*) FROM (
  SELECT cw.id FROM consumer_wallets cw JOIN ledger_entries e ON e.account_id = cw.available_account_id
  GROUP BY cw.id
  HAVING sum(CASE WHEN e.entry_type = 'CREDIT' THEN e.amount_minor ELSE -e.amount_minor END) < 0) x;

-- ── Transfers and their postings ────────────────────────────────────────────
SELECT 'COMPLETED_TRANSFERS_WITHOUT_POSTING', count(*)
  FROM transfers WHERE status = 'COMPLETED' AND ledger_posting_id IS NULL;
SELECT 'TRANSFER_AMOUNT_DIFFERS_FROM_POSTING', count(*)
  FROM transfers t JOIN ledger_entries e ON e.posting_id = t.ledger_posting_id AND e.entry_type = 'DEBIT'
 WHERE t.amount_minor <> e.amount_minor;

-- ── Receipts (BZM proofs) ───────────────────────────────────────────────────
-- A BZM reference is a promise that it resolves: a signed proof of a real
-- transfer, for its amount, with its description verbatim.
SELECT 'PROOFS_UNSIGNED', count(*) FROM transaction_proofs WHERE signature_value IS NULL OR signature_value = '';
SELECT 'PROOFS_OF_MISSING_TRANSFERS', count(*)
  FROM transaction_proofs p WHERE p.transfer_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM transfers t WHERE t.id::text = p.transfer_id);
SELECT 'PROOF_AMOUNT_DIFFERS_FROM_TRANSFER', count(*)
  FROM transaction_proofs p JOIN transfers t ON t.id::text = p.transfer_id WHERE p.amount_minor <> t.amount_minor;
SELECT 'PROOF_DESCRIPTION_DIFFERS_FROM_TRANSFER', count(*)
  FROM transaction_proofs p JOIN transfers t ON t.id::text = p.transfer_id
 WHERE COALESCE(NULLIF(t.description, ''), '') <> COALESCE(NULLIF(p.description, ''), '')
   AND p.issued_at > '2026-09-10';
SELECT 'PROOF_REFERENCES_DUPLICATED', count(*) FROM (
  SELECT proof_reference FROM transaction_proofs GROUP BY proof_reference HAVING count(*) > 1) x;
SELECT 'PROOFS_TOTAL', count(*) FROM transaction_proofs;

-- ── Environment integrity ───────────────────────────────────────────────────
-- The Sandbox database holds no LIVE row, and no column still defaults to LIVE.
SELECT 'LIVE_DEFAULTED_ENVIRONMENT_COLUMNS', count(*)
  FROM information_schema.columns WHERE column_name = 'environment' AND column_default ILIKE '%LIVE%';

-- ── Business identity ───────────────────────────────────────────────────────
SELECT 'BUSINESS_LOGIN_NOT_OWNING_ITS_HANDLE', count(*)
  FROM merchant_app_credentials c JOIN handle_registry hr ON hr.handle = c.handle
 WHERE hr.owner_type <> 'MERCHANT' OR hr.owner_id IS DISTINCT FROM c.merchant_id;
SELECT 'APPROVED_APPLICATIONS_WITHOUT_RESOLUTION', count(*)
  FROM merchant_applications WHERE status = 'APPROVED' AND resolution IS NULL;
SELECT 'APPLICATION_HOLDS_OF_CLOSED_APPLICATIONS', count(*)
  FROM handle_registry hr JOIN merchant_applications a ON a.id = hr.owner_id
 WHERE hr.owner_type = 'APPLICATION' AND a.status IN ('APPROVED', 'REJECTED');
SELECT 'HANDLES_WITH_MORE_THAN_ONE_OWNER', count(*) FROM (
  SELECT handle FROM handle_registry GROUP BY handle HAVING count(*) > 1) x;

-- ── Webhooks ────────────────────────────────────────────────────────────────
SELECT 'WEBHOOK_EVENTS_DELIVERED_TWICE_TO_ONE_ENDPOINT', count(*) FROM (
  SELECT event_id, endpoint_id FROM webhook_deliveries GROUP BY 1, 2 HAVING count(*) > 1) x;
SELECT 'WEBHOOK_ATTEMPTS_BEYOND_DELIVERY_COUNT', count(*)
  FROM webhook_delivery_attempts a JOIN webhook_deliveries d ON d.id = a.delivery_id
 WHERE a.attempt_number > d.attempt_count;
