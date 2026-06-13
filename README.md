# Banzami

> **Banzami is an independent commercial startup — not part of the BANZA protocol organization.**

> **BANZA** = open financial infrastructure protocol · [github.com/banza-protocol/banza](https://github.com/banza-protocol/banza)  
> **BanzAI** = BANZA's protocol knowledge assistant (external/adjacent — not a Banzami product) · [github.com/banza-protocol/banzai](https://github.com/banza-protocol/banzai)  
> **Banzami** = independent startup and reference operator · [github.com/banzami/banzami](https://github.com/banzami/banzami) ← this repository

> Angola's instant payment startup — QR-native, wallet-native, built on the BANZA protocol.  
> Website: [banzami.com](https://banzami.com) · Contact: contact@banzami.com

**Banzami is an independent commercial payment operator built on the BANZA protocol.** Banzami is one company — it does not own, govern, or certify the protocol. This repository contains only the operator: consumer and merchant applications, backend services, the financial core implementation, infrastructure, and operational tooling.

**Banzami provides:**

* consumer wallets · merchant wallets
* QR payments · payment links
* operator APIs · SDKs for integrating with the Banzami API
* mobile apps · hosted checkout · merchant dashboard · admin operations
* acquiring integration · settlement · reconciliation · operational compliance

**Banzami does NOT provide** (these belong to the **BANZA protocol** at [github.com/banza-protocol/banza](https://github.com/banza-protocol/banza)):

* BANZA protocol governance
* BANZA certification or conformance authority
* BANZA canonical contracts (OpenAPI, webhook, QR, event schemas)
* BANZA protocol SDK standards
* BANZA federation governance

> Protocol-owned assets (`contracts/`, `sdk-certification/`, the `BANZA_REFERENCE.md` mirror) were removed from this repository in the operator purification ([BANZAMI-PURIFICATION-EXECUTION-001](docs/governance/BANZAMI-PURIFICATION-EXECUTION-REPORT.md)); their canonical home is the BANZA protocol repo. The libraries under `sdk/` are kept as **Banzami operator integration SDKs** for the Banzami API.

---

Banzami is **Angola's instant payment network**: a four-layer platform spanning consumer wallets, merchant QR rails, a developer SDK ecosystem, and a regulated financial core. Every payment is a wallet-to-wallet ledger transfer. Every merchant surface is a QR code. Any Angolan app integrates the Banzami SDK and accepts instant Kwanza payments natively.

The canonical experience: `SCAN QR → CONFIRM → INSTANT SETTLEMENT`

Reference models: Pix, WeChat Pay, M-Pesa, UPI — not card-first checkout.

The platform provides:

* **Programmable payments** — any Angolan app accepts instant AOA via SDK or API,
* **QR-native payments** — scan to pay, scan to receive, instant settlement,
* **@handle identity** — payments addressed to human-readable handles,
* **wallet infrastructure** — double-entry ledger, strongly consistent balances,
* **payment requests** — pull payments via @handle or link,
* **instant transfers** — consumer-to-consumer and consumer-to-merchant,
* **merchant settlements** — T+0 wallet credit, configurable payout cycles,
* **local rail integration** — EMIS, Multicaixa Express,
* **payout orchestration**, **reconciliation**, **compliance enforcement**.

Banzami is an API-first infrastructure layer. External integrations use official Banzami SDKs. See [ADR-013](docs/adr/ADR-013-wallet-native-identity.md) for the network identity constraint and [ADR-012](docs/adr/ADR-012-sdk-first-ecosystem.md) for SDK policy.

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

To modernize and revolutionize digital payments in Angola — making digital Kwanza payments so simple, fast, and integrated that physical cash and manual bank transfer confirmations become the exception rather than the norm.

---

## National Objectives

**1. First QR-native instant payment network in Angola**

A cantina owner prints a QR. A customer scans it. Payment is instant. No confirmation waiting. No WhatsApp screenshot. No bank transfer reference. This is the target.

**2. First Angola-native SDK payment infrastructure**

Any Angolan application — taxi apps, delivery platforms, ecommerce, schools, donation platforms, creator apps — integrates a Banzami SDK in hours and accepts instant Kwanza payments natively.

---

## Core Values

* Angola first — serve one market exceptionally before expanding
* Financial correctness over hype
* Reliability over unnecessary complexity
* Operational maturity over premature scale patterns
* Clear boundaries over architectural chaos
* Long-term maintainability over short-term shortcuts

---

## Product Vision

Banzami is building the digital payment layer for Angola.

The vision: `SCAN → CONFIRM → PAID INSTANTLY` — eliminating cash dependency, manual transfer confirmations, and WhatsApp proof-of-payment flows from Angolan commerce.

Reference models: Pix (Brazil), UPI (India), M-Pesa (East Africa). Not Stripe, not PayPal, not card-first checkout.

The long-term objective is a national network effect: merchants adopt QR, consumers adopt the wallet, developers integrate the SDK, and digital Kwanza becomes the default payment experience.

See [ADR-014](docs/adr/ADR-014-angola-national-mission.md) for the full national mission decision record.

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
9. [Sandbox](#sandbox)
10. [Financial Flows](#financial-flows)
11. [Database Schema](#database-schema)
12. [Security Model](#security-model)
13. [Observability](#observability)
14. [Local Development](#local-development)
15. [Engineering Principles](#engineering-principles)
16. [Contributing](#contributing)

---

## Production

The platform is live on an IONOS VPS (`217.160.9.248`, Ubuntu 24.04, 4 vCores / 4 GB / 120 GB NVMe) behind Cloudflare.

### Public URLs

**Live (production)**

| URL | Service | Description |
|-----|---------|-------------|
| `https://api.banzami.com` | API Gateway | Merchant REST API — authenticated with JWT |
| `https://consumer.banzami.com` | Public API | Consumer mobile API — authenticated with PIN + JWT |
| `https://pay.banzami.com` | Checkout Frontend | Hosted payment links and QR checkout (Next.js) |
| `https://admin.banzami.com` | Admin Frontend | Internal operations portal (Next.js) |
| `https://business.banzami.com` | Business Dashboard | Merchant self-service dashboard (Next.js) |

**Sandbox (test environment)**

| URL | Service | Description |
|-----|---------|-------------|
| `https://sandbox-api.banzami.com` | API Gateway (sandbox) | Same API surface — virtual money, no real transactions |
| `https://sandbox-dashboard.banzami.com` | Business Dashboard (sandbox) | Merchant dashboard for test integrations |

Sandbox and live data never mix. A `bz_test_` key is rejected by the live gateway; a `bz_live_` key is rejected by the sandbox. See the [Sandbox](#sandbox) section for full details.

### Production Stack

All services run as Docker containers managed by Docker Compose under `/srv/banzami/`.
Only nginx is exposed to the internet (ports 80/443). All other services communicate internally on the `banzami_net` bridge network.

| Container | Image | Internal Port | Role |
|-----------|-------|---------------|------|
| `banzami-nginx-1` | nginx:1.27-alpine | 80, 443 (host) | TLS termination and reverse proxy |
| `banzami-postgres-1` | postgres:16-alpine | 5432 | Primary database |
| `banzami-redis-1` | redis:7-alpine | 6379 | Cache, rate limiting, idempotency |
| `banzami-core-api-1` | banzami/core-api | 8081 | Rust financial core |
| `banzami-api-gateway-1` | banzami/api-gateway | 8080 | Merchant API gateway |
| `banzami-public-api-1` | banzami/public-api | 8083 | Consumer public API |
| `banzami-admin-api-1` | banzami/admin-api | 8082 | Admin operations API |
| `banzami-admin-frontend-1` | banzami/admin-frontend | 3002 | Admin portal (Next.js) |
| `banzami-dashboard-frontend-1` | banzami/dashboard-frontend | 3001 | Business dashboard (Next.js) |
| `banzami-checkout-frontend-1` | banzami/checkout-frontend | 3003 | Hosted checkout (Next.js) |

Source code is built directly on the server under `/srv/banzami/src/`. Each service has its own Dockerfile.

### Deploying to Production

Use `deploy.sh` at the repo root — it syncs source files, builds the Docker image on the server, and recreates the container:

```bash
# Deploy a single service
./deploy.sh core-api
./deploy.sh admin-api
./deploy.sh admin-frontend
./deploy.sh pay-frontend
./deploy.sh checkout-frontend

# Deploy multiple services
./deploy.sh api-gateway pay-frontend checkout-frontend

# Deploy everything
./deploy.sh

# Force a full rebuild (bypass Docker layer cache — useful when Rust caches stale layers)
./deploy.sh --no-cache core-api
```

The script:
1. `rsync`s the relevant source directory to the server (excluding `node_modules/`, `target/`, `.next/`)
2. Runs `docker build` on the server (with layer cache by default)
3. Recreates the container via `docker compose up -d`
4. Waits for the health check to pass before returning

Build directories on the server:

| Service | Build context on server |
|---------|------------------------|
| `core-api` | `/srv/banzami/src/core/` |
| `admin-api` | `/srv/banzami/admin-api-build/` |
| `api-gateway` | `/srv/banzami/api-gateway-build/` |
| `public-api` | `/srv/banzami/public-api-build/` |
| `admin-frontend` | `/srv/banzami/src/apps/admin/` |
| `dashboard-frontend` | `/srv/banzami/src/apps/dashboard/` |
| `pay-frontend` | `/srv/banzami/src/apps/pay/` |
| `checkout-frontend` | `/srv/banzami/src/apps/checkout/` |

### SSL

Cloudflare Origin Certificate (RSA 2048, wildcard `*.banzami.com` + `banzami.com`).
Valid until May 2041. Cloudflare SSL/TLS mode: **Full (strict)**.

```
/srv/banzami/nginx/certs/banzami.pem   # Cloudflare Origin Certificate
/srv/banzami/nginx/certs/banzami.key   # Private key (chmod 600)
```

Certificates are mounted read-only into the nginx container. No certbot or automatic renewal needed — the Cloudflare Origin CA certificate is valid for 15 years.

---

## Architecture Overview

### System Topology

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                               External Clients                                │
│                                                                               │
│   Merchant SDKs       Mobile App (Flutter)        Browser / QR scanner        │
│   Plugins             consumer + merchant          pay / admin / business      │
└────────────────────────────────────┬─────────────────────────────────────────┘
                                     │  HTTPS
                                     ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                          Cloudflare  (proxy / WAF)                            │
│                                                                               │
│   DDoS protection  │  WAF rules  │  Bot management  │  SSL/TLS Full strict   │
│   Origin Certificate validation   │  CF-Connecting-IP header injection        │
│                                                                               │
│   *.banzami.com  →  217.160.9.248 (IONOS VPS)  — proxied, orange cloud       │
└───────────────────────────────────┬──────────────────────────────────────────┘
                                    │  HTTPS  (Cloudflare Origin Certificate)
                                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                     nginx  :80 / :443  (Docker container)                     │
│                     TLS termination  ·  virtual host routing                  │
│                                                                               │
│  api.banzami.com      →  api-gateway:8080   (CORS: admin + business origins)  │
│  consumer.banzami.com →  public-api:8083                                      │
│  admin.banzami.com    →  admin-frontend:3002  +  /api/ → admin-api:8082       │
│  business.banzami.com →  dashboard-frontend:3001                              │
│  pay.banzami.com      →  checkout-frontend:3003                               │
└──┬──────────────┬──────────────┬──────────────┬──────────────┬───────────────┘
   │              │              │              │              │
   ▼              ▼              ▼              ▼              ▼
┌──────┐  ┌────────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐
│Admin │  │ API Gateway│  │Public API│  │ Admin    │  │ Checkout   │
│Front │  │ Go  :8080  │  │ Go :8083 │  │ Frontend │  │ Frontend   │
│:3002 │  │            │  │          │  │ :3002    │  │ Next :3003 │
│Next  │  │JWT auth    │  │PIN+JWT   │  │ Next.js  │  │ SSR pay    │
└──────┘  │Rate limit  │  │P2P xfer  │  └──────────┘  │ links      │
          │Idempotency │  │Consumer  │                 └────────────┘
          │Webhooks    │  │wallets   │
          └─────┬──────┘  └────┬─────┘
                │              │
                │   ┌──────────┘
                │   │          ┌─────────────────────────┐
                ▼   ▼          │   Admin API  Go  :8082   │
┌──────────────────────────┐   │   X-Admin-Key auth       │
│   Rust Core API  :8081   │◄──│   Settlements / Payouts  │
│                          │   │   Reconciliation         │
│  Single financial auth.  │   └─────────────────────────┘
│  Go NEVER writes to DB   │
│                          │
│  ledger  (double-entry)  │
│  wallets  (reserve/rel.) │
│  transactions  (FSM)     │
│  settlement  (netting)   │
│  payouts  (lifecycle)    │
│  reconciliation          │
│  compliance  (KYB/AML)   │
│  risk  (scoring)         │
│  routing  (acquirer sel.)│
│  transfers  (P2P)        │
│  payment-links           │
│  qr  (static/dynamic)    │
│  identity  (handles)     │
│  consumer-wallets        │
└───────────┬──────────────┘
            │
    ┌───────┴────────┐
    ▼                ▼
┌──────────────┐  ┌──────────────────────────────┐
│  PostgreSQL  │  │            Redis              │
│  :5432       │  │            :6379              │
│              │  │                              │
│  Single SoT  │  │  Rate limiting (sliding win) │
│  Immutable   │  │  Idempotency keys            │
│  ledger      │  │  Session store               │
│  All fin.    │  │  Distributed locking         │
│  state       │  │  Password-protected          │
└──────────────┘  └──────────────────────────────┘

All containers run on the banzami_net Docker bridge network.
Only nginx is reachable from outside (ports 80/443 on the host).
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

> **Architecture freeze:** The layout below reflects the frozen target architecture (CLAUDE.md §20). Some directories are physically in a transitional location — these are explicitly noted. No new top-level directory may be added without updating both README.md and CLAUDE.md §20.

### Semantic Architecture

The repository is organized into **eight semantic zones**:

| Zone | Purpose |
|------|---------|
| `core/` | Rust financial core — all financial logic, invariants, and state. `core/jobs/` is the canonical home for background jobs. |
| `services/` | Go orchestration services — APIs, auth, middleware, webhooks |
| `apps/` | Product-facing applications — what merchants, consumers, and admins use |
| `platforms/` | Operational/governance platforms — docs site, validation studio _(target: apps/docs and apps/validation-studio migrate here)_ |
| `sdk/` | Banzami operator integration SDKs (TypeScript, Flutter, Python, Go, PHP, checkout-web) |
| `plugins/` | Operator commerce plugins / adapters (generic Node, PHP, Laravel) |
| `db/` | PostgreSQL migrations |
| `infra/` | Infrastructure as code, monitoring, deployment |
| `docs/` | Technical documentation |
| `tools/` | Developer tooling |

### Current Physical Layout

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
│   ├── acquiring/                 Multicaixa Express acquiring — initiation, callbacks, wallet settlement
│   ├── api/                       Axum HTTP server wiring all domains
│   └── jobs/                      [PLACEHOLDER] Background jobs owned by the financial core
│                                   Current jobs live inside core/api/ — migrate here as the count grows
│
├── services/                      Go orchestration services
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
├── apps/                          Product-facing applications + platforms (transitional)
│   │                              Target: product apps only; platforms/ below for docs + studio
│   ├── dashboard/                 Merchant dashboard (Next.js, :3010)
│   ├── admin/                     Internal admin panel (Next.js, :3002)
│   ├── pay/                       Consumer pay page — payment links (Next.js, :3003)
│   ├── checkout/                  Hosted checkout — QR-first payment UX (Next.js, :3004)
│   ├── mobile/                    Flutter multi-flavor mobile app
│   │   ├── lib/main_consumer.dart Consumer entry point (Banza app)
│   │   ├── lib/main_merchant.dart Merchant entry point (Banza Business)
│   │   ├── lib/merchant/          Merchant screens and session service
│   │   ├── ios/                   iOS project with consumer + merchant xcschemes
│   │   └── android/               Android project with consumer + merchant productFlavors
│   ├── merchant/                  Standalone Flutter merchant app (reference project)
│   ├── docs/          [→ platforms/docs]       Developer documentation site (banzami.com)
│   └── validation-studio/ [→ platforms/validation-studio]  LOCAL-ONLY governance workstation (:3099)
│
│   ── platforms/ (semantic concept — physical home: apps/docs and apps/validation-studio)
│      Operational and governance platforms, not product-facing applications.
│      Not moved physically to avoid breaking Dockerfiles and deploy.sh.
│
├── sdk/               [→ integrations/sdk/]    Official Banzami SDKs (transitional top-level)
│   ├── flutter/                   Flutter SDK — mobile runtime (iOS + Android)
│   │   ├── lib/client/            BanzaClient (HTTP, auth, retry, idempotency, hooks)
│   │   ├── lib/models/            Typed response models
│   │   ├── test/                  Unit + integration tests (MockClient)
│   │   └── CHANGELOG.md
│   ├── typescript/                TypeScript SDK — Node.js, Next.js, browser (@banza/sdk)
│   │   ├── src/client.ts          BanzaClient (ESM + CJS, retry, hooks, idempotency)
│   │   ├── src/webhooks.ts        Webhook signature verification (Banza-Signature)
│   │   ├── examples/              next-api-route, node-webhook, browser-checkout
│   │   └── CHANGELOG.md
│   ├── python/                    Python SDK — async-first (Django, FastAPI, Flask) (banza-python)
│   │   ├── banza/                 Package root
│   │   │   ├── client.py          BanzaClient + BanzaHooks
│   │   │   ├── resources/         transactions, qr_payments, transfers, payouts, …
│   │   │   ├── models/            Pydantic v2 response models
│   │   │   ├── exceptions.py      Clean exception hierarchy
│   │   │   └── signature.py       HMAC-SHA256 webhook verification
│   │   ├── examples/              fastapi, django, flask, qr_checkout, webhook_handler
│   │   ├── tests/                 Unit + integration tests
│   │   └── CHANGELOG.md
│   ├── php/                       PHP SDK (banza/sdk-php)
│   └── go/                        Go SDK (banza-go)
│
├── plugins/                       Operator commerce plugins / runtime adapters
│   ├── generic-php/               PHP adapter (no dependencies)
│   ├── generic-laravel/           Laravel service provider
│   └── generic-node/              Node.js adapter
│
│   Note: protocol-owned contracts/ and sdk-certification/ were removed from
│   this operator repo (BANZAMI-PURIFICATION-EXECUTION-001). Canonical home:
│   the BANZA protocol repo (github.com/banza-protocol/banza).
│
├── db/
│   └── migrations/                Global PostgreSQL migrations (0001–0023)
│
├── infra/
│   ├── docker/                    Docker Compose for local development
│   ├── terraform/                 Infrastructure as code — split by provider/domain
│   │   ├── cloudflare/            Cloudflare DNS, WAF, SSL rules
│   │   ├── ionos/                 IONOS VPS provisioning
│   │   ├── monitoring/            Monitoring stack infrastructure
│   │   └── networking/            Network topology and firewall rules
│   ├── monitoring/                Prometheus scrape config + Grafana provisioning
│   └── deployment/                Deployment scripts and runbooks
│
├── docs/
│   ├── adr/                       Architecture Decision Records (ADR-001 – ADR-016)
│   ├── domains/                   Per-domain technical documentation
│   ├── architecture/              Cross-cutting architecture documents
│   ├── integrations/              Integration guides (Doa reference integration)
│   ├── product/                   Product strategy and positioning
│   ├── brand/                     Brand audit and naming rules
│   ├── security/                  Security model and threat analysis
│   ├── sandbox/                   Sandbox developer guide
│   ├── runbooks/                  Operational runbooks
│   ├── playbooks/                 Incident playbooks
│   ├── api/                       API reference documentation
│   └── validation/                Implementation matrix + governance (BANZAMI_IMPLEMENTATION_MATRIX.json)
│
├── tools/                         Developer tooling
│   ├── check-repository-layout.mjs  Layout compliance check (make check-repo-layout)
│   └── seed.sh                    Test merchant + data seeder
│
├── CLAUDE.md                      Engineering Constitution — mandatory reading
└── README.md                      This file
```

### Migration Candidates

These physical locations do not match the target semantic architecture. No move has been performed because the build, deploy scripts, and imports would break. Each is documented here until a safe migration plan is executed.

| Current location | Target location | Blocker |
|-----------------|----------------|---------|
| `apps/docs/` | `platforms/docs/` | Dockerfile, deploy.sh hardcode `apps/docs/` |
| `apps/validation-studio/` | `platforms/validation-studio/` | Makefile, dev.sh reference `apps/validation-studio/` |
| `sdk/` | `integrations/sdk/` | pubspec.yaml, package.json, import paths in all SDKs |
| `plugins/` | `integrations/plugins/` and `integrations/adapters/` | Documentation links, README cross-references |

### Layout Governance

The `tools/check-repository-layout.mjs` script enforces structural rules:

```bash
make check-repo-layout
```

See CLAUDE.md §20 for the binding governance rules.

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
- **Mobile / Flutter:** [`sdk/flutter/lib/theme/banza_theme.dart`](sdk/flutter/lib/theme/banza_theme.dart)
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
| Server adapters | generic-node, generic-php, generic-laravel | [`plugins/`](plugins/) | HIGH | Thin adapters for Node.js, PHP, and Laravel without framework dependencies |
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

### SDK-First Ecosystem Policy

**Banzami is an SDK-first operator.** External integrations should use an official **Banzami SDK** to talk to the Banzami API. Direct HTTP integrations using `fetch()`, `axios()`, `requests()`, or handcrafted API clients are not the recommended path and must not appear in official examples. See [ADR-012](docs/adr/ADR-012-sdk-first-ecosystem.md) for the operator SDK policy.

The SDKs are not optional helper libraries. They are security boundaries, DX infrastructure, and payment orchestration layers. Without SDK standardization, integrations become inconsistent, security mistakes multiply, and ecosystem maintenance becomes impossible at scale.

---

### Official Example Integrations

Reference implementations that demonstrate correct, production-grade Banzami merchant integration. These serve as canonical guides for specific integration patterns.

| Integration | Platform | Patterns Demonstrated |
|-------------|----------|----------------------|
| [Doa](docs/integrations/doa/README.md) | Next.js donation platform | QR payments, HMAC webhooks, sandbox detection, idempotency, poll + push convergence |

**Doa** (`doadoa.app`) is the canonical reference for:
- Merchant-presented QR payment flows
- BANZA webhook integration with HMAC-SHA256 signature verification
- Sandbox mode detection and developer UX (`bz_test_` prefix → SANDBOX badge)
- Three-layer idempotency (initiation → confirmation → receipt)
- Next.js `server-only` credential isolation
- Poll-and-webhook dual-path payment confirmation

> Doa's current implementation uses direct `fetch()` — a transitional state from before the TypeScript SDK reached production readiness. Doa must migrate to `@banza/sdk` to become the complete canonical SDK example. See [`docs/integrations/doa/`](docs/integrations/doa/).

Full documentation: [`docs/integrations/doa/`](docs/integrations/doa/)

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
- Multiple API keys per merchant, each with an `environment` field (`LIVE` / `SANDBOX`).
- Key prefix encodes environment: `bz_live_…` for live, `bz_test_…` for sandbox.
- Status: `Active`, `Suspended`.
- Admin-initiated sandbox creation auto-approves KYB and AML, issues a `bz_test_` key, and sends a welcome email with credentials.

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
External bank statement matching against internal settlement records, plus a periodic ledger balance consistency checker (`run_balance_checker`) that runs as a background Tokio task in core-api.

The balance checker enforces three invariants on every tick (default: hourly):
1. **Posting balance** — every ledger posting has debits == credits (double-entry).
2. **No negative consumer balances** — no consumer wallet may have a negative available balance.
3. **Transfer-posting linkage** — every `COMPLETED` transfer references a ledger posting.

Violations are logged as errors but never kill the process — the checker is observability-only.

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

#### `banzami-acquiring`
Multicaixa Express acquiring bridge. Connects payment links to EMIS (Angola's national instant payment network) and processes confirmation callbacks.

Provider selection at boot via `ACQUIRING_PROVIDER` env var:
- `SimulatedProvider` (default) — generates realistic references, signs callbacks locally, no external HTTP calls. Used in development, sandbox, and TestFlight.
- `EMISProvider` — live EMIS Multicaixa Express integration. Requires `EMIS_*` env vars. Refuses to activate unless `APP_ENV=production`.

On callback confirmation the acquiring route posts a double-entry ledger credit to the merchant wallet (`system:transit DR / wallet:available CR`), fully idempotent via `ledger_postings.idempotency_key`.

Consumer deposits (`consumer_deposits` table) share the same provider infrastructure but credit consumer wallets via a separate callback endpoint. See [docs/domains/consumer-deposits/](docs/domains/consumer-deposits/).

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
| Variable              | Default                   | Description                              |
|-----------------------|---------------------------|------------------------------------------|
| `ADMIN_API_PORT`      | `8082`                    | Listen port                              |
| `CORE_API_URL`        | `http://127.0.0.1:8081`   | Rust core-api base URL                   |
| `ADMIN_API_KEY`       | required                  | Shared secret for admin auth             |
| `SMTP_HOST`           | optional                  | SMTP server hostname (email disabled if empty) |
| `SMTP_PORT`           | `587`                     | SMTP port (`465` for SSL, `587` for STARTTLS) |
| `SMTP_USER`           | optional                  | SMTP username                            |
| `SMTP_PASSWORD`       | optional                  | SMTP password                            |
| `SMTP_FROM`           | `noreply@banzami.com`     | Sender address                           |
| `SMTP_FROM_NAME`      | `Banzami`                 | Sender display name                      |
| `OTLP_ENDPOINT`       | optional                  | OTLP HTTP endpoint                       |
| `LOG_LEVEL`           | `info`                    | Log verbosity                            |
| `LOG_FORMAT`          | `json`                    | `json` / `pretty`                        |

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
| Variable                             | Default      | Description                                                     |
|--------------------------------------|--------------|-----------------------------------------------------------------|
| `DATABASE_URL`                       | required     | PostgreSQL connection string                                    |
| `CORE_API_PORT`                      | `8081`       | Listen port                                                     |
| `TRANSIT_ACCOUNT_ID`                 | auto-gen     | Ledger account ID for acquiring transit (in-flight funds)       |
| `BANK_ACCOUNT_ID`                    | auto-gen     | Ledger account ID for bank settlement funds                     |
| `APP_ENV`                            | (unset)      | Set to `production` to enable boot safety guard                 |
| `ACQUIRING_PROVIDER`                 | `SIMULATED`  | `EMIS` for production Multicaixa Express; default is simulated  |
| `ACQUIRING_WEBHOOK_SECRET`           | required     | HMAC-SHA256 secret for validating inbound acquiring callbacks   |
| `EMIS_API_URL`                       | —            | EMIS API base URL (required when `ACQUIRING_PROVIDER=EMIS`)     |
| `EMIS_API_KEY`                       | —            | EMIS API key (required when `ACQUIRING_PROVIDER=EMIS`)          |
| `EMIS_ENTITY`                        | —            | EMIS entity number (required when `ACQUIRING_PROVIDER=EMIS`)    |
| `RUST_LOG`                           | `warn`       | Log filter (e.g. `core_api=info,warn`)                          |
| `QR_EXPIRY_INTERVAL_SECS`            | `60`         | How often the QR expiry background worker runs                  |
| `SETTLEMENT_SCHEDULER_INTERVAL_SECS` | `86400`      | Settlement batch scheduler interval (default: daily)            |
| `BALANCE_CHECKER_INTERVAL_SECS`      | `3600`       | Ledger invariant checker interval (default: hourly)             |

**Boot safety guard:** if `APP_ENV=production` and `ACQUIRING_PROVIDER` is not `EMIS`, the process exits immediately with a fatal error. This prevents deploying simulated payments to production.

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
| GET    | `/v1/public/pay/{slug}`         | Resolve link by slug — includes `merchant_name` (no auth) |
| GET    | `/v1/public/pay/{slug}/status`  | Check if link is paid (no auth)       |

**Sandbox utilities** (JWT required; token must carry `environment = SANDBOX`)

| Method | Path                            | Description                                           |
|--------|---------------------------------|-------------------------------------------------------|
| GET    | `/v1/sandbox/status`            | Confirm sandbox mode and active environment           |
| GET    | `/v1/sandbox/instruments`       | List test cards and mobile numbers with their outcomes|
| POST   | `/v1/sandbox/fund`              | Credit sandbox wallet with virtual AOA (max 100M/call)|
| POST   | `/v1/sandbox/simulate/payment`  | Inject a synthetic transaction for a given scenario   |

Valid simulation scenarios: `success`, `insufficient_funds`, `fraud_blocked`, `expired_card`, `auth_challenge`.

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

| Method | Path                                    | Description                                    |
|--------|-----------------------------------------|------------------------------------------------|
| POST   | `/admin/v1/settlements`                 | Create settlement batch                        |
| GET    | `/admin/v1/settlements?merchant_id=`    | List settlements for a specific merchant       |
| GET    | `/admin/v1/settlements/all`             | List all settlements (optional `?status=`)     |
| GET    | `/admin/v1/settlements/{id}`            | Get settlement                                 |
| POST   | `/admin/v1/settlements/{id}/submit`     | Submit to acquirer                             |
| POST   | `/admin/v1/settlements/{id}/confirm`    | Confirm (posts ledger DR/CR)                   |
| POST   | `/admin/v1/settlements/{id}/fail`       | Mark failed (requires `reason`)                |

**Payouts**

| Method | Path                                    | Description                        |
|--------|-----------------------------------------|------------------------------------|
| GET    | `/admin/v1/payouts?merchant_id=`        | List payouts for a specific merchant |
| GET    | `/admin/v1/payouts/all`                 | List all payouts (optional `?status=`) |
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

| Method | Path                                              | Description                                         |
|--------|---------------------------------------------------|-----------------------------------------------------|
| POST   | `/admin/v1/merchants`                             | Create merchant, auto-issue key and wallet; sends welcome email |
| GET    | `/admin/v1/merchants`                             | List all merchants (optional `?search=` filter)     |
| GET    | `/admin/v1/merchants/{id}`                        | Get merchant details                                |
| DELETE | `/admin/v1/merchants/{id}`                        | Delete merchant and cascade (API keys, compliance). Fails if financial data exists. |
| POST   | `/admin/v1/merchants/{id}/api-keys`               | Create additional API key (`name`, `environment`)   |
| POST   | `/admin/v1/merchants/{id}/resend-credentials`     | Re-issue API key and email credentials to merchant  |
| POST   | `/admin/v1/merchants/{id}/wallets`                | Create wallet for a currency                        |

**Consumers**

| Method | Path                              | Description                                         |
|--------|-----------------------------------|-----------------------------------------------------|
| GET    | `/admin/v1/consumers`             | List consumers (optional `?handle=` filter)         |
| GET    | `/admin/v1/consumers/{id}`        | Get consumer details                                |
| POST   | `/admin/v1/consumers/{id}/suspend`| Suspend consumer account (requires `notes`)         |
| PATCH  | `/admin/v1/consumers/{id}/badge`  | Set or clear verification badge (`badge: "CONSUMER"` or `null`) |

**Wallets (admin)**

| Method | Path                          | Description                                                        |
|--------|-------------------------------|--------------------------------------------------------------------|
| GET    | `/admin/v1/wallets`           | Get wallet by merchant (`?merchant_id=&currency=`)                 |
| POST   | `/admin/v1/wallets/{id}/credit`| Manually credit a merchant wallet — requires `amount_minor`, `currency`, `reason` (mandatory). No cap. Creates auditable ledger posting. |

Observability:
- `GET /health` — liveness probe
- `GET /metrics` — Prometheus metrics

---

### Internal Routes (core-api, loopback only)

The same operations are available at `/internal/v1/*` on port 8081. These are the routes the Go services actually call. They are never proxied to the public internet.

**Acquiring**

| Method | Path                                          | Description                                                    |
|--------|-----------------------------------------------|----------------------------------------------------------------|
| POST   | `/internal/v1/acquiring/payments`             | Initiate Multicaixa Express payment for a payment link         |
| POST   | `/internal/v1/acquiring/callbacks/emis`       | Inbound EMIS callback — validates HMAC, confirms payment, credits merchant wallet |
| POST   | `/internal/v1/acquiring/test/confirm`         | Dev helper — simulate confirmation for a pending payment (`?external_ref=`) |

**Consumer Deposits**

| Method | Path                                              | Description                                                      |
|--------|---------------------------------------------------|------------------------------------------------------------------|
| POST   | `/internal/v1/consumer-deposits`                  | Initiate a consumer wallet top-up via acquiring provider         |
| GET    | `/internal/v1/consumer-deposits/{id}`             | Get deposit status                                               |
| POST   | `/internal/v1/consumer-deposits/callback`         | Inbound callback — validates HMAC, confirms deposit, credits consumer wallet |
| POST   | `/internal/v1/consumer-deposits/test-confirm`     | Dev helper — simulate confirmation (`?external_ref=`)            |

**Wallet (admin credit)**

| Method | Path                                          | Description                                                              |
|--------|-----------------------------------------------|--------------------------------------------------------------------------|
| POST   | `/internal/v1/wallets/{id}/sandbox-credit`    | Credit sandbox merchant wallet (capped at 100M AOA, dev/sandbox only)   |
| POST   | `/internal/v1/wallets/{id}/admin-credit`      | Credit merchant wallet for any amount — requires `reason`. Full audit trail. |

---

## Sandbox

Banzami operates two fully isolated environments. Sandbox is a complete replica of the production stack — same API surface, same state machines, same webhook retry logic — but no real money ever moves.

### Environment isolation

| | Sandbox | Live |
|---|---|---|
| API key prefix | `bz_test_…` | `bz_live_…` |
| Base URL | `https://sandbox-api.banzami.com` | `https://api.banzami.com` |
| Dashboard | `https://sandbox-dashboard.banzami.com` | `https://business.banzami.com` |
| Money | Virtual AOA — no real funds | Real Angolan Kwanza |
| Database | Physically separate | Physically separate |
| Redis | Physically separate | Physically separate |
| Webhooks | Sandbox-only delivery | Live-only delivery |

The environment is cryptographically encoded in both the key prefix and the JWT `environment` claim. Cross-environment requests are rejected at the middleware layer with `403 SANDBOX_ONLY` or `403 LIVE_ONLY`.

### API key format

```
bz_live_<random>   →  LIVE environment  (real money)
bz_test_<random>   →  SANDBOX environment  (virtual money)
```

Create a sandbox key by passing `"environment": "SANDBOX"` to `POST /v1/merchants/{id}/api-keys`. Exchange it for a JWT via `POST /v1/auth/token`. All JWTs carry a signed `environment` claim — forging or swapping the claim invalidates the signature.

### Test cards

| Card number | Scenario | Final status |
|---|---|---|
| `4242 4242 4242 4242` | success | `CAPTURED` |
| `4000 0000 0000 9995` | insufficient_funds | `FAILED` |
| `4100 0000 0000 0019` | fraud_blocked | `FAILED` |
| `4000 0000 0000 0069` | expired_card | `FAILED` |
| `4000 0027 6000 3184` | auth_challenge | `PENDING` (3DS) |

Use expiry `12/30` and CVV `123` for all test cards.

### Dashboard sandbox mode

When a merchant logs in to the dashboard with a `bz_test_` key, an amber banner appears at the top of every page:

```
⚠ MODO DE TESTES — SANDBOX — nenhum pagamento real é processado
```

The banner is driven by the `environment` field stored in the session at login time. No sandbox data is ever shown on a live session and vice-versa.

### SDK usage

**TypeScript**

```typescript
import { BanzaClient } from '@banza/sdk';

const sandbox = new BanzaClient({ apiKey: 'bz_test_…', environment: 'sandbox' });
const live    = new BanzaClient({ apiKey: 'bz_live_…', environment: 'live' });

sandbox.isSandbox;    // true
sandbox.isProduction; // false
```

The SDK automatically routes to the correct base URL and handles JWT exchange and renewal internally.

**Flutter**

```dart
import 'package:banza_flutter/banza_flutter.dart';

final client = BanzaClient(
  apiKey:      'bz_test_…',
  environment: BanzaEnvironment.sandbox,
);

client.isSandbox;    // true
client.isProduction; // false
```

For the complete sandbox developer guide — test mobile numbers, wallet funding, simulated payouts, webhook testing, QR testing, idempotency testing, and the going-to-production checklist — see [docs/sandbox/README.md](docs/sandbox/README.md).

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

| Migration | Domain              | Key Tables / Changes                                 |
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
| `0016`    | Acquiring           | `acquiring_payments`, `acquiring_callbacks`          |
| `0017`    | Transfers (fix)     | Drop `transfers.recipient_id` FK — allows merchant wallet recipients |
| `0018`    | Environment isolation | `environment TEXT CHECK ('LIVE','SANDBOX')` added to `api_keys`, `transactions`, `webhook_endpoints`, `qr_codes`, `payment_links`, `payouts`, `transfers` |
| `0019`    | Consumer verification | `verification_badge TEXT CHECK ('CONSUMER','MERCHANT')` added to `consumers` |
| `0020`    | Seed data           | Seed `verification_badge` for initial consumer accounts |
| `0021`    | Merchant verification | `verified BOOLEAN NOT NULL DEFAULT false` added to `merchants` |
| `0022`    | Consumer suspension | `suspension_notes TEXT` added to `consumers`         |
| `0023`    | Consumer deposits   | `consumer_deposits` — Multicaixa top-up lifecycle for consumer wallets |

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
- The key prefix encodes the environment — `bz_live_` for live, `bz_test_` for sandbox
- The prefix is part of the raw key material before hashing, so a key cannot be reused across environments
- The environment is also embedded as a signed claim in the JWT; a token with `environment = SANDBOX` is rejected by all live routes and vice-versa

### Environment Isolation

| Guarantee | Mechanism |
|---|---|
| `bz_test_` key rejected in live | Middleware validates key prefix against JWT environment claim |
| `bz_live_` key rejected in sandbox | Same middleware — `403 LIVE_ONLY` returned |
| Sandbox data never appears in live | `environment` column + `CHECK` constraint on 7 tables; separate DB in production |
| Sandbox webhooks stay in sandbox | Webhook delivery filtered by `environment` at dispatch time |
| Sandbox payouts never hit banking rails | Rust payout engine checks `environment` before calling acquirer |

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
./tools/seed.sh "Farmácia Central" farmacia@banzami.com
```

The script prints credentials ready to paste into the dashboard at `http://localhost:3010/login`:

```
Merchant ID   mch_xxxxxxxx-...
API Key       bz_live_xxxxxxxx-...   ← shown only once (use bz_test_ key for sandbox testing)
Wallet ID     wlt_xxxxxxxx-...
```

To create a sandbox API key for local integration testing, pass `"environment": "SANDBOX"` to `POST /v1/merchants/{id}/api-keys`. The returned `bz_test_` key routes to the sandbox stack and shows the amber banner in the dashboard.

**Admin panel** (`http://localhost:3002/login` locally, `https://admin.banzami.com` in production) uses the `ADMIN_API_KEY` from `.env`.

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
#                  # Sandbox: postgres-sandbox :5434, redis-sandbox :6380 (docker compose)
make db-migrate    # apply all 18 migrations

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

`apps/mobile` is a single Flutter project with two flavors — **consumer** (Banzami) and **merchant** (Banzami Business) — built and published to the App Store and Play Store separately.

**Run in development:**

```bash
cd apps/mobile

# Consumer app — local backend
flutter run --flavor consumer -t lib/main_consumer.dart \
  --dart-define=PUBLIC_API_URL=http://192.168.1.10:8083 --debug

# Consumer app — production backend
flutter run --flavor consumer -t lib/main_consumer.dart \
  --dart-define=PUBLIC_API_URL=https://consumer.banzami.com --debug

# Merchant app — local backend
flutter run --flavor merchant -t lib/main_merchant.dart \
  --dart-define=GATEWAY_URL=http://192.168.1.10:8080 --debug

# Merchant app — production backend
flutter run --flavor merchant -t lib/main_merchant.dart \
  --dart-define=GATEWAY_URL=https://api.banzami.com --debug
```

**Build for release:**

```bash
cd apps/mobile

# iOS IPA (requires Xcode and Apple Developer account)
flutter build ipa --flavor consumer -t lib/main_consumer.dart \
  --dart-define=PUBLIC_API_URL=https://consumer.banzami.com \
  --export-options-plist=ios/ExportOptions.plist

flutter build ipa --flavor merchant -t lib/main_merchant.dart \
  --dart-define=GATEWAY_URL=https://api.banzami.com \
  --dart-define=PAY_BASE_URL=https://pay.banzami.com \
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
| consumer | `com.banzami.consumer`   | `com.banzami.consumer`   | Banzami                |
| merchant | `com.banzami.merchant`   | `com.banzami.merchant`   | Banzami Business    |

**iOS schemes** are at `apps/mobile/ios/Runner.xcodeproj/xcshareddata/xcschemes/`:
- `consumer.xcscheme` — Debug-consumer / Release-consumer configurations
- `merchant.xcscheme` — Debug-merchant / Release-merchant configurations

**Required `--dart-define` variables** (set in CI or passed at build time):

| Variable           | Flavor(s)          | Description                          |
|--------------------|--------------------|--------------------------------------|
| `PUBLIC_API_URL`   | consumer           | Banza Public API base URL          |
| `GATEWAY_URL`      | merchant           | Banza API Gateway base URL         |
| `PAY_BASE_URL`     | consumer, merchant | Banza pay page base URL            |

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
cd sdk/python && .venv/bin/pytest tests/ --cov=banza --cov-report=term-missing
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
| `make db-migrate`    | Apply all pending migrations (currently 0001–0023) |
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
| `make studio`        | Start Validation Studio at http://localhost:3099 (local only) |
| `make studio-install`| Install Validation Studio npm dependencies        |

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
