# Banza Documentation

This directory contains all technical documentation for the Banza platform.

> Code without documentation is an incomplete system. — CLAUDE.md §2.4

**Start here:** [docs/index.md](index.md) — navigation entry point for new contributors.

---

## Ecosystem References

| Document | Description |
|----------|-------------|
| [index.md](index.md) | Documentation navigation entry point — start here |
| [BANZAMI_REFERENCE.md](BANZAMI_REFERENCE.md) | Official public reference — product, protocol, ecosystem |
| [architecture/BANZAMI_ECOSYSTEM_REFERENCE.md](architecture/BANZAMI_ECOSYSTEM_REFERENCE.md) | Architecture-first ecosystem reference (single source of truth) |
| [glossary.md](glossary.md) | Authoritative term definitions |
| [conformance.md](conformance.md) | Conformance suite specification |
| [certification.md](certification.md) | Certification levels 0–4 and process |
| [reference-operator.md](reference-operator.md) | Reference Operator (Banzami) specification |
| [banzamia/overview.md](banzamia/overview.md) | BanzAI — what it is and what it isn't |
| [audit/documentation-audit.md](audit/documentation-audit.md) | Documentation gap analysis |
| [images/architecture/banzami-ecosystem.svg](images/architecture/banzami-ecosystem.svg) | Ecosystem diagram |

---

## Architecture Decision Records (ADRs)

ADRs document the major technical decisions made in this project, their rationale, and the alternatives that were considered. They are the long-term memory of the engineering team.

| ADR | Title | Status |
|-----|-------|--------|
| [ADR-001](adr/ADR-001-go-rust-service-boundary.md) | Go ↔ Rust Service Boundary | Accepted |
| [ADR-002](adr/ADR-002-double-entry-ledger.md) | Double-Entry Ledger and Monetary Precision | Accepted |
| [ADR-003](adr/ADR-003-authentication-strategy.md) | Authentication Strategy | Accepted |
| [ADR-004](adr/ADR-004-idempotency-and-rate-limiting.md) | Idempotency and Rate Limiting with Redis | Accepted |
| [ADR-005](adr/ADR-005-modular-monolith.md) | Modular Monolith Deployment Strategy | Accepted |
| [ADR-006](adr/ADR-006-qr-payment-system.md) | QR Code Payment System | Accepted |
| [ADR-007](adr/ADR-007-flutter-sdk-architecture.md) | Flutter SDK Architecture | Accepted |
| [ADR-008](adr/ADR-008-dashboard-separation.md) | Dashboard Separation | Accepted |
| [ADR-009](adr/ADR-009-payment-links.md) | Payment Links: Shareable URL Commerce Primitive | Accepted |
| [ADR-010](adr/ADR-010-consumer-auth-pin-jwt.md) | Consumer Authentication: PIN + JWT | Accepted |
| [ADR-011](adr/ADR-011-integration-ecosystem-strategy.md) | Integration Ecosystem Strategy: v1 | Accepted |
| [ADR-012](adr/ADR-012-sdk-first-ecosystem.md) | SDK-First Ecosystem: Mandatory SDK Usage | Accepted |
| [ADR-013](adr/ADR-013-wallet-native-identity.md) | Wallet-Native Identity (@handle, no IBAN) | Accepted |
| [ADR-014](adr/ADR-014-angola-national-mission.md) | Angola National Mission — single-market first | Accepted |
| [ADR-015](adr/ADR-015-markdown-first-content-architecture.md) | Markdown-First Content Architecture | Accepted |
| [ADR-016](adr/ADR-016-banzami-banza-brand-architecture.md) | Banza/Banzami Brand Architecture | Accepted |
| [ADR-017](adr/ADR-017-wallet-domain-architecture.md) | Wallet Domain Architecture | Accepted |

New ADRs should be numbered sequentially and placed in `docs/adr/`. ADRs are immutable once accepted — supersede with a new ADR rather than editing.

---

## Domain Documentation

Each financial domain has a dedicated document covering its business purpose, architecture, state machines, invariants, and failure scenarios.

| Domain | Description |
|--------|-------------|
| [Ledger](domains/ledger/README.md) | Double-entry accounting engine — the financial truth |
| [Wallets](domains/wallets/README.md) | Merchant wallet lifecycle and balance management |
| [Transactions](domains/transactions/README.md) | Payment transaction state machine |
| [Merchants](domains/merchants/README.md) | Merchant registration and API key lifecycle |
| [Settlements](domains/settlements/README.md) | Batch settlement netting and acquirer lifecycle |
| [Payouts](domains/payouts/README.md) | Merchant disbursement to external bank accounts |
| [Reconciliation](domains/reconciliation/README.md) | External statement matching and discrepancy reporting |
| [Compliance](domains/compliance/README.md) | KYB / KYC / AML enforcement and transaction gates |
| [Consumer Wallets](domains/consumer-wallets/README.md) | Consumer wallet lifecycle and balance management |
| [Identity](domains/identity/README.md) | Consumer identity and handle registry |
| [Transfers](domains/transfers/README.md) | Instant P2P money transfers |
| [QR Codes](domains/qr/README.md) | Static and dynamic QR payment codes |
| [Payment Links](domains/payment-links/README.md) | Shareable URL payments for informal commerce |

---

## Official Example Integrations

Reference implementations that demonstrate correct Banza integration patterns. These are not toy examples — each documents a production-grade merchant integration and serves as the canonical guide for that integration type.

| Integration | Type | Documentation |
|-------------|------|---------------|
| [Doa](integrations/doa/README.md) | Donation platform — QR payments, webhooks, sandbox | [Full docs →](integrations/doa/) |

### Doa Integration Coverage

| Document | Contents |
|----------|----------|
| [README](integrations/doa/README.md) | Overview, quick start, architecture summary |
| [Architecture](integrations/doa/architecture.md) | System boundaries, component responsibilities, idempotency layers |
| [Payment Flow](integrations/doa/payment-flow.md) | End-to-end sequence diagram, API reference, failure modes |
| [QR Payments](integrations/doa/qr-payments.md) | Merchant-presented QR model, polling, confirmation UX |
| [Webhooks](integrations/doa/webhooks.md) | HMAC verification, retry policy, intent resolution |
| [Sandbox](integrations/doa/sandbox.md) | Environment setup, test instruments, simulation |
| [Frontend Integration](integrations/doa/frontend-integration.md) | Payment UI, QR generation, sandbox badge, polling loop |
| [Backend Integration](integrations/doa/backend-integration.md) | Provider interface, idempotency, persistence, configuration |
| [Security](integrations/doa/security.md) | Secret management, signature verification, replay protection |
| [Observability](integrations/doa/observability.md) | Structured logs, payment tracing, webhook monitoring |
| [Production Checklist](integrations/doa/production-checklist.md) | Go-live steps, credential migration, E2E test |
| [Troubleshooting](integrations/doa/troubleshooting.md) | Webhook failures, mismatch errors, diagnostics |

---

## Other Documentation

| Directory | Contents |
|-----------|----------|
| `security/` | Threat model, security controls, vulnerability management |
| `runbooks/` | [Operational procedures](runbooks/README.md) (deployments, incidents, PIN reset) |
| `playbooks/` | Incident response playbooks |
| `incident-management/` | Incident response procedures and post-mortems |
| `api/` | [API reference](api/README.md) — request/response schemas, error catalogs |
| `architecture/` | [System architecture](architecture/README.md) — service map, data flows, dependency graph |
| `compliance/` | Regulatory documentation (BNA, AML, data protection, audit obligations) |

---

## Standards

See [CLAUDE.md](../CLAUDE.md) §5 for full documentation requirements.

### For ADRs

Format: `ADR-NNN-short-title.md`

Every ADR must include:
- **Context** — the situation that requires a decision
- **Decision** — what was decided
- **Rationale** — why this option over others
- **Consequences** — positive and negative effects
- **Alternatives Considered** — what was rejected and why

### For Domain Docs

Every domain document must cover:
- Business purpose
- Architecture diagram or description
- State machines (where applicable)
- Core invariants
- Failure scenarios and handling
- Security assumptions

### General Rules

- Write in present tense about how the system works today.
- Do not document future plans in the same section as current behaviour — mark them clearly as "planned" or "future work".
- Update docs in the same PR as the code change. An outdated document is a defect.
