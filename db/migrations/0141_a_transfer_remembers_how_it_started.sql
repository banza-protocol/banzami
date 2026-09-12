-- A transfer says how it was initiated, so its receipt can say so too.
--
-- The receipt's channel was inferred from the shape of the row: a payment to a
-- Business joined to a payment link was ChannelPaymentLink, and everything else
-- was ChannelHandle — "paid by @banza". That inference had no way to be wrong
-- while the only ways to move money were a handle and a link.
--
-- Paying a QR breaks it. A QR payment to a Business joins no payment link, and a
-- QR payment to a consumer looks exactly like a handle transfer, so both would
-- mint a proof that names the wrong channel — a signed document asserting the
-- payer did something they did not do. The channel is a fact about how the
-- payment started, and a fact is recorded, not guessed.
--
-- Nullable, and only the QR-pay route writes it for now: every historical
-- transfer keeps the derivation that was correct for it, and nothing has to be
-- backfilled to be right. A row that says nothing is read exactly as before.

ALTER TABLE transfers
    ADD COLUMN initiated_via TEXT
    CHECK (initiated_via IS NULL OR initiated_via IN ('QR', 'HANDLE', 'PAYMENT_LINK'));
