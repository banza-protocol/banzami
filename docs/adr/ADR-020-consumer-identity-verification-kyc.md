# ADR-020: Consumer Identity Verification (KYC)

**Status:** Accepted (design) — implementation in increments  
**Date:** 2026-06-28  
**Authors:** Banzami Engineering  
**Supersedes:** —  
**Related:** BANZA ADR-038 (KYC operator boundary & Trust Assertions) · BANZA ADR-035 (Protocol-first) · [BANZA-PROTOCOL-VS-OPERATOR-POLICY](https://github.com/banza-protocol/banza/blob/main/docs/governance/BANZA-PROTOCOL-VS-OPERATOR-POLICY.md) · [ADR-019](ADR-019-protocol-first-product-development.md)

---

## Context

Banzami needs a real, production-grade consumer **identity verification (KYC)**:
the consumer captures a document and a selfie, submits them as evidence, and an
operator review decides the outcome — which updates the wallet's KYC level and
limits. This is the **first official KYC implementation** of the operator; the
prior `Verificar identidade` screen (a JSON-only form posting
`/v1/compliance/customers/verify` with `full_name/document_number/date_of_birth/
requested_level`, **no document or image upload**) is a discarded prototype, not a
v1. We do not call this work "v2".

**Protocol boundary (BANZA ADR-038):** KYC is **operator policy**. The BANZA
protocol defines no documents, OCR, selfies, AML, or review workflow. Everything
here is operator-owned. The only future protocol-level aspect is signed
cross-operator **Trust Assertions** (federation) — out of scope here.

## Decision

Introduce an operator-owned **KYC domain** built on real evidence and a real
review workflow. Files never live in the database; document/selfie images are
uploaded to **Cloudflare R2** via short-lived signed URLs; the database stores
only references (storage_key, mime, sha256, size). The **operator decides the
level** — the consumer never picks it.

### Domain model (aggregates)

**KycCase** (aggregate root) — one verification attempt for a subject.
- `id`, `operator_id`, `subject_type` (`CONSUMER` for now; `MERCHANT_PERSON` /
  `BUSINESS_OWNER` reserved), `subject_id`
- `status` (state machine below), `reason_code?`
- `created_at`, `submitted_at?`, `reviewed_at?`, `expires_at?`
- `metadata`, `version` (optimistic concurrency)
- **No level field chosen by the user.** The granted level is an *outcome* of the
  review (written to `customer_compliance.kyc_level`), not an input.

**KycDocument** — a document presented in a case.
- `id`, `case_id`, `document_type` (`IDENTITY_CARD` | `PASSPORT` |
  `RESIDENCE_PERMIT` | `DRIVING_LICENSE`), `country?`
- one or more required **sides** (below); `status`; `extracted_data?` (OCR, future)
- `created_at`, `metadata`

**KycEvidence** — a single uploaded artifact (its own aggregate; never holds the
bytes).
- `id`, `case_id`, `document_id?` (null for a selfie), `evidence_type`
  (`DOCUMENT_IMAGE` | `SELFIE` | `LIVENESS_VIDEO` | `PROOF_OF_ADDRESS`),
  `side?` (`FRONT` | `BACK` | `MAIN_PAGE` | `SELFIE`)
- `storage_key` (R2 — **never returned to clients/logs**), `bucket`, `mime_type`,
  `sha256`, `size_bytes`, `status` (`PENDING` | `UPLOADED` | `FAILED`),
  `captured_at?`, `uploaded_at?`, `retention_until?`, `metadata`

**KycReview** — a decision on a case.
- `id`, `case_id`, `reviewer_type` (`SYSTEM` | `HUMAN` | `VENDOR`),
  `decision` (`APPROVED` | `REJECTED` | `NEEDS_MORE_INFO`), `reason_code?`,
  `granted_level?` (operator-decided), `notes?`, `created_at`

### State machine (KycCase)

```
DRAFT ──▶ WAITING_DOCUMENTS ──▶ DOCUMENTS_RECEIVED ──▶ UNDER_REVIEW ──▶ APPROVED
  │              │                      │                    │
  │              │                      │                    ├──▶ REJECTED        (reason_code required)
  │              │                      │                    └──▶ NEEDS_MORE_INFO (missing evidence named)
  └──────────────┴──────────────────────┴────────────────────────▶ CANCELLED
                                                          (any non-terminal) ──▶ EXPIRED / FAILED
```

- `DRAFT → WAITING_DOCUMENTS` on case creation with a chosen document type.
- `→ DOCUMENTS_RECEIVED` only when **all required evidence is UPLOADED** (per the
  document rules below) — never on a client claim.
- `→ UNDER_REVIEW` on **submit** (the consumer cannot self-approve).
- `APPROVED` only via a real `KycReview` decision (operator). `REJECTED` requires a
  `reason_code`. `NEEDS_MORE_INFO` names the missing evidence and returns the case
  to `WAITING_DOCUMENTS`.
- `EXPIRED` (deadline passed), `CANCELLED` (subject/operator), `FAILED` (terminal
  error) are terminal. Terminal states accept no further transitions. **No
  automatic approval. No level change without an approval.**

Evidence required by document type:

| Document | Required evidence |
|---|---|
| `IDENTITY_CARD` (Bilhete de Identidade) | FRONT + BACK + SELFIE |
| `PASSPORT` | MAIN_PAGE + SELFIE |
| `RESIDENCE_PERMIT` | FRONT + BACK + SELFIE |
| `DRIVING_LICENSE` | FRONT + BACK + SELFIE |

Angola v1 surfaces `IDENTITY_CARD` and `PASSPORT`; the others are modelled.

### Storage (Cloudflare R2)

Reuse the existing signed-URL R2 abstraction (the merchant-KYB `kybstorage`
pattern: signed PUT/GET, SigV4, HEAD), under a **separate** consumer KYC prefix —
never mixed with KYB business documents:

```
kyc/consumer/{consumer_id}/{case_id}/document-front
kyc/consumer/{consumer_id}/{case_id}/document-back
kyc/consumer/{consumer_id}/{case_id}/passport-main
kyc/consumer/{consumer_id}/{case_id}/selfie
```

The bucket/key segments are server-generated; the storage_key is never exposed to
the client or logs. Upload is **multipart to R2 via a short-lived signed PUT URL**,
not JSON-in-the-API.

### APIs (operator surface — consumer)

A new `/v1/kyc` surface (the legacy `/v1/compliance/customers/verify` stays as
**legacy/internal**, no longer the consumer path; it does **not** accept a
user-chosen `requested_level`):

```
POST /v1/kyc/cases                          create a case (document_type)
GET  /v1/kyc/cases/current                  the caller's active case + status
GET  /v1/kyc/cases/{id}
POST /v1/kyc/cases/{id}/evidence/upload-url  signed PUT URL for FRONT/BACK/MAIN_PAGE/SELFIE
POST /v1/kyc/cases/{id}/evidence/complete    confirm an upload (HEAD verify) -> evidence UPLOADED
POST /v1/kyc/cases/{id}/submit               -> UNDER_REVIEW (only when required evidence present)
GET  /v1/kyc/cases/{id}/status
```

Admin/review (admin-api; UI out of scope, backend prepared):

```
GET  /admin/v1/kyc/cases            list / filter by status
GET  /admin/v1/kyc/cases/{id}       case + evidence (signed, short-TTL download)
POST /admin/v1/kyc/cases/{id}/approve         (operator decides granted_level)
POST /admin/v1/kyc/cases/{id}/reject          (reason_code required)
POST /admin/v1/kyc/cases/{id}/request-more-info
```

### "Nível pretendido" is removed

The consumer **never chooses** the KYC level. The mobile UI shows no level
dropdown; the public consumer API does not accept `requested_level`. The granted
level is decided by the operator/review from document type + evidence + compliance
rules + risk, and written to `customer_compliance.kyc_level` only on `APPROVED`.
Any existing `requested_level` field is treated as legacy/internal.

### Events (operator outbox)

Emitted via the existing transactional outbox, idempotency-keyed, auditable:
`kyc.case.created`, `kyc.document.uploaded`, `kyc.selfie.uploaded`,
`kyc.review.started`, `kyc.review.completed`, `kyc.approved`, `kyc.rejected`,
`kyc.expired`. (Operator-internal events; not protocol events — BANZA ADR-038.)

### Relationship to existing compliance

The case outcome updates `customer_compliance` (`kyc_level`, `status`) — the same
record the progressive-KYC gates already read. **No change** to the ledger,
transfers, settlement, PaymentIntent, or Collections. Limits are lifted only when
a real review approves a level.

## Security & privacy

- **PII minimization:** the DB stores references + hashes, never document/selfie
  bytes; files live in R2 only.
- **Signed URLs:** short-TTL signed PUT (upload) and signed GET (admin download
  only); **no permanent public URLs**.
- **Integrity:** `sha256` per evidence; `mime_type` + size validated; (antivirus
  scanning reserved for a later increment).
- **Ownership:** a consumer sees only their own case; a merchant never sees a
  consumer case; cross-subject access returns 404.
- **No PII / no storage refs / no signed URLs / no tokens in logs.** Retention
  policy via `retention_until`; deletion policy and regulatory export are
  future-ready.

## Non-goals (this ADR / increment)

- No OCR or liveness implementation (the model reserves `extracted_data` and
  `LIVENESS_VIDEO`/`evidence_type`; not wired now).
- No changes to Collections / Ledger / Transfers / Settlement / PaymentIntent.
- No protocol change (BANZA ADR-038): KYC stays operator policy.
- No automatic approval; no level change without an approval.

## Increment plan

1. **(this) Architecture & domain ADR** + BANZA boundary note (ADR-038) + `docs/architecture/kyc.md`.
2. **Backend:** migrations (`kyc_cases`, `kyc_documents`, `kyc_evidence`,
   `kyc_reviews`), domain crate, R2 consumer-KYC storage, `/v1/kyc/*` + admin
   review APIs, outbox events, real-DB + ownership tests.
3. **SDK:** `createKycCase`, `getCurrentKycCase`, `requestKycUploadUrl`,
   `completeKycEvidenceUpload`, `submitKycCase`, `getKycStatus` (no R2 details
   beyond the signed URL; no PII logged).
4. **Mobile (Consumer):** replace the old screen — intro → choose document →
   capture (BI front+back / passport main page) → selfie → review → submit →
   status. BanzamiAppBar compact, off-white, premium cards, no level dropdown,
   document-first, honest states (real upload, real `UNDER_REVIEW`).

## Consequences

- A real, auditable, extensible KYC: real evidence, real review, no fake upload,
  no fake approval, operator-decided level.
- The protocol is untouched; the operator owns KYC end-to-end (ADR-038/ADR-035).
- Each increment ships and is reviewed independently; nothing is deployed/pushed
  without explicit GO.
