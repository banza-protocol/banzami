# Banzami Invariant Taxonomy

Official invariant registry for all validation items. Every invariant in
`BANZAMI_IMPLEMENTATION_MATRIX.json` must reference an entry in this taxonomy.

**Version:** 1.0  
**Status:** Active  
**Governance:** Append-only. New invariants added via pull request; existing invariants never modified.

---

## Structure

Each invariant has:

| Field | Type | Description |
|-------|------|-------------|
| `id` | `INV-<DOMAIN>-<NNN>` | Stable identifier — never reused |
| `name` | string | Human-readable name |
| `domain` | string | Invariant family |
| `description` | string | What this invariant asserts |
| `rule` | string | Formal assertion (can be code-style) |
| `severity` | `CRITICAL` \| `HIGH` \| `MEDIUM` | Impact if violated |
| `appliesToCategories` | string[] | Category IDs where this invariant applies |
| `validationMethod` | string | How to verify this invariant |

---

## INV-LEDGER — Ledger Invariants

Invariants over the double-entry ledger engine. Violations here represent financial data corruption.

### INV-LEDGER-001

| Field | Value |
|-------|-------|
| **id** | `INV-LEDGER-001` |
| **name** | Double-entry balance |
| **domain** | Ledger |
| **description** | Every ledger posting must be balanced: the sum of all debit entries equals the sum of all credit entries |
| **rule** | `∀ posting: sum(debit entries) == sum(credit entries)` |
| **severity** | `CRITICAL` |
| **appliesToCategories** | `cat-ledger`, `cat-wallet`, `cat-p2p`, `cat-payouts`, `cat-refunds` |
| **validationMethod** | Automated: `banzami-reconciliation::run_balance_checker` + integration tests |

### INV-LEDGER-002

| Field | Value |
|-------|-------|
| **id** | `INV-LEDGER-002` |
| **name** | Immutable entries |
| **domain** | Ledger |
| **description** | Ledger entries are append-only. No UPDATE or DELETE on `ledger_entries` or `ledger_postings` |
| **rule** | `∀ entry: once_written → never_modified` |
| **severity** | `CRITICAL` |
| **appliesToCategories** | `cat-ledger` |
| **validationMethod** | Schema-level: no UPDATE triggers; code review: no ORM update calls on ledger tables |

### INV-LEDGER-003

| Field | Value |
|-------|-------|
| **id** | `INV-LEDGER-003` |
| **name** | No floating-point money |
| **domain** | Ledger |
| **description** | All monetary amounts are stored and computed as integer minor units (i64). Floating-point arithmetic is forbidden in financial calculations |
| **rule** | `∀ amount: type == i64 (minor units), never f32 or f64` |
| **severity** | `CRITICAL` |
| **appliesToCategories** | `cat-ledger`, `cat-wallet`, `cat-p2p`, `cat-qr`, `cat-payouts`, `cat-refunds` |
| **validationMethod** | Static analysis: Rust type system enforces `Money` struct with i64 field |

### INV-LEDGER-004

| Field | Value |
|-------|-------|
| **id** | `INV-LEDGER-004` |
| **name** | Atomic posting |
| **domain** | Ledger |
| **description** | All entries in a posting are written atomically. Partial postings must never persist |
| **rule** | `∀ posting: all entries committed atomically or none` |
| **severity** | `CRITICAL` |
| **appliesToCategories** | `cat-ledger`, `cat-wallet`, `cat-p2p`, `cat-payouts`, `cat-refunds` |
| **validationMethod** | PostgreSQL transaction wrapping all ledger writes; integration test verifies rollback on failure |

---

## INV-WALLET — Wallet Invariants

Invariants over wallet balance state. Violations mean merchants or consumers see incorrect balances.

### INV-WALLET-001

| Field | Value |
|-------|-------|
| **id** | `INV-WALLET-001` |
| **name** | No negative available balance |
| **domain** | Wallet |
| **description** | Available balance must never go below zero. Debits must be rejected if insufficient funds |
| **rule** | `∀ wallet: available_balance >= 0` |
| **severity** | `CRITICAL` |
| **appliesToCategories** | `cat-wallet`, `cat-p2p`, `cat-qr` |
| **validationMethod** | `SELECT FOR UPDATE` before debit; `banzami-reconciliation::run_balance_checker` |

### INV-WALLET-002

| Field | Value |
|-------|-------|
| **id** | `INV-WALLET-002` |
| **name** | Balance derived from ledger |
| **domain** | Wallet |
| **description** | Wallet balances are derived from ledger entries, not stored as independent counters. Available = sum(ledger credits) - sum(ledger debits) |
| **rule** | `wallet.available == sum(ledger_entries where account == wallet.ledger_account)` |
| **severity** | `HIGH` |
| **appliesToCategories** | `cat-wallet`, `cat-ledger` |
| **validationMethod** | Periodic reconciliation check: compare computed vs. reported balance |

### INV-WALLET-003

| Field | Value |
|-------|-------|
| **id** | `INV-WALLET-003` |
| **name** | Reserve/release symmetry |
| **domain** | Wallet |
| **description** | Every `reserve` operation must be paired with exactly one `release` or `settle` |
| **rule** | `∀ reserve_event: ∃ exactly one {release | settle} event` |
| **severity** | `HIGH` |
| **appliesToCategories** | `cat-wallet`, `cat-p2p` |
| **validationMethod** | Integration tests on transaction lifecycle; state machine enforcement |

---

## INV-SETTLEMENT — Settlement Invariants

Invariants over settlement batch processing.

### INV-SETTLE-001

| Field | Value |
|-------|-------|
| **id** | `INV-SETTLE-001` |
| **name** | Settlement amount identity |
| **domain** | Settlement |
| **description** | `gross_amount - fee_amount == net_amount` for every settlement batch |
| **rule** | `settlement.net_amount == settlement.gross_amount - settlement.fee_amount` |
| **severity** | `HIGH` |
| **appliesToCategories** | `cat-payouts` |
| **validationMethod** | Application-level validation before insert; integration tests |

### INV-SETTLE-002

| Field | Value |
|-------|-------|
| **id** | `INV-SETTLE-002` |
| **name** | Settlement ledger correctness |
| **domain** | Settlement |
| **description** | On confirmation, ledger posts `DR bank_account / CR transit_account` for exactly `net_amount` |
| **rule** | `on SETTLED: ledger DR bank_account net_amount, CR transit_account net_amount` |
| **severity** | `CRITICAL` |
| **appliesToCategories** | `cat-payouts`, `cat-ledger` |
| **validationMethod** | Integration test: confirm settlement → verify ledger entries |

---

## INV-IDEMPOTENCY — Idempotency Invariants

Invariants ensuring safe retries across all financial operations.

### INV-IDEM-001

| Field | Value |
|-------|-------|
| **id** | `INV-IDEM-001` |
| **name** | Replay safety |
| **domain** | Idempotency |
| **description** | For any idempotency key, the same request replayed N times produces the same result as executing it once. No side effect is duplicated |
| **rule** | `∀ key k: execute(k) ≡ execute(k)×N` |
| **severity** | `CRITICAL` |
| **appliesToCategories** | `cat-ledger`, `cat-wallet`, `cat-p2p`, `cat-qr`, `cat-payouts`, `cat-refunds` |
| **validationMethod** | Integration tests: duplicate request with same key → verify identical response and single DB row |

### INV-IDEM-002

| Field | Value |
|-------|-------|
| **id** | `INV-IDEM-002` |
| **name** | Idempotency key scope |
| **domain** | Idempotency |
| **description** | Idempotency keys are scoped per merchant. Keys from different merchants with the same value must not conflict |
| **rule** | `idempotency_key.scope == merchant_id` |
| **severity** | `HIGH` |
| **appliesToCategories** | `cat-ledger`, `cat-wallet`, `cat-api` |
| **validationMethod** | Integration tests: same key, different merchants → independent results |

---

## INV-RECON — Reconciliation Invariants

Invariants over the reconciliation engine.

### INV-RECON-001

| Field | Value |
|-------|-------|
| **id** | `INV-RECON-001` |
| **name** | Transfer-posting linkage |
| **domain** | Reconciliation |
| **description** | Every COMPLETED transfer must reference a valid ledger posting |
| **rule** | `∀ transfer where status == COMPLETED: transfer.ledger_posting_id IS NOT NULL` |
| **severity** | `HIGH` |
| **appliesToCategories** | `cat-p2p`, `cat-ledger` |
| **validationMethod** | `banzami-reconciliation::run_balance_checker` (checks transfer-posting linkage on every run) |

### INV-RECON-002

| Field | Value |
|-------|-------|
| **id** | `INV-RECON-002` |
| **name** | External statement reconcilability |
| **domain** | Reconciliation |
| **description** | All SETTLED settlement records must be reconcilable against an external bank statement within the settlement period |
| **rule** | `∀ settlement where status == SETTLED: ∃ external_line with matching (amount, currency)` |
| **severity** | `HIGH` |
| **appliesToCategories** | `cat-payouts`, `cat-ledger` |
| **validationMethod** | `POST /admin/v1/reconciliation/run` with test statement data |

---

## INV-QR — QR Invariants

Invariants over QR payment code generation and resolution.

### INV-QR-001

| Field | Value |
|-------|-------|
| **id** | `INV-QR-001` |
| **name** | QR resolves uniquely |
| **domain** | QR |
| **description** | A QR payload must resolve to exactly one payment target (merchant wallet). Ambiguous or conflicting resolutions are rejected |
| **rule** | `∀ qr_code: resolve(qr_code) → exactly one {merchant_wallet}` |
| **severity** | `CRITICAL` |
| **appliesToCategories** | `cat-qr` |
| **validationMethod** | Integration tests: generate QR → resolve → verify single merchant match |

### INV-QR-002

| Field | Value |
|-------|-------|
| **id** | `INV-QR-002` |
| **name** | Dynamic QR single-use |
| **domain** | QR |
| **description** | A dynamic QR code can be paid at most once. Second payment attempt returns 409 Conflict |
| **rule** | `∀ dynamic_qr: count(payments) <= 1` |
| **severity** | `HIGH` |
| **appliesToCategories** | `cat-qr` |
| **validationMethod** | Integration test: pay dynamic QR twice → second returns 409 |

### INV-QR-003

| Field | Value |
|-------|-------|
| **id** | `INV-QR-003` |
| **name** | QR expiry enforced |
| **domain** | QR |
| **description** | Expired dynamic QR codes are rejected. The background expiry worker runs on the configured interval |
| **rule** | `∀ dynamic_qr where now() > expires_at: status == EXPIRED, payment rejected` |
| **severity** | `HIGH` |
| **appliesToCategories** | `cat-qr` |
| **validationMethod** | Integration test: create QR with short TTL → wait → attempt payment → expect 410 |

---

## INV-KYC — KYC/KYB Invariants

Invariants over identity and compliance gates.

### INV-KYC-001

| Field | Value |
|-------|-------|
| **id** | `INV-KYC-001` |
| **name** | Compliance gate enforced |
| **domain** | KYC/KYB |
| **description** | No transaction may be processed for a merchant unless `can_operate() == true` (KYB Approved + no AML block) |
| **rule** | `∀ transaction: merchant.compliance.can_operate() == true` |
| **severity** | `CRITICAL` |
| **appliesToCategories** | `cat-kyc`, `cat-ledger` |
| **validationMethod** | Integration test: attempt transaction with PENDING/SUSPENDED merchant → expect 403 |

### INV-KYC-002

| Field | Value |
|-------|-------|
| **id** | `INV-KYC-002` |
| **name** | KYC limits enforced |
| **domain** | KYC/KYB |
| **description** | Per-transaction and daily volume limits are enforced based on KYC level |
| **rule** | `∀ transaction: amount <= kyc_level.max_single AND daily_total <= kyc_level.max_daily` |
| **severity** | `HIGH` |
| **appliesToCategories** | `cat-kyc` |
| **validationMethod** | Integration tests per KYC level: amounts at and above threshold |

---

## INV-WEBHOOK — Webhook Invariants

Invariants over webhook delivery and verification.

### INV-WEBHOOK-001

| Field | Value |
|-------|-------|
| **id** | `INV-WEBHOOK-001` |
| **name** | Signature validity |
| **domain** | Webhook |
| **description** | Every outbound webhook payload includes a valid HMAC-SHA256 signature in the `banza-signature` header. Recipients must verify this signature |
| **rule** | `∀ webhook: HMAC-SHA256(payload, secret) == banza-signature header` |
| **severity** | `CRITICAL` |
| **appliesToCategories** | `cat-webhooks` |
| **validationMethod** | Integration test: receive webhook → verify signature with known secret → tampered payload fails |

### INV-WEBHOOK-002

| Field | Value |
|-------|-------|
| **id** | `INV-WEBHOOK-002` |
| **name** | Delivery retry idempotency |
| **domain** | Webhook |
| **description** | Webhook events are delivered at-least-once with exponential backoff. Retries carry the same event ID; receivers must deduplicate |
| **rule** | `∀ event: delivery_attempts use same event_id; receiver deduplication is receiver's responsibility` |
| **severity** | `HIGH` |
| **appliesToCategories** | `cat-webhooks` |
| **validationMethod** | Integration test: simulate webhook failure → verify retry with same event ID |

### INV-WEBHOOK-003

| Field | Value |
|-------|-------|
| **id** | `INV-WEBHOOK-003` |
| **name** | Environment isolation |
| **domain** | Webhook |
| **description** | Sandbox webhooks are delivered only to sandbox endpoint registrations. Live webhooks are delivered only to live endpoints |
| **rule** | `∀ event: event.environment == endpoint.environment` |
| **severity** | `HIGH` |
| **appliesToCategories** | `cat-webhooks`, `cat-sandbox` |
| **validationMethod** | Integration test: sandbox event → verify not delivered to live endpoint |

---

## INV-SEC — Security Invariants

Invariants over authentication, authorization, and data protection.

### INV-SEC-001

| Field | Value |
|-------|-------|
| **id** | `INV-SEC-001` |
| **name** | Secret keys never stored plaintext |
| **domain** | Security |
| **description** | API secret keys are stored only as SHA-256 hashes in PostgreSQL. The plaintext is returned once at creation and never persisted |
| **rule** | `∀ api_key: stored_value == SHA256(plaintext), plaintext not in DB` |
| **severity** | `CRITICAL` |
| **appliesToCategories** | `cat-security`, `cat-api` |
| **validationMethod** | Code review + integration test: create key → verify DB stores hash, not plaintext |

### INV-SEC-002

| Field | Value |
|-------|-------|
| **id** | `INV-SEC-002` |
| **name** | Environment key isolation |
| **domain** | Security |
| **description** | `bz_test_` keys are rejected by live routes; `bz_live_` keys are rejected by sandbox routes. Cross-environment authentication is impossible |
| **rule** | `bz_test_ ∉ live-gateway; bz_live_ ∉ sandbox-gateway` |
| **severity** | `CRITICAL` |
| **appliesToCategories** | `cat-security`, `cat-sandbox` |
| **validationMethod** | Integration test: cross-environment key → expect 403 |

### INV-SEC-003

| Field | Value |
|-------|-------|
| **id** | `INV-SEC-003` |
| **name** | PIN stored hashed |
| **domain** | Security |
| **description** | Consumer PINs are stored as bcrypt hashes. Plaintext PINs are never written to any persistent store |
| **rule** | `consumer.pin_hash == bcrypt(pin, cost >= 10), plaintext not stored` |
| **severity** | `CRITICAL` |
| **appliesToCategories** | `cat-security`, `cat-identity` |
| **validationMethod** | Code review: verify bcrypt usage; integration test: register → check DB column |

### INV-SEC-004

| Field | Value |
|-------|-------|
| **id** | `INV-SEC-004` |
| **name** | Go never writes financial tables |
| **domain** | Security |
| **description** | Go services (api-gateway, admin-api, public-api) must never write directly to financial tables. All financial writes go through the Rust core-api |
| **rule** | `∀ financial_table_write: origin == rust_core_api` |
| **severity** | `CRITICAL` |
| **appliesToCategories** | `cat-security`, `cat-arch` |
| **validationMethod** | Architecture review: Go services have no DB credentials for financial tables; only core-api has write access |

### INV-SEC-005

| Field | Value |
|-------|-------|
| **id** | `INV-SEC-005` |
| **name** | Admin routes not internet-exposed |
| **domain** | Security |
| **description** | Admin API routes are reachable only from the internal Docker network. nginx does not proxy any `/admin/` path to the public internet |
| **rule** | `admin-api:8082 not in nginx public_upstream` |
| **severity** | `CRITICAL` |
| **appliesToCategories** | `cat-security` |
| **validationMethod** | nginx config review; integration test from external IP → connection refused |

### INV-WALLET-004

| Field | Value |
|-------|-------|
| **id** | `INV-WALLET-004` |
| **name** | Wallet-owner uniqueness |
| **domain** | Wallet |
| **description** | Each consumer has at most one non-CLOSED wallet per currency. No consumer may hold two active wallets in the same currency simultaneously |
| **rule** | `∀ consumer, currency: count(wallets where status != 'CLOSED') <= 1` |
| **severity** | `HIGH` |
| **appliesToCategories** | `cat-wallet` |
| **validationMethod** | DB constraint: unique partial index on (consumer_id, currency) WHERE status NOT IN ('CLOSED'); integration test: attempt duplicate wallet creation → expect 409 |

### INV-WALLET-005

| Field | Value |
|-------|-------|
| **id** | `INV-WALLET-005` |
| **name** | Currency immutability |
| **domain** | Wallet |
| **description** | A wallet's currency is set once at creation and never changes for the lifetime of the wallet |
| **rule** | `∀ wallet: wallet.currency at t=1 == wallet.currency at t=N` |
| **severity** | `HIGH` |
| **appliesToCategories** | `cat-wallet` |
| **validationMethod** | DB check constraint: `CHECK (currency = 'AOA')` for v1; application code rejects currency change requests; integration test: attempt currency update → expect 422 |

### INV-WALLET-006

| Field | Value |
|-------|-------|
| **id** | `INV-WALLET-006` |
| **name** | Lifecycle state machine |
| **domain** | Wallet |
| **description** | Wallet status transitions must follow the defined state machine. Illegal transitions (e.g., CLOSED → ACTIVE, LOCKED → PENDING_OTP) are rejected by the engine |
| **rule** | `∀ transition (from, to): (from, to) ∈ ALLOWED_TRANSITIONS` |
| **severity** | `CRITICAL` |
| **appliesToCategories** | `cat-wallet` |
| **validationMethod** | Unit tests covering every allowed and every illegal transition; engine returns `InvalidStatusTransition` for illegal paths |

---

## Invariant Status Values

| Status | Meaning |
|--------|---------|
| `PASS` | Invariant verified — implementation confirmed to satisfy the rule |
| `FAIL` | Invariant violated — implementation does not satisfy the rule, or a test failed |
| `UNKNOWN` | Cannot determine from available evidence |
| `NOT_RUN` | Verification not yet executed |

**Governance rule:** For financially critical items (`cat-ledger`, `cat-wallet`, `cat-p2p`, `cat-qr`, `cat-payouts`, `cat-refunds`), ALL invariants must be `PASS` before `VALIDATED` may be proposed.

---

## Adding New Invariants

1. Assign the next sequential ID in the appropriate family.
2. Add the entry to this file.
3. Reference the ID in the matrix item's `invariants[]` array.
4. Set initial status to `NOT_RUN`.
5. Submit via pull request — invariant taxonomy changes require review.

Invariant IDs are permanent. If an invariant becomes obsolete, mark it as `DEPRECATED` in this file — do not delete or reuse the ID.
