# BanzAI — Manifest Validator

**Version:** 1.0  
**Date:** 2026-05-28  
**Status:** Active

---

## Overview

The Manifest Validator checks an Operator Manifest for structural correctness and semantic consistency before it enters the certification process.

Validation is split into two layers:

| Layer | What it checks |
|-------|---------------|
| **Structural** | Schema correctness — required fields, types, formats |
| **Semantic** | Protocol consistency — capabilities match level, invariants are complete |

---

## Validation Rules

### Structural Rules

| Rule | Description |
|------|-------------|
| `operator_id` must match `op_[a-z0-9_]+_[0-9]+` | Stable identifier format |
| `version` must be valid semver | `MAJOR.MINOR.PATCH` |
| `certification_level` must be 0–4 | Integer, one of the defined levels |
| `capabilities` must be a non-empty array of known identifiers | See capability registry |
| `invariants_asserted` must be a non-empty array | Must reference valid invariant IDs |
| `environment` must be `"LIVE"` or `"SANDBOX"` | Case-sensitive |
| `sandbox_available` must be boolean | Required |

### Semantic Rules

**Level–capability consistency:**

| Certification Level | Minimum required capabilities |
|--------------------|-------------------------------|
| 0 | None (sandbox only) |
| 1 | `wallet.consumer`, `wallet.merchant`, `qr.static`, `p2p.transfer` |
| 2 | Level 1 + `qr.dynamic`, `payment_links`, `settlement.t0` |
| 3 | Level 2 + `payout.batch`, `reconciliation` |
| 4 | Level 3 + `acquiring.emis`, `federation_ready` |

**Invariant completeness:**

For each declared capability, a minimum set of invariants must be asserted:

| Capability | Required invariants |
|------------|---------------------|
| `wallet.consumer` | `INV-LEDGER-001`, `INV-WALLET-001`, `INV-IDENT-001` |
| `wallet.merchant` | `INV-LEDGER-001`, `INV-WALLET-001` |
| `qr.static` | `INV-QR-001`, `INV-STL-001`, `INV-TRACE-001` |
| `qr.dynamic` | `INV-QR-001`, `INV-QR-002`, `INV-STL-001`, `INV-TRACE-001` |
| `p2p.transfer` | `INV-LEDGER-001`, `INV-STL-001`, `INV-STL-002` |
| `payment_links` | `INV-STL-001`, `INV-TRACE-001` |
| `settlement.t0` | `INV-STL-001`, `INV-STL-002` |
| `payout.batch` | `INV-LEDGER-001`, `INV-STL-001` |
| `reconciliation` | `INV-LEDGER-001`, `INV-LEDGER-002` |

---

## Validation Output

A passing validation:

```json
{
  "status": "PASS",
  "operator_id": "op_yourcompany_001",
  "certification_level": 2,
  "capabilities_count": 7,
  "invariants_count": 9,
  "issues": []
}
```

A failing validation:

```json
{
  "status": "FAIL",
  "operator_id": "op_yourcompany_001",
  "certification_level": 2,
  "issues": [
    {
      "code": "MISSING_CAPABILITY",
      "message": "Level 2 requires 'settlement.t0' but it is not declared",
      "field": "capabilities"
    },
    {
      "code": "MISSING_INVARIANT",
      "message": "Capability 'qr.dynamic' requires INV-QR-002 but it is not asserted",
      "field": "invariants_asserted"
    }
  ]
}
```

### Issue codes

| Code | Description |
|------|-------------|
| `MISSING_CAPABILITY` | Required capability for declared level is absent |
| `UNKNOWN_CAPABILITY` | Declared capability is not in the capability registry |
| `MISSING_INVARIANT` | Required invariant for declared capability is not asserted |
| `UNKNOWN_INVARIANT` | Declared invariant is not in the invariant registry |
| `INVALID_OPERATOR_ID` | `operator_id` does not match required format |
| `INVALID_SEMVER` | `version` is not valid semver |
| `INVALID_LEVEL` | `certification_level` is not 0–4 |
| `INVALID_ENVIRONMENT` | `environment` is not `"LIVE"` or `"SANDBOX"` |
| `LEVEL_CAPABILITY_MISMATCH` | Capabilities are insufficient for the declared level |

---

## Using the Validator

### Via BanzAI UI

Navigate to **BanzAI → Manifest Validator**. Paste your manifest JSON. Click Validate. Results appear in real time.

### Via BanzAI Chat

```
> Valida este manifesto:
{
  "operator_id": "op_example_001",
  "certification_level": 1,
  ...
}
```

BanzAI will run validation and explain each issue in plain language.

### Via API (planned)

```http
POST /validate/manifest
Content-Type: application/json

{ ...manifest JSON... }
```

Response: validation result with issues array.

---

## Common Issues and Fixes

**"Level 2 requires 'settlement.t0' but it is not declared"**

Add `"settlement.t0"` to your `capabilities` array, or lower your `certification_level` to 1.

**"Capability 'qr.dynamic' requires INV-QR-002 but it is not asserted"**

Add `"INV-QR-002"` to your `invariants_asserted` array. Ensure your implementation actually upholds this invariant before asserting it.

**"operator_id does not match required format"**

Format must be `op_<slug>_<number>`. Examples: `op_banza_001`, `op_mycompany_main_001`.

---

## References

- [Operator Builder](operator-builder.md) — create a manifest step by step
- `docs/certification.md` — certification process
- `docs/validation/INVARIANT_TAXONOMY.md` — invariant registry
