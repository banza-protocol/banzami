# ADR-005 — Modular Monolith Deployment Strategy

**Status:** Accepted  
**Date:** 2026-05-13

---

## Context

Early-stage distributed systems impose heavy operational costs: distributed transactions, network partitions, schema coordination across services, polyglot observability, and complex local development environments. Banzami is building infrastructure that must be correct before it is fast and scalable.

The question is: how should the system be decomposed and deployed, and under what conditions should that change?

---

## Decision

**Deploy as a controlled set of processes with strong internal modularity. Extract services only when a concrete operational necessity arises.**

The current topology (three processes: `core-api`, `api-gateway`, `admin-api`) is not a microservices architecture — it is a modular monolith with a deliberate process boundary at the Go ↔ Rust language split. Within each process, domains are separated by Rust crates and Go packages, not by network calls.

All three processes deploy together, share one PostgreSQL instance, and are monitored as a unit.

---

## Architecture

```
Current (target for v1.0):

  ┌──────────────────────────────────────────────────┐
  │ Single host / single pod                         │
  │                                                  │
  │  api-gateway (:8080)   admin-api (:8082)         │
  │        │                     │                   │
  │        └──────────┬──────────┘                   │
  │                   │ loopback                      │
  │            core-api (:8081)                       │
  │                   │                               │
  │            PostgreSQL + Redis                     │
  └──────────────────────────────────────────────────┘

Extraction trigger example (future):

  If the risk engine requires ML model inference at high RPS,
  it may be extracted to a dedicated service with its own
  scaling profile. The core-api calls it over HTTP, same
  pattern as api-gateway → core-api today.
```

---

## Rationale

### Why not microservices from day one?

Microservices solve scaling and team ownership problems. They introduce:

- **Distributed transactions** — a payment that touches wallets, ledger, and transactions in a single atomic operation becomes a saga or two-phase commit across network boundaries. Both are orders of magnitude more complex than a database transaction.
- **Schema coordination** — migrating a shared schema requires coordinating deployments of every service that reads it.
- **Operational overhead** — each service needs its own CI/CD pipeline, health checks, logging aggregation, and distributed tracing instrumentation.
- **Local development complexity** — running 10 services locally requires orchestration that slows down every engineer.

None of these costs are justified at Banzami's current scale. The team is small, the domains are well-understood, and correctness is more important than independent scalability.

### Why three processes and not one?

The Go ↔ Rust split is a language boundary, not a scalability decision. It is driven by the need for Rust's correctness guarantees on the financial core (see ADR-001). The admin-api is a separate process because it has a different security posture (internal-only, static key auth) that should not be mixed with the public API surface.

These three processes are fewer than any microservices architecture would produce, and all run in the same deployment unit.

### What justifies extracting a service?

A service should be extracted only when one of the following is true:

1. **Scaling boundary** — one component needs significantly different compute resources (e.g., the risk engine needs GPU inference; the ledger is write-bottlenecked while the analytics layer is read-heavy).
2. **Domain ownership** — a team owns a domain end-to-end and needs independent deployment cadence.
3. **Technology isolation** — a component has dependency requirements that conflict with the monolith (e.g., a Python ML model cannot be embedded in a Rust process).
4. **Compliance isolation** — a component handles data that requires different access controls, audit logging, or geographic data residency.

A component growing large in lines of code is **not** a reason to extract it.

---

## Consequences

**Positive:**
- Database transactions span all financial operations — no distributed transaction complexity.
- Local development requires starting three processes and one Docker Compose file.
- Schema migrations are coordinated through a single migration sequence.
- Simpler observability: all logs, metrics, and traces share a single deployment context.

**Negative:**
- All three processes must be deployed together. A breaking change in the core-api requires coordinated deployment of api-gateway and admin-api.
- A bug that causes the core-api to crash affects all API traffic simultaneously.
- Horizontal scaling requires scaling all three processes (or running multiple instances behind a load balancer).

**Mitigations:**
- Coordinated deployment is manageable at small team size and is handled by a single CI/CD pipeline.
- Crash isolation is provided by Docker/process supervision (`restart: unless-stopped`).
- The Go ↔ Rust interface (`/internal/v1/*`) is versioned (`v1`), enabling safe evolution.

---

## Extraction Readiness

The codebase is designed to make future extraction straightforward:

- Each Rust domain is a separate crate with explicit public interfaces. Extracting `banzami-risk` to its own service means the existing interface becomes an HTTP client.
- The Go services already communicate with the Rust core over HTTP. Adding a new upstream service follows the same pattern as `CoreAdminClient` or `CoreApiClient`.
- Migrations are domain-scoped (one file per domain) and can be split if schemas diverge.

---

## Alternatives Considered

| Option | Rejected Because |
|--------|-----------------|
| Full microservices from day 1 | Distributed transaction complexity; operational overhead; slows correctness work |
| Single binary (embed Go in Rust or vice versa) | Language boundary is real; FFI complexity; two runtimes do not embed cleanly |
| Event-driven architecture (Kafka/NATS) | Synchronous payment responses required; eventual consistency incompatible with API contract |
| Serverless | Cold start latency unacceptable for payment processing; stateful connection pools not supported |
