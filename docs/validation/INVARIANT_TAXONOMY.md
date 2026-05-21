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

### INV-WALLET-007

| Field | Value |
|-------|-------|
| **id** | `INV-WALLET-007` |
| **name** | Active wallet has both ledger accounts |
| **domain** | Wallet |
| **description** | Every wallet row in `consumer_wallets` must have non-null `available_account_id` and `reserved_account_id`. Pre-activation state lives in `consumer_onboarding`, not in `consumer_wallets`. |
| **rule** | `∀ wallet in consumer_wallets: available_account_id IS NOT NULL AND reserved_account_id IS NOT NULL` |
| **severity** | `CRITICAL` |
| **appliesToCategories** | `cat-wallet` |
| **validationMethod** | DB NOT NULL constraint on both columns in `consumer_wallets`; application: `activate()` only inserts wallet rows after ledger accounts are provisioned |

### INV-WALLET-008

| Field | Value |
|-------|-------|
| **id** | `INV-WALLET-008` |
| **name** | @banza handle globally unique |
| **domain** | Wallet |
| **description** | No two live consumers may share the same @banza handle. Uniqueness is enforced at the database level, preventing race-condition duplicates |
| **rule** | `∀ handle h: count(consumers where handle == h AND status != 'CLOSED') <= 1` |
| **severity** | `CRITICAL` |
| **appliesToCategories** | `cat-wallet`, `cat-identity` |
| **validationMethod** | `UNIQUE` constraint `consumers_handle_key` on `consumers.handle` (from migration 0010); integration test: concurrent activation with same handle → one succeeds, one gets 23505 unique-violation |

---

## INV-IDENTITY — Handle Identity Invariants

Invariants over the @banza handle registration and resolution system.

### INV-IDENTITY-001

| Field | Value |
|-------|-------|
| **id** | `INV-IDENTITY-001` |
| **name** | Handle globally unique across the network |
| **domain** | Identity |
| **description** | No two consumers — active or not — may hold the same normalized handle. Once registered, a handle is permanently associated with one consumer_id. |
| **rule** | `∀ handle h: count(consumers where handle == normalize(h)) == 1` |
| **severity** | `CRITICAL` |
| **appliesToCategories** | `cat-handle`, `cat-identity` |
| **validationMethod** | `UNIQUE` constraint `consumers_handle_key`; DB-level format CHECK `consumers_handle_format`; concurrent registration test → exactly one succeeds |

### INV-IDENTITY-002

| Field | Value |
|-------|-------|
| **id** | `INV-IDENTITY-002` |
| **name** | Handle format enforced at all layers |
| **domain** | Identity |
| **description** | Handle format rules (3–20 chars, starts with `a-z`, only `a-z0-9_`, no `__`, no trailing `_`) are enforced at application layer (validate_handle) and at DB layer (CHECK constraint), so neither layer can be bypassed alone. |
| **rule** | `validate_handle(h) AND h ~ '^[a-z][a-z0-9_]{2,19}$' AND h !~ '__' AND h !~ '_$'` |
| **severity** | `HIGH` |
| **appliesToCategories** | `cat-handle`, `cat-identity` |
| **validationMethod** | Unit tests on validate_handle; integration test rejects all malformed handles at engine layer; DB constraint rejects malformed handles if bypassed |

### INV-IDENTITY-003

| Field | Value |
|-------|-------|
| **id** | `INV-IDENTITY-003` |
| **name** | Reserved namespace protected |
| **domain** | Identity |
| **description** | Handles in the reserved list (banza, emis, admin, system, etc.) can never be registered by any consumer. |
| **rule** | `∀ h ∈ RESERVED_HANDLES: register(h) → Err(InvalidHandle)` |
| **severity** | `HIGH` |
| **appliesToCategories** | `cat-handle`, `cat-identity` |
| **validationMethod** | Unit test in identity.rs; integration test rejects known reserved handles |

### INV-IDENTITY-004

| Field | Value |
|-------|-------|
| **id** | `INV-IDENTITY-004` |
| **name** | Normalization applied before uniqueness check |
| **domain** | Identity |
| **description** | Handle input is normalized (strip `@`, lowercase, trim) before both validation and uniqueness enforcement, preventing collision via case or prefix variation. |
| **rule** | `normalize("@Carlos") == normalize("carlos") == "carlos"` |
| **severity** | `HIGH` |
| **appliesToCategories** | `cat-handle`, `cat-identity` |
| **validationMethod** | Integration test: register `@Carlos`, then attempt `@CARLOS` → HandleTaken |

### INV-HDL-002-1

| Field | Value |
|-------|-------|
| **id** | `INV-HDL-002-1` |
| **name** | Normalized handle resolves to at most one active wallet |
| **domain** | Identity / Routing |
| **description** | For any normalized handle and currency, there is at most one routable wallet. The UNIQUE constraint on (consumer_id, currency) WHERE NOT CLOSED combined with the UNIQUE constraint on handle ensures this structurally. |
| **rule** | `∀ h, c: count(routable wallets for normalize(h) in currency c) ≤ 1` |
| **severity** | `CRITICAL` |
| **appliesToCategories** | `cat-handle`, `cat-identity`, `cat-p2p`, `cat-qr` |
| **validationMethod** | DB constraints: consumers_handle_key + consumer_wallets_consumer_currency_idx (partial); integration test: concurrent duplicate registration creates only one active wallet |

### INV-HDL-002-2

| Field | Value |
|-------|-------|
| **id** | `INV-HDL-002-2` |
| **name** | Suspended or closed wallets/identities cannot be resolved |
| **domain** | Identity / Routing |
| **description** | resolve_to_wallet() returns an error for any handle whose consumer is SUSPENDED or CLOSED, or whose wallet status does not permit inbound transfers (SUSPENDED, CLOSED, PENDING_OTP, PENDING_PIN). |
| **rule** | `resolve_to_wallet(h) → Ok(_) ⟹ consumer.status == ACTIVE ∧ wallet.can_receive() == true` |
| **severity** | `CRITICAL` |
| **appliesToCategories** | `cat-handle`, `cat-identity`, `cat-p2p` |
| **validationMethod** | Integration tests: suspended and closed identities rejected; WalletCannotReceive for non-active wallet statuses |

### INV-HDL-002-3

| Field | Value |
|-------|-------|
| **id** | `INV-HDL-002-3` |
| **name** | Resolution is deterministic for the same normalized input |
| **domain** | Identity / Routing |
| **description** | The same normalized handle always resolves to the same wallet_id as long as the underlying DB state has not changed. The query uses ORDER BY created_at ASC LIMIT 1 — no random selection, no LIMIT without ORDER. |
| **rule** | `∀ h: resolve(normalize(h)) = resolve(normalize(h))` for unchanged DB state |
| **severity** | `HIGH` |
| **appliesToCategories** | `cat-handle`, `cat-p2p`, `cat-qr` |
| **validationMethod** | Integration test: 10 concurrent resolutions of the same handle return identical wallet_id |

### INV-HDL-002-4

| Field | Value |
|-------|-------|
| **id** | `INV-HDL-002-4` |
| **name** | Malformed handles never resolve |
| **domain** | Identity / Routing |
| **description** | resolve_to_wallet() validates handle syntax before any DB access. Handles that fail validate_handle() are rejected with InvalidHandle immediately. |
| **rule** | `¬validate_handle(h) ⟹ resolve_to_wallet(h) → Err(InvalidHandle)` |
| **severity** | `HIGH` |
| **appliesToCategories** | `cat-handle`, `cat-identity` |
| **validationMethod** | Integration test: 6 malformed handle patterns all return InvalidHandle |

### INV-HDL-002-5

| Field | Value |
|-------|-------|
| **id** | `INV-HDL-002-5` |
| **name** | Concurrent resolution cannot create ambiguous routing |
| **domain** | Identity / Routing |
| **description** | Multiple concurrent calls to resolve_to_wallet() for the same handle return the same wallet_id. Registration and resolution are safe to run concurrently — DB constraints prevent ambiguity at the storage layer. |
| **rule** | `∀ concurrent(resolve(h)): all results → same wallet_id or error` |
| **severity** | `HIGH` |
| **appliesToCategories** | `cat-handle`, `cat-p2p` |
| **validationMethod** | Integration test: JoinSet of 10 concurrent resolve calls — all return identical wallet_id |

### INV-IDENTITY-005

| Field | Value |
|-------|-------|
| **id** | `INV-IDENTITY-005` |
| **name** | Handle resolution returns only ACTIVE consumers |
| **domain** | Identity |
| **description** | resolve_handle() returns SuspendedIdentity or ClosedIdentity for non-active consumers. Money can never be routed to an unreachable recipient via handle resolution. |
| **rule** | `resolve_handle(h) → Ok(_) ⟹ consumer.status == ACTIVE` |
| **severity** | `CRITICAL` |
| **appliesToCategories** | `cat-handle`, `cat-identity`, `cat-p2p` |
| **validationMethod** | Unit tests in engine.rs; integration tests for suspended and closed consumers |

---

## INV-P2P-001 — P2P Transfer Correctness

### INV-P2P-001-1

| Field | Value |
|-------|-------|
| **id** | `INV-P2P-001-1` |
| **name** | Transfer conservation invariant |
| **domain** | P2P / Ledger |
| **description** | A completed P2P transfer debits the sender's available account and credits the recipient's available account by the same amount. No money is created or destroyed. |
| **rule** | `sender.balance_delta + recipient.balance_delta == 0` |
| **severity** | `CRITICAL` |
| **appliesToCategories** | `cat-p2p`, `cat-ledger` |
| **validationMethod** | Integration tests: sender_balance_reduced, recipient_balance_increased, zero_sum_ledger_invariant in p2p_integration.rs |

### INV-P2P-001-2

| Field | Value |
|-------|-------|
| **id** | `INV-P2P-001-2` |
| **name** | Transfer-ledger backing invariant |
| **domain** | P2P / Ledger |
| **description** | Every COMPLETED P2P transfer record is backed by exactly one LedgerPosting with two balanced LedgerEntries (one DEBIT, one CREDIT). |
| **rule** | `transfer.status == COMPLETED ⟹ ∃! posting ∧ sum(signed_entries) == 0` |
| **severity** | `CRITICAL` |
| **appliesToCategories** | `cat-p2p`, `cat-ledger` |
| **validationMethod** | Integration test: zero_sum_ledger_invariant in p2p_integration.rs — queries ledger_entries for the transfer's posting_id and asserts signed sum == 0 |

### INV-P2P-001-3

| Field | Value |
|-------|-------|
| **id** | `INV-P2P-001-3` |
| **name** | Concurrent overdraft prevention invariant |
| **domain** | P2P / Concurrency |
| **description** | Concurrent P2P transfers from the same sender cannot collectively debit more than the sender's available balance. SELECT FOR UPDATE on the sender wallet row serializes concurrent sends. |
| **rule** | `sum(completed_transfers[sender]) <= initial_balance[sender]` under concurrent execution |
| **severity** | `CRITICAL` |
| **appliesToCategories** | `cat-p2p`, `cat-wallet` |
| **validationMethod** | Integration test: concurrent_sends_cannot_overdraw in p2p_integration.rs — JoinSet of 2 × 6k sends against 10k balance; asserts exactly one succeeds |

### INV-P2P-001-4

| Field | Value |
|-------|-------|
| **id** | `INV-P2P-001-4` |
| **name** | Transfer idempotency invariant |
| **domain** | P2P / Idempotency |
| **description** | Re-submitting the same idempotency_key returns the original transfer record without creating a new ledger posting or modifying any balance. |
| **rule** | `send(key) → T ∧ send(key) → T (same T, no new ledger entries)` |
| **severity** | `HIGH` |
| **appliesToCategories** | `cat-p2p`, `cat-ledger` |
| **validationMethod** | Integration test: idempotency_returns_original in p2p_integration.rs — calls p2p_send twice with the same key; asserts same transfer id and balance decremented only once |

### INV-P2P-001-5

| Field | Value |
|-------|-------|
| **id** | `INV-P2P-001-5` |
| **name** | Recipient handle audit snapshot invariant |
| **domain** | P2P / Audit |
| **description** | The normalized @banza handle used to route a P2P transfer is snapshotted atomically on the transfers record for audit trail. The snapshot is immutable after the transfer is created. |
| **rule** | `transfer.recipient_handle == normalize(routing_input)` for all handle-routed transfers |
| **severity** | `MEDIUM` |
| **appliesToCategories** | `cat-p2p` |
| **validationMethod** | Integration test: recipient_handle_snapshotted in p2p_integration.rs — sends with @ANA_SNAP (uppercase), asserts transfer.recipient_handle == "ana_snap" |

---

## INV-P2P-002 — Public Consumer Transfer API

### INV-P2P-002-1

| Field | Value |
|-------|-------|
| **id** | `INV-P2P-002-1` |
| **name** | Sender identity from JWT invariant |
| **domain** | P2P / Security |
| **description** | The sender's identity is always taken from the verified JWT, never from any client-supplied field in the request body. A caller cannot spoof a different sender. |
| **rule** | `transfer.sender == resolve_handle(jwt.consumer_id)` — the JWT consumer_id is the authoritative source for sender routing |
| **severity** | `CRITICAL` |
| **appliesToCategories** | `cat-p2p` |
| **validationMethod** | Unit test: TestSend_Success in transfers_test.go — confirms sender resolved from injected JWT consumer (not from body), no spoofing path exists |

### INV-P2P-002-2

| Field | Value |
|-------|-------|
| **id** | `INV-P2P-002-2` |
| **name** | Idempotency key mandatory invariant |
| **domain** | P2P / Idempotency |
| **description** | Every POST /v1/transfers request must carry an idempotency_key (body or Idempotency-Key header). Requests without one are rejected before any ledger work begins. |
| **rule** | `idempotency_key != ""` — enforced at public API layer before core delegation |
| **severity** | `HIGH` |
| **appliesToCategories** | `cat-p2p` |
| **validationMethod** | Unit test: TestSend_MissingIdempotencyKey in transfers_test.go — asserts 400 MISSING_FIELD when key absent; TestSend_IdempotencyPassthrough — asserts header value takes precedence over body field |

### INV-P2P-002-3

| Field | Value |
|-------|-------|
| **id** | `INV-P2P-002-3` |
| **name** | No internal identifiers in public response invariant |
| **domain** | P2P / Security |
| **description** | Public transfer receipts must never expose internal system identifiers: no ledger_posting_id, no sender_id/recipient_id UUIDs, no available_account_id, no reserved_account_id. Only the public transfer_id (UUID) and @banza handles are returned. |
| **rule** | `response !contains { ledger_posting_id, sender_id, recipient_id, available_account_id, reserved_account_id }` |
| **severity** | `HIGH` |
| **appliesToCategories** | `cat-p2p` |
| **validationMethod** | Unit test: TestSend_NoInternalIDsInResponse in transfers_test.go — enumerates all forbidden keys and asserts none are present in the 201 response body |

### INV-P2P-002-4

| Field | Value |
|-------|-------|
| **id** | `INV-P2P-002-4` |
| **name** | Rate limit enforcement invariant |
| **domain** | P2P / Reliability |
| **description** | A single authenticated consumer cannot exceed 20 transfer attempts per minute through the public API. Requests beyond the limit are rejected with 429 RATE_LIMITED before any core delegation occurs. |
| **rule** | `count(transfers, consumer_id, window=1min) <= 20` — enforced by fixed-window limiter before body parsing |
| **severity** | `MEDIUM` |
| **appliesToCategories** | `cat-p2p` |
| **validationMethod** | Unit test: TestSend_RateLimited in transfers_test.go — exhausts limiter to limit, asserts 21st attempt returns 429; rate limiter state is per-consumer and resets on new window |

### INV-P2P-002-5

| Field | Value |
|-------|-------|
| **id** | `INV-P2P-002-5` |
| **name** | Transfer atomicity from consumer perspective invariant |
| **domain** | P2P / UX |
| **description** | The public API exposes no PENDING state. Every transfer is either COMPLETED or FAILED. completed_at equals created_at for all successful transfers, reflecting the atomic nature of the underlying ledger operation. |
| **rule** | `transfer.status in {"COMPLETED", "FAILED"} && (status == "COMPLETED" => completed_at == created_at)` |
| **severity** | `HIGH` |
| **appliesToCategories** | `cat-p2p` |
| **validationMethod** | Unit test: TestSend_Success in transfers_test.go — asserts status is COMPLETED and completed_at equals created_at in response; OpenAPI spec documents the same contract |

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
