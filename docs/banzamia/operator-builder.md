# BanzamIA — Operator Builder

**Version:** 1.0  
**Date:** 2026-05-28  
**Status:** Active

---

## Overview

The Operator Builder module guides you through creating a valid Banzami Operator Manifest. A manifest is the machine-readable declaration that defines who you are as an operator, what capabilities you implement, and what certification level you are targeting.

Start here if you are:
- Building a new Banzami protocol operator
- Integrating Banzami payments into an existing platform
- Seeking certification for an existing implementation

---

## What is an Operator Manifest?

An Operator Manifest is a JSON document that declares:

| Field | Description |
|-------|-------------|
| `operator_id` | Stable unique identifier for your operator |
| `version` | Manifest version (semver) |
| `certification_level` | Target level: 0, 1, 2, 3, or 4 |
| `capabilities` | Array of atomic capability identifiers |
| `invariants_asserted` | Financial invariants your implementation upholds |
| `environment` | `"LIVE"` or `"SANDBOX"` |
| `sandbox_available` | Whether you offer a sandbox environment |

---

## Capabilities Reference

Capabilities are atomic, independently testable units. Each is associated with a conformance sub-suite.

### Core Capabilities (Level 1)

| Capability | Description | Conformance suite |
|------------|-------------|------------------|
| `wallet.consumer` | Consumer wallet creation, funding, querying | `suites/core-payments/wallet.json` |
| `wallet.merchant` | Merchant wallet management | `suites/core-payments/wallet.json` |
| `qr.static` | Static QR code generation and payment processing | `suites/core-payments/qr-static.json` |
| `p2p.transfer` | Consumer-to-consumer @handle transfers | `suites/core-payments/p2p.json` |

### Settlement Operator Capabilities (Level 2)

| Capability | Description | Conformance suite |
|------------|-------------|------------------|
| `qr.dynamic` | Dynamic QR with encoded amount | `suites/advanced-payments/qr-dynamic.json` |
| `payment_links` | Pull-payment URLs | `suites/advanced-payments/payment-links.json` |
| `settlement.t0` | Instant (T+0) settlement to merchant wallet | `suites/advanced-payments/settlement.json` |

### Federation Operator Capabilities (Level 3)

| Capability | Description | Conformance suite |
|------------|-------------|------------------|
| `payout.batch` | Batch payouts to bank accounts | `suites/full-protocol/payout.json` |
| `reconciliation` | Automated ledger reconciliation | `suites/full-protocol/reconciliation.json` |

### Infrastructure Capabilities (Level 4)

| Capability | Description | Conformance suite |
|------------|-------------|------------------|
| `acquiring.emis` | EMIS card acquiring integration | `suites/infrastructure/acquiring.json` |
| `federation_ready` | Inter-operator routing capabilities | `suites/infrastructure/federation.json` |

---

## Example Manifests

### Level 1 — Payment Operator

```json
{
  "operator_id": "op_yourcompany_001",
  "version": "1.0.0",
  "certification_level": 1,
  "capabilities": [
    "wallet.consumer",
    "wallet.merchant",
    "qr.static",
    "p2p.transfer"
  ],
  "invariants_asserted": [
    "INV-LEDGER-001",
    "INV-LEDGER-002",
    "INV-LEDGER-003",
    "INV-LEDGER-004",
    "INV-WALLET-001",
    "INV-STL-001",
    "INV-STL-002",
    "INV-TRACE-001"
  ],
  "environment": "LIVE",
  "sandbox_available": true,
  "contact": {
    "technical": "tech@yourcompany.ao",
    "operations": "ops@yourcompany.ao"
  },
  "endpoints": {
    "sandbox": "https://sandbox-api.yourcompany.ao",
    "live":    "https://api.yourcompany.ao"
  }
}
```

### Level 2 — Settlement Operator

```json
{
  "operator_id": "op_yourcompany_001",
  "version": "1.1.0",
  "certification_level": 2,
  "capabilities": [
    "wallet.consumer",
    "wallet.merchant",
    "qr.static",
    "qr.dynamic",
    "p2p.transfer",
    "payment_links",
    "settlement.t0"
  ],
  "invariants_asserted": [
    "INV-LEDGER-001",
    "INV-LEDGER-002",
    "INV-LEDGER-003",
    "INV-LEDGER-004",
    "INV-WALLET-001",
    "INV-STL-001",
    "INV-STL-002",
    "INV-QR-001",
    "INV-TRACE-001"
  ],
  "environment": "LIVE",
  "sandbox_available": true
}
```

---

## Guided Creation Flow

The Operator Builder module in BanzamIA walks you through manifest creation step by step:

1. **Identity** — enter your `operator_id` and organisation name
2. **Target level** — select certification level 0–4
3. **Capabilities** — select capabilities (builder enforces level requirements)
4. **Invariants** — builder auto-populates required invariants for selected capabilities
5. **Endpoints** — sandbox and live API endpoints
6. **Contacts** — technical and operations contact emails
7. **Review** — BanzamIA Manifest Validator runs automatically
8. **Download** — download the validated manifest JSON

---

## Manifest Validation

After creating your manifest, use the [Manifest Validator](manifest-validator.md) to check:

- All fields are present and correctly typed
- Capabilities are consistent with the declared certification level
- All required invariants for declared capabilities are asserted
- `operator_id` format is valid (`op_<slug>_<number>`)
- Version follows semver

---

## Next Steps

After creating a valid manifest:

1. Implement the capabilities declared in your manifest
2. Run the [Conformance Suite](../conformance.md) for your target level
3. Use the BanzamIA [Conformance module](../banzamia/overview.md) to verify results
4. Submit for [Certification](../certification.md)

---

## References

- `docs/certification.md` — full certification process
- `docs/conformance.md` — conformance suite reference
- [Manifest Validator](manifest-validator.md) — validation reference
- `docs/validation/INVARIANT_TAXONOMY.md` — full invariant registry
