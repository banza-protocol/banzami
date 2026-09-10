# Receipt semantics — who was paid, and what the operation was

Every surface that shows a completed operation — the payer's comprovativo in
the app, the official PDF, the public verifier at `banzami.com/r/<ref>`, and
BANZADMIN — renders **one canonical receipt**. None of them looks a party up
on its own.

## Why

A 2,000 Kz payment-link payment from @fm65 to @doa (proof
`BZM-BMJN-CFAF-00ZT-ADSF-P4N7-FB0T`) was:

| Surface | Said | Truth |
|---------|------|-------|
| Phone | "para Sandbox · Doa-Sandbox", "Ref 0056EAD5", 21:13 | Doa · @doa, `BZM-BMJN-…-FB0T`, 20:13 WAT |
| PDF | "Comprovativo de transferência", Para: *(empty)*, "Payment link: d7c27a5585a4" | a payment, to Doa · @doa |
| Verifier | "Para: —", "Método: Transferência Banzami · @banza", 19:13 | the same |

The ledger had credited @doa's CAMPAIGN Wallet Account. Three causes:

1. A payment-link payment runs as a transfer from the consumer to the
   Business's wallet, and the receipt path assumed every transfer is P2P: it
   looked the recipient up among consumers, found none, and proved an empty
   payee typed `consumer`.
2. The pay path generated the transfer description `Payment link: <slug>`.
3. The Business that owns @doa was created by the retired one-click Console
   setup (`0ccc0b8f`, removed in `8ae9c3b1`) with the account name
   `Sandbox · <Project name>`. A Project is integration metadata; it is never a
   payee.

## The rule

```
Project key → Project → sealed Financial Setup → Business → Wallet / Wallet Account → ledger
```

The payee is whoever the ledger credited: a **consumer** (a P2P transfer) or a
**Business wallet** (a payment to that Business). Its public identity is
`business_public_identities` (migration 0125):

- **handle** — the @handle the Business owns in `handle_registry`;
- **name** — its public profile's display name; otherwise the business name of
  the ONE approved application that provisioned that handle (the name it was
  reviewed under); otherwise its account name. Ambiguity resolves to nothing.

Nothing reads a Project, and nothing is special to any Business.

## The canonical receipt

Derived once, in `services/api-gateway/internal/service/receipt_semantics.go`,
from `transfers` / `wallet_payments`, `consumers`, `wallets`,
`business_public_identities`, `payment_links` and `payment_sessions`:

| Field | Values | Meaning |
|-------|--------|---------|
| `operation_kind` | `PAYMENT`, `P2P_TRANSFER` | what it was |
| `channel` | `PAYMENT_LINK`, `QR`, `HANDLE` | how it started (`HANDLE` = an @banza address) |
| `funding_source` | `BANZAMI_BALANCE` | where the money came from |
| `payer`, `payee` | `{kind: PERSON\|BUSINESS, display_name, handle}` | public identities at the time of the operation |
| `merchant_reference` | ≤ 64 chars | the Business's own reference (order, donation number) |
| `display_context` | ≤ 120 chars | what the payment was for, in the Business's public words |
| `description` | text | a P2P note, or what the Business wrote on the link |
| `proof_reference` | `BZM-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX` | the ONLY receipt reference |
| `confirmed_at` | instant (UTC) | when the ledger confirmed it |

The network is BANZA; the operator is Banzami. "@banza" is how people are
addressed — never a method — and "liquidação" names the settlement operation
only, never a payment.

### Where each surface gets it

| Surface | Source |
|---------|--------|
| Phone comprovativo | `POST /v1/payment-links/{slug}/pay` → `receipt`; else `GET /v1/consumer/transactions/{id}/receipt` |
| PDF (consumer) | `GET /v1/consumer/transactions/{id}/receipt.pdf` |
| PDF (Business) | `GET /v1/merchant/transactions/{id}/receipt.pdf` |
| BANZADMIN | admin-api → `POST /internal/v1/receipts/{transfer,wallet-payment}` with `issue:false` (never issues a proof) |
| Verifier | `GET /v1/public/proofs/{ref}` — the proof's snapshot, public disclosure |

## A Business's own words

A Business describes a payment through two documented keys of a Payment
Session's `metadata` (operator-local; every other key stays opaque and is never
rendered):

```json
{ "metadata": {
    "merchant_reference": "DOA-55791091",
    "display_context": "Vaquinha · Jornada economica fresca" } }
```

- `merchant_reference`: letters, digits, spaces and `- _ . / # :`, at most 64.
- `display_context`: printable text, at most 120, no `<` `>` `@` or links.

They are refused at creation (`400 INVALID_METADATA`) rather than dropped on a
receipt. They are **context, not identity**: a `payee_name` in metadata is
ignored, and a Project can never name who is paid.

## Disclosure

A party's own view (phone, PDF issued to a party, BANZADMIN) shows both
parties' names. The public verifier follows ADR-033 §7: a Business by name and
@handle, a person by @handle only. No surface shows an internal id; the
transaction id is an "ID da operação", never a reference.

## Time and money

- The instant is stored once (UTC). Every official surface prints it in
  Luanda time **and says so**: `10 set 2026, 20:13 (WAT)` on the PDF,
  `10/09/2026, 20:13 (WAT)` on the verifier, `10 de setembro de 2026, 20:13
  (WAT)` on the phone. The phone's live clock is labelled "Ecrã em direto".
- Amounts use the Banzami money format everywhere: `2 000 Kz` (cêntimos only
  when present, `50 000,50 Kz`).

## Proof snapshot and corrections

A proof stores the receipt's display snapshot (`operation_kind`, `channel`,
`funding_source`, `merchant_reference`, `display_context`, the payee's type,
name and @handle) at issue. It is history: renaming a Business later changes no
issued receipt.

The reference, amount, currency, confirmed and issued instants, ledger
reference and payer identity are **immutable** — a trigger refuses any update
(`transaction_proofs_financial_facts_immutable`).

A proof issued before this model is completed from the same derivation:
missing semantics are filled, a payee missing its @handle or of the wrong kind
is corrected, a generated `Payment link: <slug>` description is replaced by
the link's own words, and the legacy method line becomes the funding source. A
legitimate snapshot is never overwritten with today's value. When the payee
@handle changes, the proof is re-signed under the operator key. Every change is
recorded in `transaction_proof_corrections` (append-only) with the previous
value and the previous hash and signature. The proof reference is never
reissued.

```bash
# on the Sandbox server, gateway image, report only
backfill-proofs -correct-semantics
# write
backfill-proofs -correct-semantics -apply
```

A receipt request for a legacy proof completes it the same way.
