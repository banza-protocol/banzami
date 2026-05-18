# Banzami — System Architecture

## Network Identity

Banzami is a **wallet-native payment network**. This is the foundational architectural constraint from which all design decisions derive.

| What Banzami IS | What Banzami is NOT |
|-----------------|---------------------|
| Wallet ↔ wallet instant transfer network | Card processor |
| QR-native payment ecosystem | Stripe clone |
| @handle-based identity system | Visa/Mastercard gateway |
| Kwanza-native money network | Card-first checkout platform |
| Local rail integration (EMIS, Multicaixa Express) | Western fintech copy-paste |

The canonical payment operation:

```
Consumer Wallet ──[ledger transfer]──▶ Merchant Wallet
```

The canonical UX: `SCAN QR → CONFIRM → INSTANT SETTLEMENT`

Reference models: **Pix, WeChat Pay, M-Pesa, UPI** — not Stripe checkout.

See [ADR-013](../adr/ADR-013-wallet-native-identity.md) and [CLAUDE.md §2.7](../../CLAUDE.md) for the full architectural constraint.

---

## Overview

Banzami is a **modular monolith** deployed as a set of coordinated processes. The core design principle is domain isolation without premature service extraction: each domain has strong internal boundaries but shares a single PostgreSQL instance and a single deployment unit per service.

---

## Service Map

```
Internet
  │
  ├─ pay.banzami.org          → apps/pay/          (Next.js 14, port 3003)
  ├─ pay.banzami.org/{slug}   → apps/checkout/     (Next.js 14, port 3004)  ← hosted checkout
  ├─ dashboard.banzami.org    → apps/dashboard/    (Next.js 14, port 3000)
  │
  ├─ api.banzami.org          → api-gateway        (Go, port 8080)  ← merchants
  └─ consumer.banzami.org     → public-api         (Go, port 8083)  ← consumers

Internal network only
  └─ admin.internal          → admin-api          (Go, port 8082)  ← operators

Loopback only (127.0.0.1)
  └─ core-api                (Rust/Axum, port 8081)
```

---

## Component Diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                            EXTERNAL ZONE                                │
│                                                                         │
│  ┌──────────────┐   ┌──────────────┐   ┌────────────┐   ┌──────────┐  │
│  │ Merchant App │   │ Consumer App │   │  Pay Page  │   │Dashboard │  │
│  │  (server)    │   │  (Flutter)   │   │(Next.js 14)│   │(Next.js) │  │
│  └──────┬───────┘   └──────┬───────┘   └─────┬──────┘   └────┬─────┘  │
└─────────┼──────────────────┼─────────────────┼───────────────┼────────┘
          │ JWT (API key)     │ JWT (PIN)        │ No auth       │ JWT
          ▼                  ▼                  ▼               ▼
┌─────────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│   api-gateway   │  │  public-api  │  │  api-gateway │  │  api-gateway │
│   Go :8080      │  │  Go :8083    │  │  /public/pay │  │  (dashboard) │
└────────┬────────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘
         │                  │                  │                  │
         └──────────────────┴──────────────────┴──────────────────┘
                                     │ HTTP (loopback)
                                     ▼
                          ┌──────────────────────┐
                          │       core-api        │
                          │     Rust/Axum :8081   │
                          │                       │
                          │  ┌─────────────────┐  │
                          │  │  Domain Engines  │  │
                          │  │  - ledger        │  │
                          │  │  - wallets       │  │
                          │  │  - transactions  │  │
                          │  │  - transfers     │  │
                          │  │  - payment-links │  │
                          │  │  - qr-codes      │  │
                          │  │  - merchants     │  │
                          │  │  - consumers     │  │
                          │  │  - settlements   │  │
                          │  │  - payouts       │  │
                          │  │  - reconciliation│  │
                          │  └─────────────────┘  │
                          └──────────┬─────────────┘
                                     │ SQL
                                     ▼
                          ┌──────────────────────┐
                          │      PostgreSQL       │
                          │   (single source of   │
                          │      financial truth)  │
                          └──────────────────────┘

                  ┌──────────────────────────┐
                  │       admin-api           │
                  │       Go :8082            │
                  │  (internal network only)  │
                  └──────────┬───────────────┘
                             │ HTTP (loopback)
                             └──► core-api
```

---

## Language Boundaries

| Language | Responsibility | Rationale |
|----------|---------------|-----------|
| **Rust** | Financial core (ledger, wallets, transfers, settlements, reconciliation) | Memory safety, deterministic behaviour, zero-overhead abstractions |
| **Go** | API services (api-gateway, public-api, admin-api) | Simplicity, concurrency, fast compilation, excellent HTTP tooling |
| **TypeScript / Next.js** | Web frontends (dashboard, pay page, docs site) | Strong typing for complex UI state; App Router for SSR |
| **Flutter / Dart** | Mobile SDK and checkout widget | Cross-platform (iOS + Android), familiar P2P payment UX |

---

## Data Flow: Payment Link Payment

```
1. Merchant creates link
   POST api.banzami.org/v1/payment-links
     → api-gateway → POST core-api/internal/v1/payment-links
     → Returns slug: "a3f7c2d19b40"
     → Merchant shares: https://pay.banzami.org/a3f7c2d19b40

2. Consumer opens pay page
   GET pay.banzami.org/a3f7c2d19b40
     → Next.js server component
     → GET api-gateway/public/pay/a3f7c2d19b40
     → Server-renders page with amount, description, QR

3. Consumer pays (logged in)
   POST consumer.banzami.org/v1/payment-links/a3f7c2d19b40/pay
     → public-api verifies JWT
     → GET core-api/internal/v1/payment-links/by-slug/a3f7c2d19b40
     → GET core-api/internal/v1/consumer-wallets?consumer_id=...
     → POST core-api/internal/v1/transfers  (sender→merchant wallet)
     → POST core-api/internal/v1/payment-links/{id}/mark-used
     → Returns { status: "USED" }

4. Pay page detects payment
   GET api-gateway/public/pay/a3f7c2d19b40/status → { "paid": true }
     → Shows "Payment successful"
```

---

## Data Flow: P2P Transfer

```
1. Consumer authenticates
   POST consumer.banzami.org/v1/auth/token
     → public-api verifies PIN against public_api_credentials
     → Returns JWT { customer_id: "...", scopes: ["consumer"] }

2. Consumer sends money
   POST consumer.banzami.org/v1/transfers
     { recipient_handle: "maria_shop", amount_minor: 25000, currency: "AOA" }
     → public-api resolves sender wallet via consumer_id
     → public-api resolves recipient consumer by handle
     → public-api resolves recipient wallet
     → POST core-api/internal/v1/transfers
        Rust engine:
          1. Idempotency check
          2. Balance check (available >= amount)
          3. Ledger posting (sender_account -25000, recipient_account +25000)
          4. Update transfer status = COMPLETED
          All in one PostgreSQL transaction
     → Returns completed transfer
```

---

## Observability Stack

Every Go service exposes:
- `GET /health` — liveness probe (returns `200 ok`)
- `GET /metrics` — Prometheus metrics (request counts, durations, error rates)
- OpenTelemetry traces via OTLP when `OTLP_ENDPOINT` is set

The Rust core-api exposes the same via its Axum router.

Grafana dashboards are defined in `infra/monitoring/`.

---

## Security Boundaries

| Boundary | Control |
|----------|---------|
| Internet → api-gateway | TLS, JWT authentication, rate limiting (Redis) |
| Internet → public-api | TLS, JWT authentication, rate limiting |
| Internet → admin-api | **Never exposed** — internal network only |
| Go services → core-api | Loopback (127.0.0.1) + firewall; no auth token |
| core-api → PostgreSQL | Loopback; credentials via `DATABASE_URL` env var |
| Secrets | Environment variables; never in source code or logs |

---

## Background Workers

| Worker | Service | Interval | Purpose |
|--------|---------|----------|---------|
| QR expiry | core-api | 60s | Expire dynamic QR codes past `expires_at` |
| Payment link expiry | core-api | 60s | Expire payment links past `expires_at` |

Both workers use `tokio::time::interval` with `MissedTickBehavior::Skip` — if the tick fires while the previous run is still executing, the missed tick is skipped rather than queued.

---

## Dependency Graph

```
apps/pay          → api-gateway (public endpoints, no auth)
apps/dashboard    → api-gateway (merchant JWT)
public-api        → core-api (loopback HTTP)
public-api        → PostgreSQL (credentials table only)
api-gateway       → core-api (loopback HTTP)
api-gateway       → PostgreSQL (webhooks table)
api-gateway       → Redis (rate limiting, idempotency)
admin-api         → core-api (loopback HTTP)
core-api          → PostgreSQL (all financial data)
sdk/flutter       → public-api, api-gateway
sdk/typescript    → api-gateway
sdk/python        → api-gateway
apps/checkout     → api-gateway (public endpoints)
plugins/*         → api-gateway
```

---

## Repository Layout

```
/banzami
  /apps
    /pay          ← Consumer pay page (Next.js 14, port 3003)
    /dashboard    ← Merchant dashboard (Next.js 14, port 3000)
    /admin        ← Operator dashboard (planned)
    /docs         ← Public docs site (planned)
  /services
    /api-gateway  ← Merchant-facing API (Go, port 8080)
    /public-api   ← Consumer-facing API (Go, port 8083)
    /admin-api    ← Internal operator API (Go, port 8082)
  /core           ← Rust workspace (core-api Axum server + domain crates)
    /api          ← Axum HTTP server
    /ledger       ← Double-entry accounting engine
    /wallets      ← Merchant wallet management
    /transactions ← Payment transaction state machine
    /transfers    ← P2P transfer engine
    /payment-links← Payment link domain
    /qr           ← QR code domain
    /types        ← Shared types (IDs, Money, Currency)
  /sdk
    /flutter      ← Flutter SDK (mobile runtime — iOS + Android)
    /typescript   ← TypeScript SDK (Node.js, Next.js, browser — ESM + CJS)
    /python       ← Python SDK (async, pydantic v2, Django/FastAPI/Flask)
  /plugins
    /generic-node    ← Node.js server-side adapter
    /generic-php     ← PHP adapter (no external dependencies)
    /generic-laravel ← Laravel service provider + facades
    /woocommerce     ← WooCommerce payment gateway plugin
  /db
    /migrations   ← Sequential SQL migration files
  /infra
    /docker       ← docker-compose for local development
    /monitoring   ← Grafana + Prometheus configs
  /docs           ← This directory
```
