# 14 — Receipt / comprovativo validation plan

Version: 1.0

---

## 1. The chain that must be proven end to end

```
  real financial operation
        │
        ▼
  canonical receipt semantics        services/common/documents/receipt_semantics.go
        │                            (one derivation: payee, operation)
        ▼
  proof record + BZM reference       transaction_proofs  ·  BZM-XXXX-XXXX-XXXX
        │
        ├──▶ PDF (Document Engine, Chromium → PDF, ADR-025 hyperlinked)
        │
        └──▶ verification URL / QR ──▶ /r/{ref} ──▶ VERIFIED
```

Every link is a separate assertion. A PDF that renders is not proof that the
reference resolves; a reference that resolves is not proof that the payee is
right. The payee derivation in particular has been wrong before — a payment-link
payment to `@doa` once produced three different answers for who was paid — which
is why `receipt_semantics` is a single canonical derivation shared by the proof,
the PDF, the app and the verifier.

## 2. Verified runtime behaviour (read 2026-09-18)

`GET https://sandbox-api.banzami.com/v1/public/proofs/BZM-0000-0000-0000`

```json
{"exists":false,
 "status":"NOT_FOUND",
 "message":"Este comprovativo não existe ou pode ter sido falsificado."}
```
HTTP 404. `https://pay.banzami.com/r/BZM-0000-0000-0000` → 200 (the page renders
the not-found state rather than erroring).

So the canonical negative state of §49 is **already implemented and correct**.

## 3. S15 journeys

| Journey | Assertion |
|---|---|
| `S15-RCP-001` | wallet payment → proof exists, `BZM-` reference well-formed |
| `S15-RCP-002` | P2P transfer → proof exists for **both** sides, one operation |
| `S15-RCP-003` | Collection share payment → proof names the Business as payee |
| `S15-RCP-004` | PDF renders; SHA-256 captured into the Evidence Manifest |
| `S15-RCP-005` | PDF hyperlinks are live and reference-only (ADR-025), print-safe |
| `S15-RCP-006` | verification QR in the PDF decodes to the `/r/{ref}` URL |
| `S15-RCP-007` | `/r/{ref}` shows VERIFIED with the correct amount, payee, timestamp |
| `S15-RCP-008` | **name privacy** (ADR-024): consumers by `@handle` only; businesses public |
| `S15-RCP-009` | unknown reference → `NOT_FOUND`, no enumeration signal, no hash, no counter |
| `S15-RCP-010` | verifier intentionally unavailable → `VERIFICATION_UNAVAILABLE`, never a false VERIFIED |
| `S15-RCP-011` | tampered reference → `NOT_FOUND` (fails closed) |
| `S15-RCP-012` | refunded payment → the proof reflects the refund (migration 0131) |
| `S15-RCP-013` | one proof per operation — no duplicate proof for one payment |
| `S15-RCP-014` | receipt payee == the ledger recipient, via `business_public_identities` |

`S15-RCP-010` needs a way to make the verifier unavailable without breaking the
Sandbox for everyone. Recommended: assert the *handler's* unavailable path in an
integration test and assert at runtime only that the client renders
`VERIFICATION_UNAVAILABLE` when the endpoint returns 503 — **do not** take the
public verifier down during a run.

## 4. Fields

Assert **the fields the implementation actually produces**. No PII requirement
is invented: Sandbox performs no consumer KYC, consumers are identified by
`@handle`, and a receipt that displayed a legal name would be a privacy defect,
not a completeness win.

## 5. Evidence

Every receipt journey contributes: the PDF (SHA-256 in the manifest), the
verification JSON, a screenshot of the rendered `/r/{ref}` page, and the ledger
extract the receipt claims to describe. The PDF is **financial evidence** and is
retained indefinitely ([10](10-run-resource-retention.md) §5).

## 6. Reuse

`tests/phase0/receipt-assurance.sh`, `proof-lookup-assurance.sh`,
`tools/e2e/security/proof-reference-canonicality.mjs`,
`tools/e2e/business/payment-receipt-identity-e2e.mjs`,
`tests/ops/{proof-reference-literals,proof-url-one-spelling,bzm-namespace-guard,
nginx-proof-log-redaction}.test.mjs`, `migration-0125-payment-receipt-semantics`,
`migration-0131-refunded-wallet-payment-proofs`.
