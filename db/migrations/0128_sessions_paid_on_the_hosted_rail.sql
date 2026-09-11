-- 0128 — a Payment Session whose link was paid on the hosted rail is paid.
--
-- The hosted acquiring rail (pay.banzami.com: the provider callback, and the
-- Sandbox's simulated confirmation) credited the session's account and marked
-- its link USED, and never moved the session: 52 sessions on the Sandbox were
-- still ACTIVE after their link was paid, each with a dynamic QR payable for the
-- rest of its 89 days. Core now pays the session from the acquiring settlement
-- itself (payment_sessions::settle_for_acquired_link); this repairs the ones
-- paid before.
--
-- A USED link has been paid — that is the only way a link becomes USED. Its
-- session becomes PAID and the session's dynamic QR expires, the same two
-- changes the rail now makes. Nothing financial changes: no posting, no
-- balance, no proof. No event is emitted retroactively: an integrator told
-- "paid" days late about a payment it has already seen as payment_link.paid
-- would reconcile it twice.

WITH paid AS (
    UPDATE payment_sessions s
       SET status = 'PAID', updated_at = now()
      FROM payment_links l
     WHERE l.id = s.payment_link_id
       AND l.status = 'USED'
       AND s.status IN ('CREATED','ACTIVE')
 RETURNING s.qr_code_id
)
UPDATE qr_codes q
   SET status = 'EXPIRED'
  FROM paid
 WHERE q.id = paid.qr_code_id
   AND q.status = 'ACTIVE';
