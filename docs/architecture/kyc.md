# KYC — Consumer Identity Verification (architecture)

**Status:** Increment 4 — backend + Flutter SDK + Consumer mobile implemented · **Authority:** Banzami ADR-020 · BANZA ADR-038 (KYC = operator policy)

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

## Storage layout (R2, dedicated buckets — separate from KYB)

KYC uses its **own** R2 buckets, never a KYB bucket:

| Purpose | Sandbox | Live | Prefix |
|---|---|---|---|
| **KYC** consumer evidence | `banzami-kyc-sandbox` | `banzami-kyc-live` | `kyc/consumer/` |
| **KYB** merchant documents | `banzami-kyb-sandbox` | `banzami-kyb-live` | `kyb/` |

```
kyc/consumer/{consumer_id}/{case_id}/document-front
kyc/consumer/{consumer_id}/{case_id}/document-back
kyc/consumer/{consumer_id}/{case_id}/passport-main
kyc/consumer/{consumer_id}/{case_id}/selfie
```

Never mixed with merchant KYB documents. Buckets are **private** (no public URL,
no public domain); access is only via short-TTL signed PUT/GET (SigV4) + HEAD.
CORS on the KYC buckets exists only to permit the signed upload/download from the
operator origins. A KYC-scoped R2 token (not the KYB token) is used. See the
provisioning runbook: [docs/runbooks/kyc-r2-storage.md](../runbooks/kyc-r2-storage.md)
and the CORS policies in `infra/r2/`. Live storage is documented but **not
activated** until an explicit GO.

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

## Implementation (Increment 2 — backend)

Migration `db/migrations/0067_kyc_schema.sql` (`kyc_cases`, `kyc_documents`,
`kyc_evidence`, `kyc_reviews`, `kyc_events`).

- **Consumer** (`public-api`): `internal/kycstorage` (R2 signed PUT/GET, SigV4),
  `internal/service/kyc.go` (state machine, persistence, HEAD-verify, outbox),
  `internal/handler/kyc.go` → the `/v1/kyc/*` routes. Upload is a signed PUT
  straight to R2; `evidence/complete` HEAD-verifies before marking UPLOADED; a
  case reaches `DOCUMENTS_RECEIVED` only when every required slot is uploaded and
  `UNDER_REVIEW` only on submit.
- **Review** (`admin-api`): `internal/service/kyc_review.go` +
  `internal/handler/kyc.go` → `/admin/v1/kyc/cases…/approve|reject|request-more-info`.
  The operator decides `granted_level`; an approval is the only thing that writes
  `customer_compliance.kyc_level`. Evidence is viewed via short-TTL signed GET.
  View reuses `consumer.view`; decisions reuse `compliance.review`.
- **Events**: `kyc_events` is an operator-internal transactional outbox written in
  the same tx as the state change, idempotency-keyed (not merchant webhooks, not
  protocol events). Ownership is enforced (cross-subject → 404); no PII /
  storage_key / signed URL is logged. `KYC_STORAGE_*` unset → uploads return 503,
  startup unaffected.

## Boundaries

- **Untouched:** Collections, Ledger, Transfers, Settlement, PaymentIntent.
- **Protocol untouched** (BANZA ADR-038): KYC is operator policy; only future
  signed Trust Assertions (federation) could ever be protocol-level.
