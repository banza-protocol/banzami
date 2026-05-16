# Banzami Engineering Constitution

## National-Grade Financial Infrastructure for Angola

---

# 1. Mission

Banzami is a modern financial infrastructure platform designed to become the foundational payment layer for Angola and, eventually, broader African markets.

The platform is engineered with:

* banking-grade reliability,
* financial correctness,
* developer-first experience,
* infrastructure-level scalability,
* modern security standards,
* long-term maintainability.

Banzami is NOT a simple startup product.

It is a national-scale fintech infrastructure project.

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

# 14. Final Principle

Every engineer working on Banzami must understand:

This platform handles money.

Trust is the product.

Everything else is secondary.