# Banza Ecosystem Reference

**Version:** 1.0  
**Date:** 2026-05-28  
**Status:** Official  
**Author:** Banza Engineering

> This document is the single source of truth for the Banza ecosystem architecture.  
> It is architecture-first, not marketing. For the public product narrative, see `docs/BANZA_REFERENCE.md`.

---

## Table of Contents

1. [Vision](#1-vision)
2. [Philosophy](#2-philosophy)
3. [Ecosystem Structure](#3-ecosystem-structure)
4. [Governance](#4-governance)
5. [Public vs Private Components](#5-public-vs-private-components)
6. [Financial Infrastructure Model](#6-financial-infrastructure-model)
7. [Operator Model](#7-operator-model)
8. [Certification Model](#8-certification-model)
9. [Conformance Model](#9-conformance-model)
10. [Federation Model](#10-federation-model)
11. [BanzAI](#11-banzamia)
12. [Roadmap](#12-roadmap)

---

## 1. Vision

Banza is open programmable financial infrastructure for Angola.

The vision is a payment ecosystem where:

- **Any** Angolan application integrates instant Kwanza payments in hours via official SDKs
- **Any** party certified to the protocol can operate as a conformant payment operator
- **All** financial operations are traceable, verifiable, and invariant-checked by default
- **AI** explains protocol truth grounded in tooling, not inference

Banza is not a payment processor. It is a payment protocol with a reference implementation, a certification framework, and an AI-assisted integration layer.

The canonical experience: `SCAN QR → CONFIRM → INSTANT SETTLEMENT`

---

## 2. Philosophy

### Tools determine truth. AI explains truth.

Financial invariants are checked by deterministic tools, not inferred by AI. BanzAI surfaces the results of tool execution — it does not replace the tools.

### Financial correctness over hype

Every design decision is evaluated against: "Does this preserve financial correctness?" Operational simplicity and auditability outrank features.

### The protocol is the product

Banzami (the consumer product) is the reference implementation of the Banza protocol. The protocol is what scales. Banzami is what proves it.

### Operators implement policy. Kernel implements protocol.

The Banza Kernel enforces the financial invariants. Operators apply their business policies within the constraints the kernel enforces. These layers are never collapsed.

### Traceability by default

Every financial event carries a `trace_id`. Every causal chain is reconstructable. No money moves without a ledger entry. No ledger entry is ever modified.

### Angola first

Banza serves one market exceptionally before considering expansion. The protocol is designed around Kwanza, Angolan commercial law, EMIS rails, and the informal sector that represents the majority of Angolan commerce.

---

## 3. Ecosystem Structure

```
┌─────────────────────────────────────────────────────────────────────┐
│                           BANZAMI                                    │
│                    (Organisation / Protocol)                         │
├───────────────────────────┬─────────────────────────────────────────┤
│      BANZAMI KERNEL        │              OPERATORS                  │
│   (Rust Financial Core)    │   (Protocol Implementors)               │
│                            │                                         │
│  ledger                    │  Reference Operator (Banza)             │
│  wallets                   │  Sandbox Operator                       │
│  transactions              │  Future: third-party operators          │
│  transfers                 │                                         │
│  settlement                ├─────────────────────────────────────────┤
│  reconciliation            │          CERTIFICATION                   │
│  payouts                   │                                         │
│  qr                        │  Level 0 — Sandbox                      │
│  payment-links             │  Level 1 — Payment Operator             │
│  identity                  │  Level 2 — Settlement Operator          │
│  consumer-wallets          │  Level 3 — Federation Operator          │
│  acquiring                 │  Level 4 — Infrastructure Operator      │
│  risk                      │                                         │
│  compliance                ├─────────────────────────────────────────┤
│  types (18 crates)         │           CONFORMANCE                    │
│                            │                                         │
│                            │  Financial Invariants                   │
│                            │  Protocol Conformance Tests             │
│                            │  Operator Manifest Validation           │
├───────────────────────────┴─────────────────────────────────────────┤
│                           BANZAI                                     │
│              (Protocol Operating System)                             │
│                                                                      │
│  Chat · Operator Builder · Conformance · Manifest Validator          │
│  Trace Explainer · SDK Assistant · RFC/ADR Explorer · Knowledge Search│
├─────────────────────────────────────────────────────────────────────┤
│                           SDKs                                       │
│                                                                      │
│  TypeScript · Flutter/Dart · PHP · Go (internal)                     │
├─────────────────────────────────────────────────────────────────────┤
│                        APPLICATIONS                                  │
│                                                                      │
│  Banzami (consumer mobile) · Banzami Business (merchant) ·          │
│  Banzami Checkout · Banza Docs · Banza Admin · Validation Studio     │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.1 Brand Architecture

Per ADR-025 (supersedes ADR-016):

| Name | Role |
|------|------|
| **Banza** | Open financial protocol — kernel, ledger, certification, federation, governance |
| **Banzami** | Reference operator and main product — consumer app, wallet, QR, checkout, Banzami Business |
| **BanzAI** | Protocol Operating System — 16 modules, 8 capabilities |

`Banza constrói a infraestrutura. Banzami move o dinheiro.`

### 3.2 Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Financial core | Rust | Memory safety, deterministic performance, strong type system for money |
| Orchestration | Go | Operational simplicity, concurrency, HTTP gateway patterns |
| Frontend | Next.js (TypeScript) | Developer ecosystem, SSR, performance |
| Mobile | Flutter/Dart | Single codebase for Android/iOS, native performance |
| Database | PostgreSQL | ACID guarantees, financial correctness |
| Cache / queues | Redis | Rate limiting, idempotency keys, session store |
| Observability | OpenTelemetry | Vendor-neutral traces, metrics, logs |

### 3.3 Service Topology

```
Internet
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│                    Go Services Layer                         │
│                                                             │
│  api-gateway (8080)   public-api (8083)   admin-api (8082)  │
│                                                             │
│  • Auth (JWT)         • Consumer ops      • Admin ops       │
│  • Rate limiting      • Sandbox API       • Merchant mgmt   │
│  • Idempotency        • Push notifs       • Reporting       │
│  • Webhooks                                                 │
└─────────────────────────────────────────────────────────────┘
                │ HTTP (loopback)
                ▼
┌─────────────────────────────────────────────────────────────┐
│                  Rust Core API (internal)                   │
│                                                             │
│  18 crates — never exposed directly to internet             │
│                                                             │
│  ledger · wallets · transactions · transfers · settlement   │
│  reconciliation · payouts · qr · payment-links · identity  │
│  consumer-wallets · acquiring · risk · compliance · routing │
│  merchants · jobs · types                                   │
└─────────────────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────┐
│              PostgreSQL (single source of truth)            │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. Governance

### 4.1 RFC Governance

RFCs (Request for Comments) govern protocol-level decisions: financial invariants, payment flows, API contracts, operator requirements, federation protocols.

An RFC is required for:
- Any change to the financial invariant set
- Any change to the payment flow protocol
- Any new certification level
- Any operator capability addition
- Federation protocol design

RFCs are numbered sequentially (RFC-001, RFC-002...) and are immutable once accepted.

### 4.2 ADR Governance

ADRs (Architecture Decision Records) govern implementation-level decisions: technology choices, service boundaries, SDK architecture, brand architecture, identity model.

Current ADRs:
| ADR | Decision |
|-----|----------|
| ADR-001 | Go ↔ Rust service boundary — Rust core, Go gateway |
| ADR-002 | Double-entry ledger — append-only, integer minor units |
| ADR-003 | Authentication strategy — JWT with API key exchange |
| ADR-004 | Idempotency and rate limiting — idempotency keys in all mutating endpoints |
| ADR-005 | Modular monolith — domain-bounded crates, no premature microservices |
| ADR-006 | QR payment system — static and dynamic QR, direct ledger settlement |
| ADR-007 | Flutter SDK architecture — single codebase, environment injection |
| ADR-008 | Dashboard separation — merchant and admin dashboards separate |
| ADR-009 | Payment links — pull payment model via URL |
| ADR-010 | Consumer auth — PIN + JWT, no passwords |
| ADR-011 | Integration ecosystem strategy — SDK-first |
| ADR-012 | SDK-first ecosystem — all external integrations via official SDKs |
| ADR-013 | Wallet-native identity — @handle addressing, no IBAN |
| ADR-014 | Angola national mission — single-market first |
| ADR-015 | Markdown-first content architecture — docs driven from single source |
| ADR-016 | Banza/Banzami brand architecture — two-tier brand |
| ADR-017 | Wallet domain architecture — consumer wallet lifecycle |

### 4.3 Validation Governance

The `BANZAMI_IMPLEMENTATION_MATRIX.json` is the source of truth for implementation progress. It tracks:
- Acceptance criteria per feature
- Financial invariant status per feature
- Validation domain assignment
- Evidence references
- Confidence scores
- Immutable audit history

Changes to the matrix require governance phrases with fingerprint verification. Claude never modifies the matrix without explicit approval.

---

## 5. Public vs Private Components

### Private (this repository — `github.com/banza-protocol/banzami`)

| Component | Description |
|-----------|-------------|
| `core/` | Rust financial core (18 crates) |
| `services/` | Go API services |
| `apps/mobile` | Banzami consumer mobile app |
| `apps/merchant` | Banzami Business merchant app |
| `apps/checkout` | Banzami Checkout web app |
| `apps/docs` | Banza documentation website |
| `infra/` | Infrastructure as code |
| `tools/` | Operational tooling |

### Public (open-source — `github.com/banza-protocol/banzamimi`)

| Component | Description |
|-----------|-------------|
| TypeScript SDK | `@banza/sdk` — payment integration for web/Node.js |
| Flutter SDK | `banzami_sdk` — consumer/merchant integration for mobile |
| PHP SDK | `banza/sdk` — Composer package for backend integrations |
| Protocol specs | QR protocol, webhook signature spec, API contracts |
| Conformance suite | Tests that any operator must pass |
| Certification contracts | Machine-readable certification requirements |

---

## 6. Financial Infrastructure Model

### 6.1 The Double-Entry Ledger

Every financial operation in Banza produces ledger entries. The ledger is:
- **Append-only** — entries are never modified or deleted (INV-LEDGER-002)
- **Balanced** — every posting has equal debits and credits (INV-LEDGER-001)
- **Integer-only** — amounts are stored as i64 minor units, never floating-point (INV-LEDGER-003)
- **Atomic** — partial postings never persist (INV-LEDGER-004)

The QR payment canonical flow:

```
Consumer wallet (DEBIT)
    ├── Merchant wallet (CREDIT) — net amount
    └── Fee wallet (CREDIT)     — fee amount

gross_minor = net_minor + fee_minor  [INV-STL-001]
```

### 6.2 Financial Invariants

Financial invariants are non-negotiable assertions that must never be violated. They are enforced at multiple layers:
- Rust type system (compile-time)
- Database constraints (schema-level)
- Application logic (runtime)
- Automated test suites (CI)
- BanzAI tooling (observability)

Core invariant families:
- `INV-LEDGER-*` — Ledger correctness
- `INV-WALLET-*` — Wallet balance consistency
- `INV-STL-*` — Settlement correctness
- `INV-TRACE-*` — Traceability completeness
- `INV-QR-*` — QR payment lifecycle
- `INV-IDENT-*` — Identity uniqueness

See `docs/validation/INVARIANT_TAXONOMY.md` for the full registry.

### 6.3 Traceability System

Every payment flow produces a `trace_id`. The trace captures:
- Every event in causal order (`qr.created` → `transfer.initiated` → `ledger.debit` → `ledger.credit` → `transfer.completed` → `qr.paid` → `settlement.assigned`)
- Every entity touched (QR ID, transfer ID, ledger entry IDs, settlement ID)
- Every invariant status at completion

Traces are the primary audit tool. BanzAI's Trace Explainer module reconstructs and verifies any trace interactively.

### 6.4 Settlement Model

Settlement in Banza is T+0 wallet credit with configurable payout cycles:
- Consumer-to-merchant: immediate wallet credit
- Merchant-to-bank: configurable payout schedule (daily by default)
- Fee collection: immediate fee wallet credit
- Reconciliation: automated, daily

Settlement invariants:
- `INV-STL-001` — No money creation (gross = net + fee)
- `INV-STL-002` — No negative balances (wallet balance ≥ 0 after every posting)

---

## 7. Operator Model

### 7.1 What is an Operator?

An Operator is any party that implements the Banza protocol to process payments. Operators:
- Declare capabilities in an Operator Manifest
- Implement the conformance requirements for their certification level
- Operate under the invariant framework
- Are subject to certification verification

### 7.2 Operator Manifest

An Operator Manifest is a machine-readable declaration of:

```json
{
  "operator_id": "op_banza_reference",
  "version": "1.0.0",
  "certification_level": 3,
  "capabilities": [
    "wallet.consumer",
    "wallet.merchant",
    "qr.static",
    "qr.dynamic",
    "p2p.transfer",
    "payment_links",
    "settlement.t0",
    "payout.batch"
  ],
  "invariants_asserted": ["INV-LEDGER-001", "INV-LEDGER-002", "INV-STL-001", "INV-STL-002"],
  "environment": "LIVE",
  "sandbox_available": true
}
```

### 7.3 Operator Types

| Type | Description | Example |
|------|-------------|---------|
| **Reference Operator** | Canonical implementation of full protocol | Banzami |
| **Sandbox Operator** | Development/testing environment | Banzami Sandbox |
| **Third-party Operator** | External party certified to protocol | Future |
| **Acquirer Operator** | Specialised in card acquiring | Future |

### 7.4 Capabilities System

Capabilities are atomic, independently testable units of operator functionality:

| Capability | Description |
|------------|-------------|
| `wallet.consumer` | Consumer wallet lifecycle management |
| `wallet.merchant` | Merchant wallet management |
| `qr.static` | Static QR code generation and processing |
| `qr.dynamic` | Dynamic QR with amount encoding |
| `p2p.transfer` | Consumer-to-consumer transfers |
| `payment_links` | Pull-payment URLs |
| `settlement.t0` | Instant settlement (T+0) |
| `payout.batch` | Batch payout to bank accounts |
| `acquiring.emis` | EMIS card acquiring integration |

---

## 8. Certification Model

### 8.1 Certification Levels

Certification is earned by passing the conformance suite for the corresponding level.

| Level | Name | Required Capabilities | Description |
|-------|------|----------------------|-------------|
| **0** | Sandbox Operator | Basic sandbox ops | Can operate in sandbox; no live certification |
| **1** | Payment Operator | wallet.consumer, wallet.merchant, qr.static, p2p.transfer | Basic QR and wallet operations |
| **2** | Settlement Operator | Level 1 + qr.dynamic, payment_links, settlement.t0 | Dynamic QR, payment links, instant settlement |
| **3** | Federation Operator | Level 2 + payout.batch, reconciliation | Full payment lifecycle |
| **4** | Infrastructure Operator | Level 3 + acquiring.emis, federation_ready | Infrastructure-grade operator |

### 8.2 Certification Process

1. Operator submits Manifest declaring target certification level
2. BanzAI Manifest Validator validates manifest structure
3. Operator runs conformance suite for their level
4. BanzAI Conformance module verifies test results
5. Financial invariants are verified for all claimed capabilities
6. Certification is issued as a signed artifact
7. Certification is recorded in the public operator registry

### 8.3 Certification Maintenance

Certifications are version-bound:
- Major protocol updates require re-certification
- Monthly automated invariant verification
- Quarterly conformance spot-checks
- Certifications expire after 12 months without re-verification

---

## 9. Conformance Model

### 9.1 Conformance Suite Structure

The conformance suite is a machine-executable specification. It is the source of truth for what "protocol compliant" means.

Structure:
```
conformance/
  suites/
    core-payments/         # Level 1 tests
      ledger.json          # Double-entry suite
      wallet.json          # Wallet lifecycle suite
      qr-static.json       # Static QR suite
    advanced-payments/     # Level 2 tests
      qr-dynamic.json
      payment-links.json
      settlement.json
    full-protocol/         # Level 3 tests
      payout.json
      reconciliation.json
    infrastructure/        # Level 4 tests
      acquiring.json
      federation.json
```

### 9.2 Conformance Test Structure

Each conformance test declares:
- Preconditions (wallet state, operator capabilities)
- The operation being tested
- Expected outcomes (including ledger entries)
- Invariants that must hold after the operation
- Financial assertions (amounts, balances)

### 9.3 Invariant Verification in Conformance

Conformance tests do not just check API responses. They verify:
- Every ledger entry is correctly formed
- Every balance is consistent
- All declared invariants pass
- trace_id propagation is correct

---

## 10. Federation Model

### 10.1 Current State

Banza does not currently support federation (inter-operator routing). All payments are processed by the Banza reference operator.

Foundation capabilities have been designed to enable federation:
- `trace_id` propagation across service boundaries
- Operator manifest declaration
- Capability-based routing architecture
- Settlement isolation between operators

### 10.2 Federation Architecture (Planned)

Federation enables payment routing between certified operators:

```
Consumer A (Operator X) → payment → Consumer B (Operator Y)
                                ↓
                    Banzami Federation Layer
                    (routing, settlement, invariant enforcement)
```

Requirements for federation:
- Both operators hold Certification Level 3+
- Shared settlement account with Banza
- Federation manifest with routing capabilities
- Cross-operator trace_id propagation
- Atomic cross-operator ledger settlement

### 10.3 Federation Roadmap

| Milestone | Description | Target |
|-----------|-------------|--------|
| Federation spec (RFC) | Define inter-operator protocol | H1 2027 |
| Pilot operators | Two operators in controlled federation | H2 2027 |
| Open federation | Any Level 4 operator can federate | 2028 |

---

## 11. BanzAI

### 11.1 What BanzAI Is

BanzAI is the AI-native interface for building, validating, and certifying Banza operators. It is deployed at `banzami.org/banzai`.

> Tools determine truth. AI explains truth.

BanzAI does not replace deterministic tools. It:
- Explains protocol documentation grounded in citations
- Surfaces tool execution results in natural language
- Guides operators through the integration process
- Validates manifests and conformance results

### 11.2 Architecture

```
BanzAI
├── Orchestration Layer (task routing)
│   ├── DOCS tasks → Protocol documentation model
│   ├── CODE tasks → Code generation model
│   ├── REASON tasks → Deep reasoning model
│   └── VALIDATE/CERTIFY tasks → Validation model
│
├── Knowledge Base (indexed)
│   ├── Protocol docs (RFC, ADR, reference docs)
│   ├── Financial invariants
│   ├── Conformance specifications
│   └── SDK documentation
│
└── Tool Integration
    ├── Invariant checker
    ├── Manifest validator
    ├── Conformance runner
    └── Trace reconstructor
```

### 11.3 Modules

| Module | Description |
|--------|-------------|
| **Chat** | Protocol Q&A grounded in citations |
| **Operator Builder** | Guided operator manifest creation |
| **Conformance** | Conformance test runner and result analysis |
| **Manifest Validator** | Structural and semantic manifest validation |
| **Trace Explainer** | Causal timeline reconstruction and invariant verification |
| **SDK Assistant** | Code generation and SDK integration guidance |
| **RFC/ADR Explorer** | Governance document search and explanation |
| **Knowledge Search** | Semantic search over protocol documentation |

### 11.4 Security Posture

BanzAI is read-only. It:
- Cannot initiate financial operations
- Cannot modify the implementation matrix without governance phrases
- Cannot approve certifications autonomously
- Cites sources for all protocol claims
- Defers certification decisions to tooling

### 11.5 Live vs Demo Mode

- **Live mode**: Connected to BanzAI API (`NEXT_PUBLIC_BANZAMIA_API_URL`). Real streaming responses from protocol-grounded models.
- **Demo mode**: Static DEMO_RESPONSES array in `banzamia-client.ts`. Used when API is unavailable. Visually distinguished with amber badge.

---

## 12. Roadmap

### Near Term (H2 2026)

| Item | Description |
|------|-------------|
| Conformance Suite v1 | Machine-executable Level 1–3 test suite |
| Certification Level 1–2 | First external operators can be certified |
| BanzAI Live API | Production BanzAI API with Qdrant vector store |
| PHP SDK v1 | Stable PHP SDK for server-side integrations |
| Payout automation | Automated T+1 payout cycles |
| Acquiring integration | EMIS card acquiring integration |

### Mid Term (H1 2027)

| Item | Description |
|------|-------------|
| Certification Level 3–4 | Full protocol and infrastructure certification |
| Third-party operators | First non-Banzami operators on the protocol |
| Federation RFC | Inter-operator routing specification |
| BanzAI Knowledge API | Qdrant-powered semantic search over all protocol docs |
| Open certification | Self-service certification portal |

### Long Term (H2 2027+)

| Item | Description |
|------|-------------|
| Federation pilot | Two operators in controlled federation |
| Open federation | Any Level 4 operator can federate |
| Acquiring ecosystem | Multiple acquiring providers |
| Cross-border rails | AOA ↔ other African currencies |
| Protocol governance DAO | Decentralised RFC/ADR governance |

---

## References

- ADR-001 through ADR-017 — all in `docs/adr/`
- `docs/validation/INVARIANT_TAXONOMY.md` — full invariant registry
- `docs/validation/VALIDATION_DOMAINS.md` — validation domain taxonomy
- `docs/sandbox/README.md` — sandbox environment reference
- `docs/audit/documentation-audit.md` — documentation gap analysis
- `CLAUDE.md` — Engineering Constitution
- `README.md` — Developer entry point
