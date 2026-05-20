# ADR-017: Consumer Wallet Domain Architecture

**Status:** Accepted  
**Date:** 2026-05-20  
**Authors:** Banzami Engineering  
**Supersedes:** —  
**Related:** [ADR-002](ADR-002-double-entry-ledger.md) · [ADR-010](ADR-010-consumer-auth-pin-jwt.md) · [ADR-013](ADR-013-wallet-native-identity.md)

---

## Context

The Banza Wallet is the foundational financial container for every consumer on the network. Every payment, transfer, QR scan, and payout settlement flows through a wallet. Getting the domain architecture right is a prerequisite for every subsequent financial feature — mistakes here propagate into the ledger, identity, and settlement layers.

At the time of this ADR the `core/consumer-wallets` crate exists with a minimal three-state model (`ACTIVE`, `SUSPENDED`, `CLOSED`) and no onboarding lifecycle, no PIN security specification, no handle constraint definition, and no formal event model. The domain boundary between consumer identity (`core/identity`), the wallet engine (`core/consumer-wallets`), and the ledger (`core/ledger`) is implicit.

This ADR freezes the complete domain architecture before the implementation of onboarding, PIN authentication, and the consumer payment flows.

---

## Decision

We define the consumer wallet domain as a state machine with six lifecycle states, backed by two ledger accounts (available + reserved), carrying an immutable @banza handle, protected by an Argon2id PIN hash, and governed by the invariants enumerated below.

---

## 1. Wallet Lifecycle

### States

| State | Meaning |
|-------|---------|
| `PENDING_OTP` | Phone number submitted. Waiting for OTP verification. No ledger accounts yet. |
| `PENDING_PIN` | OTP verified. Ledger accounts provisioned. Waiting for handle selection and PIN creation. |
| `ACTIVE` | Fully onboarded. Handle reserved. PIN set. Ready to send and receive funds. |
| `LOCKED` | Too many consecutive failed PIN attempts. No outbound operations allowed. Inbound still accepted. |
| `SUSPENDED` | Administrative suspension. All operations blocked. Support unlock required. |
| `CLOSED` | Permanently closed. No further operations. Balance must be zero at closure. |

### Transition Table

```
PENDING_OTP  ──OTP verified──────────────────▶  PENDING_PIN
PENDING_OTP  ──OTP TTL expired (job)───────────▶  (row deleted)
PENDING_PIN  ──handle chosen + PIN set─────────▶  ACTIVE
PENDING_PIN  ──onboarding TTL expired (job)────▶  (row deleted, handle released)
ACTIVE       ──5 consecutive PIN failures──────▶  LOCKED
ACTIVE       ──admin action─────────────────────▶  SUSPENDED
ACTIVE       ──consumer requests closure────────▶  CLOSED
LOCKED       ──SMS OTP unlock────────────────────▶  ACTIVE
LOCKED       ──admin escalation──────────────────▶  SUSPENDED
SUSPENDED    ──support decision───────────────────▶  ACTIVE
SUSPENDED    ──admin closure─────────────────────▶  CLOSED
```

All other transitions are illegal and are rejected by `ConsumerWalletEngine` with `InvalidStatusTransition`.

### Ledger Account Provisioning

Ledger accounts are provisioned atomically when the wallet transitions from `PENDING_OTP` → `PENDING_PIN`. This is the earliest point at which the phone number is verified and the consumer identity is established. Wallets in `PENDING_OTP` state have no ledger footprint; they are cheap to clean up on OTP expiry.

---

## 2. Wallet Identity Model

### Table Schema (`consumer_wallets`)

```sql
CREATE TABLE consumer_wallets (
    id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    consumer_id           UUID        NOT NULL REFERENCES consumers(id),
    phone_number          TEXT        NOT NULL,            -- E.164: +244XXXXXXXXX
    banza_handle          TEXT        UNIQUE,              -- NULL until ACTIVE
    status                TEXT        NOT NULL,            -- lifecycle state enum
    currency              TEXT        NOT NULL DEFAULT 'AOA',
    available_account_id  UUID        REFERENCES ledger_accounts(id),  -- NULL during PENDING_OTP
    reserved_account_id   UUID        REFERENCES ledger_accounts(id),  -- NULL during PENDING_OTP
    kyc_status            TEXT        NOT NULL DEFAULT 'NONE',  -- NONE | PENDING | VERIFIED
    pin_hash              TEXT,                            -- NULL until ACTIVE; Argon2id
    failed_pin_attempts   INT         NOT NULL DEFAULT 0,
    locked_at             TIMESTAMPTZ,
    otp_code_hash         TEXT,                           -- NULL after verification; SHA-256 of OTP
    otp_expires_at        TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX consumer_wallets_phone_active_idx
    ON consumer_wallets (phone_number)
    WHERE status NOT IN ('CLOSED');

CREATE UNIQUE INDEX consumer_wallets_handle_idx
    ON consumer_wallets (banza_handle)
    WHERE banza_handle IS NOT NULL;
```

### Design Rationale

- `consumer_id` references `consumers(id)` in `core/identity`. The identity record is created first (during phone number submission), the wallet record is created immediately after.
- `banza_handle` carries a partial unique index that allows multiple `NULL` values (one per closed/abandoned wallet) while enforcing uniqueness among active handles.
- `otp_code_hash` stores `SHA-256(otp_code)` — never the plaintext OTP. The job `otp_expiry` deletes the row if `otp_expires_at` passes without verification.
- `pin_hash` is `NULL` until the wallet reaches `ACTIVE`. Code that reads `pin_hash` must treat `None` as "PIN not yet set" and return `PinNotSet` error.

---

## 3. Ledger Ownership Model

Each `ACTIVE` consumer wallet owns exactly **two** ledger accounts:

| Account | Ledger Type | Purpose |
|---------|------------|---------|
| `available_account_id` | `LIABILITY` | Immediately spendable funds. Banzami owes this to the consumer. |
| `reserved_account_id` | `LIABILITY` | Funds held for in-flight outbound operations (pending transfers, QR payments). |

**Why LIABILITY accounts?** Banzami holds the consumer's Kwanza — it is a liability on Banzami's balance sheet. A credit to a liability account increases what we owe; a debit reduces it. When a consumer receives funds, we credit their available account. When they send, we debit available and credit reserved (the reserve), then on settlement, debit reserved.

**One-to-one invariant:** A wallet cannot share ledger accounts with any other wallet. Account IDs are non-transferable for the wallet's lifetime, including after `CLOSED` (the account rows remain for audit).

---

## 4. Balance Semantics

Balances are **never stored** as columns. They are always derived from ledger entries on-demand.

```
available_balance = Σ credits(available_account) − Σ debits(available_account)
reserved_balance  = Σ credits(reserved_account)  − Σ debits(reserved_account)
total_balance     = available_balance + reserved_balance
```

### Implementation Rules

- Balance queries use `SELECT FOR SHARE` for reads.
- Before any debit from `available_account`, use `SELECT FOR UPDATE` on the wallet row + compute balance within the same transaction to prevent race conditions.
- `InsufficientFunds` is returned (not a panic) when the computed balance would go negative.
- Balance snapshots for display purposes may be cached in Redis with a short TTL (≤ 5 seconds). The authoritative balance is always the ledger.

---

## 5. Currency Rules

- **v1:** AOA (Angolan Kwanza) only. `currency` is set to `'AOA'` at creation and never changes.
- **Immutability:** `currency` is write-once. `UPDATE consumer_wallets SET currency = ...` is forbidden by application code. A DB-level check constraint enforces: `CHECK (currency = 'AOA')` for v1.
- **Minor units:** All monetary amounts are stored as `i64` integer centimes (lwei). 1 AOA = 100 lwei. Floating-point arithmetic on money is forbidden (`INV-LEDGER-003`).
- **Multi-currency:** Deferred to v2+. When introduced, each currency gets its own wallet record (one consumer can have one wallet per currency).

---

## 6. @banza Handle Rules

The `@banza` handle is the human-readable payment identity of a consumer. It appears in the UI as `@handle` and is used in P2P transfer initiation (`/transfer/to/@handle`).

### Format

| Rule | Specification |
|------|--------------|
| Length | 3–20 characters |
| Character set | Lowercase ASCII letters, digits, underscores (`a-z`, `0-9`, `_`) |
| Must start with | A lowercase letter (`a-z`) |
| Regex | `^[a-z][a-z0-9_]{2,19}$` |
| Case | Stored lowercase; lookup is case-insensitive |

### Uniqueness and Immutability

- Globally unique across all consumers, enforced by the partial unique index.
- **Immutable after activation.** Once the wallet transitions to `ACTIVE`, the handle cannot be changed. This is a system invariant, not a UI hint. The engine rejects handle-change requests for `ACTIVE` wallets.
- During `PENDING_PIN` state, the handle is **soft-reserved** for a 3-minute window. If onboarding times out, the reservation is released by the `stale_onboarding` background job.
- Reserved handles (from timed-out onboarding) become available immediately after the job runs.

### Normalization

`core/identity::normalize_handle(input)` applies:
1. `trim()` whitespace
2. `to_lowercase()`
3. Validation against the regex

`validate_handle(input)` returns `Err(InvalidHandle(...))` for any violation.

---

## 7. PIN Security Model

### Algorithm

PINs are stored using **Argon2id** (not bcrypt — `INV-SEC-003` predates this ADR and will be superseded for consumer wallets).

Parameters:

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Algorithm | Argon2id | Resistance to GPU and side-channel attacks |
| Memory | 65536 KiB (64 MiB) | Exceeds typical attacker GPU memory per hash |
| Iterations | 3 | ~300ms on reference hardware |
| Parallelism | 4 | Matches server core count |
| Salt | 16 bytes, random per PIN | From `getrandom` / OS CSPRNG |
| Output length | 32 bytes | 256-bit output |

The hash string is stored using the Argon2 PHC format: `$argon2id$v=19$m=65536,t=3,p=4$<salt_base64>$<hash_base64>`.

### PIN Lifecycle

- PIN is 4–6 numeric digits.
- Set during `PENDING_PIN → ACTIVE` transition.
- **Plaintext PIN never written** to any PostgreSQL column, Redis key, log line, trace, or metric label.
- On change: current PIN must verify first. New hash replaces old hash atomically.
- On verification: Argon2id verify is done in core-api. The result is `bool`. Only `true` or `false` leaves the verification function.

### Lockout Policy

| Condition | Action |
|-----------|--------|
| 5 consecutive failures | Wallet status → `LOCKED`, `locked_at` = now() |
| Successful authentication | `failed_pin_attempts` reset to 0 |
| Unlock | SMS OTP sent to registered phone; on success, status → `ACTIVE`, counter reset |

The failure counter is stored on the wallet row and incremented atomically with `UPDATE ... SET failed_pin_attempts = failed_pin_attempts + 1 WHERE id = $1 RETURNING failed_pin_attempts`.

### Biometric Authentication

Biometric credentials (Face ID, fingerprint) are stored **on the device only** in the platform secure enclave. Banzami never receives, stores, or processes biometric data. Biometric auth on the client side produces a local session token that is exchanged for a short-lived JWT at `POST /v1/auth/biometric-unlock`.

---

## 8. Financial Invariants

All invariants below are registered in `docs/validation/INVARIANT_TAXONOMY.md`. Financially critical items require all invariants to be `PASS` before `VALIDATED` may be proposed.

| ID | Name | Rule | Severity |
|----|------|------|----------|
| `INV-WALLET-001` | No negative available balance | `∀ wallet: available_balance >= 0` | CRITICAL |
| `INV-WALLET-002` | Balance derived from ledger | `wallet.available == Σ(ledger credits − debits on available_account)` | HIGH |
| `INV-WALLET-003` | Reserve/release symmetry | `∀ reserve: ∃ exactly one {release ∣ settle}` | HIGH |
| `INV-WALLET-004` | Wallet-owner uniqueness | `∀ consumer: at most one non-CLOSED wallet per currency` | HIGH |
| `INV-WALLET-005` | Currency immutability | `wallet.currency is write-once and never changes after creation` | HIGH |
| `INV-WALLET-006` | Lifecycle state machine | `∀ transition: (from, to) ∈ allowed_transitions` | CRITICAL |

---

## 9. Domain Boundaries

```
┌─────────────────────────────────────────────────────┐
│  core/consumer-wallets  (this crate)                │
│  Owns: wallet struct, lifecycle state machine,       │
│        balance query (via ledger), PIN verify/hash,  │
│        request types, error types                    │
│                                                     │
│  Does NOT own:                                      │
│    - Ledger posting logic  → core/ledger             │
│    - Handle registration   → core/identity           │
│    - JWT issuance          → services/api-gateway    │
│    - SMS OTP dispatch      → services (future)       │
└────────────────┬────────────────────────────────────┘
                 │ calls
     ┌───────────┼───────────┐
     ▼           ▼           ▼
 core/ledger  core/identity  core/types
 (postings)   (handles)      (Money, ids)
```

**Go services (api-gateway, admin-api, public-api):** Read wallet state and balance via HTTP calls to core-api. They never write financial tables (`INV-SEC-004`). Wallet mutations are always initiated through core-api endpoints.

**Mobile (Banza app):** Communicates exclusively through the `@banza/sdk` TypeScript layer or `banza_flutter` SDK. PIN is captured on-device, transmitted over TLS as plaintext in the request body, hashed immediately in core-api before any persistence.

**Background jobs (core/jobs/):** OTP expiry, stale onboarding cleanup, and reservation expiry run as Tokio tasks in core-api. They interact with consumer_wallets via the `ConsumerWalletEngine` trait directly (not HTTP).

---

## 10. Background Jobs

All jobs live in `core/jobs/` per [CLAUDE.md §20] and [core/jobs/README.md].

### `otp_expiry`

- **Purpose:** Delete `PENDING_OTP` wallet rows where `otp_expires_at < now()`.
- **Schedule:** `OTP_EXPIRY_INTERVAL_SECS` (default: 60s)
- **Action:** Hard delete of the `consumer_wallets` row (no ledger footprint at this stage, so no ledger cleanup needed). Also hard-deletes the corresponding `consumers` row if no other record references it.
- **Idempotency:** `DELETE WHERE status = 'PENDING_OTP' AND otp_expires_at < now()` is naturally idempotent.
- **Metrics:** `wallet_otp_expired_total` (counter)

### `stale_onboarding`

- **Purpose:** Delete `PENDING_PIN` wallet rows where `created_at < now() - ONBOARDING_TTL`.
- **Schedule:** `STALE_ONBOARDING_INTERVAL_SECS` (default: 300s)
- **Action:**
  1. Find `PENDING_PIN` wallets older than `ONBOARDING_TTL_MINUTES` (default: 30).
  2. For each: release the soft-reserved `banza_handle` (set `banza_handle = NULL`).
  3. Close the two provisioned ledger accounts (mark `closed_at`; balance must be zero — if not, log and skip).
  4. Delete the `consumer_wallets` row.
- **Idempotency:** Safe to re-run; uses `WHERE` clauses on status and age.
- **Metrics:** `wallet_stale_onboarding_total` (counter)

### `reservation_expiry`

- **Purpose:** Release handle reservations that were set during PENDING_PIN but where the wallet has since been closed or deleted without releasing the handle.
- **Schedule:** Runs as part of `stale_onboarding` — not a separate job for v1.

---

## 11. Event Model

Events are appended to the domain event log after every successful state transition. Events are append-only and immutable.

| Event | Trigger | Key Payload Fields |
|-------|---------|-------------------|
| `wallet.onboarding_started` | `PENDING_OTP` row created | `wallet_id`, `consumer_id`, `currency`, `phone_number_masked` |
| `wallet.otp_verified` | `PENDING_OTP → PENDING_PIN` | `wallet_id`, `consumer_id` |
| `wallet.activated` | `PENDING_PIN → ACTIVE` | `wallet_id`, `consumer_id`, `banza_handle` |
| `wallet.locked` | `ACTIVE → LOCKED` | `wallet_id`, `consumer_id`, `failed_attempts: 5` |
| `wallet.unlocked` | `LOCKED → ACTIVE` | `wallet_id`, `consumer_id`, `unlock_method: "sms_otp"` |
| `wallet.suspended` | `* → SUSPENDED` | `wallet_id`, `consumer_id`, `reason`, `admin_id` |
| `wallet.reinstated` | `SUSPENDED → ACTIVE` | `wallet_id`, `consumer_id`, `admin_id` |
| `wallet.closed` | `* → CLOSED` | `wallet_id`, `consumer_id`, `reason`, `final_balance` |
| `wallet.handle_reserved` | Handle soft-reserved during `PENDING_PIN` | `wallet_id`, `banza_handle` |
| `wallet.pin_set` | PIN created (first time) | `wallet_id`, `consumer_id` — **no hash in event** |
| `wallet.pin_changed` | PIN updated | `wallet_id`, `consumer_id` — **no hash in event** |
| `wallet.otp_expired` | Job deletes `PENDING_OTP` row | `consumer_id`, `phone_number_masked` |

**Security rule:** `pin_hash`, `otp_code_hash`, and `phone_number` (unmasked) must never appear in event payloads. Phone numbers in events are masked: `+244 9** *** ***`.

---

## Alternatives Considered

### A. Merge identity and wallet into one table

Rejected. Identity (`consumers` table) must exist independently of wallet status. A consumer may be suspended and their identity record still needed for audit. Separating identity from wallet also allows future multi-wallet (multi-currency) without schema changes.

### B. Store balance as a column, sync from ledger

Rejected. Storing balances as columns creates a consistency split: the column can lag the ledger on crash or partial commit. The ledger is the single source of truth (`CLAUDE.md §2.1`). Caching in Redis (short TTL) is acceptable for display; the column approach is not.

### C. Use bcrypt for PIN hashing

Rejected in favor of Argon2id. bcrypt has a maximum input length of 72 bytes, making it unsuitable for future PIN formats. Argon2id is the current OWASP recommendation for password storage, provides tunable memory-hardness, and is resistant to GPU-accelerated attacks. `INV-SEC-003` (which referenced bcrypt) was written before this domain was fully specified; consumer wallet PIN hashing is governed by this ADR.

### D. Immutable handle reservations (never delete on timeout)

Rejected. Handle squatting would be a product problem — users abandoning onboarding mid-flow would permanently consume desirable handles. The stale_onboarding job ensures handles become available again within 30 minutes.

---

## Consequences

### Positive

- Full lifecycle coverage eliminates ambiguity between onboarding state and operational state.
- Argon2id is the strongest practical PIN storage algorithm at this time.
- Two-account ledger model (available + reserved) maps cleanly to the double-entry system and enables clean reserve/release/settle flows.
- Immutable handles give consumers a stable payment identity.
- Background jobs are enumerated upfront — no surprises when scaling.

### Negative / Risks

- `PENDING_OTP` rows with no ledger footprint means onboarding state lives in `consumer_wallets` but not in the ledger. Any analytics on "wallets started vs completed" must query `consumer_wallets` directly, not the ledger.
- Argon2id at these parameters adds ~300ms per PIN verification. This is acceptable for authentication but means PIN verification cannot be in a tight loop. The lockout policy (5 attempts) is the primary defense.
- Handle immutability may frustrate users who regret their choice. This is a product tradeoff — immutability is the price of a trustworthy identity system.

---

## Validation Matrix Reference

This ADR is the primary architecture reference for:

- `WAL-001` — Consumer wallet onboarding (DOM-FIN)
- `WAL-003` — Consumer wallet balance display
- `WAL-004` — Incoming transfers to consumer wallets
- `HDL-001` — @banza handle registration
- `P2P-001` — Consumer-to-consumer transfers

All of the above depend on this ADR being the settled architecture before implementation proceeds.
