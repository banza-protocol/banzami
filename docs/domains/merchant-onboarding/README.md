# Merchant Onboarding — Domain Documentation

## Business Purpose

Merchant onboarding is the process by which a business joins the Banzami network and becomes capable of accepting instant Kwanza payments.

The onboarding domain is Banza's first impression on Angolan merchants. It must be:
- fast (merchants should be accepting payments within minutes, not days),
- low-friction (no unnecessary documentation, no POS hardware required for small merchants),
- locally appropriate (Portuguese-first, AOA-native, Angolan identity document support),
- compliant (BNA KYC/AML requirements must be satisfied before any transaction is processed).

---

## Angola-Specific Context

Banza's target merchants span a wide range:

| Merchant Type | Onboarding Profile |
|---------------|--------------------|
| Cantina / kiosk | Mobile-only; no web; no formal business registration; needs QR immediately |
| Taxi / ride-hailing app | SDK integration; formal business entity; high transaction volume |
| Ecommerce site | SDK or payment link; formal entity; web-based integration |
| Delivery platform | SDK; formal entity; split payout requirements |
| Donation platform (e.g. DOA) | Payment link; may be NGO or individual creator |
| School / institution | Payment request flow; formal entity; fee collection |

Onboarding must serve all of these without excessive friction for the small merchant while satisfying compliance requirements for the enterprise integrator.

---

## Onboarding Flow (Canonical)

### Phase 1 — Registration

Merchant provides:
- Business name (or individual trading name)
- NIF (Número de Identificação Fiscal) — required for formal entities
- Contact phone (Angolan number, +244 format)
- Email
- Primary category (retail, food, transport, services, NGO, individual)

For small merchants (individual / informal):
- B.I. (Bilhete de Identidade) or Passaporte is accepted
- NIF is optional at registration; required before payout is enabled

### Phase 2 — Wallet provisioning

Upon registration:
- A merchant wallet is created immediately
- A default `@handle` is suggested (derivable from business name)
- A static QR is generated and available for download

The merchant can accept test payments immediately in sandbox mode. Live mode requires KYC completion.

### Phase 3 — KYC completion

Required before live settlement is enabled:
- Identity document scan (B.I., Passaporte, or Carta de Condução)
- NIF verification (integration with AGT / tax authority — future)
- Business address (optional for informal merchants)
- Bank account details (for payout: IBAN at an Angolan bank)

KYC is tiered by transaction volume:
- Tier 0 (0–50k AOA/month): B.I. only
- Tier 1 (50k–500k AOA/month): B.I. + NIF
- Tier 2 (500k+ AOA/month): full business documentation required

KYC tier increases are triggered automatically when monthly volume crosses thresholds.

### Phase 4 — SDK integration (for app merchants)

App merchants (taxi, delivery, ecommerce) proceed to SDK integration:
1. API key generated (sandbox + live environments separate)
2. SDK documentation provided in TypeScript, PHP, Go, or Flutter
3. Webhook endpoint registration
4. Sandbox test suite runs to confirm integration

Onboarding is only considered complete for SDK merchants when a successful sandbox transaction has been processed.

---

## Business application lifecycle (as implemented)

Decision records: [ADR-058](../../adr/ADR-058-business-application-lifecycle.md),
[ADR-059](../../adr/ADR-059-one-business-identity-one-kyb-authority.md) (surfaces,
authority hierarchy, state machine, @banza lifecycle). The phases above describe
the product intent; this is what the code does.

Two surfaces reach the same application: the public form (origin
`STANDALONE_BUSINESS`) and a Developer Project's Financial Setup in the Console
(origin `DEVELOPER_PROJECT`; approval also binds the Project). A Project can
instead connect an existing Business with the consent code the Business App
issues. The KYB authority is `merchant_compliance.kyb_status`; `merchants.verified`
is its projection.

| Step | Where | What happens |
|---|---|---|
| Apply | `banzami.com/comerciantes/candidatura` → `POST /v1/merchant/applications` | Application `SUBMITTED`; the requested `@handle` held for 30 days (`APPLICATION` owner). One `Idempotency-Key` per form session; replay returns the same id. |
| Documents | `POST …/documents/upload-url` → PUT to private storage → `…/confirm` | Required: `BUSINESS_REGISTRATION`, `REPRESENTATIVE_ID`. Size ≤ 5 MB; the bytes must be a PDF/JPEG/PNG of the declared type or the object is deleted and the document `REJECTED`. `503 STORAGE_NOT_CONFIGURED` when the stack has no KYB storage. |
| Review | BANZADMIN → `start-review` | `UNDER_REVIEW`. |
| Ask | BANZADMIN → `request-information` (message, emailed) | `INFORMATION_REQUIRED`; the applicant answers at `/comerciantes/candidatura/estado?ref=…` and resubmits. |
| Approve | BANZADMIN → `approve` | New Business: merchant (class `MERCHANT`), wallet, API key, KYB approved, default pricing profile, handle from the application's own hold, login + activation link. `resolution=PROVISIONED_NEW`. Idempotent; a partial failure is `PROVISIONING_FAILED` and approving again resumes. |
| Link | BANZADMIN → `link-existing` (target, typed `@handle`, reason) | Existing Business: documents + KYB attached, nothing created or moved. `resolution=LINKED_EXISTING`. |
| Reject | BANZADMIN → `reject` | `REJECTED`; the application's own handle hold released. |
| Activate | Email link → `POST /v1/merchant/activation/complete` | The Business sets its PIN; the Business App signs in with `@handle` + PIN (24 h session). |

A Business-owned `@handle` can never be requested as new (`HANDLE_OWNED_BY_BUSINESS`)
and a claim to an existing Business needs one to exist (`HANDLE_NOT_A_BUSINESS`).
A login signs in only as the owner of its handle.

Classification (`APPLICATION` / `PLATFORM`) is never set by an application; it
is a separate operator action (ADR-057).

### Onboarding surface: a Developer Project (Developers Console)

One Business identity, several onboarding surfaces, one KYB authority. A
Developer Project gets a Business to receive into on the Console page
**Configuração financeira** (`developers.banzami.com/financeiro`), in exactly two
ways — it is never sent to the public form:

| Path | Console → | What happens |
|---|---|---|
| New Business | `POST /projects/{id}/financial-onboarding/applications` (developer-api; OWNER/ADMIN, CSRF) | The same application as above, same fields, same policy (`GET /v1/merchant/application-requirements`), with the Project and the submitting member taken from the session. Documents then go to the public document endpoints by application reference, exactly as the public form sends them. Reviewed in BANZADMIN; approval provisions the Business and binds the Project. `INFORMATION_REQUIRED` is answered from the Console (replacement upload, then `POST /v1/merchant/applications/{id}/resubmit`). |
| Existing Business | `POST /projects/{id}/financial-onboarding/link` `{code}` | The Business issues a single-use code from the Business App (Perfil → «Ligar a um projeto», `ABCD-EFGH-JKMN`, 10 minutes). Redeeming it is the consent: the Project is bound to that Business; nothing is re-verified or re-created. |

The Console renders the onboarding state developer-api reports
(`NOT_CONFIGURED`, `IN_REVIEW`, `INFORMATION_REQUIRED`, `APPROVED_PROVISIONING`,
`REJECTED`, `READY`, `BLOCKED`) and decides nothing; only OWNER and ADMIN are
offered actions. The one-click Sandbox setup (`POST /projects/{id}/financial-setup`)
that created a synthetic, self-approved Business is retired — the server answers
`410 FINANCIAL_SETUP_BY_REVIEW` and no Console code calls it (guarded by
`apps/website/app/developers/financial-onboarding-guard.test.ts`).

---

## Merchant Profile

Each merchant has a `merchant_profile` record that controls the public-facing presentation on `pay.banzami.com/profiles/{handle}`.

Fields:
- `handle` — unique, @handle-addressable (e.g. `@cantina.luanda`)
- `display_name` — public business name
- `tagline` — short description (max 120 chars)
- `description` — longer merchant description
- `category` — business category (mapped to display labels in pt-AO)
- `logo_url` — merchant logo
- `cover_url` — cover image for the profile page
- `social_links` — Instagram, Facebook, WhatsApp, Website
- `public` — controls whether the profile page is publicly accessible

The profile page is the consumer-facing entry point for payment links and direct QR payments. It must load fast on Angolan mobile networks (data-constrained).

---

## @Handle Rules

The `@handle` is the payment identity. It is:
- permanent once set (cannot be changed without support ticket),
- lowercased, alphanumeric with periods and underscores allowed,
- globally unique across the Banzami network,
- the primary address for P2P and merchant payments.

Handle format: `[a-z0-9][a-z0-9._]{2,29}`

Prohibited:
- reserved system handles (`banzami`, `admin`, `support`, `pay`, `api`, etc.),
- handles that impersonate banks or government entities,
- handles containing slurs or offensive terms.

---

## API Endpoints (internal)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/merchants` | Register a new merchant |
| `GET` | `/v1/merchants/{id}` | Get merchant by ID |
| `PUT` | `/v1/merchants/{id}` | Update merchant details |
| `POST` | `/v1/merchants/{id}/kyc` | Submit KYC documents |
| `GET` | `/v1/merchants/{id}/kyc/status` | KYC review status |
| `GET` | `/internal/v1/merchant-profiles/by-handle/{handle}` | Public profile lookup (core-api internal) |
| `GET` | `/public/profiles/{handle}` | Public merchant profile (api-gateway, no auth) |

---

## Invariants

1. **No live settlement before KYC Tier 0 is satisfied.** A merchant wallet accepts credits but cannot disburse until identity verification is complete.
2. **Handle is immutable.** Once a handle is associated with a merchant, it cannot be reassigned. This protects the @handle identity system.
3. **Wallet is provisioned at registration.** The merchant can receive test payments immediately. Live payments require KYC.
4. **API keys are environment-scoped.** Sandbox keys (`bz_sandbox_*`) and live keys (`bz_live_*`) are completely separate. Mixing is rejected at the API layer.

---

## Failure Scenarios

### Duplicate NIF

If a NIF is already registered, the system must:
- reject the new registration,
- not reveal any information about the existing merchant,
- return a clear error code `NIF_ALREADY_REGISTERED`.

### KYC rejection

If KYC documents are rejected:
- the merchant is notified via email and in-dashboard alert,
- the wallet remains provisioned but live mode remains disabled,
- a reason is provided (poor image quality, document expired, mismatch, etc.),
- the merchant may resubmit.

### Handle conflict

If the merchant's preferred handle is taken:
- suggest alternatives derived from the business name,
- never silently assign a different handle.

---

## Observability

Implemented (Gateway `/metrics`, `services/api-gateway/internal/handler/business_metrics.go`).
Every label is a closed vocabulary — never an application id, merchant id,
handle, email, NIF or IP.

| Metric | Labels | Meaning |
|--------|--------|---------|
| `banzami_business_application_events_total` | `action` (submit, start_review, approve, link_existing, reject, reissue_activation), `result` (ok, replayed, refused, failed) | The application funnel and its refusals. `failed` is a 5xx an operator must look at. |
| `banzami_business_application_documents_total` | `result` (uploaded, content_mismatch, refused, storage_unavailable, failed) | Applicant document uploads. |
| `banzami_business_auth_total` | `result` (issued, refused, locked, handle_owner_mismatch) | Business App sign-ins. `handle_owner_mismatch` > 0 is a data defect, not a user error. |
| `banzami_business_tenant_denials_total` | `surface` (wallet) | A Business reaching for another Business's wallet (answered 404). |

Still to build (intent, not implemented): time from application to first
payment; KYB rejection reasons by class.

---

## Security Considerations

- KYB documents live in a private bucket (Cloudflare R2, encrypted at rest by the provider); the database stores only bucket + a non-guessable key; operators read them through short-lived signed URLs.
- Documents are checked by their bytes (magic bytes), not by their declared type. **No malware scanning is performed.**
- KYB document access is logged and auditable.
- API keys are hashed (SHA-256) at rest; the raw key is shown only once at creation.
- NIF is stored hashed for duplicate-check purposes; the plaintext is retained only for regulatory reporting under BNA requirements.
- Webhook secrets are hashed at rest; used only for HMAC signature generation.

---

## References

- [ADR-014 — Angola-First National Mission](../../adr/ADR-014-angola-national-mission.md)
- [ADR-013 — Wallet-Native Payment Network Identity](../../adr/ADR-013-wallet-native-identity.md)
- [ADR-012 — SDK-First Ecosystem](../../adr/ADR-012-sdk-first-ecosystem.md)
- [Domain: Merchants](../merchants/README.md)
- [Domain: Identity](../identity/README.md)
- [Domain: Wallets](../wallets/README.md)
- [CLAUDE.md §7 — Security Standards](../../CLAUDE.md)
- BNA — Regulamento de Pagamentos Electrónicos (reference for KYC tier thresholds)
