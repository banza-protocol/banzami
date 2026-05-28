# Banzami Glossary

**Version:** 1.0  
**Date:** 2026-05-28  
**Status:** Authoritative

> Single authoritative definitions for every important term in the Banzami ecosystem.  
> When in doubt about terminology, this document is the source of truth.

---

## @banza

A human-readable payment address uniquely identifying a consumer or merchant on the Banza network. Format: `@<handle>`. Examples: `@joao.luanda`, `@cantina.central`. Governed by INV-IDENT-001 (global uniqueness). No IBAN, no account number, no card number required. Defined in ADR-013.

---

## Acquiring

The process of accepting payment card transactions. In Banzami, acquiring refers specifically to EMIS/Multicaixa Express integration — the mechanism by which card payments are accepted and settled into Banza wallets. Implemented in the `acquiring` Rust crate. Capability: `acquiring.emis`.

---

## ADR (Architecture Decision Record)

An immutable record of an architecture-level decision: why it was made, what alternatives were considered, and what consequences follow. ADRs are numbered sequentially (ADR-001, ADR-002...). Stored in `docs/adr/`. Cannot be retroactively modified; a new ADR is required to supersede an old one.

---

## AOA / Kwanza

Angola Obrigação Angolana — the official currency of Angola. All financial amounts in Banzami are denominated in AOA and stored as integer minor units (i64). Symbol: Kz. ISO 4217 code: AOA. Minor unit: 1 AOA = 100 minor units.

---

## Banza

The primary payment product built by Banzami. The consumer-facing payment network: wallets, QR payments, @handle identity, Banza Business for merchants, and the Banza SDK for developers. Defined in ADR-016.

**Not:** Banza ≠ Banzami (the organisation). See [Banzami](#banzami).

---

## Banza Business

The merchant dashboard and tooling within the Banza product. Provides: real-time balance, transaction history, QR generator, reconciliation reports, payout management.

---

## Banza SDK

The official SDK for integrating Banza payments into external applications. Available in TypeScript (`@banza/sdk`), Flutter/Dart (`banzami_sdk`), and PHP (`banza/sdk`). The recommended path for all external integrations — direct HTTP is not supported for production integrations (ADR-012).

---

## BanzamIA

The AI-native protocol intelligence layer for the Banzami ecosystem. Deployed at `banzami.org/banzamia`. An 8-module interface for building, validating, and certifying Banzami operators. Read-only — cannot initiate financial operations. Operates on the principle: "Tools determine truth. AI explains truth."

---

## Banzami

The organisation and protocol. Banzami builds the financial infrastructure (Banzami Kernel), defines the protocol (RFCs, ADRs), maintains the conformance suite and certification framework, and publishes official SDKs. Defined in ADR-016.

**Not:** Banzami ≠ Banza (the payment product).

---

## Banzami Kernel

The Rust financial core of the Banzami platform. Composed of 18 Rust crates that collectively implement: ledger, wallets, transactions, transfers, settlement, reconciliation, payouts, QR, payment links, identity, consumer wallets, acquiring, risk, compliance, routing, merchants, jobs, and shared types. Never exposed directly to the internet — all access is via Go service layer.

---

## Capability

An atomic, independently testable unit of operator functionality. Capabilities are declared in the Operator Manifest and verified by the conformance suite. Examples: `wallet.consumer`, `qr.static`, `settlement.t0`. Each capability maps to a specific conformance sub-suite.

---

## Certification

The formal process by which an operator proves it implements the Banzami protocol correctly at a given level. Certification is earned by passing the conformance suite for the target level. Levels 0–4. Certifications are version-bound and expire after 12 months without re-verification. See `docs/certification.md`.

---

## Certification Level

An integer 0–4 indicating an operator's verified protocol compliance depth:
- **0** — Sandbox only
- **1** — Core payments (wallets, static QR, P2P)
- **2** — Advanced payments (dynamic QR, payment links, T+0 settlement)
- **3** — Full protocol (payouts, reconciliation)
- **4** — Infrastructure operator (acquiring, federation-ready)

---

## Conformance

Protocol compliance verification. An operator is conformant if it passes all conformance tests for its declared certification level. Conformance is measured by the conformance suite — a machine-executable specification. See `docs/conformance.md`.

---

## Conformance Suite

The machine-executable specification that defines what "protocol compliant" means. A collection of structured test files organized by certification level. Each test declares preconditions, operations, expected outcomes, and invariants that must hold. Source of truth for certification.

---

## Credit (ledger)

A ledger entry that increases a wallet balance. In the QR payment flow: merchant wallet receives a credit of the net amount; fee wallet receives a credit of the fee amount. Always paired with a debit of equal total value (INV-LEDGER-001).

---

## Debit (ledger)

A ledger entry that decreases a wallet balance. In the QR payment flow: consumer wallet is debited the gross amount. Always paired with credits of equal total value (INV-LEDGER-001).

---

## Double-Entry Ledger

The accounting system used by Banzami. Every financial posting must contain equal debits and credits (INV-LEDGER-001). Entries are append-only (INV-LEDGER-002), stored as integer minor units (INV-LEDGER-003), and committed atomically (INV-LEDGER-004). Implemented in the `ledger` Rust crate. Defined in ADR-002.

---

## Dynamic QR

A QR code that encodes a specific payment amount. The consumer does not need to enter the amount — it is pre-encoded and validated by the system. Capability: `qr.dynamic`. Contrast with [Static QR](#static-qr).

---

## Environment

The deployment context. Banzami has two environments:
- **LIVE** — real Angolan Kwanza, real settlement rails
- **SANDBOX** — virtual funds, no real rails, completely isolated database

The environment is embedded in API keys (`bz_live_…` vs `bz_test_…`), JWT claims, and all OTel attributes. Environments never mix (enforced at infrastructure level).

---

## Federation

The capability for multiple certified operators to route payments between each other. Currently not implemented — planned for H1 2027 (RFC pending). Requires Certification Level 4. See `docs/architecture/BANZAMI_ECOSYSTEM_REFERENCE.md §10`.

---

## Fee

The portion of a gross payment amount retained by the operator. Formula: `gross = net + fee` (INV-STL-001). Fees are credited to a dedicated fee wallet as a separate ledger credit entry in the same atomic posting.

---

## Financial Invariant

A non-negotiable assertion about financial correctness that must never be violated. Invariants are enforced at compile time (Rust types), schema level (database constraints), runtime (application logic), CI (automated tests), and observability (BanzamIA). Identified by `INV-<DOMAIN>-<NNN>`. See `docs/validation/INVARIANT_TAXONOMY.md`.

---

## Gross Amount

The total amount paid by the consumer. Equals net + fee. `gross_minor = net_minor + fee_minor` (INV-STL-001). Stored as i64 minor units.

---

## Handle

See [@banza](#banza).

---

## Idempotency

The property of an operation that produces the same result whether applied once or many times. All mutating Banzami API endpoints accept an `Idempotency-Key` header. Submitting the same key twice returns the original response without creating a duplicate. Defined in ADR-004.

---

## Invariant

See [Financial Invariant](#financial-invariant).

---

## Ledger Entry

A single debit or credit record in the double-entry ledger. Contains: amount (i64 minor units), currency, wallet ID, direction (DEBIT/CREDIT), posting ID, and timestamp. Immutable after creation (INV-LEDGER-002).

---

## Manifest

See [Operator Manifest](#operator-manifest).

---

## Minor Units

The integer representation of monetary amounts. 1 AOA = 100 minor units. All amounts in Banzami are stored and computed as i64 minor units. Floating-point arithmetic is forbidden (INV-LEDGER-003).

---

## Net Amount

The amount credited to the merchant wallet after fee deduction. `net = gross - fee`. Stored as i64 minor units.

---

## Operator

Any party that implements the Banzami protocol to process payments. Operators declare their capabilities in a Manifest and are subject to the Certification process. The Reference Operator (Banza) is the canonical implementation of the full protocol.

---

## Operator Manifest

A machine-readable JSON declaration of an operator's identity, target certification level, capabilities, asserted invariants, and endpoints. The starting point of the certification process. Validated by the BanzamIA Manifest Validator.

---

## Payment Link

A URL that triggers a pull payment when visited. The consumer clicks the link, confirms the amount, and pays. No QR scan required. Capability: `payment_links`. Defined in ADR-009.

---

## Posting

A complete set of balanced ledger entries that are committed atomically. A posting always contains at least one DEBIT and one CREDIT of equal total value (INV-LEDGER-001, INV-LEDGER-004).

---

## Provider

A payment rail provider. Banzami integrates with EMIS (Empresa Interbancária de Serviços) and Multicaixa Express as payment rail providers for acquiring and settlement.

---

## P2P Transfer

Consumer-to-consumer wallet transfer, addressed by @banza handle. Capability: `p2p.transfer`. Produces two ledger entries: one DEBIT from sender, one CREDIT to receiver.

---

## QR Code

The primary payment surface for merchants. A Banza QR code encodes either a static merchant identity (static QR) or a specific payment amount (dynamic QR). Scanned by the Banza consumer app to initiate payment.

---

## Rate Limiting

Request frequency controls applied per API key. All Banzami API endpoints are rate-limited. Defined in ADR-004.

---

## Reconciliation

The process of verifying that all ledger entries are consistent with settlement records and external rails. Banzami performs automated daily reconciliation. Capability: `reconciliation`. Implemented in the `reconciliation` Rust crate.

---

## Reference Operator

The canonical implementation of the complete Banzami protocol. The Banza product is the Reference Operator. All protocol behaviours are validated against the Reference Operator.

---

## RFC (Request for Comments)

A protocol-level governance document. RFCs define financial invariants, payment flows, API contracts, operator requirements, and federation protocols. Numbered sequentially. Immutable after acceptance.

---

## Sandbox

The isolated development and testing environment. Uses the same Kernel as production but with virtual funds, a completely separate database, and no real settlement rails. Sandbox API keys are prefixed `bz_test_…`. See `docs/sandbox/README.md`.

---

## Sandbox Operator

A specialised operator configuration for the sandbox environment. Same capabilities as the Reference Operator but operating entirely on virtual funds.

---

## Settlement

The process of crediting a merchant wallet with payment proceeds. In Banzami, settlement is T+0 (instant) — the net amount is credited to the merchant wallet at the moment the payment is confirmed. Capability: `settlement.t0`. Governed by INV-STL-001 and INV-STL-002.

---

## Static QR

A QR code that encodes only merchant identity, not a specific amount. The consumer enters the amount during the payment confirmation flow. Capability: `qr.static`. Contrast with [Dynamic QR](#dynamic-qr).

---

## trace_id

A unique identifier that propagates through every event in a payment flow. Enables complete reconstruction of the causal chain: from QR creation through ledger entries to settlement. Required on all financial events (INV-TRACE-001).

---

## Validation Domain

A grouping of implementation items by engineering concern. Used in the BANZAMI_IMPLEMENTATION_MATRIX for health dashboards, ownership assignment, and confidence scoring. Domains: DOM-FIN, DOM-IDENTITY, DOM-CONSUMER, DOM-MERCHANT, DOM-DEVELOPER, DOM-INFRA, DOM-SECURITY, DOM-COMPLIANCE. See `docs/validation/VALIDATION_DOMAINS.md`.

---

## Wallet

A Kwanza-denominated balance account. Every consumer and merchant in the Banza network has at least one wallet. Wallet balances are always derived from ledger entries — never directly mutated. A wallet balance can never go negative (INV-STL-002).

---

## Webhook

An HTTP callback sent to an operator or integrator when a financial event occurs. Banzami webhooks use HMAC-SHA256 signatures (`Banza-Signature` header) for authenticity verification. Standard retry schedule: 1m → 5m → 30m → 2h → 8h. Defined in `docs/standards/webhook-signature-spec.md`.

---

## XOF

West African CFA franc. Used in BanzamIA demo traces for protocol illustration. Not a supported live currency — Banzami's live currency is AOA (Kwanza).

---

*This glossary is maintained as part of the Banzami documentation. Report inconsistencies or missing terms via the standard RFC/ADR governance process.*
