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

## Merchant Profile

Each merchant has a `merchant_profile` record that controls the public-facing presentation on `pay.banzami.org/profiles/{handle}`.

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

Onboarding funnel metrics to track:

| Metric | Description |
|--------|-------------|
| `merchant_registrations_total` | Total registrations by day |
| `kyc_submissions_total` | KYC submissions by tier |
| `kyc_approval_rate` | Approved / submitted by tier |
| `kyc_rejection_reasons` | Top rejection reasons by label |
| `time_to_first_live_payment` | Duration from registration to first successful live transaction |
| `sdk_integration_completions` | Merchants who completed a sandbox transaction |

Time-to-first-live-payment is the primary onboarding health metric. If this grows, friction has increased somewhere in the funnel.

---

## Security Considerations

- KYC documents are stored encrypted at rest (AES-256).
- KYC document access is logged and auditable.
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
