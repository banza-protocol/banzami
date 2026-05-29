# ADR-001 — Go ↔ Rust Service Boundary

**Status:** Accepted  
**Date:** 2026-05-13

---

## Context

Banza's technology stack is split across two languages:

- **Rust** (`core/`) — the financial core: ledger, wallets, transactions, merchants, settlement, routing, risk. Rust was chosen for memory safety, deterministic performance, and strong concurrency guarantees (CLAUDE.md §3.1).
- **Go** (`services/api-gateway`) — the public API layer: authentication, rate limiting, idempotency, webhook delivery, request routing. Go was chosen for simplicity, concurrency, and operational reliability (CLAUDE.md §3.2).

The two runtimes must communicate. Several integration strategies exist, each with different tradeoffs.

---

## Decision

**Rust exposes an internal HTTP service (`services/core-api`); Go calls it over loopback.**

The Go API gateway owns the public surface (auth, rate limits, idempotency). For every financial operation — creating transactions, authorizing, capturing, managing wallets, issuing API keys — the Go gateway delegates to the Rust core-api service via HTTP.

Both services share the same PostgreSQL instance. The Rust core-api owns all writes to financial tables. The Go gateway never writes to financial tables directly.

---

## Architecture

```
                          ┌─────────────────────────────────┐
Internet ─► Go gateway ──►│ /v1/* (public API)              │
               │           │  • JWT auth                     │
               │           │  • rate limiting                 │
               │           │  • idempotency                  │
               │           └────────────┬────────────────────┘
               │                        │ HTTP (loopback :8081)
               │           ┌────────────▼────────────────────┐
               │           │ Rust core-api (internal)        │
               │           │  • transactions                  │
               │           │  • wallets                       │
               │           │  • merchants                     │
               │           │  • settlement                    │
               │           │  • risk evaluation               │
               │           └────────────┬────────────────────┘
               │                        │
               └────────────────────────┴──► PostgreSQL
```

---

## Rationale

### Why not shared PostgreSQL (Go reads/writes directly)?

Go talking to PostgreSQL directly would require reimplementing the financial state machines (transaction lifecycle, ledger invariants, double-entry enforcement) in Go. This creates two authoritative implementations that must be kept in sync — a maintenance and correctness risk that is unacceptable for a financial platform.

The Rust core is the single source of financial truth. All financial mutations must go through it.

### Why not FFI (Go calls Rust via cgo)?

FFI is error-prone, makes debugging difficult, and couples the deployment of both components. A process boundary is cleaner.

### Why not a message queue (async)?

Financial operations (authorize, capture, reverse) are inherently synchronous from the merchant's perspective — they need an immediate response to know if a payment succeeded. A queue introduces eventual consistency that conflicts with the expected API contract.

### Why internal HTTP and not gRPC?

gRPC adds protobuf schema management and code generation to both sides. At the current scale (modular monolith, single team), the operational overhead outweighs the benefits. HTTP with JSON is simpler to debug, test, and evolve. gRPC can be adopted later if performance profiling reveals HTTP overhead as a bottleneck.

### Why not embed Rust as a library in Go?

Rust's async ecosystem (tokio, sqlx) does not embed cleanly into Go's runtime. A process boundary is the correct abstraction.

---

## Consequences

**Positive:**
- Financial logic lives in one place (Rust). No duplication.
- The Go gateway can be scaled independently of the Rust core.
- The Rust core-api can be called by future services (admin-api, analytics) without going through the Go gateway.
- Clean testability: the Rust core can be tested in isolation; the Go gateway can be tested with a mock core-api.

**Negative:**
- An additional network hop per financial request (mitigated by loopback latency ~0.1ms).
- Two processes to deploy and monitor instead of one.
- Service discovery / health checks needed between gateway and core-api.

**Mitigations:**
- Loopback HTTP has negligible latency in the same host/pod.
- In the initial deployment, both services run in the same Docker Compose / pod.
- The Go gateway's idempotency middleware deduplicates retries, protecting the Rust core from duplicate writes on network blips.

---

## Alternatives Considered

| Option | Rejected Because |
|--------|-----------------|
| Shared DB (Go writes directly) | Duplicates financial state machines; correctness risk |
| gRPC | Schema management overhead; premature at current scale |
| FFI / cgo | Complex, brittle; difficult to debug in production |
| Async message queue | Synchronous API contract; merchants need immediate responses |
| Single language (all Go or all Rust) | Go cannot match Rust's safety guarantees for financial code; Rust's web ecosystem is less mature than Go's for API-layer concerns |
