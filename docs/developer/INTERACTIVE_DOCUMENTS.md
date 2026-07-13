# Interactive Documents

Every financial document Banzami emits (comprovativos, invoices, settlement
statements, DOA campaign docs, exports) is an **Interactive Financial Document**
per BANZA **ADR-044**: it is a perfect printable PDF *and* it carries invisible,
additive hyperlinks so a reader can verify or navigate with one click — without
ever exposing financial data.

Full spec: [BANZA ADR-025](../adr/) · operator implementation:
[interactive-pdf-documents.md](../architecture/interactive-pdf-documents.md) ·
engine: [document-engine.md](../document-engine.md).

## How to generate a PDF

Use the shared Document Engine — never build a PDF (or its links/QR) by hand:

```go
pdf, err := documents.GeneratePDF(ctx, receiptData) // ReceiptData → branded PDF
```

The engine renders the one `receipt.html` template with headless Chromium.

## Hyperlinks — you get them for free

You do **not** add links per document. The engine already wires, from the same
`ReceiptData`:

- **QR**, **verification URL** and the **transaction reference** → `https://banzami.com/r/{reference}`
- **logo** and **website** → `https://banzami.com`
- **email** → `mailto:contact@banzami.com`

They are styled invisible (`a { color: inherit; text-decoration: none }`) so the
layout is identical, and Chromium turns them into native PDF link annotations.
A new document type inherits them by reusing the shared template/partials.

## QR

The centre QR is the canonical [QR Engine](../architecture/qr-engine.md) code
(ECC H, red finders, centre Banzami logo). It stays fully scannable; the link is
additive. Don't render QR any other way.

## Verifying authenticity

The PDF is **never** the source of truth — the ledger is. To verify, resolve the
reference against the public page (which reads the ledger):

```
GET https://banzami.com/r/{reference}
```

`{reference}` is the public, non-enumerable proof reference (e.g. `BZM-Q3MP-ZQ5V`).
It carries **no** amount, wallet, party or signature — the server resolves the
real transaction from the ledger. Never trust a PDF, screenshot or a URL query
string for financial facts.

## How `/r/{reference}` works

1. The document shows/links the reference only.
2. `/r/{reference}` looks up the TransactionProof (ADR-040) and renders the real
   amount, parties and status **from the ledger**.
3. A GREEN verification means the ledger confirms the transaction; the document
   was merely a representation of it.
