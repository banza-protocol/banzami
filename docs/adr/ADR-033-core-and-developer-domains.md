# ADR-033 — Account Identity / Business / Developer / Core: Four-Domain Separation

**Status:** Accepted · **Date:** 2026-07-02 · **Supersedes:** none ·
**Relates to:** ADR-019 (protocol-first product development), ADR-025 (platform
mode / env router), ADR-028 (application business account), ADR-032 (application
integration engine), BANZA ADR-035 (protocol-first).

## Context

The Banzami Developers Portal frontend exists (login, verify, dashboard, API
keys, webhooks, logs, go-live, settings, docs) but is powered by mock data. The
next phase makes it a real developer platform.

An initial proposal modelled a *Developer Organization* as the same aggregate as
a *Business / Merchant account*. **That is rejected.** A software house that
integrates Banzami (an ERP vendor, a marketplace, an agency) is a fundamentally
different thing from a restaurant that receives money. Coupling them would:

- force a wallet / KYB / settlement onto every developer who never handles money,
- create two sources of truth for money-adjacent configuration,
- and violate protocol-first governance (grouping settlement/keys by a new
  "project" aggregate is a financial/protocolar concept — ADR-019 / BANZA-035).

Banzami already implements the Business domain (merchants, wallet, KYB,
settlement, API keys, webhooks) and the operator financial kernel that consumes
BANZA contracts. What is missing is (a) a human **Account Identity** layer with
Email+OTP SSO and (b) an independent **Developer** domain.

## Terminology (kept strictly distinct)

- **BANZA** — the open protocol: invariants, contracts, event names, webhook
  conventions, certification and federation rules. Owned by `~/banza`.
- **Banzami Core** ("**Core**") — the reference operator financial engine that
  implements and consumes BANZA contracts. It is the operator-side financial
  kernel and the **only writer of financial state**. BANZA event names, webhook
  contracts and protocol rules are **consumed** from BANZA and are **never
  invented locally**.
- **Account Identity** — the human account used for authentication, OTP,
  sessions and SSO.
- **@banza** — the Banzami payment handle / username used in the payment network.
  This is **not** Account Identity; the two concepts must remain distinct.

## Decision

Banzami is organised into **four independent bounded contexts**: **Account
Identity**, **Business**, **Developer**, **Core**. They reference one another by
**opaque IDs, APIs, commands or events only** — no merged models, no
cross-context foreign keys, no cross-schema reads.

### Domain 1 — Account Identity (a human)

`User` = a human account. Auth V1: **Email + OTP**, HttpOnly cookie sessions;
future SSO. Owns `identity_users`, `identity_otp_codes`, `identity_sessions`.
**Never assumes** Business or Developer. A `User` may simultaneously be a Business
owner/employee, a Developer member and an Admin — via *memberships*, never via
role columns on the user.

### Domain 2 — Business (a merchant) — ALREADY EXISTS, REUSED, UNTOUCHED

The existing merchant financial and legal domain: wallets, KYB, settlement and
merchant capabilities (`merchants`, `merchant_compliance`, `merchant_kyb_*`,
`merchant_applications`, wallet/settlement). **Reused and not touched by this
ADR.** Business members reference Account Identity.

### Domain 3 — Developer (an integrator) — NEW, INDEPENDENT

A software house / ERP / marketplace / agency / freelancer that integrates
Banzami. A Developer does **not** necessarily receive money. Owns:

`Developer Workspace → Members → Projects → (Sandbox | Live) → API Keys,
Webhooks, Logs, Events`.

Developer members reference **Account Identity by opaque ID only**. A `User` may
belong to multiple workspaces. **Sandbox does not require a Business Account.**
The Developer domain **reuses Core / BANZA capabilities** (webhook
signing/delivery, event definitions, key-hashing conventions) — it never
reinvents them and never invents financial event names.

### Domain 4 — Core (the financial kernel) — ALREADY EXISTS, REUSED

The Banzami financial kernel and operator-side implementation of BANZA
contracts: payments, transfers, refunds, ledger, events, notifications,
settlement, risk, compliance, currency, FX. **Financial state remains owned
exclusively by the Core**, which is the single financial truth and sole writer of
financial data. Event and webhook **type names are BANZA contracts**
(`~/banza/contracts/events/*`); Core exposes them and Developer consumes them.

### Business ↔ Developer intersection (Live activation)

Business and Developer are **independent — not parent/child**.

```
Business  = the financial and legal principal.
Developer = the technical integration principal.
```

However, a project that **receives, routes, settles or controls real value** must
have an **explicit, auditable, capability-scoped** link to an **approved Business
Account**. The link is **never a creation dependency** — a Developer Workspace and
its Sandbox projects exist with no Business whatsoever.

```
Developer Project (Sandbox)
        │  request Live for a capability
        ▼
Select an existing approved Business the user is authorised for  ── or ──
        │                         create/complete one via the Business product
        ▼
KYB approved + settlement account ready (snapshotted onto the link)
        ▼
dev_project_business_link → active   (capability-scoped, audited)
        ▼
Live capability enabled for that project
```

A Project must be able to link to **more than one** approved Business Account in
future. Therefore **do not add `business_id` (or `merchant_id`) directly to
`dev_projects`** — the relationship lives only in the link record:

```
dev_project_business_link
  id
  project_id
  merchant_id
  environment
  status
  requested_by_user_id
  approved_by_user_id
  authorization_reference
  capabilities                 -- capability-scoped grant (e.g. collect, settle)
  kyb_snapshot_status          -- snapshot at link time; Business remains source of truth
  settlement_snapshot_status
  activated_at
  revoked_at
  created_at
  updated_at
```

States:

```
requested → awaiting_business_approval → awaiting_kyb → awaiting_settlement
          → active → (suspended | revoked)
```

### Session-cookie & SSO boundary

For Slice 1, Account Identity sessions are **issued and consumed only by
`developer-api.banzami.com`**. Cookies are **secure host-only**:

```
Secure
HttpOnly
SameSite=Lax
__Host- prefix where technically possible
```

**Never** issue a parent-domain cookie (`Domain=.banzami.com`). The Developer
Portal, Business Dashboard, Admin Portal and consumer surfaces **must not
validate one another's session cookies**.

Before Business or Admin authentication consumes Account Identity, the context is
**extracted** into `services/identity-api`. Future cross-portal SSO must use a
**central redirect-based identity flow** (e.g. `identity.banzami.com`) — never a
shared parent-domain session cookie.

## Service boundaries (modular monolith first — §2.3)

The repo already splits **by product surface** (admin-api, api-gateway = Business
integration, public-api = consumer). The Developer product gets its own service;
Account Identity is a strongly-isolated, **extraction-ready** context — not a
separate running service on day one (premature microservices are forbidden — §2.3).

```
services/developer-api                     ← NEW Go service (chi/v5, pgx, Redis)
  internal/accountidentity/  ← Account Identity context: users, OTP, sessions,
                               cookie/SSO. Own schema ownership, interfaces and
                               tests. Extraction-ready → services/identity-api.
  internal/developer/        ← Developer context: workspaces, members, projects,
                               api keys, webhooks, logs, events.
  internal/coreref/          ← anti-corruption client to Core/Business (by API)
                               for the Live-activation link only.

Routed at  developer-api.banzami.com  via nginx/gateway to the modular monolith.

Shared technical modules (see Decisions → shared-module extraction):
  services/common/webhooks, /crypto, /email, /events, /observability

Reused via existing services (called, never duplicated):
  Business  → merchants / KYB / wallet / settlement   (api-gateway + Core)
  Core      → payments / ledger / events / webhooks    (Core + BANZA contracts)
```

## Data model (proposed — not yet migrated)

Each context **owns its own schema and migrations**. References across contexts
are opaque IDs only: `user_id` → `identity_users.id`; the Business bridge is a
`merchant_id` reference held solely in the link record.

### Account Identity context (`identity_*`)

```
identity_users        (id uuid pk, email citext unique, name, avatar_url,
                       locale, timezone, verified bool, status, created_at, updated_at)
identity_otp_codes    (id, email citext, code_hash, purpose, attempts int,
                       max_attempts int, expires_at, consumed_at, request_ip,
                       created_at)               -- store HASH of the 6-digit code, never plaintext
identity_sessions     (id, user_id, token_hash unique, user_agent, ip,
                       created_at, last_seen_at, expires_at, revoked_at)
-- future: identity_passkeys, identity_mfa_factors
```

OTP rules: 6 digits, 10-min expiry, one-time use (`consumed_at`), configurable
`max_attempts`, resend cooldown + rate limit (Redis), anti-enumeration
(uniform responses/timing), every issue/verify/failure audited.

### Developer context (`dev_*`)

```
dev_workspaces        (id, name, slug unique, created_by user_id, status,
                       created_at, updated_at)
dev_workspace_members (id, workspace_id, user_id, role, invited_by, accepted_at,
                       status)   role ∈ OWNER|ADMIN|DEVELOPER|FINANCE|VIEWER
dev_workspace_invites (id, workspace_id, email, role, token_hash, invited_by,
                       expires_at, accepted_at)   -- invite by email before a User exists
dev_projects          (id, workspace_id, name, slug, status, created_at, updated_at)
                       -- NO business_id / merchant_id column (see intersection)
dev_api_keys          (id, project_id, environment, kind, name, key_prefix,
                       secret_key_hash, scopes, last_used_at, created_by, status,
                       created_at, revoked_at)
                       environment ∈ SANDBOX|LIVE   kind ∈ PUBLISHABLE|SECRET
                       -- SANDBOX: pk_test_/sk_test_ ; LIVE only after an active link
                       -- secret stored as hash; raw revealed once at creation
dev_webhooks          (id, project_id, environment, url, secret_encrypted,
                       events text[], enabled, created_at)   -- reuse shared signer
dev_webhook_deliveries(id, webhook_id, event_id, attempt_count, status,
                       status_code, last_error, scheduled_at, delivered_at)
dev_request_logs      (id, project_id, environment, user_id?, api_key_id?, method,
                       path, status, latency_ms, ip, created_at)
dev_events            (id, project_id, environment, type, payload jsonb, created_at)
                       -- `type` drawn from the BANZA event registry, never invented here
```

### The intersection (opaque-id link only)

```
dev_project_business_link (id, project_id, merchant_id, environment, status,
                           requested_by_user_id, approved_by_user_id,
                           authorization_reference, capabilities,
                           kyb_snapshot_status, settlement_snapshot_status,
                           activated_at, revoked_at, created_at, updated_at)
```

### Audit

Reuse the immutable `audit_log` (`db 0025`) with actor `USER:<id>` for every
critical Account-Identity / Developer action (login, logout, failed login, key
create/reveal/rotate/revoke, member invite/remove, webhook create/delete, link
request/approve, live enable/disable).

## Database rules (binding)

A shared PostgreSQL deployment is acceptable, but each bounded context owns its
schema and migrations.

```
No cross-context foreign keys.
No cross-context reads.
No copied balances.
No financial projections outside Core.
No direct Developer or Account Identity access to Core financial tables.
```

The **Core remains the single financial truth and sole writer of financial data.**

## Reuse rules (binding)

1. **Do not rewrite Business models.** Reuse merchants / wallet / KYB / settlement.
2. **Do not duplicate** Wallet, KYB, or Settlement inside the Developer domain.
3. **Do not merge** Account Identity with Business or Developer; never duplicate
   identity; keep Account Identity distinct from the `@banza` handle.
4. **Consume** BANZA event/webhook type names and the BANZA webhook signing
   contract; never invent, rename or locally redefine financial event names or
   signing conventions.
5. Developer reuses shared technical modules, not copies; the Core owns all money.

## Decisions

### Identity hosting — Approved

Slice 1 ships Account Identity inside `services/developer-api`:

```
services/developer-api
  internal/accountidentity
  internal/developer
```

Account Identity must be internally isolated, have its own schema ownership,
interfaces and tests, and be **extraction-ready**. **Do not create
`services/identity-api` now.** Extract it **before** any Business, Admin or
Consumer portal depends on Account Identity.

### Routing — Approved

Canonical host convention — used consistently across this ADR, the architecture
host map, nginx configuration, deployment documentation, environment
configuration and frontend integration:

```
developers.banzami.com       → Developer Console frontend
developer-api.banzami.com    → Authenticated Developer Platform management API
api.banzami.com              → Public merchant and application integration API
consumer.banzami.com         → Consumer API
```

Developer Platform management is served at `developer-api.banzami.com`, routed
through nginx/gateway to the existing modular-monolith deployment. **Do not** use
`api.banzami.com/dev/*`: `api.banzami.com` remains the merchant/public integration
API surface, while `developer-api.banzami.com` is the **authenticated management
API** for Developer Workspaces, Projects, API keys, webhooks, logs and events. The
Developer Console frontend is served from `developers.banzami.com`. These hosts
must be documented in the Banzami architecture host map, the deployment guide and
the nginx configuration so the documentation does not drift.

### Shared-module extraction — Approved (strict limits)

Allowed shared **technical** modules only:

```
services/common/webhooks
services/common/crypto
services/common/email
services/common/events
services/common/observability
```

The shared **webhook** module must implement the **canonical BANZA webhook
signing contract exactly** as defined in the BANZA contracts — header name
(`banza-signature`), algorithm, canonical payload construction, timestamp and
replay requirements — plus the official BANZA test vectors. Do not invent, rename
or locally redefine a webhook signing convention. **AES-GCM is for secrets at
rest; it is not a webhook signing mechanism.**

**Forbidden** in shared modules:

```
Business models · Developer models · Account Identity models
repositories · database ownership
wallet logic · ledger logic · financial rules
cross-context service imports
```

## Rejected alternatives (governance)

| Rejected | Reason | Consequence if adopted |
|---|---|---|
| **Stand up `services/identity-api` immediately** | No consumer beyond the Developer portal exists yet; a second running service now is premature microservice split (§2.3). | Operational overhead + coordination cost for zero present benefit; deploy/observability surface without a second consumer. |
| **Route developer management via `api.banzami.com/dev/*`** | `api.banzami.com` is the merchant/public integration surface; the authenticated workspace-management API is a different concern and audience. | Conflated surfaces, blurred rate-limit/authz boundaries, harder to reason about exposure and to split later. |
| **Shared parent-domain session cookies (`Domain=.banzami.com`)** | One portal's cookie would be presentable to others; violates portal isolation and least privilege. | A compromise or bug in any surface leaks sessions across all portals; no clean per-portal revocation. |
| **Direct Developer → Business creation dependency** | Business and Developer are independent principals; most developers never handle money. | Forces wallet/KYB/settlement onto every developer; couples two products; blocks Sandbox-only use. |
| **Direct Developer access to Core financial tables** | Core is the single financial truth and sole writer; cross-context reads break the boundary. | Duplicated/stale balances, reconciliation ambiguity, loss of audit and financial-correctness guarantees. |
| **Locally invented webhook conventions** | BANZA owns the signing contract, event names and test vectors (ADR-019 / BANZA-035). | Protocol drift, broken SDK/partner verification, non-conformance with BANZA certification. |

## Consequences

- Clean DDD separation; each context extractable to its own service under load,
  with no schema rewrite (opaque-id references already in place).
- Account Identity is the seam for future unified SSO via a central redirect flow;
  Business and Admin migrate onto it later — until then their current auth is
  untouched.
- A developer can build and test entirely in Sandbox with **no** wallet/KYB.
- Going Live is an explicit, auditable, capability-scoped business-linking step;
  all money logic stays in Business + Core.
- Slightly more surface now (a new service, isolated contexts, shared modules) in
  exchange for a model that scales for a decade.

## First implementation slice (Slice 1) — gated on approval of this revision

Proceed **only** with the following. No Business functionality inside the
Developer domain; no Live activation; no Business-linking implementation beyond
the schema/design already defined here.

1. **Account Identity**
   - email OTP; anti-enumeration protections
   - OTP expiry, resend limits and rate limiting
   - secure sessions (host-only cookies per the SSO boundary)
   - `GET /auth/me`
   - authorization guards
   - audit events

2. **Developer**
   - Workspace creation
   - membership
   - Project creation
   - **Sandbox environment only**

3. **Sandbox API keys**
   - reveal once
   - prefix + secure hash only
   - rotation and revocation
   - scopes and environment
   - audit logs
   - raw keys never stored, logged or returned after creation

4. **Frontend wiring**
   - connect the existing Developer frontend to real data
   - no UX redesign
   - no Live activation
   - no Business-linking implementation beyond schema/design preparation

Sandbox must remain isolated from production data, production credentials and real
financial rails.
