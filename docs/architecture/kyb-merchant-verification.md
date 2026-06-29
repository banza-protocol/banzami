# KYB — Business verification inside the Merchant app

**Status:** Implemented (merchant-authenticated documents, real lifecycle) ·
operator policy — KYB · not deployed to live without GO

The Business (Merchant) app does **not** repeat the onboarding application. A
merchant applies at `/comerciantes/candidatura` (business data + base documents),
the Banzami team reviews and approves, and only then are credentials issued.
Inside the app the merchant **sees the real verification state** and **updates
documents**, never re-submitting the business, the @handle, the legal
representative, estimated volume, category or location.

## Two document stores (application vs merchant)

| Store | Scope | Lifetime | Purpose |
|---|---|---|---|
| `merchant_application_documents` | application-scoped (public apply flow) | the application | the documents sent at apply time — **history, preserved** |
| `merchant_kyb_documents` | **merchant-scoped** (authenticated) | post-approval | the documents the merchant maintains in-app — **source of truth** |

On merchant approval the application's documents are linked to the new merchant
and **bridged** into `merchant_kyb_documents` as `VALID` (the application rows are
never lost). See `BridgeFromApplicationTx`.

## Document model (`merchant_kyb_documents`, migration 0069)

Three canonical slots: `COMMERCIAL_REGISTRATION` (Registo Comercial),
`COMPANY_TAX_ID` (NIF da empresa), `REPRESENTATIVE_ID` (Documento do representante).

Lifecycle: `MISSING` (no row) → `PENDING_UPLOAD` (upload-url) → `PENDING_REVIEW`
(complete, HEAD-verified) → `VALID` | `REJECTED` (reason required) → `EXPIRED`
(`valid_until` passed; never deletes) / `REPLACED` (superseded by a newer accepted
doc). Fields: `valid_until`, `rejection_reason`, `replaced_by_document_id`,
`sha256`, `mime_type`, `size_bytes`, `submitted_at`, `reviewed_at`. Plus a
`merchant_kyb_events` outbox (idempotent; no PII / storage_key / signed URL).

## Storage

KYB R2 buckets (`banzami-kyb-sandbox` / `banzami-kyb-live`), **never** KYC. Key
prefix `kyb/merchant/{merchant_id}/{document_type}/{document_id}`. The DB holds
only `{bucket, storage_key, mime, sha256, size}`; signed short-TTL PUT (merchant)
/ GET (admin). MIME allowlist: PDF/JPEG/PNG; max size enforced (`KYB_MAX_FILE_SIZE_BYTES`).

## APIs

Merchant (gateway, merchant-authenticated):

```
GET  /v1/merchant/kyb/status                     status + 3 document slots
GET  /v1/merchant/kyb/documents
GET  /v1/merchant/kyb/documents/{id}
POST /v1/merchant/kyb/documents/{type}/upload-url  signed PUT
POST /v1/merchant/kyb/documents/{id}/complete      HEAD verify -> PENDING_REVIEW
```

Admin (admin-api → gateway internal):

```
GET  /admin/v1/merchant-kyb/documents             list (signed download URLs)
POST /admin/v1/merchant-kyb/documents/{id}/approve   {valid_until?}; all VALID -> KYB APPROVED
POST /admin/v1/merchant-kyb/documents/{id}/reject    {rejection_reason}
```

Approval supersedes the prior current document of the same type (`REPLACED`) and,
when all required types are `VALID`, promotes `merchant_compliance.kyb_status` to
`APPROVED`. The KYB level changes **only** via an admin decision — never an upload.

## App — "Verificação do negócio"

`apps/mobile/lib/merchant/screens/kyb_screen.dart`: Estado da verificação (Em
análise / Aprovado / Rejeitado / Suspenso / Documentos necessários / Documentos
expirados) · Documentos da empresa (each: real status, submitted/validity dates,
rejection reason, "Atualizar documento" → pick image → signed PUT → complete) ·
Ações necessárias. No application form, no fake upload.

## Security & ownership

A merchant sees only its own documents; cross-merchant access → 404. `storage_key`
never returned to clients; signed URLs never logged; logs carry no NIF / names /
document numbers. HEAD verify before accepting; MIME allowlist + max size; sha256.
KYB buckets separate from KYC; no permanent public URLs.

## Admin review UI (BANZADMIN)

`apps/admin` → **Documentos KYB** (`/merchant-kyb`) lists post-approval
`merchant_kyb_documents` (distinct from the application-doc section), filter by
status, open via the short-TTL signed `download_url`, approve (optional
`valid_until`) / reject (reason required). It shows an **environment badge**
(LIVE/SANDBOX, inferred from the admin-api host) and an env-aware empty state —
because the portal reads a single environment, a Business app in a *different*
environment (e.g. app=SANDBOX, portal=LIVE) won't show its docs there, by design.

## Stale-merchant guard

The merchant KYB endpoints verify the JWT's `merchant_id` still exists in
`merchants` before any read/write; a deleted/stale merchant gets `401
INVALID_SESSION` and **no orphan `merchant_kyb_documents` are created**.

## Limitations / remaining

- **Upload is image-only in the app** (camera/gallery via `image_picker`, sent as
  `image/jpeg`). PDF upload would need a file picker (`file_picker`) — backend
  already accepts PDF.
- **Admin review UI** lives in BANZADMIN (web); the admin **APIs** are ready here.
- **Not deployed to live** (migration `0069` + gateway/admin-api) without a GO;
  works in sandbox once deployed.
