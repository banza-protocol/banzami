-- A fully refunded wallet payment's proof reads REVERSED.
--
-- The reversal on a full refund looked for the source's transaction id, and a
-- wallet payment has none: its operation is the transfer, and since one proof
-- per operation (0125) its proof is keyed on the transfer id (older ones on the
-- wallet payment itself). Every fully refunded wallet payment therefore kept a
-- CONFIRMED proof, and /r/ kept answering "Pagamento verificado" for money that
-- had been given back (A7-01; four in the Sandbox on 2026-09-11). The code now
-- reverses both keys; this moves the proofs it missed.
--
-- Status only, forward only (CONFIRMED -> REVERSED is the one move the
-- immutability trigger of 0125 allows); amounts, parties and references are not
-- touched, and nothing is deleted. reversed_at is the moment the last allocation
-- completed the refund, not the moment this ran.

WITH fully_refunded AS (
    SELECT wp.id, wp.transfer_id, wp.environment, max(ra.created_at) AS completed_at
      FROM wallet_payments wp
      JOIN restitution_allocations ra
        ON ra.source_type = 'WALLET_PAYMENT' AND ra.source_id = wp.id
     GROUP BY wp.id, wp.transfer_id, wp.environment, wp.amount_minor
    HAVING sum(ra.amount_minor) >= wp.amount_minor
)
UPDATE transaction_proofs tp
   SET status = 'REVERSED',
       reversed_at = COALESCE(tp.reversed_at, f.completed_at),
       updated_at = now()
  FROM fully_refunded f
 WHERE tp.transaction_id IN (f.transfer_id::text, f.id::text)
   AND tp.environment = f.environment
   AND tp.status = 'CONFIRMED';
