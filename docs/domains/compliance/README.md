# Domain: Compliance

**Crate:** `banzami-compliance`  
**Module:** `core/compliance/`

---

## Business Purpose

Compliance enforces the legal and regulatory obligations of operating a payment platform in Angola. It covers two dimensions:

- **KYB (Know Your Business)** — verifying that a merchant is a legitimate, identifiable business before allowing them to process payments.
- **KYC (Know Your Customer) + AML (Anti-Money Laundering)** — verifying customer identity and monitoring for suspicious transaction patterns.

The compliance domain is a gate: transactions cannot be processed unless both merchant KYB and the relevant KYC checks pass.

---

## Architecture

```
  ComplianceEngine
    │
    ├── get_merchant_compliance(merchant_id)      — get or create compliance record
    ├── approve_merchant(merchant_id)             — KYB + AML → Approved
    ├── reject_merchant(merchant_id, notes)       — KYB → Rejected
    ├── suspend_merchant(merchant_id, notes)      — halt all processing
    ├── flag_merchant_aml(merchant_id, notes)     — AML → UnderReview
    │
    ├── get_customer_compliance(customer_id)      — get or create compliance record
    ├── approve_customer(customer_id, kyc_level)  — set KYC level
    └── check_customer_can_transact(customer_id, amount, daily_volume)
                                                  — validate against KYC limits
```

Records are created with `Pending` status on first access (upsert semantics). An operator must explicitly approve before transactions are allowed.

---

## Merchant Compliance

### KYB Status

```
  Pending ──► Approved ──► Suspended
     │           │
     │           └──► UnderReview  (AML flag)
     │
     └──► Rejected  (terminal)
```

### AML Status

```
  Pending ──► Approved
     │           │
     │           └──► UnderReview ──► Approved
     │                             │
     │                             └──► Suspended
     │
     └──► Rejected  (terminal)
```

### can_process_transactions()

A merchant can process transactions only if **both** KYB and AML status are `Approved`:

```rust
pub fn can_process_transactions(&self) -> bool {
    self.kyb_status.can_operate() && self.aml_status.can_operate()
}
```

`can_operate()` returns `true` only for `ComplianceStatus::Approved`. Every other status — including `Pending` — blocks processing.

---

## Customer KYC

### KYC Levels and Transaction Limits

| Level      | Max single transaction | Max daily volume | Use case                      |
|------------|------------------------|------------------|-------------------------------|
| `NONE`     | 0 (blocked)            | 0 (blocked)      | Unverified — no transactions  |
| `BASIC`    | 50,000 AOA             | 500,000 AOA      | Phone + name verified         |
| `ENHANCED` | 500,000 AOA            | 5,000,000 AOA    | Government ID verified        |
| `FULL`     | Unlimited              | Unlimited        | ID + address + face match     |

These limits are compile-time constants in Rust (`const fn`). They cannot be changed without a code change and deployment — intentional.

### check_customer_can_transact

Three checks, evaluated in order:

1. `KycLevel::None` → always blocked.
2. `amount > kyc_level.max_single_transaction_minor()` → `TransactionLimitExceeded`.
3. `daily_volume + amount > kyc_level.max_daily_volume_minor()` → `DailyLimitExceeded`.

---

## Identity Verification Provider

The compliance **engine** owns the verification *state machine* (levels, statuses,
gating). Establishing an identity — actually checking a consumer's Bilhete de
Identidade or a merchant's NIF — is delegated to a **provider**, mirroring the
acquiring layer. The provider is the seam to an external verification vendor.

```
  submit document ─► KycProvider ─► VerificationOutcome ─► engine persists
   (BI / NIF)        (decides)      (decision + level)      (status + level)
```

### Provider strategy

Selected at boot via the `KYC_PROVIDER` env var:

| Value      | Provider               | Use case                                          |
|------------|------------------------|---------------------------------------------------|
| (default)  | `SimulatedKycProvider` | Development, sandbox — deterministic checks        |
| `EXTERNAL` | `ExternalKycProvider`  | Production (requires `KYC_API_BASE`/`KYC_API_KEY`) |

**Safety guard:** the server refuses to boot if `APP_ENV=production` and
`KYC_PROVIDER` is not `EXTERNAL` — preventing a production deployment that would
approve identities with the simulated provider. The `ExternalKycProvider` is a
stub today: it errors until a verification vendor is wired, so the production
path is explicit rather than silently approving.

### Decisions

A provider returns one of three decisions, which the engine maps onto the
compliance record:

| Decision        | Consumer (KYC)                                | Merchant (KYB)     |
|-----------------|-----------------------------------------------|--------------------|
| `Approved`      | KYC level raised to granted level, `Approved` | KYB + AML → `Approved` |
| `Rejected`      | status `Rejected`, level unchanged            | KYB → `Rejected`   |
| `PendingReview` | status `UnderReview`, level unchanged         | KYB → `UnderReview` |

The simulated provider grants the requested level capped at `Enhanced`: it can
verify a document but cannot establish the proof-of-address + face match that
`Full` requires, so `Full` requests route to manual review. Sandbox callers can
force each branch — a name or document containing `REJECT`/`REVIEW`, or an
all-zero document number, drives the corresponding decision.

### Endpoints (internal core-api)

```
POST /internal/v1/compliance/customers/:id/verify   — run consumer KYC
POST /internal/v1/compliance/merchants/:id/verify    — run merchant KYB
```

`verify` runs the document through the configured provider and persists the
outcome; the existing `approve`/`reject` endpoints remain the manual override
path for a compliance officer.

---

## Compliance Status Values

| Value          | Meaning                                                  |
|----------------|----------------------------------------------------------|
| `PENDING`      | Record created; not yet reviewed by a compliance officer |
| `APPROVED`     | Verified; operations permitted                           |
| `REJECTED`     | Verification failed; terminal                            |
| `UNDER_REVIEW` | Flagged for investigation; operations blocked            |
| `SUSPENDED`    | Manually halted; operations blocked                      |

---

## Invariants

1. Compliance records are created on first access with `Pending` status. They are never absent for a merchant or customer that has been encountered.
2. `REJECTED` is terminal for merchants. Once rejected, a merchant cannot be approved. A new merchant record must be created if re-onboarding is needed.
3. All status transitions are explicit — there is no automatic state change. A compliance officer must call the appropriate endpoint.
4. The `notes` field is required for all negative actions (`reject`, `suspend`, `flag-aml`). This enforces an audit trail for every adverse action.

---

## Failure Scenarios

| Scenario | Behaviour |
|----------|-----------|
| Transaction attempted with PENDING KYB | Blocked — `can_process_transactions()` returns false |
| Transaction attempted with AML under review | Blocked — same gate |
| Customer at KYC NONE attempts transaction | Blocked — `TransactionLimitExceeded` |
| Customer exceeds daily limit | Blocked — `DailyLimitExceeded` |
| Approving an already-approved merchant | `InvalidStatusTransition` error |
| Rejecting an already-rejected merchant | `InvalidStatusTransition` error |

---

## Security Assumptions

- Compliance operations are admin-only. Merchants cannot change their own compliance status.
- The `notes` field for adverse actions is stored and included in audit logs. Operators cannot reject or suspend a merchant without leaving a reason.
- KYC limits are constants in the codebase, not database configuration. This prevents a compliance bypass through a database update without a code review.
