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
-- transfer, for its amount, with its description as the operation defines it —
-- a P2P note verbatim; for a payment-link payment, what the Business wrote on
-- the link (the transfer's own description there was generated, "Payment link:
-- <slug>", and is never printed), or nothing when it repeats the Business's
-- reference or context. See docs/api/receipt-semantics.md.
SELECT 'PROOFS_UNSIGNED', count(*) FROM transaction_proofs WHERE signature_value IS NULL OR signature_value = '';
SELECT 'PROOFS_OF_MISSING_TRANSFERS', count(*)
  FROM transaction_proofs p WHERE p.transfer_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM transfers t WHERE t.id::text = p.transfer_id);
SELECT 'PROOF_AMOUNT_DIFFERS_FROM_TRANSFER', count(*)
  FROM transaction_proofs p JOIN transfers t ON t.id::text = p.transfer_id WHERE p.amount_minor <> t.amount_minor;
SELECT 'PROOF_DESCRIPTION_DIFFERS_FROM_OPERATION', count(*)
  FROM transaction_proofs p JOIN transfers t ON t.id::text = p.transfer_id
  LEFT JOIN payment_links pl ON t.idempotency_key = 'pl-pay-' || pl.id::text AND pl.wallet_id = t.recipient_id
 WHERE COALESCE(NULLIF(CASE WHEN pl.id IS NOT NULL THEN pl.description ELSE t.description END, ''), '')
       <> COALESCE(NULLIF(p.description, ''), '')
   AND NOT (pl.id IS NOT NULL AND COALESCE(p.description, '') = ''
            AND lower(btrim(pl.description)) IN (lower(btrim(COALESCE(p.merchant_reference, ''))), lower(btrim(COALESCE(p.display_context, '')))))
   AND p.issued_at > '2026-09-10';
SELECT 'PROOF_PRINTS_A_TECHNICAL_LINK_DESCRIPTION', count(*)
  FROM transaction_proofs WHERE description ~ '^Payment link: ';
SELECT 'PROOF_OF_A_BUSINESS_PAYMENT_WITHOUT_ITS_PAYEE', count(*)
  FROM transaction_proofs p JOIN transfers t ON t.id::text = p.transfer_id JOIN wallets w ON w.id = t.recipient_id
 WHERE p.operation_kind IS DISTINCT FROM 'PAYMENT' OR COALESCE(p.payee_display_name, '') = '' OR p.payee_subject_type IS DISTINCT FROM 'merchant';
SELECT 'PROOF_REFERENCES_DUPLICATED', count(*) FROM (
  SELECT proof_reference FROM transaction_proofs GROUP BY proof_reference HAVING count(*) > 1) x;
SELECT 'PROOFS_TOTAL', count(*) FROM transaction_proofs;

-- ── Environment integrity ───────────────────────────────────────────────────
-- The Sandbox database holds no LIVE row, and no column still defaults to LIVE.
SELECT 'LIVE_DEFAULTED_ENVIRONMENT_COLUMNS', count(*)
  FROM information_schema.columns WHERE column_name = 'environment' AND column_default ILIKE '%LIVE%';

-- ── Business identity ───────────────────────────────────────────────────────
-- "Verified" is the KYB decision (0122): the badge and the decision never disagree.
SELECT 'VERIFIED_FLAG_DISAGREES_WITH_KYB', count(*)
  FROM merchants m
 WHERE m.verified IS DISTINCT FROM EXISTS (SELECT 1 FROM merchant_compliance c
                                            WHERE c.merchant_id = m.id AND c.kyb_status = 'APPROVED');
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

-- ── Ledger effect of financial objects (§8) ───────────────────────────────────
-- A ledger entry belongs to a posting; a posting belongs to at most one object.
SELECT 'LEDGER_ENTRIES_WITHOUT_POSTING', count(*)
  FROM ledger_entries e WHERE NOT EXISTS (SELECT 1 FROM ledger_postings p WHERE p.id = e.posting_id);
SELECT 'POSTINGS_CLAIMED_BY_TWO_OBJECTS', count(*) FROM (
  SELECT pid FROM (
    SELECT ledger_posting_id AS pid FROM transfers
    UNION ALL SELECT ledger_posting_id FROM payouts
    UNION ALL SELECT ledger_posting_id FROM settlements
    UNION ALL SELECT ledger_posting_id FROM consumer_deposits
    UNION ALL SELECT settlement_posting_id FROM app_settlements
    UNION ALL SELECT fee_posting_id FROM app_settlements
    UNION ALL SELECT posting_id FROM restitution_allocations) u
  WHERE pid IS NOT NULL GROUP BY pid HAVING count(*) > 1) x;
SELECT 'OBJECT_POSTINGS_THAT_DO_NOT_EXIST', count(*) FROM (
    SELECT ledger_posting_id AS pid FROM transfers
    UNION ALL SELECT ledger_posting_id FROM payouts
    UNION ALL SELECT ledger_posting_id FROM settlements
    UNION ALL SELECT ledger_posting_id FROM consumer_deposits
    UNION ALL SELECT settlement_posting_id FROM app_settlements
    UNION ALL SELECT fee_posting_id FROM app_settlements
    UNION ALL SELECT posting_id FROM restitution_allocations) u
  WHERE pid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ledger_postings p WHERE p.id = u.pid);
-- A state that says money moved has the posting that moved it. (A payout is
-- posted when it is processed; PENDING has none by design.)
SELECT 'PAYOUTS_PROCESSED_WITHOUT_POSTING', count(*)
  FROM payouts WHERE status IN ('PROCESSING','SENT','CONFIRMED') AND ledger_posting_id IS NULL;
SELECT 'SETTLEMENTS_SETTLED_WITHOUT_POSTING', count(*)
  FROM settlements WHERE status = 'SETTLED' AND ledger_posting_id IS NULL;
SELECT 'APP_SETTLEMENTS_COMPLETED_WITHOUT_POSTING', count(*)
  FROM app_settlements WHERE status = 'COMPLETED'
   AND (settlement_posting_id IS NULL OR (application_fee_minor > 0 AND fee_posting_id IS NULL));
SELECT 'DEPOSITS_CONFIRMED_WITHOUT_POSTING', count(*)
  FROM consumer_deposits WHERE status = 'CONFIRMED' AND ledger_posting_id IS NULL;
SELECT 'RESTITUTIONS_WITHOUT_POSTING', count(*)
  FROM restitution_allocations WHERE amount_minor > 0 AND posting_id IS NULL;
-- Phantom PAID: a link or session that reads paid with no payment behind it —
-- neither a recorded wallet payment nor a confirmed acquiring payment.
SELECT 'PAID_LINKS_WITHOUT_PAYMENT', count(*) FROM payment_links l
  WHERE (l.status IN ('PAID','USED') OR l.paid_at IS NOT NULL)
    AND NOT EXISTS (SELECT 1 FROM wallet_payments w WHERE w.payment_link_id = l.id)
    AND NOT EXISTS (SELECT 1 FROM acquiring_payments a WHERE a.payment_link_id = l.id AND a.status = 'CONFIRMED');
SELECT 'PAID_SESSIONS_WITHOUT_PAYMENT', count(*) FROM payment_sessions s
  WHERE s.status = 'PAID'
    AND NOT EXISTS (SELECT 1 FROM wallet_payments w WHERE w.payment_link_id = s.payment_link_id OR w.qr_code_id = s.qr_code_id)
    AND NOT EXISTS (SELECT 1 FROM acquiring_payments a WHERE a.payment_link_id = s.payment_link_id AND a.status = 'CONFIRMED');
SELECT 'WALLET_PAYMENTS_WITHOUT_COMPLETED_TRANSFER', count(*)
  FROM wallet_payments w LEFT JOIN transfers t ON t.id = w.transfer_id
  WHERE t.id IS NULL OR t.status <> 'COMPLETED';
