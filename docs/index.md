# Banza Documentation Index

**Version:** 1.0  
**Date:** 2026-05-28  
**Status:** Active

> Start here. This index tells you what to read, in what order, and why.

---

## I am a...

### New contributor to the Banza codebase

1. Read [README.md](../README.md) — developer entry point, stack overview, service topology
2. Read [CLAUDE.md](../CLAUDE.md) — Engineering Constitution, rules, conventions
3. Read [docs/architecture/BANZAMI_ECOSYSTEM_REFERENCE.md](architecture/BANZAMI_ECOSYSTEM_REFERENCE.md) — ecosystem architecture
4. Read [docs/adr/ADR-001](adr/ADR-001-go-rust-service-boundary.md) through [ADR-017](adr/ADR-017-wallet-domain-architecture.md)
5. Read [docs/validation/VALIDATION_DOMAINS.md](validation/VALIDATION_DOMAINS.md) — validation model

### Developer integrating Banzami payments

1. Read [docs/sandbox/README.md](sandbox/README.md) — get started in sandbox
2. Read [docs/banzamia/sdk-assistant.md](banzamia/sdk-assistant.md) — SDK examples
3. Read [docs/BANZAMI_REFERENCE.md §9](BANZAMI_REFERENCE.md) — programadores section
4. Ask [BanzAI](https://banzami.org/banzamia) — generates integration code

### Operator building on the Banza protocol

1. Read [docs/architecture/BANZAMI_ECOSYSTEM_REFERENCE.md §7](architecture/BANZAMI_ECOSYSTEM_REFERENCE.md) — Operator Model
2. Read [docs/certification.md](certification.md) — certification levels and process
3. Read [docs/conformance.md](conformance.md) — conformance suite reference
4. Read [docs/banzamia/operator-builder.md](banzamia/operator-builder.md) — manifest creation
5. Use [BanzAI Operator Builder](https://banzami.org/banzamia) — guided manifest creation

### Understanding the protocol governance

1. Read [docs/adr/](adr/) — all ADRs (architecture decisions)
2. Read [docs/validation/INVARIANT_TAXONOMY.md](validation/INVARIANT_TAXONOMY.md) — financial invariants
3. Read [docs/validation/VALIDATION_DOMAINS.md](validation/VALIDATION_DOMAINS.md) — validation domains
4. Read [docs/architecture/BANZAMI_ECOSYSTEM_REFERENCE.md §4](architecture/BANZAMI_ECOSYSTEM_REFERENCE.md) — Governance

### Understanding BanzAI

1. Read [docs/banzamia/overview.md](banzamia/overview.md) — what BanzAI is
2. Read [docs/banzamia/architecture.md](banzamia/architecture.md) — technical architecture
3. Read [docs/banzamia/roadmap.md](banzamia/roadmap.md) — what's coming
4. Visit [banzami.org/banzamia](https://banzami.org/banzamia) — live interface

---

## Document Map

### Core References

| Document | Audience | Language | Description |
|----------|----------|----------|-------------|
| [README.md](../README.md) | Developers | English | Repository entry point, stack, service topology |
| [CLAUDE.md](../CLAUDE.md) | Developers | English | Engineering Constitution — rules and conventions |
| [docs/BANZAMI_REFERENCE.md](BANZAMI_REFERENCE.md) | Everyone | Portuguese | Public reference — product, ecosystem, protocol |
| [docs/architecture/BANZAMI_ECOSYSTEM_REFERENCE.md](architecture/BANZAMI_ECOSYSTEM_REFERENCE.md) | Technical | English | Architecture-first ecosystem reference |
| [docs/glossary.md](glossary.md) | Everyone | English | Authoritative term definitions |

### Architecture

| Document | Description |
|----------|-------------|
| [docs/architecture/BANZAMI_ECOSYSTEM_REFERENCE.md](architecture/BANZAMI_ECOSYSTEM_REFERENCE.md) | Full ecosystem architecture |
| [docs/architecture/integration-ecosystem.md](architecture/integration-ecosystem.md) | Integration ecosystem design |
| [docs/adr/ADR-001](adr/ADR-001-go-rust-service-boundary.md) | Go ↔ Rust service boundary |
| [docs/adr/ADR-002](adr/ADR-002-double-entry-ledger.md) | Double-entry ledger design |
| [docs/adr/ADR-005](adr/ADR-005-modular-monolith.md) | Modular monolith architecture |

### Governance

| Document | Description |
|----------|-------------|
| [docs/adr/](adr/) | All Architecture Decision Records (ADR-001..017) |
| [docs/validation/INVARIANT_TAXONOMY.md](validation/INVARIANT_TAXONOMY.md) | Financial invariant registry |
| [docs/validation/VALIDATION_DOMAINS.md](validation/VALIDATION_DOMAINS.md) | Validation domain taxonomy |
| [docs/validation/README.md](validation/README.md) | Validation governance model |

### Certification & Conformance

| Document | Description |
|----------|-------------|
| [docs/certification.md](certification.md) | Certification levels 0–4, process, maintenance |
| [docs/conformance.md](conformance.md) | Conformance suite structure and rules |
| [docs/reference-operator.md](reference-operator.md) | Reference Operator (Banzami) specification |

### BanzAI

| Document | Description |
|----------|-------------|
| [docs/banzamia/overview.md](banzamia/overview.md) | What BanzAI is (and isn't) |
| [docs/banzamia/architecture.md](banzamia/architecture.md) | Technical architecture |
| [docs/banzamia/api.md](banzamia/api.md) | API contract |
| [docs/banzamia/operator-builder.md](banzamia/operator-builder.md) | Manifest creation guide |
| [docs/banzamia/manifest-validator.md](banzamia/manifest-validator.md) | Validation rules reference |
| [docs/banzamia/trace-explainer.md](banzamia/trace-explainer.md) | Trace reconstruction guide |
| [docs/banzamia/sdk-assistant.md](banzamia/sdk-assistant.md) | SDK code generation guide |
| [docs/banzamia/knowledge-search.md](banzamia/knowledge-search.md) | Semantic search guide |
| [docs/banzamia/roadmap.md](banzamia/roadmap.md) | BanzAI roadmap |

### Developer Integration

| Document | Description |
|----------|-------------|
| [docs/sandbox/README.md](sandbox/README.md) | Sandbox environment — full reference |
| [docs/banzamia/sdk-assistant.md](banzamia/sdk-assistant.md) | SDK examples (TypeScript, Flutter, PHP) |
| [docs/standards/webhook-signature-spec.md](standards/webhook-signature-spec.md) | Webhook signature verification |
| [docs/integrations/doa/](integrations/doa/) | DOA integration (TypeScript SDK) |

### Product & Brand

| Document | Description |
|----------|-------------|
| [docs/product/strategy.md](product/strategy.md) | Product strategy |
| [docs/product/positioning.md](product/positioning.md) | Market positioning |
| [docs/adr/ADR-016](adr/ADR-016-banzami-banza-brand-architecture.md) | Brand architecture (Banza/Banzami) |
| [assets/banza/guidelines/BANZA_BRAND_GUIDELINES.md](../assets/banza/guidelines/BANZA_BRAND_GUIDELINES.md) | Brand guidelines |

### Audit & Compliance

| Document | Description |
|----------|-------------|
| [docs/audit/documentation-audit.md](audit/documentation-audit.md) | Documentation gap analysis |
| [docs/sandbox/sandbox-vs-production.md](sandbox/sandbox-vs-production.md) | Environment isolation guarantees |

---

## Concept Map

How the major concepts connect:

```
Protocol (RFC)
    │
    ├── Financial Invariants (INV-*)
    │       │
    │       └── Invariant Taxonomy → Validation Domains → Implementation Matrix
    │
    ├── Operator Model
    │       │
    │       ├── Operator Manifest (capabilities + invariants)
    │       ├── Conformance Suite (machine-executable tests)
    │       └── Certification (levels 0–4)
    │
    ├── Architecture (ADR)
    │       │
    │       ├── Banzami Kernel (18 Rust crates)
    │       ├── Go Services (gateway, public-api, admin-api)
    │       └── Applications (mobile, merchant, checkout, docs)
    │
    └── BanzAI (Protocol Operating System)
            │
            ├── Chat (protocol Q&A)
            ├── Builder (manifest creation)
            ├── Conformance (test runner)
            ├── Trace Explainer (causality + invariants)
            └── Knowledge Search (semantic search)
```

---

## Terminology Quick Reference

When in doubt about a term, see [docs/glossary.md](glossary.md).

| If you see... | It means... |
|--------------|-------------|
| Banza | The organisation and protocol |
| Banzami | The consumer payment product |
| BanzAI | Protocol Operating System |
| Kernel | The Rust financial core (18 crates) |
| Operator | Protocol implementor |
| Manifest | Operator capability declaration |
| Certification | Verified protocol compliance level |
| Conformance | Protocol compliance testing |
| INV-* | Financial invariant ID |
| ADR-* | Architecture Decision Record |
| RFC-* | Request for Comments (protocol governance) |
| trace_id | Payment flow causal chain identifier |
| DOM-* | Validation domain ID |

---

*This index is maintained as part of BANZAMI-DOCUMENTATION-CONSOLIDATION-009.*
