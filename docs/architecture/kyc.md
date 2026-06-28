# KYC — Consumer Identity Verification (architecture)

**Status:** Design (Increment 1) · **Authority:** Banzami ADR-020 · BANZA ADR-038 (KYC = operator policy)

Banzami's first official consumer identity verification. Real evidence (document
+ selfie), real review, operator-decided level. Files live in **Cloudflare R2**;
the database holds only references. **The protocol does not define KYC** (BANZA
ADR-038) — this is entirely operator-owned.

## Domain model

```
   KycCase (aggregate root)            — one verification attempt
   status · reason_code · subject_id
        │ 1:N
        ├──────────────▶ KycDocument   — IDENTITY_CARD | PASSPORT | RESIDENCE_PERMIT | DRIVING_LICENSE
        │                    │ 1:N
        │                    ▼
        └──────────────▶ KycEvidence   — DOCUMENT_IMAGE | SELFIE | LIVENESS_VIDEO | PROOF_OF_ADDRESS
        │                  storage_key (R2) · sha256 · mime · size   (never the bytes)
        ▼
      KycReview            — SYSTEM | HUMAN | VENDOR -> APPROVED | REJECTED | NEEDS_MORE_INFO
        │ on APPROVED
        ▼
   customer_compliance.kyc_level   (limits lifted only here)
```

## State machine

```
DRAFT ─▶ WAITING_DOCUMENTS ─▶ DOCUMENTS_RECEIVED ─▶ UNDER_REVIEW ─▶ APPROVED  (terminal)
                                                          ├─▶ REJECTED         (reason_code)
                                                          └─▶ NEEDS_MORE_INFO  (names missing evidence)
            (any non-terminal) ─▶ CANCELLED | EXPIRED | FAILED  (terminal)
```
`DOCUMENTS_RECEIVED` only when all required evidence is `UPLOADED`; `UNDER_REVIEW`
only on submit; `APPROVED` only via a real review. No auto-approval; no level
change without an approval.

Required evidence: IDENTITY_CARD/RESIDENCE_PERMIT/DRIVING_LICENSE → FRONT+BACK+SELFIE;
PASSPORT → MAIN_PAGE+SELFIE. (Angola v1: IDENTITY_CARD, PASSPORT.)

## Upload flow (signed URL, multipart → R2)

```
Mobile                          Operator (api-gateway/public-api)        R2
  │ POST /v1/kyc/cases ─────────▶ create KycCase (WAITING_DOCUMENTS)
  │ POST …/evidence/upload-url ─▶ build storage_key, KycEvidence PENDING,
  │                               sign short-TTL PUT  ───────────────────────▶
  │ PUT image bytes ───────────────────────────────────────────────────────▶ stored
  │ POST …/evidence/complete ───▶ HEAD verify (mime/size/sha256), evidence UPLOADED
  │   …repeat for each required side + selfie…
  │ POST …/cases/{id}/submit ───▶ all required present? -> UNDER_REVIEW
  │ GET  …/cases/{id}/status ◀──  status (no storage_key, no PII)
```
The image bytes go **directly to R2** via the signed PUT; the API never carries
the bytes and the `storage_key` is never returned to the client.

## Storage layout (R2, separate from KYB)

```
kyc/consumer/{consumer_id}/{case_id}/document-front
kyc/consumer/{consumer_id}/{case_id}/document-back
kyc/consumer/{consumer_id}/{case_id}/passport-main
kyc/consumer/{consumer_id}/{case_id}/selfie
```
Never mixed with merchant KYB documents. Reuses the existing signed-URL R2
abstraction (SigV4 presigner).

## APIs

Consumer: `POST /v1/kyc/cases`, `GET /v1/kyc/cases/current`, `GET …/{id}`,
`POST …/{id}/evidence/upload-url`, `POST …/{id}/evidence/complete`,
`POST …/{id}/submit`, `GET …/{id}/status`. **No `requested_level`** — the consumer
never picks the level.

Admin (UI later; backend prepared): `GET /admin/v1/kyc/cases`, `GET …/{id}`
(signed short-TTL evidence download), `POST …/{id}/approve|reject|request-more-info`.

## Events (outbox)

`kyc.case.created`, `kyc.document.uploaded`, `kyc.selfie.uploaded`,
`kyc.review.started`, `kyc.review.completed`, `kyc.approved`, `kyc.rejected`,
`kyc.expired` — idempotency-keyed, auditable, operator-internal (not protocol
events).

## Security & privacy

- DB stores references + `sha256`, never bytes; R2 holds the files.
- Short-TTL signed PUT (upload) / signed GET (admin download only); no permanent
  public URLs.
- `mime_type` + size validated; AV scan reserved (later).
- Ownership: consumer sees only its own case; merchant never sees a consumer case;
  cross-subject → 404.
- **No PII / storage_key / signed URL / token in logs.** `retention_until` per
  evidence; deletion + regulatory export future-ready.

## Boundaries

- **Untouched:** Collections, Ledger, Transfers, Settlement, PaymentIntent.
- **Protocol untouched** (BANZA ADR-038): KYC is operator policy; only future
  signed Trust Assertions (federation) could ever be protocol-level.
