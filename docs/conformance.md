# Banza Conformance Suite

**Version:** 1.0  
**Date:** 2026-05-28  
**Status:** Active

---

## Overview

The Banza Conformance Suite is the machine-executable specification that defines what "protocol compliant" means. It is the source of truth for certification.

An operator is conformant if and only if it passes all conformance tests for its declared certification level. AI inference is not a substitute for passing the suite.

> **Conformance is binary. Either all tests pass, or the operator is not conformant at that level.**

---

## Suite Structure

```
conformance/
  suites/
    core-payments/               # Level 1
      ledger.json                # Double-entry correctness
      wallet-consumer.json       # Consumer wallet lifecycle
      wallet-merchant.json       # Merchant wallet lifecycle
      qr-static.json             # Static QR payment flow
      p2p-transfer.json          # @handle P2P transfer
    advanced-payments/           # Level 2 (includes Level 1)
      qr-dynamic.json            # Dynamic QR with amount
      payment-links.json         # Pull payment URLs
      settlement-t0.json         # Instant settlement verification
    full-protocol/               # Level 3 (includes Levels 1–2)
      payout-batch.json          # Batch payout lifecycle
      reconciliation.json        # Ledger reconciliation
    infrastructure/              # Level 4 (includes Levels 1–3)
      acquiring.json             # EMIS acquiring flow
      federation.json            # Inter-operator routing
```

---

## Test Structure

Each conformance test file is a JSON document with this structure:

```json
{
  "suite": "core-payments/qr-static",
  "version": "1.0.0",
  "certification_level": 1,
  "tests": [
    {
      "id": "QR-STATIC-001",
      "name": "Static QR payment — happy path",
      "preconditions": {
        "consumer_wallet_balance_minor": 100000,
        "merchant_wallet_balance_minor": 0
      },
      "operation": {
        "type": "qr_payment",
        "qr_type": "static",
        "amount_minor": 5000,
        "currency": "AOA"
      },
      "expected_outcomes": {
        "consumer_balance_change": -5000,
        "merchant_balance_change": "+net_amount",
        "fee_wallet_change": "+fee_amount",
        "qr_status": "PAID",
        "transfer_status": "COMPLETED"
      },
      "invariants_verified": [
        "INV-LEDGER-001",
        "INV-STL-001",
        "INV-STL-002",
        "INV-QR-001",
        "INV-TRACE-001"
      ],
      "ledger_assertions": [
        { "direction": "DEBIT",  "wallet": "consumer", "amount": "gross_minor" },
        { "direction": "CREDIT", "wallet": "merchant", "amount": "net_minor" },
        { "direction": "CREDIT", "wallet": "fee",      "amount": "fee_minor" }
      ]
    }
  ]
}
```

### Test fields

| Field | Description |
|-------|-------------|
| `id` | Stable test identifier — never reused |
| `preconditions` | Required state before the test runs |
| `operation` | The protocol operation being tested |
| `expected_outcomes` | Observable results that must be true after the operation |
| `invariants_verified` | Invariants checked after execution |
| `ledger_assertions` | Exact ledger entries that must exist |

---

## Certification Level Requirements

### Level 1 — Payment Operator

Pass all tests in `core-payments/`:

| Test suite | Tests | Key invariants |
|------------|-------|----------------|
| `ledger.json` | 4 | INV-LEDGER-001..004 |
| `wallet-consumer.json` | 6 | INV-WALLET-001, INV-IDENT-001 |
| `wallet-merchant.json` | 4 | INV-WALLET-001 |
| `qr-static.json` | 8 | INV-QR-001, INV-STL-001, INV-STL-002 |
| `p2p-transfer.json` | 6 | INV-LEDGER-001, INV-STL-001, INV-TRACE-001 |

**Minimum passing threshold:** 100% of all Level 1 tests.

### Level 2 — Settlement Operator

Pass all Level 1 tests PLUS all tests in `advanced-payments/`:

| Test suite | Tests | Key invariants |
|------------|-------|----------------|
| `qr-dynamic.json` | 10 | INV-QR-001, INV-QR-002, INV-STL-001 |
| `payment-links.json` | 8 | INV-STL-001, INV-TRACE-001 |
| `settlement-t0.json` | 6 | INV-STL-001, INV-STL-002 |

### Level 3 — Federation Operator

Pass all Level 1–2 tests PLUS all tests in `full-protocol/`:

| Test suite | Tests | Key invariants |
|------------|-------|----------------|
| `payout-batch.json` | 8 | INV-LEDGER-001, INV-STL-001 |
| `reconciliation.json` | 6 | INV-LEDGER-001, INV-LEDGER-002 |

### Level 4 — Infrastructure Operator

Pass all Level 1–3 tests PLUS all tests in `infrastructure/`:

| Test suite | Tests | Key invariants |
|------------|-------|----------------|
| `acquiring.json` | 12 | INV-LEDGER-001, INV-STL-001 |
| `federation.json` | 10 | INV-TRACE-001, cross-operator INVs |

---

## Invariant Verification in Tests

Conformance tests do not just check API responses. They verify financial invariants against actual ledger state:

1. **Pre-execution** — record all balances and ledger entry counts
2. **Execute** — perform the operation
3. **Post-execution verification:**
   - Fetch all ledger entries created in this operation
   - Verify `SUM(debits) == SUM(credits)` (INV-LEDGER-001)
   - Verify `gross == net + fee` where applicable (INV-STL-001)
   - Verify no balance went negative (INV-STL-002)
   - Verify all entries share the same `trace_id` (INV-TRACE-001)
   - Verify no entry was modified (INV-LEDGER-002)

An invariant failure causes the test to fail regardless of the API response code.

---

## Running the Suite

### Against a sandbox environment

```bash
# Run Level 1 suite against your sandbox
banzami-conformance run \
  --suite core-payments \
  --api-key bz_test_... \
  --base-url https://sandbox-api.youroperator.ao

# Run full suite for Level 3 certification
banzami-conformance run \
  --level 3 \
  --api-key bz_test_... \
  --base-url https://sandbox-api.youroperator.ao
```

### Output format

```
Banzami Conformance Suite v1.0
Suite: core-payments (Level 1)
Operator: op_yourcompany_001

  PASS  QR-STATIC-001 — Static QR payment (happy path)
  PASS  QR-STATIC-002 — Static QR payment (insufficient funds)
  PASS  QR-STATIC-003 — Static QR expiry enforcement
  FAIL  QR-STATIC-004 — Duplicate QR payment prevention

FAIL: INV-LEDGER-001 violation in QR-STATIC-004
  Expected: sum(debits) == sum(credits)
  Actual:   debit=5000 credit=4850 (missing fee entry)

Result: 27/28 tests passed. NOT CONFORMANT at Level 1.
```

### Via BanzAI

Navigate to **BanzAI → Conformance**. Select your certification level. The module guides you through setup and displays results with invariant-level explanations.

---

## Universal Conformance Rules

The following rules are tested at **all certification levels** (0–4), independent of the level-specific suites.

### CONFORMANCE-MON-001 — Monetary Integer Representation

**Applies to:** All levels (0–4)  
**Severity:** CRITICAL — failure blocks certification at any level

This rule verifies that the operator implements the monetary representation specification from `BANZAMI_REFERENCE.md §5`.

| Check | Method | Expected |
|-------|--------|----------|
| Monetary fields use `*_minor` naming convention | API schema inspection | PASS |
| Field values are JSON integers (not floats) | Payload inspection on all monetary endpoints | PASS |
| Float payloads are rejected with a 4xx response | Submit `{"amount": 10.50}` to any monetary endpoint | HTTP 422 |
| Settlement invariant holds | Verify `gross_minor = net_minor + fee_minor` on each payment | PASS |
| Wallet invariant holds | Verify `balance_minor = available_minor + reserved_minor` after each operation | PASS |

**Test file example:**

```json
{
  "suite": "universal/monetary-representation",
  "version": "1.0.0",
  "certification_level": 0,
  "tests": [
    {
      "id": "CONFORMANCE-MON-001-field-naming",
      "name": "Monetary fields use *_minor convention",
      "operation": { "type": "wallet_query", "wallet": "consumer" },
      "expected_outcomes": {
        "response_fields_monetary": ["balance_minor", "available_minor", "reserved_minor"],
        "no_float_fields": true
      },
      "invariants_verified": ["INV-LEDGER-003", "MON-001"]
    },
    {
      "id": "CONFORMANCE-MON-001-float-rejection",
      "name": "Operator rejects floating-point monetary values",
      "operation": {
        "type": "raw_request",
        "method": "POST",
        "path": "/v1/qr/dynamic",
        "body": { "amount": 10.50, "currency": "AOA" }
      },
      "expected_outcomes": { "status": "4xx" },
      "invariants_verified": ["MON-001"]
    },
    {
      "id": "CONFORMANCE-MON-001-settlement-invariant",
      "name": "Settlement invariant: gross = net + fee",
      "operation": { "type": "qr_payment", "amount_minor": 5000, "currency": "AOA" },
      "expected_outcomes": {
        "gross_minor_eq_net_plus_fee": true
      },
      "invariants_verified": ["INV-STL-001", "MON-001"]
    }
  ]
}
```

---

## Idempotency Testing

Every mutating operation is tested for idempotency:
- Submit the same operation twice with the same `idempotency_key`
- Verify only one ledger posting exists
- Verify the second response matches the first exactly

Idempotency failures are blocking for all certification levels.

---

## Common Failure Patterns

### "INV-LEDGER-001: debit sum ≠ credit sum"

The most common Level 1 failure. Usually caused by:
- Missing fee entry in the ledger posting
- Incorrect fee calculation rounding
- Partial rollback leaving unbalanced entries

Fix: verify all ledger entries in the posting are created atomically, including the fee credit.

### "INV-STL-001: gross ≠ net + fee"

Fee decomposition error. The declared gross amount does not equal the sum of net and fee amounts.

Fix: verify fee calculation logic. Ensure `gross_minor = net_minor + fee_minor` is enforced before creating the transfer record.

### "INV-TRACE-001: missing trace_id on ledger entry"

Trace propagation failure. A ledger entry was created without the `trace_id` from the originating request.

Fix: verify trace context is passed from Go gateway through Rust core-api to all ledger entry creation calls.

### "Duplicate payment accepted"

QR was paid twice with the same payload. The system did not enforce QR single-use.

Fix: implement atomic QR state transition: `PENDING → PAID` using a database-level locking mechanism. Reject any payment attempt when status ≠ `PENDING`.

---

## Conformance and BanzAI

BanzAI's Conformance module presents conformance results in natural language:

- Explains what each failing test checks
- Maps failures to specific invariants
- Suggests fixes based on common failure patterns
- Tracks certification readiness across multiple runs

BanzAI does not run conformance tests autonomously — it presents the results of tests that you run.

---

## References

- `docs/certification.md` — certification process
- `docs/reference-operator.md` — reference implementation
- `docs/validation/INVARIANT_TAXONOMY.md` — invariant registry
- `docs/banzamia/manifest-validator.md` — manifest validation before conformance
- ADR-002 — double-entry ledger design
- ADR-006 — QR payment system
