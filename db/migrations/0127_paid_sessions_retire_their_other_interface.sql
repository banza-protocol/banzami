-- 0127 — a paid Payment Session leaves no interface payable.
--
-- A session provisions a payment link and (fixed amount) a dynamic QR. When one
-- paid it, the other stayed ACTIVE for the rest of its 89-day life: every PAID
-- session on the Sandbox (56 at the time) still had a live dynamic QR. Core now
-- retires the other interface in the same statement that marks the session PAID
-- (payment_sessions::settle_for_interface); this repairs the sessions paid before.
--
-- The dynamic QR of a PAID session expires; the link of a PAID session paid by
-- QR is cancelled. Nothing financial changes: no posting, no balance, no proof.

UPDATE qr_codes q
   SET status = 'EXPIRED'
  FROM payment_sessions s
 WHERE s.qr_code_id = q.id
   AND s.status = 'PAID'
   AND q.status = 'ACTIVE';

UPDATE payment_links l
   SET status = 'CANCELLED', updated_at = now()
  FROM payment_sessions s
 WHERE s.payment_link_id = l.id
   AND s.status = 'PAID'
   AND l.status = 'ACTIVE';
