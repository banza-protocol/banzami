# Banzami

> Modern financial infrastructure for Africa — engineered for reliability, interoperability, and operational excellence.

Banzami is a financial technology platform focused on building secure, resilient, and developer-friendly payment infrastructure for Angola and emerging African markets.

The platform provides:

* payment processing,
* wallet infrastructure,
* merchant settlements,
* payout orchestration,
* reconciliation systems,
* compliance enforcement,
* and financial operations tooling.

Banzami is designed as an API-first infrastructure layer enabling businesses, platforms, and digital services to move money safely and efficiently.

---

## Engineering Philosophy

Banzami is built with:

* fintech-grade agility,
* banking-grade reliability,
* infrastructure-grade operational discipline.

The system prioritizes:

* deterministic financial correctness,
* operational resilience,
* observability,
* auditability,
* idempotent financial operations,
* and long-term maintainability.

Critical financial systems are intentionally designed to remain:

* simple,
* predictable,
* traceable,
* and highly reliable under real-world operational conditions.

See [CLAUDE.md](CLAUDE.md) for the full Engineering Constitution.

---

## Architectural Principles

Banzami follows a modular monolith architecture with strong internal domain boundaries.

* Rust powers the financial core:
  ledger, wallets, settlements, reconciliation, payouts, and financial invariants.

* Go powers the orchestration layer:
  APIs, authentication, operational workflows, integrations, and middleware.

* PostgreSQL remains the single financial source of truth.

The platform is designed for gradual evolution, operational simplicity, and controlled scalability.

---

## Mission

To provide modern, reliable, and accessible financial infrastructure that enables African businesses to build and operate digital financial products with confidence.

---

## Core Values

* Financial correctness over hype
* Reliability over unnecessary complexity
* Operational maturity over premature scale patterns
* Clear boundaries over architectural chaos
* Long-term maintainability over short-term shortcuts

---

## Product Vision

Banzami aims to become a foundational infrastructure layer for digital commerce and financial operations across African markets.

The focus is not on reinventing banking, but on making modern financial infrastructure more accessible, interoperable, and operationally reliable.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Repository Layout](#repository-layout)
3. [Technology Stack](#technology-stack)
4. [Design System](#design-system)
5. [Integration Ecosystem](#integration-ecosystem)
6. [Domain Model](#domain-model)
7. [Services](#services)
8. [API Reference](#api-reference)
9. [Financial Flows](#financial-flows)
10. [Database Schema](#database-schema)
11. [Security Model](#security-model)
12. [Observability](#observability)
13. [Local Development](#local-development)
14. [Engineering Principles](#engineering-principles)
15. [Contributing](#contributing)

---

## Production

The platform is live on an IONOS dedicated server (`212.227.93.136`) behind Cloudflare.

### Public URLs

| URL | Service | Description |
|-----|---------|-------------|
| `https://api.banzami.org` | API Gateway | Merchant REST API — authenticated with JWT |
| `https://consumer.banzami.org` | Public API | Consumer mobile API — authenticated with PIN + JWT |
| `https://pay.banzami.org` | API Gateway | Payment links and QR payment resolution |
| `https://admin.banzami.org` | Admin Frontend | Internal operations portal (Next.js) |
| `https://merchant.banzami.org` | Merchant Frontend | Merchant dashboard portal (Next.js) |

### Production Stack

All services run as Docker containers managed by Docker Compose under `/srv/banzami/`:

| Container | Image | Port | Role |
|-----------|-------|------|------|
| `banzami_postgres` | postgres:16-alpine | internal | Primary database |
| `banzami_redis` | redis:7-alpine | internal | Cache, rate limiting, idempotency |
| `banzami_core` | banzami-core-api | 8081 (internal) | Rust financial core |
| `banzami_gateway` | banzami-api-gateway | 8080 | Merchant API gateway |
| `banzami_public` | banzami-public-api | 8083 | Consumer public API |
| `banzami_admin` | banzami-admin-api | 8082 | Admin operations API |
| `banzami_admin_frontend` | banzami-admin-frontend | 3002 | Admin portal (Next.js) |
| `banzami_dashboard_frontend` | banzami-dashboard-frontend | 3001 | Merchant portal (Next.js) |

nginx (shared with the existing `mondrive` project on the same VM) terminates TLS with Let's Encrypt certificates and reverse-proxies to each container by name on the `mondrive_default` Docker network.

### SSL

Certificates issued by Let's Encrypt via certbot (webroot challenge). Covers all 5 production subdomains. Renewal is automatic.

```
/etc/letsencrypt/live/api.banzami.org/fullchain.pem
/etc/letsencrypt/live/api.banzami.org/privkey.pem
Expires: 2026-08-13
```

---

## Architecture Overview

### System Topology

```
┌──────────────────────────────────────────────────────────────────────────┐
│                            External Clients                               │
│                                                                           │
│  Merchant Apps   Admin Dashboard        Mobile Apps (Flutter)   Plugins   │
│  (REST API)      admin.banzami.org       consumer + merchant    (WooComm.)│
│  Python SDK      merchant.banzami.org   Hosted Checkout (:3004)           │
└──────┬───────────────┬─────────────────────┬──────────────────┬──────────┘
       │               │ (internal only)      │                  │
       │           ┌───▼──────────────────┐   │                  │
       │           │  Go Admin API  :8082  │   │                  │
       │           │  X-Admin-Key auth     │   │                  │
       │           │  Compliance lifecycle │   │                  │
       │           │  Settlement mgmt      │   │                  │
       │           │  Payout operations    │   │                  │
       │           │  Reconciliation       │   │                  │
       │           └───────────┬───────────┘   │                  │
       │                       │               │                  │
       ▼                       │               ▼                  │
┌──────────────────┐           │  ┌────────────────────────────┐  │
│ Cloudflare       │           │  │  Go Public API  :8083      │  │
│ WAF / CDN        │           │  │  Consumer-facing (mobile)  │  │
└────────┬─────────┘           │  │  PIN + JWT auth            │  │
         │                     │  │  P2P transfers             │  │
         ▼                     │  │  Consumer wallets          │  │
┌──────────────────────────────┴──┴────────────────────────────┴──┐
│               HTTP /internal/v1/*  (loopback, never internet)    │
│                                                                   │
│                    Go API Gateway  :8080                          │
│                                                                   │
│   JWT Bearer auth  │  Redis rate limiting (1,000 req/min)        │
│   Redis idempotency keys  │  Request tracing  │  Panic recovery  │
│                                                                   │
│   POST /v1/auth/token          — API key → JWT exchange          │
│   POST /v1/transactions        — initiate payment                │
│   POST /v1/wallets             — provision wallet                │
│   POST /v1/payouts             — request payout                  │
│   POST /v1/webhooks/endpoints  — register webhook                │
│   POST /v1/merchants           — register merchant               │
└───────────────────────────────────┬──────────────────────────────┘
                                    │ HTTP /internal/v1/*
                                    ▼
┌──────────────────────────────────────────────────────────────────┐
│                    Rust Core API  :8081                           │
│                                                                   │
│  The single financial authority. Go services orchestrate.        │
│  Go NEVER writes financial data directly to PostgreSQL.          │
│                                                                   │
│  ┌──────────────┐  ┌─────────────┐  ┌────────────────────┐      │
│  │banzami-ledger│  │banzami-walls│  │banzami-transactions│      │
│  │ Double-entry │  │ Reserve     │  │ Authorize          │      │
│  │ Immutable    │  │ Release     │  │ Capture            │      │
│  │ Balanced     │  │ Settle      │  │ Reverse / Fail     │      │
│  └──────────────┘  └─────────────┘  └────────────────────┘      │
│                                                                   │
│  ┌──────────────┐  ┌─────────────┐  ┌────────────────────┐      │
│  │banzami-settle│  │banzami-pouts│  │banzami-reconcil.   │      │
│  │ Batch netting│  │ Lifecycle   │  │ Statement match    │      │
│  │ Acquirer sub.│  │ Ledger DR/CR│  │ Discrepancy rpt    │      │
│  └──────────────┘  └─────────────┘  └────────────────────┘      │
│                                                                   │
│  ┌──────────────┐  ┌─────────────┐  ┌────────────────────┐      │
│  │banzami-comply│  │banzami-risk │  │banzami-routing     │      │
│  │ KYB / KYC   │  │ Tx scoring  │  │ Acquirer selection │      │
│  │ AML flagging │  │             │  │                    │      │
│  └──────────────┘  └─────────────┘  └────────────────────┘      │
│                                                                   │
│  ┌──────────────┐  ┌─────────────┐  ┌────────────────────┐      │
│  │banzami-cnsmr │  │banzami-trans│  │banzami-qr          │      │
│  │ Consumer     │  │ P2P instant │  │ Static + dynamic   │      │
│  │ wallets      │  │ transfers   │  │ QR payment codes   │      │
│  └──────────────┘  └─────────────┘  └────────────────────┘      │
│                                                                   │
│  ┌──────────────┐  ┌─────────────┐                               │
│  │banzami-links │  │banzami-ident│                               │
│  │ Payment links│  │ Consumer ID │                               │
│  │ Shareable URL│  │ Handle reg. │                               │
│  └──────────────┘  └─────────────┘                               │
└───────────────────────────────┬──────────────────────────────────┘
                                 │
                 ┌───────────────┴───────────────┐
                 ▼                               ▼
┌────────────────────────────┐   ┌───────────────────────────────┐
│  PostgreSQL  (primary DB)  │   │           Redis               │
│                            │   │                               │
│  15 migration files        │   │  Rate limiting (sliding win.) │
│  Immutable ledger entries  │   │  Idempotency key store        │
│  Double-entry accounting   │   │  Session management           │
│  All financial state       │   │  Distributed coordination     │
└────────────────────────────┘   └───────────────────────────────┘
```

### Go ↔ Rust Boundary

The boundary between the Go services and the Rust core is the most important architectural constraint in the system.

```
┌─────────────────────┐         ┌─────────────────────┐
│    Go Services      │         │    Rust Core API     │
│                     │         │                      │
│  Orchestration      │  HTTP   │  Financial logic     │
│  Auth/authz     ───────────►  │  Ledger writes       │
│  API contracts      │  JSON   │  Balance management  │
│  Rate limiting      │         │  State transitions   │
│  Webhooks           │         │  Invariant checks    │
│                     │         │                      │
│  NEVER writes to    │         │  Single source of    │
│  financial tables   │         │  financial truth     │
└─────────────────────┘         └─────────────────────┘
```

**Rule:** Go services call `/internal/v1/*` on `127.0.0.1:8081`. These routes are never exposed to the internet. The Rust core is the only process that writes to financial tables.

---

## Repository Layout

```
banzami/
│
├── core/                          Rust financial core (Cargo workspace)
│   ├── types/                     Shared types: Money, Currency, typed IDs
│   ├── ledger/                    Double-entry accounting engine
│   ├── wallets/                   Merchant wallet lifecycle and balance management
│   ├── transactions/              Payment transaction state machine
│   ├── merchants/                 Merchant registration and API key management
│   ├── settlement/                Settlement batch netting and lifecycle
│   ├── payouts/                   Merchant payout orchestration
│   ├── reconciliation/            External statement matching engine
│   ├── compliance/                KYB/KYC/AML enforcement
│   ├── risk/                      Transaction risk scoring
│   ├── routing/                   Acquirer/PSP selection
│   ├── identity/                  Consumer identity and handle registry
│   ├── consumer-wallets/          Consumer wallet lifecycle and balance management
│   ├── transfers/                 Instant P2P transfer engine
│   ├── qr/                        Static and dynamic QR payment codes
│   ├── payment-links/             Shareable URL payments for informal commerce
│   └── api/                       Axum HTTP server wiring all domains
│
├── services/                      Go services
│   ├── api-gateway/               Merchant-facing API gateway (:8080)
│   │   ├── cmd/gateway/           Entry point
│   │   └── internal/
│   │       ├── config/            Environment configuration
│   │       ├── handler/           HTTP handlers (transactions, wallets, payouts, …)
│   │       ├── middleware/        Auth, rate limit, idempotency, logging, tracing
│   │       ├── observability/     OTel setup (traces + Prometheus metrics)
│   │       ├── service/           Service interfaces + core-api client
│   │       └── server/            Chi router and server construction
│   │
│   ├── admin-api/                 Internal admin service (:8082)
│   │   ├── cmd/admin/             Entry point
│   │   └── internal/
│   │       ├── config/            Environment configuration
│   │       ├── handler/           Admin handlers (compliance, settlements, payouts, …)
│   │       ├── middleware/        Admin key auth, structured logging, tracing
│   │       ├── observability/     OTel setup (traces + Prometheus metrics)
│   │       ├── service/           CoreAdminClient (wraps Rust internal routes)
│   │       └── server/            Chi router and server construction
│   │
│   └── public-api/                Consumer-facing API (:8083)
│       ├── cmd/public-api/        Entry point
│       └── internal/
│           ├── config/            Environment configuration
│           ├── handler/           Auth, transfers, wallets, payment-links handlers
│           ├── middleware/        Consumer JWT auth, structured logging, tracing
│           ├── service/           CorePublicClient + CredentialStore
│           └── server/            Chi router and server construction
│
├── apps/                          Frontend and mobile applications
│   ├── dashboard/                 Merchant dashboard (Next.js, :3010)
│   ├── admin/                     Internal admin panel (Next.js, :3002)
│   ├── pay/                       Consumer pay page — payment links (Next.js, :3003)
│   ├── checkout/                  Hosted checkout — QR-first payment UX (Next.js, :3004)
│   ├── mobile/                    Flutter multi-flavor mobile app
│   │   ├── lib/main_consumer.dart Consumer entry point (Banzami app)
│   │   ├── lib/main_merchant.dart Merchant entry point (Banzami Comerciante)
│   │   ├── lib/merchant/          Merchant screens and session service
│   │   ├── ios/                   iOS project with consumer + merchant xcschemes
│   │   └── android/               Android project with consumer + merchant productFlavors
│   ├── merchant/                  Standalone Flutter merchant app (reference project)
│   └── docs/                      Developer documentation site
│
├── sdk/
│   ├── flutter/                   Flutter SDK — mobile runtime (iOS + Android)
│   │   ├── lib/client/            BanzamiClient (HTTP, auth, retry, idempotency, hooks)
│   │   ├── lib/models/            Typed response models
│   │   ├── test/                  Unit + integration tests (MockClient)
│   │   └── CHANGELOG.md
│   ├── typescript/                TypeScript SDK — Node.js, Next.js, browser
│   │   ├── src/client.ts          BanzamiClient (ESM + CJS, retry, hooks, idempotency)
│   │   ├── src/types.ts           Pydantic-style response type definitions
│   │   ├── examples/              next-api-route, node-webhook, browser-checkout
│   │   └── CHANGELOG.md
│   └── python/                    Python SDK — async-first (Django, FastAPI, Flask)
│       ├── banzami/               Package root
│       │   ├── client.py          BanzamiClient + BanzamiHooks
│       │   ├── resources/         transactions, qr_payments, transfers, payouts, …
│       │   ├── models/            Pydantic v2 response models
│       │   ├── exceptions.py      Clean exception hierarchy
│       │   └── signature.py       HMAC-SHA256 webhook verification
│       ├── examples/              fastapi, django, flask, qr_checkout, webhook_handler
│       ├── tests/                 58 tests, 88% coverage
│       └── CHANGELOG.md
│
├── plugins/
│   ├── woocommerce/               WooCommerce payment gateway plugin
│   ├── generic-php/               PHP adapter (no external dependencies)
│   │   ├── src/BanzamiClient.php  Full API surface + retry + hooks
│   │   ├── examples/              payment-link, webhook-handler, wallet-and-payout
│   │   └── CHANGELOG.md
│   ├── generic-laravel/           Laravel service provider + facades
│   │   └── CHANGELOG.md
│   └── generic-node/              Node.js adapter
│       ├── src/client.ts          BanzamiClient + BanzamiHooks
│       ├── examples/              payment-link, webhook-express, wallet-payout
│       └── CHANGELOG.md
│
├── db/
│   └── migrations/                Global PostgreSQL migrations (0001–0015)
│
├── infra/
│   ├── docker/                    Docker Compose for local development
│   ├── terraform/                 Infrastructure as code
│   ├── monitoring/                Prometheus scrape config + Grafana provisioning
│   └── deployment/                Deployment scripts and runbooks
│
├── docs/
│   ├── adr/                       Architecture Decision Records (ADR-001 – ADR-011)
│   ├── domains/                   Per-domain technical documentation
│   ├── security/                  Security model and threat analysis
│   ├── runbooks/                  Operational runbooks
│   ├── playbooks/                 Incident playbooks
│   └── api/                       API reference documentation
│
├── tools/                         Internal developer tooling
├── CLAUDE.md                      Engineering Constitution (mandatory reading)
└── README.md                      This file
```

---

## Technology Stack

| Layer                | Technology                                        | Rationale                                          |
|----------------------|---------------------------------------------------|----------------------------------------------------|
| Financial core       | **Rust**                                          | Memory safety, determinism, zero-cost abstractions |
| API & orchestration  | **Go**                                            | Simplicity, concurrency, operational reliability   |
| Frontend             | **TypeScript / Next.js / React**                  | Type safety, SSR, ecosystem maturity               |
| Mobile SDK           | **Flutter**                                       | Single codebase, native performance                |
| Database             | **PostgreSQL**                                    | ACID guarantees, transactional correctness         |
| Cache & coordination | **Redis**                                         | Sliding-window rate limiting, idempotency keys     |
| HTTP framework (Rust)| **Axum 0.7**                                      | Ergonomic, tokio-native, compile-time safety       |
| HTTP framework (Go)  | **Chi v5**                                        | Lightweight, idiomatic, stdlib-compatible          |
| Async runtime        | **Tokio**                                         | Battle-tested Rust async executor                  |
| Database access      | **sqlx 0.7** (Rust), **pgx** (Go, planned)        | Compile-time query validation (sqlx)               |
| Auth tokens          | **JWT (HS256)** via golang-jwt/jwt                | Stateless, expiry-enforced merchant sessions       |
| Observability        | **OpenTelemetry + Prometheus + Grafana**           | Full tracing, metrics, dashboards                  |
| Infrastructure       | **Docker + IONOS + Cloudflare**                   | Cost-effective, reliable European/African hosting  |

Kubernetes is intentionally deferred. The modular monolith approach provides simpler operations until scale demands otherwise.

---

## Design System

Banzami maintains a unified design system shared across all web and mobile surfaces. The single source of truth for design tokens is:

- **Web / TypeScript:** [`sdk/typescript/src/theme/index.ts`](sdk/typescript/src/theme/index.ts)
- **Mobile / Flutter:** [`sdk/flutter/lib/theme/banzami_theme.dart`](sdk/flutter/lib/theme/banzami_theme.dart)
- **Tailwind config:** extended in each Next.js app from the shared token values

### Brand Colour Palette

| Token         | Hex       | Role                                          |
|---------------|-----------|-----------------------------------------------|
| `wine`        | `#990011` | Space Cherry — primary identity, CTA buttons  |
| `wineDark`    | `#6B000B` | Gradient deep end / pressed state             |
| `wineMedium`  | `#B5001A` | Gradient light end / hover state              |
| `wineRose`    | `#A63A50` | Wine Rose — secondary: badges, tags, accents  |
| `gold`        | `#C89B3C` | Savanna Gold — accent: highlights, emphasis   |
| `goldLight`   | `#D4AF5C` | Gold hover / light variant                    |
| `offWhite`    | `#FCF6F5` | Warm White — main background                  |
| `gray100`     | `#F5EEED` | Form fills, chips                             |
| `gray200`     | `#EBE3E2` | Borders, dividers (Flutter only)              |
| `gray400`     | `#9C8483` | Secondary text                                |
| `gray700`     | `#534040` | Tertiary text                                 |
| `gray900`     | `#1A1A1A` | Primary text                                  |
| `success`     | `#166534` | Success state (Flutter) / `#1A7A4A` (web SDK) |
| `warning`     | `#92400E` | Warning state                                 |
| `error`       | `#DC2626` | Error state — distinct from Space Cherry      |
| `info`        | `#1E3A8A` | Informational state                           |

### Typography

- **Sans:** Inter (primary UI font)
- **Mono:** JetBrains Mono (amounts, codes, terminal output)

### Spacing Scale

`micro (2px) → xs (4px) → sm (8px) → md (12px) → lg (16px) → xl (24px) → 2xl (32px) → section (48px) → page (64px)`

### Border Radius

`sm (4px) → md (8px) → lg (12px) → xl (16px) → 2xl (24px) → full (9999px)`

See [`docs/brand/audit-2026-05-15.md`](docs/brand/audit-2026-05-15.md) for the full platform branding audit and the correction record.

---

## Integration Ecosystem

> The integration layer is not built on top of Banzami — it **is** Banzami from the merchant's and developer's perspective.

Every SDK, plugin, and checkout interface is production infrastructure, held to the same engineering standards as the Rust ledger. See [ADR-011](docs/adr/ADR-011-integration-ecosystem-strategy.md) and the [Integration Ecosystem Strategy](docs/architecture/integration-ecosystem.md) for the full rationale.

### Integration Pyramid

```
                          ┌──────────────────────┐
                          │   Flutter Widgets &   │
                          │   Hosted Checkout     │  ← consumer UX
                          └──────────┬───────────┘
                                     │
                     ┌───────────────┴───────────────┐
                     │   WooCommerce Plugin           │  ← commerce
                     └───────────────┬───────────────┘
                                     │
              ┌──────────────────────┴──────────────────────┐
              │  TypeScript SDK  ·  Python SDK  ·  PHP SDK  │  ← developers
              └──────────────────────┬──────────────────────┘
                                     │
                     ┌───────────────┴───────────────┐
                     │  Node Adapter  ·  PHP Adapter  │  ← server runtimes
                     └───────────────┬───────────────┘
                                     │
                          ┌──────────┴───────────┐
                          │    REST API + OpenAPI  │  ← foundation
                          └──────────────────────┘
```

### v1 Ecosystem Components

| Layer | Component | Location | Priority | Notes |
|-------|-----------|----------|----------|-------|
| Mobile SDK | Flutter SDK | [`sdk/flutter/`](sdk/flutter/) | **CRITICAL** | Runtime for consumers + merchants; full widget library |
| Web/Backend SDK | TypeScript SDK | [`sdk/typescript/`](sdk/typescript/) | **CRITICAL** | ESM + CJS; SSR-safe; Node.js, Next.js, browser |
| Python SDK | Python SDK | [`sdk/python/`](sdk/python/) | **HIGH** | async-first (httpx + pydantic v2 + tenacity); Django, FastAPI, Flask |
| Commerce plugin | WooCommerce | [`plugins/woocommerce/`](plugins/woocommerce/) | **CRITICAL** | WordPress/WooCommerce gateway plugin |
| Server adapters | generic-node, generic-php | [`plugins/`](plugins/) | HIGH | Thin adapters for Node.js and PHP without framework dependencies |
| Hosted checkout | Checkout app | [`apps/checkout/`](apps/checkout/) | **CRITICAL** | QR-first payment UX for links shared over WhatsApp / social |
| API layer | REST API + OpenAPI | [`docs/api/`](docs/api/) | **CRITICAL** | OpenAPI spec, versioned endpoints, full schema documentation |

### SDK Engineering Standards

All SDKs implement the same baseline contract:

| Requirement | Behaviour |
|-------------|-----------|
| Retry policy | Exponential backoff — 500ms base, 3× max retries; retry only on `429`, `502`, `503`, `504` |
| Idempotency | Key generated **once** before first attempt, reused across all retries |
| Exception hierarchy | Clean typed errors — no raw HTTP errors leak to callers |
| Typed models | All responses are typed (Pydantic v2 / TS interfaces / Dart classes) |
| Webhook verification | HMAC-SHA256 with constant-time comparison |
| Observability hooks | `onRequest` / `onResponse` / `onError` callbacks — zero overhead when unused |

### QR Capability Matrix

| Integration point | Static QR | Dynamic QR | Scan & Pay | Generate & Display |
|------------------|-----------|------------|------------|-------------------|
| Flutter SDK | ✓ | ✓ | ✓ (camera) | ✓ (widget) |
| Hosted Checkout | ✓ | ✓ | — | ✓ |
| TypeScript SDK | ✓ | ✓ | — | via API |
| Python SDK | ✓ | ✓ | — | via API |
| WooCommerce | ✓ | ✓ | — | ✓ (checkout page) |

QR is the primary payment modality for Angola's market — it works offline, requires no card infrastructure, and collapses the payment flow to scan → confirm.

---

## Domain Model

### Rust Crates

#### `banzami-types`
Shared primitives used across all domains.

- **`Money`** — integer minor units, never floating-point. `Money::new(1000_00, Currency::AOA)` = 1,000 AOA.
- **`Currency`** — AOA (Angolan Kwanza) and major international currencies.
- **Typed IDs** — `AccountId`, `WalletId`, `TransactionId`, `SettlementId`, `PayoutId`, `MerchantId`, `CustomerId`, `LedgerPostingId`, `ReconciliationRunId`. Mixing IDs is a compile error.

```rust
// Compile error — cannot pass a WalletId where TransactionId is expected
fn get_transaction(id: TransactionId) { ... }
get_transaction(wallet_id);  // ERROR: mismatched types
```

---

#### `banzami-ledger`
The double-entry accounting engine. The financial truth of the system.

Every financial movement creates a balanced journal entry. Debits always equal credits. Entries are immutable and append-only.

```
Account Types: ASSET | LIABILITY | EQUITY | REVENUE | EXPENSE

Every posting must balance:
  sum(DEBIT amounts) == sum(CREDIT amounts)
```

Account examples:
| Account                | Type      | Represents                       |
|------------------------|-----------|----------------------------------|
| `bank_account`         | ASSET     | Funds held at the acquiring bank |
| `merchant_wallet`      | LIABILITY | Funds owed to the merchant       |
| `transit_account`      | LIABILITY | Funds in-flight during a payment |

---

#### `banzami-wallets`
Merchant wallet lifecycle management with balance tracking.

```
WalletStatus state machine:

  Active ──► Suspended ──► Active
     │
     └──► Closed  (terminal)
```

Operations: `reserve` (holds funds), `release` (frees a hold), `settle` (confirms a debit).

Balance components:
- **available** — funds free to use
- **reserved** — funds on hold (authorized but not captured)
- **total** — available + reserved

---

#### `banzami-transactions`
Payment transaction lifecycle with strict state machine enforcement.

```
Transaction state machine:

  Pending ──► Authorized ──► Captured  (terminal)
     │              │
     │              └──► Reversed  (terminal)
     │
     └──► Failed  (terminal)
```

Transaction types: `Payment`, `Refund`, `Transfer`.

Each transition validates business rules (sufficient balance, correct currency, compliance gate) before writing to the ledger.

---

#### `banzami-merchants`
Merchant registration, status management, and API key lifecycle.

- SHA-256 hashed API keys stored; plaintext never persisted after creation.
- Multiple API keys per merchant; per-key scopes.
- Status: `Active`, `Suspended`.

---

#### `banzami-settlement`
Batch settlement netting and acquirer lifecycle.

```
Settlement state machine:

  Pending ──► Submitted ──► Settled  (terminal)
     │              │
     └──────────────┴──► Failed  (terminal)
```

At `Settled`: posts `DR bank_account / CR transit_account` to the ledger (net funds received from acquirer).

A settlement batch covers a merchant's wallet for a given period: `gross_amount - fee_amount = net_amount`.

---

#### `banzami-payouts`
Merchant payout orchestration — the flow of funds from Banzami to merchant bank accounts.

```
Payout state machine:

  Pending ──► Processing ──► Sent ──► Confirmed  (terminal)
     │              │          │
     │              │          └──► Returned  (terminal, ledger reversed)
     │              │
     │              └──► Failed  (terminal, ledger reversed if posted)
     │
     └──► Failed  (terminal, no ledger entry)
```

Ledger entries at key transitions:
| Transition          | Debit               | Credit              |
|---------------------|---------------------|---------------------|
| Pending → Processing | `merchant_wallet`   | `bank_account`      |
| Processing → Failed | `bank_account`      | `merchant_wallet`   |
| Sent → Returned     | `bank_account`      | `merchant_wallet`   |

---

#### `banzami-reconciliation`
External bank statement matching against internal settlement records.

```
Match logic (greedy, by amount + currency):

  For each internal settlement:
    find first unconsumed external line with same (amount, currency)
    → MATCHED
    → else MISSING_EXTERNAL

  For each unconsumed external line:
    → MISSING_INTERNAL

  Amount match on reference but different amount:
    → AMOUNT_MISMATCH (discrepancy_minor recorded)
```

The `ReconciliationEngine` is intentionally decoupled from the settlement crate — it accepts `SettlementView` slices from the caller, keeping it testable and DB-free for matching logic.

---

#### `banzami-compliance`
KYB (Know Your Business) and KYC/AML enforcement.

```
ComplianceStatus (merchant KYB and AML):

  Pending ──► Approved ──► Suspended
     │           │
     │           └──► UnderReview (AML flag)
     │
     └──► Rejected  (terminal)
```

KYC levels enforce per-transaction and daily volume limits:
| Level      | Max single transaction | Max daily volume |
|------------|------------------------|------------------|
| `NONE`     | 0 (blocked)            | 0 (blocked)      |
| `BASIC`    | 50,000 AOA             | 500,000 AOA      |
| `ENHANCED` | 500,000 AOA            | 5,000,000 AOA    |
| `FULL`     | Unlimited              | Unlimited        |

`can_operate()` returns `true` only when `ComplianceStatus::Approved`. This gates all transaction processing.

---

#### `banzami-risk` and `banzami-routing`
- **Risk:** transaction scoring with configurable thresholds (conservative defaults in production).
- **Routing:** Angola-specific acquirer/PSP selection rules.

Both use static configuration today. Dynamic rule evaluation is a planned future capability.

---

#### `banzami-identity`
Consumer identity and handle registry. Handles are the human-readable address for P2P payments (e.g. `@joao`). Unique within the platform. Consumers are independent of merchants — separate domain with separate typed IDs (`ConsumerId`).

---

#### `banzami-consumer-wallets`
Consumer wallet lifecycle. Each consumer has an AOA wallet with two ledger accounts:
- **available** — spendable balance
- **reserved** — funds held for pending transfers

Operations: `provision`, `get_balance`. Balances are derived from ledger entries — no stored balance field.

---

#### `banzami-transfers`
Instant P2P transfer engine. Atomic double-entry postings: debits sender's available account, credits recipient's available account in a single transaction.

Core invariants:
- Zero and negative amounts rejected before any DB write
- Self-transfer rejected (sender == recipient)
- Insufficient funds checked via `SELECT FOR UPDATE` — concurrent transfers are serialised at the row lock level
- Fully idempotent: duplicate `idempotency_key` returns the original transfer

---

#### `banzami-qr`
Static and dynamic QR code payment codes. Static codes link to a merchant and accept any amount. Dynamic codes embed a specific amount and expire after use or a configurable TTL.

---

#### `banzami-payment-links`
Shareable URL payments for informal commerce. A payment link has a human-readable slug, an optional fixed amount (open links accept any amount), and a state machine:

```
ACTIVE ──► USED       (single-use link paid)
       ──► CANCELLED  (merchant cancelled)
       ──► EXPIRED    (TTL elapsed, background worker)
```

Idempotency: the pay endpoint uses `"pl-pay-" + link.ID` as the transfer idempotency key, so network retries never double-charge.

---

## Services

### API Gateway (`services/api-gateway`, port 8080)

The public internet-facing service. All merchant API calls enter here.

**Middleware stack (in order):**
1. `RealIP` — trust X-Forwarded-For from Cloudflare
2. `RequestID` — assigns correlation ID to every request
3. `Logger` — structured slog request logging (JSON in production)
4. `Recoverer` — panic → 500, never crashes the server
5. `Timeout(60s)` — kills slow upstream calls
6. `RouteSpan` — enriches the OTel span with the chi route pattern
7. `Auth` — JWT Bearer token validation (authenticated routes only)
8. `RateLimit` — Redis sliding-window: 1,000 req/min authenticated, 60 req/min anonymous
9. `Idempotency` — Redis-backed: replays cached response for duplicate keys

**Configuration (environment variables):**
| Variable              | Default   | Description                            |
|-----------------------|-----------|----------------------------------------|
| `PORT`                | `8080`    | Listen port                            |
| `JWT_SECRET`          | required  | HS256 signing key                      |
| `CORE_API_URL`        | required  | Rust core-api base URL                 |
| `REDIS_URL`           | required  | Redis URL (`redis://host:port`)        |
| `OTLP_ENDPOINT`       | optional  | OTLP HTTP endpoint for trace export    |
| `LOG_LEVEL`           | `info`    | `debug` / `info` / `warn` / `error`   |
| `LOG_FORMAT`          | `json`    | `json` (production) / `pretty` (dev)  |

---

### Admin API (`services/admin-api`, port 8082)

Internal-only service for compliance operations, settlement management, and reconciliation triggers. Never exposed to the public internet.

**Authentication:** `X-Admin-Key: <key>` header.

**Configuration (environment variables):**
| Variable              | Default                   | Description                   |
|-----------------------|---------------------------|-------------------------------|
| `ADMIN_API_PORT`      | `8082`                    | Listen port                   |
| `CORE_API_URL`        | `http://127.0.0.1:8081`   | Rust core-api base URL        |
| `ADMIN_API_KEY`       | required                  | Shared secret for admin auth  |
| `OTLP_ENDPOINT`       | optional                  | OTLP HTTP endpoint            |
| `LOG_LEVEL`           | `info`                    | Log verbosity                 |
| `LOG_FORMAT`          | `json`                    | `json` / `pretty`             |

---

### Public API (`services/public-api`, port 8083)

Consumer-facing service. This is what the mobile app (Flutter SDK) calls directly. Never used by merchants.

**Authentication:** PIN + JWT (HS256, 24h TTL). Consumer registers with a unique handle and a 4–8 digit PIN. Credentials (bcrypt-hashed PIN) are stored in `public_api_credentials` — the only table public-api owns directly. All monetary operations delegate to core-api.

**Public endpoints (no auth):**

| Method | Path                           | Description                             |
|--------|--------------------------------|-----------------------------------------|
| POST   | `/v1/auth/register`            | Register consumer — returns JWT         |
| POST   | `/v1/auth/token`               | PIN login — returns JWT                 |
| GET    | `/v1/payment-links/{slug}`     | Resolve a payment link (public)         |
| GET    | `/health`                      | Liveness probe                          |
| GET    | `/metrics`                     | Prometheus metrics                      |

**Authenticated endpoints (Bearer JWT required):**

| Method | Path                           | Description                             |
|--------|--------------------------------|-----------------------------------------|
| GET    | `/v1/me`                       | Get own consumer profile                |
| GET    | `/v1/me/wallet`                | Get own AOA wallet                      |
| GET    | `/v1/me/wallet/balance`        | Get available and reserved balance      |
| POST   | `/v1/transfers`                | Send P2P transfer (by recipient handle) |
| GET    | `/v1/transfers`                | List own transfers                      |
| GET    | `/v1/transfers/{id}`           | Get transfer by ID                      |
| POST   | `/v1/payment-links/{slug}/pay` | Pay a payment link                      |

**Configuration (environment variables):**
| Variable          | Default  | Description                           |
|-------------------|----------|---------------------------------------|
| `PUBLIC_API_PORT` | `8083`   | Listen port                           |
| `CORE_API_URL`    | required | Rust core-api base URL                |
| `DATABASE_URL`    | required | PostgreSQL (for `public_api_credentials`) |
| `JWT_SECRET`      | required | Shared HS256 key (same as api-gateway)|
| `LOG_LEVEL`       | `info`   | Log verbosity                         |
| `OTLP_ENDPOINT`   | optional | OTLP HTTP endpoint                    |

---

### Rust Core API (`core/api`, port 8081)

Internal HTTP server binding all Rust domain crates. Only reachable from localhost. Uses Axum with `TraceLayer` for structured request tracing.

**Configuration (environment variables):**
| Variable              | Default  | Description                              |
|-----------------------|----------|------------------------------------------|
| `DATABASE_URL`        | required | PostgreSQL connection string             |
| `CORE_API_PORT`       | `8081`   | Listen port                              |
| `TRANSIT_ACCOUNT_ID`  | auto-gen | Ledger account ID for in-flight funds    |
| `BANK_ACCOUNT_ID`     | auto-gen | Ledger account ID for bank funds         |

---

## API Reference

### Public API (api-gateway, authenticated with JWT)

| Method | Path                            | Description                           |
|--------|---------------------------------|---------------------------------------|
| POST   | `/v1/auth/token`                | Exchange API key for JWT              |
| POST   | `/v1/transactions`              | Create a payment transaction          |
| GET    | `/v1/transactions`              | List transactions                     |
| GET    | `/v1/transactions/{id}`         | Get transaction by ID                 |
| POST   | `/v1/wallets`                   | Provision a new wallet                |
| GET    | `/v1/wallets/{id}`              | Get wallet details                    |
| GET    | `/v1/wallets/{id}/balance`      | Get wallet balance                    |
| POST   | `/v1/payouts`                   | Request a payout                      |
| GET    | `/v1/payouts`                   | List payouts                          |
| GET    | `/v1/payouts/{id}`              | Get payout by ID                      |
| POST   | `/v1/webhooks/endpoints`        | Register a webhook endpoint           |
| GET    | `/v1/webhooks/endpoints`        | List webhook endpoints                |
| GET    | `/v1/webhooks/endpoints/{id}`   | Get webhook endpoint                  |
| DELETE | `/v1/webhooks/endpoints/{id}`   | Deactivate webhook endpoint           |
| GET    | `/v1/webhooks/events`           | List webhook events                   |
| GET    | `/v1/webhooks/events/{id}/deliveries` | List delivery attempts          |
| POST   | `/v1/merchants`                 | Register a merchant                   |
| GET    | `/v1/merchants/{id}`            | Get merchant details                  |
| POST   | `/v1/merchants/{id}/suspend`    | Suspend a merchant                    |
| POST   | `/v1/merchants/{id}/api-keys`   | Create an API key                     |
| GET    | `/v1/merchants/{id}/api-keys`   | List API keys                         |
| DELETE | `/v1/merchants/{id}/api-keys/{keyID}` | Revoke an API key             |
| POST   | `/v1/payment-links`             | Create a payment link                 |
| GET    | `/v1/payment-links`             | List payment links (`?merchant_id=`)  |
| GET    | `/v1/payment-links/{id}`        | Get payment link                      |
| DELETE | `/v1/payment-links/{id}`        | Cancel a payment link                 |
| POST   | `/v1/payment-links/{id}/mark-used` | Mark payment link as used          |
| GET    | `/v1/public/pay/{slug}`         | Resolve link by slug (no auth)        |
| GET    | `/v1/public/pay/{slug}/status`  | Check if link is paid (no auth)       |

Observability:
- `GET /health` — liveness probe
- `GET /readyz` — readiness probe (checks core-api connectivity)
- `GET /metrics` — Prometheus metrics

---

### Admin API (admin-api, authenticated with X-Admin-Key)

**Compliance**

| Method | Path                                          | Description                        |
|--------|-----------------------------------------------|------------------------------------|
| GET    | `/admin/v1/compliance/merchants/{id}`         | Get KYB + AML status               |
| POST   | `/admin/v1/compliance/merchants/{id}/approve` | Approve KYB — enables processing   |
| POST   | `/admin/v1/compliance/merchants/{id}/reject`  | Reject KYB (requires `notes`)      |
| POST   | `/admin/v1/compliance/merchants/{id}/suspend` | Suspend merchant (requires `notes`)|
| POST   | `/admin/v1/compliance/merchants/{id}/flag-aml`| Flag for AML review (requires `notes`) |

**Settlements**

| Method | Path                                    | Description                        |
|--------|-----------------------------------------|------------------------------------|
| POST   | `/admin/v1/settlements`                 | Create settlement batch            |
| GET    | `/admin/v1/settlements?merchant_id=`    | List settlements for merchant      |
| GET    | `/admin/v1/settlements/{id}`            | Get settlement                     |
| POST   | `/admin/v1/settlements/{id}/submit`     | Submit to acquirer                 |
| POST   | `/admin/v1/settlements/{id}/confirm`    | Confirm (posts ledger DR/CR)       |
| POST   | `/admin/v1/settlements/{id}/fail`       | Mark failed (requires `reason`)    |

**Payouts**

| Method | Path                                    | Description                        |
|--------|-----------------------------------------|------------------------------------|
| GET    | `/admin/v1/payouts?merchant_id=`        | List payouts for merchant          |
| GET    | `/admin/v1/payouts/{id}`                | Get payout                         |
| POST   | `/admin/v1/payouts/{id}/process`        | Process — posts ledger DR/CR       |
| POST   | `/admin/v1/payouts/{id}/sent`           | Mark as sent to bank               |
| POST   | `/admin/v1/payouts/{id}/confirm`        | Confirm bank receipt               |
| POST   | `/admin/v1/payouts/{id}/fail`           | Mark failed (requires `reason`)    |
| POST   | `/admin/v1/payouts/{id}/returned`       | Record bank return + reverse ledger|

**Reconciliation**

| Method | Path                                    | Description                           |
|--------|-----------------------------------------|---------------------------------------|
| POST   | `/admin/v1/reconciliation/run`          | Run reconciliation against statement  |

**Merchants**

| Method | Path                         | Description            |
|--------|------------------------------|------------------------|
| GET    | `/admin/v1/merchants/{id}`   | Get merchant details   |

Observability:
- `GET /health` — liveness probe
- `GET /metrics` — Prometheus metrics

---

### Internal Routes (core-api, loopback only)

The same operations are available at `/internal/v1/*` on port 8081. These are the routes the Go services actually call. They are never proxied to the public internet.

---

## Financial Flows

### Payment Transaction Flow

```
Merchant calls POST /v1/transactions
         │
         ▼
  API Gateway validates JWT
  Idempotency key checked (Redis)
         │
         ▼
  POST /internal/v1/transactions (Rust)
         │
         ▼
  Compliance check: merchant.can_process_transactions()?
  Risk scoring: score < threshold?
  Wallet balance check: available >= amount?
         │
         ├── Fail → 400/422 error returned
         │
         ▼
  Status: PENDING

  POST /internal/v1/transactions/{id}/authorize
         │
         ▼
  Ledger posting:
    DR  customer_wallet  (LIABILITY ↓)
    CR  transit_account  (LIABILITY ↑)

  Wallet: available -= amount; reserved += amount
  Status: AUTHORIZED

  POST /internal/v1/transactions/{id}/capture
         │
         ▼
  Ledger posting:
    DR  transit_account   (LIABILITY ↓)
    CR  merchant_wallet   (LIABILITY ↑)

  Wallet: reserved -= amount; merchant available += amount
  Status: CAPTURED  ✓
```

### Settlement Flow

```
Admin creates settlement batch:
  POST /admin/v1/settlements
  { merchant_id, wallet_id, gross_amount, fee_amount, period_start, period_end }
         │
         ▼
  Status: PENDING
  gross_amount - fee_amount = net_amount stored

  POST /admin/v1/settlements/{id}/submit
         │
         ▼
  Status: SUBMITTED  (batch dispatched to acquirer)

  POST /admin/v1/settlements/{id}/confirm
         │
         ▼
  Ledger posting (net settlement received from acquirer):
    DR  bank_account    (ASSET ↑)    ← funds arrive from acquirer
    CR  transit_account (LIABILITY ↓) ← clears in-flight balance

  Status: SETTLED  ✓

  POST /admin/v1/settlements/{id}/fail
         │
         ▼
  Status: FAILED  (no ledger entry — funds never moved)
```

### Payout Flow

```
Merchant requests payout:
  POST /v1/payouts
  { amount, destination_bank_account, idempotency_key }
         │
         ▼
  Status: PENDING
  (no ledger entry yet — commitment not made)

  Admin processes:
  POST /admin/v1/payouts/{id}/process
         │
         ▼
  Ledger posting (funds committed for transfer):
    DR  merchant_wallet  (LIABILITY ↓) ← debit merchant balance
    CR  bank_account     (ASSET ↓)     ← funds leave Banzami's account

  Status: PROCESSING
  ledger_posting_id stored for potential reversal

  POST /admin/v1/payouts/{id}/sent
         │
         ▼
  Status: SENT  (bank transfer dispatched)

  POST /admin/v1/payouts/{id}/confirm
         │
         ▼
  Status: CONFIRMED  ✓  (bank confirms receipt — no new ledger entry)

  — OR —

  POST /admin/v1/payouts/{id}/returned
         │
         ▼
  Ledger reversal (bank returns funds):
    DR  bank_account     (ASSET ↑)    ← funds return
    CR  merchant_wallet  (LIABILITY ↑) ← merchant balance restored

  Status: RETURNED  ✓

  POST /admin/v1/payouts/{id}/fail  (at any status after PENDING)
         │
         ▼
  If posting_id exists → reversal posted (same as returned)
  Status: FAILED  ✓
```

### Reconciliation Flow

```
Admin triggers reconciliation:
  POST /admin/v1/reconciliation/run
  {
    merchant_id,
    period_start,
    period_end,
    external_lines: [
      { reference, amount_minor, currency, posted_at },
      ...
    ]
  }
         │
         ▼
  Rust fetches all SETTLED settlements for merchant in period

  For each internal settlement, find matching external line:
    match criteria: (amount_minor == net_amount_minor) AND (currency == currency)
    greedy: first unconsumed match wins

  Results per record:
    MATCHED          — internal and external agree
    MISSING_EXTERNAL — internal settlement has no external counterpart
    MISSING_INTERNAL — external line has no internal settlement
    AMOUNT_MISMATCH  — reference matches, amounts differ

  Returns ReconciliationReport:
    { run_id, total_checked, matched, missing_external,
      missing_internal, amount_mismatches,
      total_discrepancy_minor, records[] }
```

---

## Database Schema

All schema changes are managed as numbered migrations in `db/migrations/`. Migrations must be applied in sequence before running `cargo check` (sqlx validates queries at compile time).

| Migration | Domain              | Key Tables                                           |
|-----------|---------------------|------------------------------------------------------|
| `0001`    | Ledger              | `ledger_accounts`, `ledger_postings`, `ledger_entries` |
| `0002`    | Wallets             | `wallets`, `wallet_events`                           |
| `0003`    | Transactions        | `transactions`                                       |
| `0004`    | Merchants           | `merchants`, `api_keys`                              |
| `0005`    | Settlements         | `settlements`                                        |
| `0006`    | Payouts             | `payouts`                                            |
| `0007`    | Reconciliation      | `reconciliation_runs`, `reconciliation_records`      |
| `0008`    | Compliance          | `merchant_compliance`, `customer_compliance`         |
| `0009`    | Webhooks            | `webhook_endpoints`, `webhook_events`, `webhook_deliveries` |
| `0010`    | Consumer Identity   | `consumers`                                          |
| `0011`    | Consumer Wallets    | `consumer_wallets`                                   |
| `0012`    | Transfers           | `transfers`                                          |
| `0013`    | QR Codes            | `qr_codes`                                           |
| `0014`    | Payment Links       | `payment_links`                                      |
| `0015`    | Public API Auth     | `public_api_credentials`                             |

### Financial Precision

Money is always stored as **integer minor units** (`i64`):
- `1000_00` = 1,000.00 AOA (minor unit: centavo)
- Floating-point arithmetic is forbidden in all financial calculations
- The `Money` type enforces this at the type system level

### Double-Entry Invariant

The database enforces that ledger postings are balanced through application-level validation before insert. Every `ledger_postings` row links to multiple `ledger_entries`. The sum of DEBIT entries always equals the sum of CREDIT entries for any given posting.

---

## Security Model

### Authentication Layers

```
Layer 1: Cloudflare
  DDoS protection, WAF rules, TLS termination

Layer 2: API Gateway (api-gateway) — merchants
  Merchants authenticate with API Key → GET JWT
  JWT: HS256, short-lived, contains MerchantID + scopes
  All authenticated routes: Bearer JWT required

Layer 2b: Public API (public-api) — consumers
  Consumers authenticate with handle + PIN → GET JWT
  JWT: HS256, 24h TTL, contains CustomerID + scopes
  PIN stored as bcrypt hash; plaintext never persisted
  Consumer tokens carry customer_id claim (not merchant_id)
  → merchant tokens are rejected at the consumer middleware

Layer 3: Admin API (admin-api)
  X-Admin-Key header
  Network-level: only reachable from internal network

Layer 4: Core API (core-api)
  Loopback only — binds 0.0.0.0 but firewalled to 127.0.0.1
  No authentication — network isolation is the control
```

### API Key Management

- API keys are generated as random UUIDs
- Only the SHA-256 hash is stored in PostgreSQL
- The plaintext key is returned once at creation and never stored
- Keys are per-merchant, per-scope, revocable individually

### Idempotency

All financial write operations support idempotency keys:
- Key stored in Redis with TTL
- Duplicate requests within TTL receive the cached response
- Prevents double-charges on network retries

### Rate Limiting

Redis sliding-window rate limiter:
- Authenticated merchants: 1,000 requests/minute
- Anonymous/unauthenticated: 60 requests/minute
- Fails open on Redis unavailability (rate limit must not block all traffic during Redis degradation)

---

## Observability

Every service exposes structured logs, metrics, and traces per CLAUDE.md §9.

| Signal    | Technology        | Details                                                        |
|-----------|-------------------|----------------------------------------------------------------|
| Logs      | `slog` (Go), `tracing` (Rust) | Structured JSON; includes request ID and duration  |
| Traces    | OpenTelemetry SDK + OTLP HTTP | End-to-end spans across Go and Rust; no-op if `OTLP_ENDPOINT` unset |
| Metrics   | Prometheus        | `GET /metrics` on `:8080` and `:8082`; `http.server.request.duration`, active request counts |
| Dashboards| Grafana           | Auto-provisioned with Prometheus datasource at `:3000`         |

### Trace Instrumentation

- `otelhttp.NewHandler` wraps each chi router — one span per HTTP request
- `RouteSpan` middleware sets the low-cardinality route pattern (`GET /v1/payouts/{id}`) on the span, preventing label cardinality explosion in Prometheus and Jaeger
- W3C TraceContext propagation is always enabled — upstream `traceparent` headers are honoured

### Health Endpoints

- `GET /health` — liveness (is the process alive?)
- `GET /readyz` — readiness (can the service handle traffic?)
- `GET /metrics` — Prometheus scrape endpoint

### Full Observability Stack (Docker Compose)

```bash
make stack-up
# Prometheus available at http://localhost:9090
# Grafana available at http://localhost:3000 (admin / banzami_dev)
```

---

## Local Development

### Prerequisites

- Rust (stable, 1.75+) — `rustup update stable`
- Go 1.22+ — `go version`
- Node 20+ + npm — `node --version`
- Flutter (stable, 3.x+) — `flutter --version`
- Docker + Docker Compose
- `sqlx-cli` — `cargo install sqlx-cli --features postgres`
- **tmux** — `brew install tmux` (macOS) / `sudo apt install tmux` (Debian/Ubuntu)

### Quick Start

```bash
./dev.sh
```

`dev.sh` handles everything automatically: copies `.env.example` if no `.env` exists, auto-generates missing secrets (`JWT_SECRET`, `ADMIN_API_KEY`, `TRANSIT_ACCOUNT_ID`, `BANK_ACCOUNT_ID`), starts PostgreSQL and Redis, applies migrations, installs npm dependencies if missing, then opens a tmux session:

| tmux window  | What runs                        | URL                        |
|--------------|----------------------------------|----------------------------|
| `core-api`   | Rust financial core              | http://localhost:8081      |
| `api-gateway`| Go merchant API                  | http://localhost:8080      |
| `admin-api`  | Go admin API                     | http://localhost:8082      |
| `public-api` | Go consumer API                  | http://localhost:8083      |
| `dashboard`  | Next.js merchant dashboard       | http://localhost:3010      |
| `admin-app`  | Next.js admin panel              | http://localhost:3002      |
| `pay`        | Next.js consumer pay page        | http://localhost:3003      |
| `checkout`   | Next.js hosted checkout          | http://localhost:3004      |

**tmux navigation** (mouse support is enabled — click on panes and window tabs):

| Keys          | Action                    |
|---------------|---------------------------|
| `Ctrl-b n`    | Next window               |
| `Ctrl-b p`    | Previous window           |
| `Ctrl-b w`    | Window list (interactive) |
| `Ctrl-b d`    | Detach (session keeps running) |
| `tmux attach -t banzami` | Re-attach |
| `./dev.sh stop` | Kill all services and the tmux session |

### Seed Test Data

After the stack is running, create a test merchant with API key and wallet:

```bash
./tools/seed.sh
# or with custom name and email:
./tools/seed.sh "Farmácia Central" farmacia@banzami.org
```

The script prints credentials ready to paste into the dashboard at `http://localhost:3010/login`:

```
Merchant ID   mch_xxxxxxxx-...
API Key       bz_live_xxxxxxxx-...   ← shown only once
Wallet ID     wlt_xxxxxxxx-...
```

**Admin panel** (`http://localhost:3002/login` locally, `https://admin.banzami.org` in production) uses the `ADMIN_API_KEY` from `.env`.

### Test Bank Account (for Payouts)

When testing the payout flow from the merchant dashboard, use this fictitious but structurally valid Angolan bank account:

| Field                    | Value                         |
|--------------------------|-------------------------------|
| Titular da conta         | `Loja Teste`                  |
| Número de conta (NIB)    | `0040 0000 0000 0001 010 10`  |
| Código do banco (BIC)    | `BAIAOLUAXXX`                 |

**Bank:** BAI — Banco Angolano de Investimentos (code `0040`)

> NIB format: `BBBB SSSS CCCCCCCCCCC DD` (4-digit bank code · 4-digit branch · 11-digit account · 2 check digits). This account is entirely fictitious and safe to use in any non-production environment.

Payouts require available balance. Use the Admin panel (`http://localhost:3002`) to run a settlement first, or create a test transaction so the merchant wallet has funds before attempting a payout.

### Manual Setup (without tmux)

```bash
# Terminal 0 — infrastructure
make dev-up        # PostgreSQL :5433, Redis :6379
make db-migrate    # apply all 15 migrations

# Terminal 1 — Rust financial core (start first)
make core-run      # :8081

# Terminal 2-4 — Go services (after core-api is healthy)
make gateway-run    # :8080
make admin-api-run  # :8082
make public-api-run # :8083

# Terminal 5-8 — Next.js apps
cd apps/dashboard && npm run dev   # :3010
cd apps/admin     && npm run dev   # :3002
cd apps/pay       && npm run dev   # :3003
cd apps/checkout  && npm run dev   # :3004
```

### Full Docker Stack (optional, for staging-like environment)

```bash
make sqlx-prepare   # generate .sqlx/ offline cache (once, then commit)
make stack-build    # build all Docker images
make stack-up       # start everything (applies migrations automatically)
# Also starts Prometheus (:9090) and Grafana (:3000, admin/banzami_dev)
```

### Mobile Apps (Flutter)

`apps/mobile` is a single Flutter project with two flavors — **consumer** (Banzami) and **merchant** (Banzami Comerciante) — built and published to the App Store and Play Store separately.

**Run in development:**

```bash
cd apps/mobile

# Consumer app — local backend
flutter run --flavor consumer -t lib/main_consumer.dart \
  --dart-define=PUBLIC_API_URL=http://192.168.1.10:8083 --debug

# Consumer app — production backend
flutter run --flavor consumer -t lib/main_consumer.dart \
  --dart-define=PUBLIC_API_URL=https://consumer.banzami.org --debug

# Merchant app — local backend
flutter run --flavor merchant -t lib/main_merchant.dart \
  --dart-define=GATEWAY_URL=http://192.168.1.10:8080 --debug

# Merchant app — production backend
flutter run --flavor merchant -t lib/main_merchant.dart \
  --dart-define=GATEWAY_URL=https://api.banzami.org --debug
```

**Build for release:**

```bash
cd apps/mobile

# iOS IPA (requires Xcode and Apple Developer account)
flutter build ipa --flavor consumer -t lib/main_consumer.dart \
  --dart-define=PUBLIC_API_URL=https://consumer.banzami.org \
  --export-options-plist=ios/ExportOptions.plist

flutter build ipa --flavor merchant -t lib/main_merchant.dart \
  --dart-define=GATEWAY_URL=https://api.banzami.org \
  --dart-define=PAY_BASE_URL=https://pay.banzami.org \
  --export-options-plist=ios/ExportOptions.plist

# Android APK
flutter build apk --flavor consumer -t lib/main_consumer.dart
flutter build apk --flavor merchant -t lib/main_merchant.dart

# Android App Bundle (Play Store)
flutter build appbundle --flavor consumer -t lib/main_consumer.dart
flutter build appbundle --flavor merchant -t lib/main_merchant.dart
```

**Bundle identifiers:**

| Flavor   | iOS Bundle ID            | Android Application ID   | Display Name         |
|----------|--------------------------|--------------------------|----------------------|
| consumer | `com.banzami.consumer`   | `com.banzami.consumer`   | Banzami              |
| merchant | `com.banzami.merchant`   | `com.banzami.merchant`   | Banzami Comerciante  |

**iOS schemes** are at `apps/mobile/ios/Runner.xcodeproj/xcshareddata/xcschemes/`:
- `consumer.xcscheme` — Debug-consumer / Release-consumer configurations
- `merchant.xcscheme` — Debug-merchant / Release-merchant configurations

**Required `--dart-define` variables** (set in CI or passed at build time):

| Variable           | Flavor(s)          | Description                          |
|--------------------|--------------------|--------------------------------------|
| `PUBLIC_API_URL`   | consumer           | Banzami Public API base URL          |
| `GATEWAY_URL`      | merchant           | Banzami API Gateway base URL         |
| `PAY_BASE_URL`     | consumer, merchant | Banzami pay page base URL            |

**Push notifications (FCM):**

Both flavors use Firebase Cloud Messaging for push notifications. Each flavor has its own Firebase app and `GoogleService-Info.plist` stored at:

```
apps/mobile/ios/config/
  consumer/GoogleService-Info.plist
  merchant/GoogleService-Info.plist
```

A build-phase script (`ios/switch_firebase_config.sh`) copies the correct plist into the bundle at build time based on `PRODUCT_BUNDLE_IDENTIFIER`.

For full setup instructions (APNs key, Apple Developer Portal, xcconfig structure, AppDelegate configuration):
→ [docs/playbooks/fcm-push-notifications-flutter-ios.md](docs/playbooks/fcm-push-notifications-flutter-ios.md)

**Consumer app navigation (4 tabs):**

| Tab       | Screen                  | Description                               |
|-----------|-------------------------|-------------------------------------------|
| Início    | `HomeScreen`            | Balance, quick actions, recent transfers  |
| Histórico | `TransactionsScreen`    | Full transfer history with filters        |
| Receber   | `BanzamiReceiveScreen`  | QR code + handle display for receiving    |
| Perfil    | `ProfileScreen`         | Account settings and security             |

**Merchant app setup flow:**
1. Merchant enters their API Key + Merchant ID
2. App verifies credentials against `GET /v1/merchants/{id}` and fetches the wallet via `GET /v1/wallets?currency=AOA`
3. Merchant creates a 6-digit PIN (stored encrypted with `FlutterSecureStorage`)
4. Subsequent launches require PIN or biometrics (Face ID / fingerprint)

**Merchant dashboard statistics:**

Daily and monthly revenue figures are computed by paginating all completed transactions since the start of the current month using the `since_created_at` filter (`GET /v1/transactions?since=<ISO8601>`). This ensures accurate totals regardless of transaction volume — the stats are not limited by the page size of a single API call.

---

### Run Tests

```bash
# All test suites (Rust + Go + TypeScript SDK)
make test-all

# Rust only (integration tests require DATABASE_URL)
DATABASE_URL="postgres://banzami:banzami_dev@localhost:5433/banzami_dev" \
  cargo test --workspace --manifest-path core/Cargo.toml

# Go services individually
cd services/api-gateway  && go test ./...
cd services/admin-api    && go test ./...
cd services/public-api   && go test ./...

# TypeScript SDK
cd sdk/typescript && npm test

# Python SDK (requires virtualenv)
cd sdk/python && .venv/bin/pytest tests/ -v
# or with coverage:
cd sdk/python && .venv/bin/pytest tests/ --cov=banzami --cov-report=term-missing
```

### Continuous Integration

GitHub Actions runs on every push and pull request to `main`:

| Job              | What it checks                                                 |
|------------------|----------------------------------------------------------------|
| `rust`           | `cargo fmt`, `cargo clippy -D warnings`, `cargo test`         |
| `go-gateway`     | `go vet`, `go test -race`                                      |
| `go-admin`       | `go vet`, `go test -race`                                      |
| `go-public`      | `go vet`, `go test -race`                                      |
| `typescript`     | `tsc --noEmit` (typecheck), `vitest run`                       |

The Rust job spins up a PostgreSQL 16 service container so `#[sqlx::test]` integration tests run against a real database. See [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

### Useful Make Targets

| Target               | Description                                        |
|----------------------|----------------------------------------------------|
| `make dev-up`        | Start PostgreSQL and Redis                         |
| `make dev-down`      | Stop infrastructure                                |
| `make db-migrate`    | Apply all pending migrations                       |
| `make db-reset`      | Drop, recreate, and re-migrate dev database        |
| `make core-run`      | Run the Rust core-api (:8081)                      |
| `make gateway-run`   | Run the Go api-gateway (:8080)                     |
| `make admin-api-run` | Run the Go admin-api (:8082)                       |
| `make public-api-run`| Run the Go public-api (:8083)                      |
| `make stack-build`   | Build all Docker images                            |
| `make stack-up`      | Full stack: infra + migrations + all services      |
| `make stack-down`    | Tear down the full stack                           |
| `make stack-logs`    | Tail all service logs                              |
| `make test-all`      | Run all test suites (Rust + Go + TypeScript SDK)   |
| `make check-all`     | Run all linters and type-checkers                  |
| `make sqlx-prepare`  | Regenerate `.sqlx/` offline query cache            |

---

## Engineering Principles

Condensed from [CLAUDE.md](CLAUDE.md) — the binding engineering constitution.

1. **Financial correctness first** — every monetary movement uses double-entry accounting, integer minor units, atomic transactions, and immutable ledger entries. `wallet.balance -= amount` is never acceptable.

2. **Boring in the critical parts** — ledger, settlement, reconciliation, and payout logic must be simple, deterministic, and auditable. Cleverness is for developer tooling, not the financial core.

3. **Reliability over hype** — technology is adopted only when it improves reliability, security, maintainability, or scalability. Not because it is new or popular.

4. **Modular monolith first** — service extraction happens only when operational necessity, proven scaling boundaries, or domain ownership complexity demands it. Premature microservices are forbidden.

5. **Idempotency is non-negotiable** — every financial operation must be safely retryable. Duplicate execution must never produce inconsistent state.

6. **Observability is mandatory** — no black boxes. Every service exposes metrics, traces, health signals, and structured logs. If it cannot be observed, it cannot be operated.

7. **Documentation is part of the definition of done** — architecture notes, operational notes, security considerations, and migration notes are required. Undocumented features are incomplete features.

8. **The Go ↔ Rust boundary is sacred** — Go orchestrates and authenticates. Rust owns financial state. Go never writes to financial tables directly.

---

## Contributing

1. **Read [CLAUDE.md](CLAUDE.md)** — the Engineering Constitution is binding on all contributors.
2. **Every implementation requires documentation** per §5: architecture notes, operational notes, security considerations, README updates, and ADR if a major decision is involved.
3. **All major technical decisions** require an ADR under [`docs/adr/`](docs/adr/).
4. **All money movement** must use double-entry accounting and integer minor units (§10).
5. **Tests are required** at the unit and integration levels; financial invariant tests for any domain touching ledger or balances.

### Branch Naming

```
feature/*    New capabilities
fix/*        Bug fixes
infra/*      Infrastructure and deployment
security/*   Security improvements
docs/*       Documentation only
```

### Commit Format

```
type(scope): description

feat(wallets):      add transaction reservation flow
fix(ledger):        prevent duplicate settlement posting
docs(api):          update webhook retry documentation
infra(docker):      add Redis health check to compose file
security(auth):     enforce key rotation policy
```
