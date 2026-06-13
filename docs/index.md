# Banzami Documentation Index

**Version:** 1.0
**Status:** Active

> Start here. This index tells you what to read, in what order, and why. This is the **Banzami operator** repository — protocol-level topics (certification, conformance, federation, governance) are owned by the BANZA protocol at [github.com/banza-protocol/banza](https://github.com/banza-protocol/banza), not here.

---

## I am a...

### New contributor to the Banzami codebase

1. Read [README.md](../README.md) — developer entry point, stack overview, service topology
2. Read [CLAUDE.md](../CLAUDE.md) — Engineering Constitution, rules, conventions
3. Read [BANZAMI_ARCHITECTURE.md](../BANZAMI_ARCHITECTURE.md) — operator architecture and service topology
4. Read [docs/adr/](adr/) — operator Architecture Decision Records
5. Read [docs/validation/VALIDATION_DOMAINS.md](validation/VALIDATION_DOMAINS.md) — validation model

### Developer integrating Banzami payments

1. Read [docs/sandbox/README.md](sandbox/README.md) — get started in sandbox
2. Read [BANZAMI_PRODUCTS.md](../BANZAMI_PRODUCTS.md) — SDKs and integration examples
3. Read [docs/developer/15_MINUTE_QUICKSTART_SPEC.md](developer/15_MINUTE_QUICKSTART_SPEC.md) — fastest path to a first payment

### Operating Banzami

1. Read [BANZAMI_OPERATIONS.md](../BANZAMI_OPERATIONS.md) — services, health, observability, incident response
2. Read [BANZAMI_DEPLOYMENT.md](../BANZAMI_DEPLOYMENT.md) — how to deploy
3. Read [docs/runbooks/](runbooks/) — operational runbooks
4. Read [BANZAMI_SECURITY.md](../BANZAMI_SECURITY.md) — security policy

---

## Document Map

### Core References

| Document | Description |
|----------|-------------|
| [README.md](../README.md) | Repository entry point, stack, service topology |
| [CLAUDE.md](../CLAUDE.md) | Engineering Constitution — rules and conventions |
| [BANZAMI_REFERENCE.md](../BANZAMI_REFERENCE.md) | Operator reference |
| [BANZAMI_ARCHITECTURE.md](../BANZAMI_ARCHITECTURE.md) | Operator architecture |
| [BANZAMI_PRODUCTS.md](../BANZAMI_PRODUCTS.md) | Product catalogue |
| [docs/glossary.md](glossary.md) | Term definitions |

### Architecture & Decisions

| Document | Description |
|----------|-------------|
| [docs/architecture/](architecture/) | Operator architecture notes |
| [docs/adr/](adr/) | All operator Architecture Decision Records |
| [docs/domains/](domains/) | Per-domain documentation |

### Operations

| Document | Description |
|----------|-------------|
| [BANZAMI_OPERATIONS.md](../BANZAMI_OPERATIONS.md) | Operational guide |
| [BANZAMI_DEPLOYMENT.md](../BANZAMI_DEPLOYMENT.md) | Deployment guide |
| [docs/runbooks/](runbooks/) | Operational runbooks |
| [docs/playbooks/](playbooks/) | Incident playbooks |
| [docs/incident-management/](incident-management/) | Incident management |
| [BANZAMI_SECURITY.md](../BANZAMI_SECURITY.md) | Security policy |

### Validation (internal governance)

| Document | Description |
|----------|-------------|
| [docs/validation/INVARIANT_TAXONOMY.md](validation/INVARIANT_TAXONOMY.md) | Financial invariant registry |
| [docs/validation/VALIDATION_DOMAINS.md](validation/VALIDATION_DOMAINS.md) | Validation domain taxonomy |
| [docs/validation/README.md](validation/README.md) | Validation governance model |

### Developer Integration

| Document | Description |
|----------|-------------|
| [docs/sandbox/README.md](sandbox/README.md) | Sandbox environment — full reference |
| [BANZAMI_PRODUCTS.md](../BANZAMI_PRODUCTS.md) | SDK examples (TypeScript, Flutter, PHP) |
| [docs/standards/webhook-signature-spec.md](standards/webhook-signature-spec.md) | Webhook signature verification |
| [docs/integrations/](integrations/) | Operator integration guides |

> **Protocol-owned topics** — certification, conformance, the reference-operator concept — are defined by the BANZA protocol. The pointer docs [certification.md](certification.md), [conformance.md](conformance.md), and [reference-operator.md](reference-operator.md) only describe how Banzami relates to them.

---

## Terminology Quick Reference

| If you see... | It means... |
|--------------|-------------|
| BANZA | The open financial protocol Banzami is built on |
| Banzami | This operator — wallets, QR, payment links, merchant/consumer apps |
| Kernel | The Rust financial core |
| Operator | A protocol implementor (Banzami is one) |
| Certification / Conformance | BANZA protocol compliance (owned by BANZA) |
| INV-* | Financial invariant ID |
| ADR-* | Architecture Decision Record |
| trace_id | Payment flow causal chain identifier |
| DOM-* | Validation domain ID |
