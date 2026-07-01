# Verification Pages

Every Banzami receipt links to a public verification page:

```
https://banzami.com/r/{reference}
```

It is the **single public way to prove a payment** (BANZA **ADR-033**). The PDF,
QR or screenshot is never the proof — this page reads the immutable ledger in
real time. Full spec: [BANZA ADR-033](../adr/) · operator implementation:
[public-verification-engine.md](../architecture/public-verification-engine.md).

## Reference vs verification

- A **reference** (e.g. `BZM-Q3MP-ZQ5V`) only *locates* the transaction. It has
  **no** amount, no PII, no signature. Safe to print, share, embed.
- **Verification** resolves that reference against the ledger. Everything shown
  comes from the ledger — never from the document.

## How to generate a reference / QR

You don't build references or QR by hand. When you emit a receipt through the
Document Engine, it mints an ADR-040 proof and the QR/links resolve to
`/r/{reference}` automatically (see
[interactive-pdf-documents.md](../architecture/interactive-pdf-documents.md)).
The QR is the canonical [QR Engine](../architecture/qr-engine.md) code.

## How to verify (in your app)

Resolve the reference against the public endpoint — never trust the PDF/QR/URL:

```
GET https://api.banzami.com/v1/public/proofs/{reference}
→ { exists, status, amount, currency, payer_handle, payee_handle,
    method, confirmed_at, network, operator, ... }   # allow-list only
```

- `exists:false` (or a 404) is a safe "invalid/forged" outcome — show a red
  verdict, never an error.
- Translate `status` for users (CONFIRMED → "Confirmado").
- Or just link the user to `https://banzami.com/r/{reference}`.

## Privacy

By default the page shows only the **@handle**, not a person's full name.
Business (merchant) names are public; consumers are private. Your integration
must not try to obtain or display more than the endpoint returns.

## What you will never receive (and must never invent)

No internal ids, wallet/account/settlement ids, proof hash, signature, token, or
verification counter. If you need integrity assurance, the page's message is the
contract: registered, unaltered, confirmed by the operator.

## Common mistakes

- **Trusting the PDF/QR/screenshot** as proof — always resolve the reference.
- **Putting financial data in the URL** (`?amount=`, `?wallet=`, …) — forbidden;
  the reference is the only thing on the wire.
- **Caching a verdict from a document** — verify live; the page shows the query
  timestamp for exactly this reason.
