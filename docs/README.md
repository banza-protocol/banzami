# Banzami Documentation

This directory contains all technical documentation for the Banzami platform.

> Code without documentation is an incomplete system. — CLAUDE.md §2.4

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

---

## Other Documentation

| Directory | Contents |
|-----------|----------|
| `security/` | Threat model, security controls, vulnerability management |
| `runbooks/` | Operational procedures (deployments, incidents, rollbacks) |
| `playbooks/` | Incident response playbooks |
| `incident-management/` | Incident response procedures and post-mortems |
| `api/` | API reference (request/response schemas, examples, error catalogs) |
| `architecture/` | System-wide diagrams and architecture notes beyond ADRs |
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
