# Runbook — KYC Consumer R2 storage (provisioning & validation)

**Scope:** consumer KYC evidence storage (Banzami ADR-020). KYC is operator
policy (BANZA ADR-029). This runbook provisions the **dedicated** KYC buckets,
their CORS, a scoped R2 token, and the sandbox/staging env — and validates the
flow end-to-end. **Live is documented but not activated without an explicit GO.**

## Bucket convention (decided)

| Purpose | Sandbox bucket | Live bucket | Object prefix |
|---|---|---|---|
| **KYC** consumer evidence | `banzami-kyc-sandbox` | `banzami-kyc-live` | `kyc/consumer/` |
| **KYB** merchant documents | `banzami-kyb-sandbox` | `banzami-kyb-live` | `kyb/` |

- KYC and KYB use **separate buckets**. Consumer KYC evidence **never** reuses a
  KYB bucket.
- Buckets are **private** — no public access, no Public Development URL, no public
  custom domain. Access is only via short-TTL signed PUT/GET (SigV4), HEAD for
  verification.
- R2 account id (S3 endpoint host): `https://<account>.r2.cloudflarestorage.com`,
  region `auto`.

## Object key layout

```
kyc/consumer/{consumer_id}/{case_id}/document-front
kyc/consumer/{consumer_id}/{case_id}/document-back
kyc/consumer/{consumer_id}/{case_id}/passport-main
kyc/consumer/{consumer_id}/{case_id}/selfie
```

Keys are server-generated from a fixed slot enum (no user input in the path).
`storage_key` is never returned to clients and never logged.

## 1. Create the buckets

Cloudflare dashboard → R2 → **Create bucket**: `banzami-kyc-sandbox` and
`banzami-kyc-live`. Do **not** enable any public URL.

(Or, with a `Workers R2 Storage: Edit` Cloudflare API token, via the API:
`POST /accounts/{account_id}/r2/buckets` with `{"name":"banzami-kyc-sandbox"}`.)

## 2. CORS policy

Apply the version-controlled policies (kept in `infra/r2/`):

- `infra/r2/kyc-cors-sandbox.json` → `banzami-kyc-sandbox`
- `infra/r2/kyc-cors-live.json` → `banzami-kyc-live`

Dashboard → bucket → Settings → CORS Policy → paste the JSON. Or via the S3 API
with a credential that can manage the bucket: `PutBucketCors`.

CORS exists **only** to permit the signed upload (PUT/HEAD) and signed download
(GET) from the operator origins — it does not make the bucket public.

## 3. Scoped R2 token

Cloudflare dashboard → R2 → **Manage R2 API Tokens** → Create:
- Permissions: **Object Read & Write** (PUT/GET/HEAD; add Delete only if the
  cleanup/retention tooling needs it).
- Scope: **only** the KYC buckets (`banzami-kyc-sandbox`, `banzami-kyc-live`) if
  bucket scoping is offered; otherwise account-wide but treated as KYC-only by
  convention. Must **not** be the KYB token.
- Record the **Access Key ID** + **Secret Access Key** secretly. Never commit,
  never print, never log.

## 4. Sandbox/staging env

Back up `.env` first. Set (sandbox/staging only — never touch `KYB_STORAGE_*`):

```env
KYC_STORAGE_PROVIDER=r2
KYC_STORAGE_BUCKET=banzami-kyc-sandbox
KYC_STORAGE_PREFIX=kyc/consumer/
KYC_STORAGE_ENDPOINT=https://<account>.r2.cloudflarestorage.com
KYC_STORAGE_REGION=auto
KYC_STORAGE_ACCESS_KEY_ID=<kyc token access key id>
KYC_STORAGE_SECRET_ACCESS_KEY=<kyc token secret>
```

The staging override `docker-compose.staging-kyc.yml` wires these into
`public-api-staging` only. (`KYC_STORAGE_PREFIX` is informational — the code
already hard-codes the `kyc/consumer/` prefix in the storage key builder.)

**Live env** (prepare, do **not** activate without a new GO): identical but
`KYC_STORAGE_BUCKET=banzami-kyc-live` and the live origins CORS.

## 5. Recreate public-api-staging only

```bash
docker compose -f docker-compose.yml \
  -f docker-compose.staging-collections.yml \
  -f docker-compose.staging-kyc.yml \
  up -d --no-deps --force-recreate public-api-staging
```

Do **not** touch `public-api` (live), `api-gateway` (live), `admin-api` (live),
or any live DB. Confirm: container healthy, `/health` OK, boot log shows KYC
storage configured (no "KYC storage not configured" warning), no secrets in logs.

## 6. Validate the flow (sandbox)

1. `POST /v1/kyc/cases` → WAITING_DOCUMENTS
2. `POST …/evidence/upload-url` → signed PUT to `banzami-kyc-sandbox`
3. PUT bytes to R2
4. `POST …/evidence/complete` → HEAD verify → evidence UPLOADED
5. `POST …/submit` → UNDER_REVIEW
6. Admin review via `admin-api` service/test (approve grants the operator level;
   reject/needs-more-info do not)
7. Delete the test objects from `banzami-kyc-sandbox`

Assert: upload uses `banzami-kyc-sandbox`; `storage_key` begins `kyc/consumer/`;
public responses never expose `storage_key`; signed URLs never appear in logs;
evidence becomes UPLOADED only after HEAD verify.

## 7. Isolation checks (KYC vs KYB)

- KYC objects appear **only** in `banzami-kyc-sandbox`, never in
  `banzami-kyb-sandbox`/`banzami-kyb-live`.
- KYB continues to use its own buckets; `KYB_STORAGE_*` unchanged.
- Logs contain no `storage_key`, signed URL, access key, secret, token, or PII.

## Status (2026-06-28)

- **Sandbox provisioned & validated.** Buckets `banzami-kyc-sandbox` /
  `banzami-kyc-live` exist; the scoped **Banzami KYC R2** token (Object Read &
  Write, KYC buckets only) is configured for `public-api-staging` via `.env`
  (`KYC_STORAGE_*`) + `docker-compose.staging-kyc.yml`. Full flow validated end to
  end against `banzami-kyc-sandbox` (upload → R2 PUT → HEAD verify → submit), with
  confirmed isolation (the KYC token is denied 403 on KYB buckets; zero KYC
  objects in any KYB bucket) and no secrets/`storage_key`/signed URLs in logs.
- **CORS pending (dashboard).** The Object-R&W token cannot set bucket CORS
  (`AccessDenied`), so CORS is applied in the dashboard using `infra/r2/`. It is
  **not** needed for the server-side signed PUT/HEAD validated above; it **is**
  needed before browser/mobile origin uploads (SDK/mobile increments).
- **Live activated (2026-06-29).** `banzami-kyc-live` is wired into the live
  `public-api` + `admin-api` (bucket hardcoded in each service block; token /
  endpoint shared via `KYC_STORAGE_*` in `.env`). Migrations `0067` + `0068`
  applied to the live `banzami` DB (schema backup taken first). Full flow
  validated on `api.banzami.com` against `banzami-kyc-live`; test data cleaned.

- Signed URLs are short-TTL (default 300s); there are no permanent public URLs.
- Buckets are private; CORS only enables the signed upload/download from operator
  origins.
- Live KYC storage is **not activated** in this increment.
