# Interactive Financial Documents — operator implementation

**Status:** Implemented · **Version:** 1.0 · **Implements:** BANZA **ADR-044**
(Interactive Financial Documents), building on ADR-040 (Transaction Proof
Standard). See also [document-engine.md](../document-engine.md), [qr-engine.md](qr-engine.md).

BANZA ADR-025 makes every emitted financial document **additively interactive**:
the QR, the verification URL and the transaction reference are clickable links
to the public verification page, plus logo/website/email links — invisible,
print-safe, and never leaking financial data. This document is Banzami's
implementation of that protocol standard.

> The document is **not** the source of truth. The links, QR and reference are
> conveniences; `banzami.com/r/{reference}` is only a *viewer* over the ledger,
> which remains the sole source of truth (ADR-040/ADR-044).

---

## Architecture — links come from the HTML, not PDF surgery

Banzami's Document Engine renders `receipt.html` with **headless Chromium**
(`GeneratePDF`). Chromium's print-to-PDF converts standard HTML `<a href>`
anchors into **native PDF link annotations**. So interactivity is achieved
purely in the template — no PDF-object library, no post-processing, no rect math.

```
ReceiptData ──▶ receipt.html (with <a href> anchors) ──▶ Chromium print-to-PDF
                                                              │
                                                              ▼
                                        PDF with native, invisible link
                                        annotations over QR / URL / reference /
                                        logo / website / email
```

This is the conformant "single module": every link is expressed the same way in
the one template, from the one `ReceiptData` (no screen builds links by hand).
A `<style>` rule keeps them invisible so the layout is untouched:

```css
a { color: inherit; text-decoration: none; }
```

## The links (all from `ReceiptData`)

| Element | Href | Source field |
|---------|------|--------------|
| QR area | `https://banzami.com/r/{ref}` | `VerifyURL` |
| Verification URL text | same | `VerifyURL` |
| `Nº {reference}` (header) | same | `VerifyURL` |
| `Referência da transação` (details) | same | `VerifyURL` |
| Verification note reference | same | `VerifyURL` |
| Logo | `https://banzami.com` | static |
| Website text | `https://banzami.com` | static |
| Email | `mailto:contact@banzami.com` | static |

`VerifyURL` is `verificationURL(reference)` = `https://banzami.com/r/{reference}`
— **only** the public, non-enumerable reference and the fixed host.

## Security (ADR-044 §3 — normative)

- A verification href carries **only the reference**. Never `?amount=`,
  `?wallet=`, `?from=`, `?to=`, `?signature=`, or any financial/PII field. The
  server resolves everything from the ledger.
- `html/template` renders hrefs in URL context (auto-escaping + scheme
  filtering), so a crafted reference cannot inject `javascript:` etc.
- Unit test `TestInteractiveLinks` asserts the links exist, are invisible, point
  to `/r/{ref}`, and that **no** financial query param appears anywhere.

## The QR stays canonical + scannable

The QR is the canonical [QR Engine](qr-engine.md) SVG (ECC H, red
finders, centre logo). Wrapping it in an `<a>` only adds the clickable region —
the matrix is unchanged, so camera scanning is unaffected. On a reader without
hyperlink support, nothing is lost: scan the QR.

## Compatibility

Native PDF link annotations are honoured by Adobe Acrobat, Chrome, Edge, Safari,
Firefox, macOS Preview, iOS Files and Android PDF viewers. Readers that ignore
them still show a perfect, printable document with a scannable QR.

## Applies to

Every document from the Document Engine — comprovativos (consumer transfers,
merchant payments), split bills, invoices, settlement statements, DOA campaign
documents, exports and admin PDFs — because they all render through the one
`receipt.html` template.

## For developers

You do not add links per document. Emitting a document through the Document
Engine (`documents.GeneratePDF` / `RenderHTML`) already produces an ADR-044
Interactive Financial Document: the engine wires the QR, verification URL and
reference to `banzami.com/r/{reference}` and adds the logo/website/email links.

To verify authenticity programmatically or in-product, resolve the reference
against the public page / proof API — never trust the PDF itself:

```
GET https://banzami.com/r/{reference}      # human viewer over the ledger
```

If you build a new document type, add it to the shared template (or a
template that includes the same header/footer/QR partials) so it inherits the
interactive links automatically — do not hand-roll `<a>` tags per surface.
