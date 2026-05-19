# Banzami Engineering Constitution

## National-Grade Financial Infrastructure for Angola

---

# 1. Mission

## 1.1 Primary National Mission

Banzami exists to:

**Modernize and revolutionize digital payments in Angola.**

Banzami is NOT trying to become:

* a generic African fintech,
* a continental super-app,
* or a broad "Africa payments" platform.

Banzami is focused FIRST on Angola.

Everything is optimized for:

* Angolan consumers,
* Angolan merchants,
* Angolan commerce,
* Angolan mobile usage,
* Angolan payment realities,
* the Angolan Kwanza ecosystem.

## 1.2 Core National Objective

Banzami aims to become:

1. **The first true QR-native instant payment network in Angola.**
2. **The first Angola-native SDK payment infrastructure** — enabling applications, ecommerce platforms, and mobile apps to accept instant online payments in Kwanza directly inside their products.

## 1.3 The Transformation Banzami Enables

### Taxi apps
Today many Angolan taxi apps rely on cash, manual transfer confirmation, or payment outside the app. Banzami enables European-style in-app payments: ride completed → instant settlement → no cash, no manual confirmation, no external proof.

### Small merchants and cantinas
Any business should be able to print a QR, receive instant Kwanza payments, and manage a business wallet — with no expensive terminal infrastructure.

### Ecommerce and mobile apps
Banzami must become the standard SDK payment layer for Angola: ecommerce sites, delivery apps, marketplaces, schools, creators, taxi apps, donation platforms — all integrating Banzami SDKs and receiving instant Kwanza payments.

### Creator and donation economy
Apps like DOA: receive donations instantly, generate QR codes, receive wallet settlement, operate entirely in Kwanza.

### Person-to-person payments
Consumers transfer instantly, request money, pay via QR, pay via @handle — without cash.

## 1.4 Eliminating Angolan Payment Friction

Banzami aims to eliminate:

* manual payments,
* cash dependency,
* manual bank transfer confirmations,
* WhatsApp proof-of-payment flows,
* fragmented payment experiences.

The target future state:

```text
SCAN  →  CONFIRM  →  PAID INSTANTLY
```

## 1.5 Official Positioning

CORRECT descriptions of Banzami:

* Angola's instant payment network
* QR-native payment ecosystem
* Instant Kwanza payment infrastructure
* Wallet-native payment platform
* Mobile-first payment network
* Angola-native SDK payment infrastructure

INCORRECT descriptions of Banzami:

* Pan-African super-app (premature — Angola first)
* Stripe for Africa (wrong model — wallet-native, not card-centric)
* Generic African fintech (not the identity)
* Crypto payment platform (not the product)
* Traditional banking app (not the experience)

## 1.6 The Role of EMIS

EMIS is NOT the product layer.

EMIS is one of the infrastructure rails — one integration among several, enabling access to real Angolan payment infrastructure.

Banzami provides the UX layer, wallet layer, QR layer, SDK layer, merchant layer, developer platform, and payment network on top of those rails.

## 1.7 Bank Relationship Philosophy

Banks are not competitors. Banzami is an interoperability and simplification layer.

* Banks and EMIS provide: banking rails, settlement access, regulatory integration.
* Banzami provides: instant UX, QR commerce, SDK infrastructure, developer integration, merchant tooling, mobile payment experiences, wallet-native payments.

## 1.8 Long-Term Objective

Make digital Kwanza payments so simple, fast, and integrated that:

* physical cash usage decreases,
* manual transfer confirmations disappear,
* QR payments become the normal expectation,
* and Angolan applications integrate payments natively as a first-class feature.

## 1.9 Growth Strategy

The network grows through:

* merchants (QR adoption),
* consumers (wallet usage),
* SDK integrations (developer ecosystem),
* ecommerce and mobile apps,
* instant wallet settlement creating retention.

See [ADR-014](docs/adr/ADR-014-angola-national-mission.md) for full context and rationale.

---

## 1.10 Engineering Mission

The platform is engineered with:

* banking-grade reliability,
* financial correctness,
* developer-first experience,
* infrastructure-level scalability,
* modern security standards,
* long-term maintainability.

Banzami is NOT a simple startup product.

It is national-scale financial infrastructure for Angola.

Every engineering decision must prioritize:

1. correctness,
2. reliability,
3. security,
4. observability,
5. maintainability,
6. scalability,
7. documentation quality.

Short-term speed must NEVER compromise long-term system integrity.

---

# 2. Core Engineering Principles

## 2.1 Financial Correctness First

Financial systems are not traditional CRUD applications.

Every monetary movement must be:

* auditable,
* immutable,
* traceable,
* reproducible,
* reconcilable.

Never manipulate balances directly.

INVALID:

```rust
wallet.balance -= amount;
```

VALID:

```text
Customer Wallet    -1000 Kz
Merchant Pending   +1000 Kz
```

All money movement MUST go through:

* double-entry accounting,
* atomic transactions,
* immutable ledger events.

---

## 2.2 Reliability Over Hype

Banzami prioritizes:

* stability,
* predictability,
* operational excellence.

We DO NOT adopt technologies because they are trendy.

We adopt technologies only if they:

* improve reliability,
* improve security,
* improve maintainability,
* improve scalability.

---

## 2.3 Modular Monolith First

Premature microservices are forbidden.

The initial architecture is:

* modular,
* domain-oriented,
* strongly isolated internally,
* deployed as a controlled modular monolith.

Service extraction happens ONLY when:

* operational necessity exists,
* scaling boundaries are proven,
* domain ownership becomes complex.

---

## 2.4 Documentation Is Mandatory

Undocumented systems are considered incomplete systems.

Every implementation MUST include:

* technical documentation,
* architectural reasoning,
* operational instructions,
* security considerations,
* migration notes if applicable.

If documentation is missing:
the task is NOT complete.

---

## 2.5 Readability Over Cleverness

Code must be:

* explicit,
* understandable,
* maintainable,
* predictable.

Avoid:

* magic abstractions,
* hidden side effects,
* unnecessary metaprogramming,
* overengineered patterns.

Future engineers must understand the system quickly.

---

## 2.6 Instant Payments as a Core Architectural Principle

Banzami is designed as:

* realtime payment infrastructure,
* realtime money movement infrastructure,
* QR-first payment infrastructure,
* instant-transfer-first infrastructure.

Instant payments are NOT an optional feature.

They are a foundational product characteristic.

### Core Philosophy

By default, ALL Banzami payment experiences must feel instant.

The user experience target is:

```text
scan → confirm → paid immediately
```

Users must never experience:

* banking slowness,
* delayed confirmations,
* settlement uncertainty,
* manual processing friction.

### Default Payment Experience

Target flow:

```text
Customer scans QR
        ↓
Payment confirmation screen
        ↓
Transaction authorized
        ↓
Ledger updated
        ↓
Merchant wallet updated
        ↓
Webhook dispatched
        ↓
Merchant sees payment instantly
        ↓
Customer receives success confirmation
```

Target perceived latency:

* under 2 seconds — ideal,
* under 5 seconds — acceptable.

### Payment Critical Path

The critical path must remain minimal:

```text
auth → risk → compliance → ledger posting → wallet update → response
```

Everything else is async:

* retries,
* reconciliation,
* analytics,
* notifications,
* reporting.

Queues are NEVER used for core payment confirmation.

### Mandatory Engineering Rules

**1. Ledger writes remain synchronous and atomic.**
Financial correctness is NEVER sacrificed for speed.

**2. Wallet balances update immediately** after:
authorization, capture, transfer, payout reservation, reversal.
No delayed balance refreshes. No eventual consistency for balances.
Wallet state is strongly consistent.

**3. Webhook delivery begins immediately** after successful transaction commit.
Delivery must be tracked, retried, and idempotent.

**4. Realtime infrastructure is mandatory:**
WebSocket or SSE for dashboard updates, QR status, and transaction events.
Redis pub/sub for lightweight event dispatch.

### Architectural Requirements

The architecture must prioritize:

* low latency,
* deterministic processing,
* fast state transitions,
* minimal network hops,
* minimal blocking operations.

PostgreSQL optimizations required:

* indexed transaction and wallet lookups,
* short transactions,
* minimal lock contention,
* no blocking analytical queries in the payment path.

### Observability Requirements

Track and alert on:

* authorization latency,
* capture latency,
* QR payment end-to-end latency,
* webhook dispatch latency,
* transfer latency,
* DB transaction duration.

Realtime latency monitoring is mandatory.

### Failure Handling

Instant payments must remain correct, auditable, and deterministic.

If a transaction cannot be safely completed instantly:

* fail clearly,
* retry safely,
* preserve all invariants.

Never create:

* ghost payments,
* ambiguous transaction states,
* duplicate ledger writes,
* eventual balance uncertainty.

### The Distinction

INSTANT USER EXPERIENCE does NOT mean:

* bypassing ledger integrity,
* bypassing settlement,
* weak consistency,
* unsafe architecture.

The architecture remains:

* strongly consistent,
* double-entry based,
* fully auditable,
* financially correct.

The speed comes from excellent engineering, optimized flows, and disciplined architecture.

### Product Philosophy

> **"Money moves at internet speed."**

Banzami is building realtime African payment infrastructure with banking-grade engineering.

---

## 2.7 Wallet-Native Identity — Core Architectural Constraint

This is a binding architectural constraint, not a design preference.

### What Banzami IS

Banzami is:

* a **wallet-native payment network** — every account is a wallet, every payment is a wallet transfer,
* a **QR-native ecosystem** — QR codes are the primary payment initiation mechanism,
* an **instant-transfer infrastructure** — money moves between wallets in real time,
* a **kwanza-native money network** — AOA is the primary unit, local rails (EMIS, Multicaixa Express) are native integrations,
* a **@handle-based identity system** — payments are addressed to human-readable handles, not card numbers or account strings.

### What Banzami is NOT

Banzami is NOT:

* a card processor,
* a Stripe clone,
* a Visa / Mastercard gateway,
* a card-tokenization platform,
* a card-first payment UX.

Visa and Mastercard are **optional future funding rails only** — a mechanism for topping up wallets from external sources. They are NEVER the core payment network. Card numbers, CVV forms, and card tokenization are NOT part of the primary payment flow.

### Primary Payment Rail

```text
Consumer Wallet  ──ledger transfer──▶  Merchant Wallet
```

This is the canonical payment operation. Everything else derives from it:

* QR payment: encodes amount + merchant wallet reference → consumer scans → ledger transfer
* @handle transfer: consumer-to-consumer wallet transfer via handle lookup
* Payment request: merchant requests amount → consumer approves → ledger transfer
* Payment link: pre-configured QR / URL → same ledger transfer at resolution

### UX Philosophy

The canonical UX flow is:

```text
SCAN QR → CONFIRM → INSTANT SETTLEMENT
```

Reference models: Pix (Brazil), WeChat Pay, M-Pesa, UPI — NOT Stripe checkout, NOT card entry forms.

Users must NEVER be asked for:

* card numbers,
* CVV codes,
* expiry dates,
* billing addresses.

### SDK and Documentation Rules

* All SDKs MUST prioritize QR and wallet APIs as primary integration surface.
* All documentation examples MUST showcase QR commerce and wallet transfers first.
* Payment link, QR generation, and instant transfer are TIER 1 features.
* Card-related APIs are future / supplementary and must NEVER appear in primary docs or examples.

### Engineering Enforcement

Every new feature, endpoint, or flow MUST be evaluated against this identity:

* Does it serve wallet ↔ wallet transfers?
* Does it make QR payments simpler?
* Does it strengthen the @handle identity?
* Does it deepen local rail (EMIS / Multicaixa Express) integration?

If a feature serves card processing as a primary concern, it does not belong in the core network.

See [ADR-013](docs/adr/ADR-013-wallet-native-identity.md) for full context, rationale, and tradeoffs.

---

# 3. Official Technology Stack

---

# 3.1 Financial Core

Language:

* Rust

Responsibilities:

* ledger engine,
* wallet engine,
* transaction engine,
* settlement,
* reconciliation,
* payout orchestration,
* risk engine,
* compliance core.

Rationale:

* memory safety,
* high performance,
* deterministic behavior,
* strong concurrency guarantees,
* infrastructure-grade reliability.

---

# 3.2 API Layer

Language:

* Go

Responsibilities:

* public APIs,
* admin APIs,
* webhook delivery,
* orchestration services,
* authentication,
* gateway services.

Rationale:

* simplicity,
* concurrency,
* operational reliability,
* maintainability.

---

# 3.3 Frontend

Stack:

* TypeScript
* Next.js
* React

Responsibilities:

* merchant dashboard,
* analytics,
* administration,
* disputes,
* payouts,
* developer console.

---

# 3.4 Mobile

Primary SDK:

* Flutter

Responsibilities:

* mobile SDKs,
* checkout integration,
* merchant integrations,
* future POS systems.

---

# 3.5 Database

Primary Database:

* PostgreSQL

PostgreSQL is the single source of truth.

All financial consistency depends on PostgreSQL transactional guarantees.

---

# 3.6 Cache & Coordination

Technology:

* Redis

Usage:

* caching,
* rate limiting,
* idempotency,
* distributed locking,
* lightweight queues,
* session management.

---

# 3.7 Observability

Mandatory Stack:

* OpenTelemetry
* Prometheus
* Grafana

Every service MUST expose:

* metrics,
* traces,
* structured logs,
* health signals.

No black boxes are allowed.

---

# 3.8 Infrastructure

Initial Infrastructure:

* Docker
* Hetzner / OVH
* Cloudflare

Kubernetes is intentionally deferred until operational maturity requires it.

---

# 4. Repository Structure

```text
/banzami
    /apps
        /dashboard
        /admin
        /docs

    /services
        /api-gateway
        /public-api
        /admin-api

    /core
        /ledger
        /wallets
        /transactions
        /settlement
        /routing
        /reconciliation
        /risk
        /compliance
        /payouts

    /sdk
        /flutter
        /typescript

    /plugins
        /woocommerce
        /shopify

    /infra
        /docker
        /terraform
        /monitoring
        /deployment

    /docs
        /architecture
        /adr
        /security
        /compliance
        /runbooks
        /playbooks
        /incident-management
        /api
        /domains

    /tools

    CLAUDE.md
    README.md
```

---

# 5. Documentation Standards

Documentation quality is considered a critical engineering requirement.

---

# 5.1 Mandatory Documentation for Every Feature

Every implementation MUST include:

## Required Files

* README.md update
* architecture notes
* operational notes
* security notes
* migration notes (if needed)
* API documentation (if exposed)

---

# 5.2 Domain Documentation

Every domain MUST contain:

```text
/docs/domains/<domain-name>/
```

Example:

```text
/docs/domains/ledger/
/docs/domains/wallets/
/docs/domains/payouts/
```

Each domain document MUST explain:

* business purpose,
* architecture,
* flows,
* invariants,
* failure scenarios,
* reconciliation logic,
* security assumptions.

---

# 5.3 ADRs (Architecture Decision Records)

All major technical decisions MUST create:

```text
/docs/adr/
```

Format:

```text
ADR-001-ledger-engine.md
ADR-002-idempotency-strategy.md
ADR-003-event-architecture.md
```

Each ADR MUST include:

* context,
* decision,
* rationale,
* alternatives considered,
* consequences,
* tradeoffs.

---

# 5.4 README Rules

README files must ALWAYS remain synchronized with implementation reality.

Whenever:

* architecture changes,
* commands change,
* flows change,
* deployment changes,
* APIs change,

the corresponding README MUST be updated immediately.

Outdated documentation is considered a defect.

---

# 6. Prompt Engineering Standards

All prompts used internally MUST follow engineering-grade structure.

Prompts are considered production assets.

---

# 6.1 Prompt Requirements

Every prompt MUST define:

* role,
* objective,
* constraints,
* expected outputs,
* formatting requirements,
* failure conditions.

---

# 6.2 Prompt Structure

Mandatory structure:

```text
# Context
# Objective
# Constraints
# Technical Requirements
# Output Format
# Validation Rules
```

---

# 6.3 Prompt Quality Rules

Prompts must:

* be deterministic,
* avoid ambiguity,
* define explicit expectations,
* minimize hallucinations,
* specify domain boundaries.

---

# 7. Security Standards

Security is NOT optional.

---

# 7.1 Mandatory Security Principles

All services MUST implement:

* authentication,
* authorization,
* audit logging,
* encryption at rest,
* TLS everywhere,
* idempotency,
* rate limiting,
* structured logging.

---

# 7.2 Financial Security

Critical financial actions MUST support:

* traceability,
* replay protection,
* immutable audit trails,
* reconciliation guarantees.

---

# 7.3 Secrets Management

Secrets MUST NEVER:

* exist in repositories,
* appear in logs,
* appear in screenshots,
* appear in documentation examples.

Secrets MUST use:

* environment isolation,
* secure secret managers,
* rotation policies.

---

# 8. Engineering Quality Standards

---

# 8.1 Code Quality

All code MUST be:

* strongly typed,
* tested,
* observable,
* documented,
* production-grade.

---

# 8.2 Testing Strategy

Mandatory testing layers:

* unit tests,
* integration tests,
* financial invariant tests,
* API contract tests.

Critical flows require:

* reconciliation tests,
* idempotency tests,
* concurrency tests.

---

# 8.3 Idempotency

Every financial operation MUST be idempotent.

Duplicate execution MUST NEVER produce inconsistent state.

---

# 8.4 Migrations

Database migrations MUST:

* be reversible when possible,
* be documented,
* be tested before production,
* avoid destructive operations.

---

# 9. Observability Standards

Every service MUST expose:

* metrics,
* tracing,
* health checks,
* structured logs.

Minimum requirements:

* request tracing,
* transaction tracing,
* payment lifecycle visibility,
* settlement visibility.

---

# 10. Financial Architecture Standards

---

# 10.1 Ledger Rules

The ledger is the single financial truth.

Rules:

* immutable entries,
* append-only philosophy,
* double-entry accounting,
* atomic posting,
* reconciliation-first design.

---

# 10.2 Reconciliation

Reconciliation is mandatory.

Every external integration MUST support:

* reconciliation jobs,
* settlement verification,
* discrepancy reporting,
* retry logic.

---

# 10.3 Monetary Precision

Floating-point arithmetic is forbidden for money.

Use:

* integer minor units,
* fixed precision decimal libraries.

---

# 11. API Standards

Public APIs MUST follow:

* REST consistency,
* versioning,
* idempotency,
* structured error handling,
* pagination standards,
* authentication standards.

Every endpoint MUST include:

* examples,
* request schemas,
* response schemas,
* failure responses.

---

# 12. Git Standards

Branch naming:

```text
feature/*
fix/*
infra/*
security/*
docs/*
```

Commit format:

```text
type(scope): description
```

Examples:

```text
feat(wallets): add transaction reservation flow
fix(ledger): prevent duplicate settlement posting
docs(api): update webhook retry documentation
```

---

# 13. Operational Philosophy

Banzami is infrastructure.

Infrastructure engineering requires:

* discipline,
* consistency,
* operational maturity,
* reliability culture.

We optimize for:

* decades of maintainability,
* operational excellence,
* financial integrity,
* institutional trust.

---

# 14. SDK-First Ecosystem Policy

**Banzami is an SDK-first platform.**

This is a binding architectural constraint, not a preference.

## 14.1 The Rule

ALL external applications integrating Banzami MUST use an official Banzami SDK.

Direct HTTP integrations using `fetch()`, `axios()`, `requests()`, curl wrappers, or handcrafted API clients are NOT the recommended integration path.

They are NOT acceptable in:

* official examples,
* demos,
* merchant integrations,
* documentation,
* showcase applications,
* reference implementations,
* plugins,
* templates,
* tutorials.

## 14.2 Why SDKs Are Mandatory

The SDKs are NOT optional helper libraries.

They are:

* security boundaries,
* DX infrastructure,
* payment orchestration layers,
* compatibility layers,
* ecosystem standardization tools.

Official SDK usage guarantees:

* consistent integrations,
* safer integrations,
* typed APIs,
* automatic idempotency,
* retry handling,
* webhook verification,
* environment isolation,
* API evolution compatibility,
* production-grade developer experience.

Without SDK standardization:

* integrations become inconsistent,
* merchants implement payment logic incorrectly,
* security mistakes multiply,
* and ecosystem maintenance becomes impossible at scale.

## 14.3 SDK Requirements

All SDKs must provide:

* typed APIs,
* environment isolation (sandbox / live),
* automatic idempotency key management,
* retries with exponential backoff,
* webhook signature verification,
* QR payment helpers,
* payment intent helpers,
* standardized error hierarchy,
* tracing and observability hooks,
* structured logging support,
* and production-grade documentation.

## 14.4 Secret Key Rule

Secret API keys MUST NEVER be used in frontend, browser, or mobile client code.

* Server SDKs: secret keys only.
* Client SDKs: publishable / public keys only.

## 14.5 Mandatory SDKs for v1

The following SDKs are required before the ecosystem is complete:

Server-side:

* TypeScript / Node.js SDK
* PHP SDK
* Python SDK
* Go SDK

Client-side:

* Flutter SDK
* JavaScript Browser SDK

Future:

* Laravel package
* WordPress / WooCommerce plugin
* Android native SDK
* iOS native SDK

## 14.6 If an SDK Does Not Exist

If a required SDK is not yet production-ready, the SDK must be implemented FIRST.

No production-facing integration should bypass the SDK layer because the SDK is not ready.

SDK quality is a platform-critical priority.

## 14.7 Documentation Rule

All Banzami documentation must assume SDK usage by default.

Raw HTTP examples are permitted only for:

* low-level API reference sections,
* debugging documentation,
* advanced integration guides.

SDK examples are the primary integration path in all other contexts.

## 14.8 ADR Reference

See [ADR-012](docs/adr/ADR-012-sdk-first-ecosystem.md) for the full rationale, tradeoffs, and implementation guidance.

---

# 15. Documentation Source of Truth

## 15.1 The Rule

`docs/BANZAMI_REFERENCE.md` is the **single source of truth** for the entire public Banzami ecosystem.

This is a binding architectural constraint.

---

## 15.2 What BANZAMI_REFERENCE.md Is

It is simultaneously:

* the canonical product definition,
* the official ecosystem description,
* the official public positioning,
* the official architecture reference,
* the official payment philosophy,
* the official UX philosophy,
* and the authoritative content source for the website.

Think of it as: **The Constitution of the Banzami Ecosystem.**

The public website is only the visual interface for consuming that constitution.

---

## 15.3 The Mandatory Content Flow

```text
BANZAMI_REFERENCE.md
↓
structured parsing / rendering
↓
website sections
↓
banzami.org
```

NEVER the reverse:

```text
website first → markdown later    ← FORBIDDEN
```

---

## 15.4 The Publication Rule

NOTHING may appear on:

* banzami.org,
* landing pages,
* docs pages,
* manifesto pages,
* ecosystem pages,
* architecture pages,
* SDK explanation pages,
* marketing pages,
* investor or product pages,

WITHOUT FIRST existing inside `docs/BANZAMI_REFERENCE.md`.

---

## 15.5 The Update Rule

Whenever a new concept is added:

* QR feature,
* wallet flow,
* SDK flow,
* merchant experience,
* risk or security model,
* payment philosophy,
* EMIS integration explanation,
* mobile UX,
* ecosystem principle,

it MUST first be documented in `BANZAMI_REFERENCE.md`.

Only after that may it appear publicly on the website.

---

## 15.6 Technical Implementation

The `apps/docs` website is architected so that:

* the markdown file drives public content,
* sections are rendered from the parsed markdown,
* architecture diagrams reference the markdown structure,
* all future updates begin in the markdown file.

The implementation uses:

* `lib/reference.ts` — the content parsing engine,
* section-based routing derived from H2 headings,
* custom React components for callouts, diagrams, flow blocks,
* MDX-compatible rendering where needed.

---

## 15.7 ADR Reference

See [ADR-015](docs/adr/ADR-015-markdown-first-content-architecture.md) for full context, rationale, and implementation guidance.

---

# 16. Banzami / Banza Brand Architecture

This is a binding rule for all engineers and all content.

## 16.1 The Two-Level Model

**Banzami** = organization / ecosystem / infrastructure / institutional entity

**Banza** = main payment product / payment experience / wallet-QR network

## 16.2 Use "Banza" for product-level context

Use Banza when referring to:

* the payment experience users interact with,
* wallets and balances ("Banza Wallet"),
* the payment network ("rede Banza"),
* QR payments ("Banza QR"),
* the merchant solution ("Banza Business"),
* SDKs and APIs ("Banza SDK", "Banza API"),
* payment links and checkout ("Banza Pay Links", "Banza Checkout"),
* consumer-facing copy ("Paga com Banza", "adoptar o Banza").

## 16.3 Use "Banzami" for organizational context

Use Banzami when referring to:

* the company and team ("o Banzami constrói..."),
* institutional mission and strategy,
* bank and regulatory relationships,
* the technical platform and infrastructure as a whole,
* documentation source of truth (BANZAMI_REFERENCE.md),
* the ecosystem umbrella ("Ecossistema Banzami"),
* future non-Banza products of the organization.

## 16.4 Product hierarchy

```
Banzami (organization)
└── Banza (main payment product)
    ├── Banza Wallet
    ├── Banza Business (mobile + web interfaces)
    ├── Banza QR
    ├── Banza Checkout
    ├── Banza Pay Links
    ├── Banza API
    ├── Banza SDK
    └── @banza (payment identity)
```

## 16.5 SDK naming

* TypeScript: `@banza/sdk`, class `BanzaClient`
* PHP: `banza/sdk-php`, class `BanzaClient`
* Go: `banza-go`
* Python: `banza-python`
* Flutter: `banza_flutter`, class `BanzaPay`
* Webhook header: `banza-signature`
* Env var: `BANZA_WEBHOOK_SECRET`

## 16.6 Forbidden substitutions

* "Pagar com Banzami" → WRONG. Use "Pagar com Banza."
* "carteira Banzami" → WRONG. Use "Banza Wallet."
* "Banzami Business" → WRONG. Use "Banza Business."
* "SDK Banzami" → WRONG. Use "Banza SDK."
* Blind replace-all of "Banzami" → FORBIDDEN. Context matters.

## 16.7 Grammatical gender — binding rule

Both brand names are grammatically **masculine** in Portuguese:

- **O Banza** (not "a Banza")
- **O Banzami** (not "a Banzami")

This applies to all articles and contractions:

| Wrong | Correct |
|-------|---------|
| a Banza | o Banza |
| da Banza | do Banza |
| na Banza | no Banza |
| pela Banza | pelo Banza |
| a Banzami | o Banzami |
| da Banzami | do Banzami |
| pela Banzami | pelo Banzami |

Agreement: participles and adjectives qualifying Banza/Banzami must be masculine:
- "O Banza é construído..." (not "construída")
- "O Banzami é reconhecido..." (not "reconhecida")

Compound product names follow the head noun gender (e.g. "o Banza Business" since "negócio" is masculine; "a Banza Wallet" since "carteira" is feminine).

## 16.8 Canonical positioning phrases

> "Banzami constrói a infraestrutura que permitirá Angola pagar digitalmente."
> "Banzami constrói a infraestrutura. Banza move o dinheiro."
> "Banzami constrói a infraestrutura que permitirá Angola pagar digitalmente. Banza é como Angola paga."

## 16.8 Content update flow

ALWAYS update BANZAMI_REFERENCE.md FIRST.
Never update website, UI, or SDK names before the reference document is coherent.

See ADR-016 for full context, rationale, and migration rules.

---

# 17. Validation Governance — Claude Approval Gates

## 17.1 Rule

Claude must NEVER apply validation status changes to `docs/validation/BANZAMI_IMPLEMENTATION_MATRIX.json` without first producing a structured proposal and receiving the exact approval phrase from the human.

## 17.2 Required Approval Phrases

Validation changes are governance actions. The following exact phrases are the only accepted approvals:

| Action | Required exact phrase |
|--------|-----------------------|
| Apply JSON change | `APPROVE VALIDATION <ITEM_ID>` |
| Create git commit | `APPROVE COMMIT <ITEM_ID>` |

Example: `APPROVE VALIDATION QR-001`

## 17.3 Rejected Phrasings

The following are explicitly NOT accepted and must never trigger a write operation:

`yes` · `ok` · `confirm` · `go` · `apply` · `looks good` · `pode avançar` · `sim` · `continua` · `approved` · any paraphrase or equivalent

## 17.4 Phase Separation

Applying the JSON change and creating the git commit are separate governance actions, each requiring its own approval phrase. Applying does not automatically commit.

## 17.5 Multi-Item Rule

If multiple items are involved, each requires its own explicit approval:

```
APPROVE VALIDATION QR-001
APPROVE VALIDATION WH-001
```

Batch approval does not exist.

## 17.6 Proposal Requirements

Before any approval gate is shown, Claude must produce a full VALIDATION PROPOSAL containing:
- Current status → proposed status
- **Validation fingerprint** (16-char SHA256 hex — computed from item state + git diff)
- **Architecture lock status** — each `requires` entry and its current status
- **Financial invariant status** — each invariant and its PASS/FAIL/UNKNOWN/NOT_RUN status
- Acceptance criteria check (PASS / PARTIAL / FAIL / UNVERIFIABLE per criterion, with file:line citations)
- Evidence found
- Fields that will be updated (explicit before/after)
- **History entry preview** (the immutable entry that will be appended)
- Risks
- Suggested commit message in `validation(ID): description` format

Claude may NOT propose `VALIDATED` if:
- any acceptance criterion fails
- evidence would remain empty
- any `requires` item is not VALIDATED (architecture lock)
- the item is financially critical AND any invariant is not PASS

## 17.7 Fingerprint Contract

The validation fingerprint anchors the proposal to a specific implementation state. It is computed as:
```
SHA256(item_id | SHA256(git_diff)[0:16])[0:16]
```

The approval phrase must include the fingerprint:
```
APPROVE VALIDATION QR-001 a84f9e2d1c3b5f7e
```

Before applying, Claude must recompute the fingerprint. If it differs from the proposal fingerprint, apply is ABORTED with:
> "⛔ Fingerprint mismatch. Implementation changed after proposal. Generate a new proposal."

## 17.8 Immutable History

Every status transition appends one history entry to the item's `history[]` array. History entries are never modified or deleted. The entry structure:
```json
{
  "timestamp": "ISO 8601",
  "from": "previous status",
  "to": "new status",
  "approvedBy": "local-admin",
  "fingerprint": "16-char hex",
  "commit": "optional git hash",
  "reason": "justification",
  "evidence": ["ref1", "ref2"]
}
```

## 17.9 Financial Invariants

Items in `cat-ledger`, `cat-wallet`, `cat-p2p`, `cat-qr`, `cat-payouts`, `cat-refunds` are financially critical. They carry an `invariants[]` array with named rules. ALL invariants must be PASS before VALIDATED can be proposed. Invariant statuses: PASS · FAIL · UNKNOWN · NOT_RUN.

## 17.10 Architecture Lock

Each item has a `requires[]` array — the hard dependency list. An item may NOT become VALIDATED unless every item in `requires` is already VALIDATED. This is checked:
- at proposal time (Claude warns and refuses VALIDATED)
- at apply time (Claude re-verifies and aborts if any lock is unmet)
- in the Studio UI (lock icon + red dependency list if unmet)

## 17.7 Commands

The slash commands implementing this workflow are in `.claude/commands/`:
- `/validate-feature <ID>` — full inspection + proposal + gated apply + gated commit
- `/validate-current` — auto-detect item from git context, then same flow
- `/validation-propose <ID>` — proposal only, never writes
- `/validation-apply <ID>` — apply a proposal already generated in this conversation

---

# 18. Final Principle

Every engineer working on Banzami must understand:

This platform handles money.

Trust is the product.

Everything else is secondary.