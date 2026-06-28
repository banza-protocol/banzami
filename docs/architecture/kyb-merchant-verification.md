# KYB — Business verification inside the Merchant app

**Status:** Status read-only (real) · document update = backend gap reported

The Business (Merchant) app does **not** repeat the onboarding application. A
merchant applies at `/comerciantes/candidatura` (business data + base documents),
the Banzami team reviews and approves, and only then are credentials issued.
Inside the app the merchant just **sees the verification state** and updates
documents when supported — never re-submits the business, the @handle, the legal
representative, estimated volume, category or location.

## Base application documents

* Registo Comercial — `BUSINESS_REGISTRATION`
* NIF da empresa — `TAX_ID`
* Documento do representante — `REPRESENTATIVE_ID`

## Screen — "Verificação do negócio"

`apps/mobile/lib/merchant/screens/kyb_screen.dart`. Three cards:

1. **Estado da verificação** — real KYB status (see below): Em análise / Aprovado
   / Rejeitado / Suspenso.
2. **Documentos da empresa** — the three base documents, each with a state badge
   and an "Atualizar documento" action.
3. **Ações necessárias** — derived from the verification status.

The old in-app KYB **form** (legal name + NIF + representative re-entry, via the
legacy `verifyMerchantKyb` JSON endpoint) is removed.

## Backend audit (what's real vs gap)

| Capability | Backend | App behaviour |
|---|---|---|
| KYB status (read) | **Real** — `GET /v1/compliance/merchants/status` (exposes the existing `GetMerchantStatus` → `{kyb_status, aml_status}`) | Card 1 shows the real state; falls back to the session `verified` flag if the endpoint isn't deployed yet. |
| Per-document status | **Gap** — `merchant_application_documents` is application-scoped (public, keyed by application id); no merchant-authenticated list exists, and there are **no expiry/validity columns** | Document badges show a state **derived from the case-level KYB status** (Válido / Em análise / Rejeitado), not per-document. `Expirado` / `Em falta` are not representable yet. |
| Document update / replace | **Gap** — no merchant-authenticated upload-url/confirm; the document flow is pre-approval, application-scoped | "Atualizar documento" **honestly reports the gap** (directs to support) — it never fakes an upload. |

### Gaps to close (future increment, operator policy — KYB)

A merchant-authenticated KYB document surface, e.g.:

```
GET  /v1/merchant/kyb/documents                       (scoped by principal.MerchantID)
POST /v1/merchant/kyb/documents/{type}/upload-url     (reuse kybstorage signed PUT)
POST /v1/merchant/kyb/documents/{document_id}/confirm (HEAD verify)
```

plus document `valid_until` / `EXPIRED` modelling, would make Card 2 fully real
(per-document `Válido / Em análise / Rejeitado / Expirado / Em falta`) and enable
in-app replace. Until then the app shows status truthfully and reports the update
gap. This is operator policy (no protocol ADR); KYC Consumer is untouched.
