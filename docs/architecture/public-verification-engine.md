# Public Verification Engine — operator implementation

**Status:** Implemented · **Version:** 1.0 · **Implements:** BANZA **ADR-033**
(Public Verification Pages), building on ADR-040 (Transaction Proof Standard).
See also [interactive-pdf-documents.md](interactive-pdf-documents.md),
[document-engine.md](../document-engine.md).

`banzami.com/r/{reference}` is the **public, authenticated viewer of the ledger**
for a proof reference — the single public way to validate any Banzami receipt.
The document (PDF/QR/screenshot) is never the proof; this page is.

> Source of truth: the immutable ledger. This page (and its ViewModel) only
> *reads* it. QR, PDF, screenshot and URL are untrusted — their only role is to
> carry the `reference`.

## Architecture — the Resolution Engine

```
QR / PDF / link ──▶ reference ──▶ Gateway proof endpoint (Resolution Engine)
                                    GET /v1/public/proofs/{ref}
                                    → ProofService.GetByReference (ledger)
                                    → ProofService.Public  (ViewModel)
                                          │  allow-list + name privacy
                                          ▼
                              public ViewModel (JSON) ──▶ apps/website /r/[ref]
                                                          (pure renderer)
```

- **Engine:** `services/api-gateway` — `ProofService.Public(proof)` builds the
  public ViewModel from the ledger-backed proof. The page never touches the DB.
- **Page:** `apps/website/app/r/[ref]/page.tsx` renders that ViewModel.

## What the ViewModel exposes (allow-list, ADR-033 §2)

`exists`, `status`, `amount`, `currency`, `payer/payee_display` (privacy-gated),
`payer/payee_handle`, `method`, `description`, `confirmed_at`, `issued_at`,
`verification_url`, `network`, `operator`. Nothing else.

## What it never exposes (§3–§5)

Internal ids (UUIDs, wallet/merchant/account/ledger-posting/settlement/pricing/
risk/compliance/policy/routing/transaction ids), signatures, keys, tokens/JWTs,
the **proof hash**, and the **verification counter**. The hash/signature stay
internal to the proof for integrity; the counter is recorded for operator
analytics (`RecordVerification`) but never returned.

## Name privacy (§7)

`ProofService.publicDisplayName(subjectType, name)` applies the default: a
person's name is private, so `consumer` (and unknown/empty) subjects resolve to
`null` — the page then shows only the `@handle`. Public entities (**businesses /
merchants**) show their name. A future per-user "show my name publicly" opt-in
would mark a consumer public at proof time; until then, consumers are private.

## Page presentation (§6, §8–§13)

- **Status** is localized (`statusPT`): CONFIRMED → "Confirmado", etc. Verdict
  tone: confirmed green / pending yellow / reversed·invalid·not-found red.
- **Network vs operator:** "BANZA" (protocol) vs "Banzami" (operator) — shown
  distinctly (ADR-019 visible).
- **Query timestamp:** "Verificado agora · {now} (WAT)" — rendered per request
  (`force-dynamic`), so the reader sees a live check, not a cached document.
- **Environment:** a SANDBOX badge ("sem valor financeiro real") when the site
  resolves against sandbox; LIVE shows none.
- **Fonte da verdade** card + **Integridade** summary (✓ Registado · ✓ Não
  alterado · ✓ Confirmado pelo operador) — plain assurance, **no hashes**.

## One engine, all reference types (§12)

The same endpoint + page serve every proof reference — payments, transfers, QR,
split bills, invoices, campaigns, donations, payouts, refunds, chargebacks — via
one ViewModel. New document types get a verifiable page for free by minting an
ADR-040 proof.

## Security

Everything is re-validated server-side; the client-supplied QR/PDF/URL only
provides the reference. A not-found / error resolves to a safe "invalid" verdict
(never an exception that leaks internals). Responses are `Cache-Control:
public, max-age=15` — short enough to stay live, long enough to absorb bursts.
