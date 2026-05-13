# Banzami

> Modern payment infrastructure for Angola — engineered to banking-grade reliability.

Banzami is a fintech platform in the same category as Stripe, Adyen, and Paystack. It is not a bank or a core banking system. It is a modern API-first payment infrastructure layer, built with the operational discipline of critical financial infrastructure.

**Philosophy:** fintech-grade agility + banking-grade reliability. See [CLAUDE.md](CLAUDE.md) for the full Engineering Constitution.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Repository Layout](#repository-layout)
3. [Technology Stack](#technology-stack)
4. [Domain Model](#domain-model)
5. [Services](#services)
6. [API Reference](#api-reference)
7. [Financial Flows](#financial-flows)
8. [Database Schema](#database-schema)
9. [Security Model](#security-model)
10. [Observability](#observability)
11. [Local Development](#local-development)
12. [Engineering Principles](#engineering-principles)
13. [Contributing](#contributing)

---

## Architecture Overview

### System Topology

```
┌──────────────────────────────────────────────────────────────────┐
│                          External Clients                         │
│                                                                   │
│   Merchant Apps     Admin Dashboard     Mobile SDK    Plugins     │
│   (REST API)        (Next.js)           (Flutter)     (WooComm.)  │
└──────┬──────────────────┬──────────────────────────────┬─────────┘
       │                  │ (internal network only)       │
       │              ┌───▼──────────────────────┐        │
       │              │    Go Admin API  :8082    │        │
       │              │  X-Admin-Key auth         │        │
       │              │  Compliance lifecycle     │        │
       │              │  Settlement management    │        │
       │              │  Payout operations        │        │
       │              │  Reconciliation triggers  │        │
       │              └───────────┬──────────────┘        │
       │                          │                        │
       ▼                          │ HTTP /internal/v1/*    │
┌──────────────────────┐          │                        │
│  Cloudflare WAF/CDN  │          │                        │
└──────────┬───────────┘          │                        │
           │                      │                        │
           ▼                      ▼                        ▼
┌──────────────────────────────────────────────────────────────────┐
│                    Go API Gateway  :8080                          │
│                                                                   │
│   JWT Bearer auth  │  Redis rate limiting (1000 req/min)         │
│   Redis idempotency keys  │  Request tracing  │  Panic recovery  │
│                                                                   │
│   POST /v1/auth/token          — API key → JWT exchange          │
│   POST /v1/transactions        — initiate payment                │
│   GET  /v1/transactions/{id}   — transaction status              │
│   POST /v1/wallets             — provision wallet                │
│   GET  /v1/wallets/{id}/balance                                  │
│   POST /v1/payouts             — request payout                  │
│   POST /v1/webhooks/endpoints  — register webhook                │
│   POST /v1/merchants           — register merchant               │
└──────────────────────────────┬───────────────────────────────────┘
                                │ HTTP loopback  /internal/v1/*
                                │ (never exposed to the internet)
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│                    Rust Core API  :8081                          │
│                                                                   │
│  The single financial authority. Go services orchestrate.        │
│  Go NEVER writes financial data directly to PostgreSQL.          │
│                                                                   │
│  ┌────────────────┐  ┌───────────────┐  ┌──────────────────┐    │
│  │  banzami-ledger│  │banzami-wallets│  │banzami-transactions│   │
│  │                │  │               │  │                  │    │
│  │ Double-entry   │  │ Reserve       │  │ Authorize        │    │
│  │ Immutable log  │  │ Release       │  │ Capture          │    │
│  │ Balanced posts │  │ Settle        │  │ Reverse / Fail   │    │
│  └────────────────┘  └───────────────┘  └──────────────────┘    │
│                                                                   │
│  ┌────────────────┐  ┌───────────────┐  ┌──────────────────┐    │
│  │banzami-settlement│ │banzami-payouts│  │banzami-reconcil. │    │
│  │                │  │               │  │                  │    │
│  │ Batch netting  │  │ Lifecycle mgmt│  │ Statement match  │    │
│  │ Acquirer submit│  │ Ledger DR/CR  │  │ Discrepancy rpt  │    │
│  │ DR bank/CR tran│  │ Bank reversal │  │                  │    │
│  └────────────────┘  └───────────────┘  └──────────────────┘    │
│                                                                   │
│  ┌────────────────┐  ┌───────────────┐  ┌──────────────────┐    │
│  │banzami-complian│  │ banzami-risk  │  │banzami-routing   │    │
│  │                │  │               │  │                  │    │
│  │ KYB / KYC      │  │ Transaction   │  │ Acquirer / PSP   │    │
│  │ AML flagging   │  │ risk scoring  │  │ selection        │    │
│  │ Tx limit gates │  │               │  │                  │    │
│  └────────────────┘  └───────────────┘  └──────────────────┘    │
└──────────────────────────────┬───────────────────────────────────┘
                                │
                ┌───────────────┴───────────────┐
                ▼                               ▼
┌───────────────────────────┐   ┌───────────────────────────────┐
│   PostgreSQL (primary DB) │   │           Redis               │
│                           │   │                               │
│  8 migration files        │   │  Rate limiting (sliding win.) │
│  Immutable ledger entries │   │  Idempotency key store        │
│  Double-entry accounting  │   │  Session management           │
│  All financial state      │   │  Distributed coordination     │
└───────────────────────────┘   └───────────────────────────────┘
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
│   ├── wallets/                   Wallet lifecycle and balance management
│   ├── transactions/              Payment transaction state machine
│   ├── merchants/                 Merchant registration and API key management
│   ├── settlement/                Settlement batch netting and lifecycle
│   ├── payouts/                   Merchant payout orchestration
│   ├── reconciliation/            External statement matching engine
│   ├── compliance/                KYB/KYC/AML enforcement
│   ├── risk/                      Transaction risk scoring
│   ├── routing/                   Acquirer/PSP selection
│   └── api/                       Axum HTTP server wiring all domains
│
├── services/                      Go services
│   ├── api-gateway/               Public-facing API gateway (:8080)
│   │   ├── cmd/gateway/           Entry point
│   │   └── internal/
│   │       ├── config/            Environment configuration
│   │       ├── handler/           HTTP handlers (transactions, wallets, payouts, …)
│   │       ├── middleware/        Auth, rate limit, idempotency, logging
│   │       ├── service/           Service interfaces + core-api client
│   │       └── server/            Chi router and server construction
│   │
│   └── admin-api/                 Internal admin service (:8082)
│       ├── cmd/admin/             Entry point
│       └── internal/
│           ├── config/            Environment configuration
│           ├── handler/           Admin handlers (compliance, settlements, payouts, …)
│           ├── middleware/        Admin key authentication
│           ├── service/           CoreAdminClient (wraps Rust internal routes)
│           └── server/            Chi router and server construction
│
├── apps/                          Frontend applications (Next.js)
│   ├── dashboard/                 Merchant dashboard
│   ├── admin/                     Internal admin panel
│   └── docs/                      Developer documentation site
│
├── sdk/
│   ├── flutter/                   Mobile checkout SDK
│   └── typescript/                TypeScript/Node.js SDK
│
├── plugins/
│   ├── woocommerce/               WooCommerce payment plugin
│   └── shopify/                   Shopify payment app
│
├── db/
│   └── migrations/                Global PostgreSQL migrations (0001–0008)
│
├── infra/
│   ├── docker/                    Docker Compose for local development
│   ├── terraform/                 Infrastructure as code
│   ├── monitoring/                Prometheus + Grafana configuration
│   └── deployment/                Deployment scripts and runbooks
│
├── docs/
│   ├── architecture/              Architecture decision records (ADRs)
│   ├── adr/                       ADR index
│   ├── domains/                   Per-domain documentation
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
| Infrastructure       | **Docker + Hetzner/OVH + Cloudflare**             | Cost-effective, reliable European/African hosting  |

Kubernetes is intentionally deferred. The modular monolith approach provides simpler operations until scale demands otherwise.

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

## Services

### API Gateway (`services/api-gateway`, port 8080)

The public internet-facing service. All merchant API calls enter here.

**Middleware stack (in order):**
1. `RealIP` — trust X-Forwarded-For from Cloudflare
2. `RequestID` — assigns correlation ID to every request
3. `Logger` — structured request logging
4. `Recoverer` — panic → 500, never crashes the server
5. `Timeout(60s)` — kills slow upstream calls
6. `Auth` — JWT Bearer token validation (authenticated routes only)
7. `RateLimit` — Redis sliding-window: 1,000 req/min authenticated, 60 req/min anonymous
8. `Idempotency` — Redis-backed: replays cached response for duplicate keys

**Configuration (environment variables):**
| Variable              | Default   | Description                            |
|-----------------------|-----------|----------------------------------------|
| `PORT`                | `8080`    | Listen port                            |
| `JWT_SECRET`          | required  | HS256 signing key                      |
| `CORE_API_URL`        | required  | Rust core-api base URL                 |
| `REDIS_ADDR`          | required  | Redis address                          |

---

### Admin API (`services/admin-api`, port 8082)

Internal-only service for compliance operations, settlement management, and reconciliation triggers. Never exposed to the public internet.

**Authentication:** `X-Admin-Key: <key>` header or `Authorization: Bearer <key>`.

**Configuration (environment variables):**
| Variable              | Default                   | Description                   |
|-----------------------|---------------------------|-------------------------------|
| `ADMIN_API_PORT`      | `8082`                    | Listen port                   |
| `CORE_API_URL`        | `http://127.0.0.1:8081`   | Rust core-api base URL        |
| `ADMIN_API_KEY`       | required                  | Shared secret for admin auth  |

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

Observability:
- `GET /health` — liveness probe
- `GET /readyz` — readiness probe (checks core-api connectivity)

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

| Migration | Domain         | Key Tables                                      |
|-----------|----------------|-------------------------------------------------|
| `0001`    | Ledger         | `accounts`, `ledger_postings`, `ledger_entries` |
| `0002`    | Wallets        | `wallets`, `wallet_events`                      |
| `0003`    | Transactions   | `transactions`                                  |
| `0004`    | Merchants      | `merchants`, `api_keys`                         |
| `0005`    | Settlements    | `settlements`                                   |
| `0006`    | Payouts        | `payouts`                                       |
| `0007`    | Reconciliation | `reconciliation_runs`, `reconciliation_records` |
| `0008`    | Compliance     | `merchant_compliance`, `customer_compliance`    |

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

Layer 2: API Gateway (api-gateway)
  Merchants authenticate with API Key → GET JWT
  JWT: HS256, short-lived, contains MerchantID + scopes
  All authenticated routes: Bearer JWT required

Layer 3: Admin API (admin-api)
  X-Admin-Key header or Authorization: Bearer <key>
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

| Signal    | Technology        | Details                                         |
|-----------|-------------------|-------------------------------------------------|
| Logs      | `slog` (Go), `tracing` (Rust) | Structured JSON, includes request ID   |
| Traces    | OpenTelemetry     | End-to-end request tracing across Go and Rust   |
| Metrics   | Prometheus        | HTTP request rates, durations, error rates      |
| Dashboards| Grafana           | Pre-built dashboards per service domain         |

Minimum required traces:
- Every HTTP request (request ID, duration, status code)
- Every transaction lifecycle event
- Every ledger posting
- Every settlement and payout status transition

Health endpoints:
- `GET /health` — liveness (is the process alive?)
- `GET /readyz` — readiness (can the service handle traffic?)

---

## Local Development

### Prerequisites

- Rust (stable, 1.75+) — `rustup update stable`
- Go 1.22+ — `go version`
- Docker + Docker Compose
- `sqlx-cli` — `cargo install sqlx-cli --features postgres`

### Start Infrastructure

```bash
docker compose -f infra/docker/docker-compose.yml up -d
# Starts: PostgreSQL on :5432, Redis on :6379
```

### Apply Migrations

```bash
export DATABASE_URL="postgres://banzami:banzami@localhost:5432/banzami"
sqlx migrate run --source db/migrations
```

### Build and Run Rust Core

```bash
cd core
cargo build

export DATABASE_URL="postgres://banzami:banzami@localhost:5432/banzami"
export TRANSIT_ACCOUNT_ID="<uuid>"
export BANK_ACCOUNT_ID="<uuid>"
cargo run --bin core-api
# Listening on :8081
```

### Build and Run API Gateway

```bash
cd services/api-gateway
go build ./...

export PORT=8080
export JWT_SECRET="dev-secret-change-in-production"
export CORE_API_URL="http://127.0.0.1:8081"
export REDIS_ADDR="localhost:6379"
go run ./cmd/gateway
# Listening on :8080
```

### Build and Run Admin API

```bash
cd services/admin-api
go build ./...

export ADMIN_API_PORT=8082
export CORE_API_URL="http://127.0.0.1:8081"
export ADMIN_API_KEY="dev-admin-key-change-in-production"
go run ./cmd/admin
# Listening on :8082
```

### Run Tests

```bash
# Rust unit tests (no DB required)
cd core && cargo test --workspace

# Rust with DB (migrations must be applied first)
cd core && DATABASE_URL="..." cargo test --workspace

# Go
cd services/api-gateway && go test ./...
cd services/admin-api && go test ./...
```

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
