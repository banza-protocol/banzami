# Wallet-native dependency audit

Version: 1.0

WALLET-NATIVE-001 §46–49, §69, §75. What internal financial execution depends
on, classified, with the evidence for each classification. Read with
[ADR-061](../adr/ADR-061-wallet-native-rail-decoupled-financial-network.md).

Classes: **REQUIRED** (execution cannot be correct without it) · **ACCIDENTAL**
(a dependency with no reason to exist — must be zero) · **FUTURE_ONLY** (present
in code, not on any current execution path) · **SANDBOX_ONLY** (exists only to
model the architecture with fictitious value).

## 1. Internal movement (wallet payment, P2P, wallet refund, application settlement)

| Dependency | Class | Why / evidence |
|---|---|---|
| Banzami Core (`core-api`) | REQUIRED | The only financial writer; enforced by migration 0144. |
| PostgreSQL | REQUIRED | The ledger. Postings are atomic; balances derive from entries. |
| api-gateway | REQUIRED | Authenticates the caller and routes to Core; writes no financial state (`FINANCIAL_WRITES_OUTSIDE_CORE=0`). |
| public-api (consumer surface, test payers) | REQUIRED for consumer P2P and test-payer payments | Authenticates the consumer or resolves the test payer, then calls Core. Writes only `sandbox_test_fundings` (a quota reservation, classified as not financial state). |
| developer-api | REQUIRED for developer-key calls | The single key authority (ADR-046). Not on the consumer P2P path. |
| Redis | not required for correctness | Idempotency locks and rate limits fall back when Redis errors (`middleware/idempotency.go`, `ratelimit.go`); money is protected by Core's idempotency keys and unique constraints. |
| Webhook delivery | not a dependency | Events are written to a transactional outbox with the movement (0048) and delivered afterwards; a failed delivery is retried and never rolls back the movement (workbench suite: first attempt 500, movement committed). |
| Realtime stream | not a dependency | Reads committed session state; `REALTIME_UNAVAILABLE` leaves webhook and GET answering. |
| Push notifications (FCM) | not a dependency | Sent in a goroutine after the transfer response (`public-api/internal/handler/transfers.go`). |
| Acquiring provider (EMIS / simulated) | **ACCIDENTAL: none found** | Internal crates do not depend on `banzami-acquiring`; internal routes never call it (`tools/check-wallet-native-architecture.mjs`). With the rail-state table renamed away, wallet payment and P2P still complete (`internal_movements_never_read_the_rail`). |
| Payment routing engine (`core/routing`) | FUTURE_ONLY | Constructed in `AppState` (Multicaixa Express → EMIS → bank transfer by priority) and not called by any route. The seam for multi-rail routing; it cannot change wallet semantics because no internal path reads it. |
| Sandbox external rail simulator | SANDBOX_ONLY | Per (Project, Business) (0145). Read only by rail-dependent routes; refuses in LIVE; ignored by `require_external_rail` in LIVE. |

`ACCIDENTAL_EXTERNAL_RAIL_DEPENDENCIES=0`.

## 2. Rail-dependent operations

| Operation | Declares its rail | Fails closed | Evidence |
|---|---|---|---|
| Hosted acquiring payment — initiation | `acquiring::initiate_payment` → `require_external_rail` | 503, no row | `a_down_rail_creates_no_hosted_acquiring_payment` |
| Hosted acquiring payment — confirmation | `acquiring::test_confirm` → `require_external_rail`; Live via signed callback | stays PENDING, no credit | `a_down_rail_confirms_nothing_and_credits_nothing` |
| Payout — submission / confirmation | `payouts::mark_sent` / `confirm` → `require_external_rail` | not advanced | `a_down_rail_neither_submits_nor_confirms_a_payout`; state machine requires SENT before CONFIRMED |
| Cash-in (consumer deposit) | funding session lifecycle | credited only on SETTLED | `core/consumer-wallets/src/funding.rs` |
| Test payment with `simulate` | gateway reads the Business's rail | 503 PROVIDER_UNAVAILABLE, nothing moved | `TestSandboxRail_ARailDependentPaymentFailsClosed`, scenario `EXTERNAL_RAIL_DOWN_FAILS_CLOSED` |

## 3. Schema

- **One financial truth.** Payment Sessions, Payment Links, QR codes, Collections
  and Application Settlements carry workflow state (ACTIVE, PAID, EXPIRED…); the
  value is the ledger's. No workflow table holds a balance.
  `DUPLICATE_FINANCIAL_TRUTH_DOMAINS=0`.
- **Operation identity vs external attempt.** An internal movement is a `transfers`
  / `wallet_payments` row plus its posting. An external attempt is an
  `acquiring_payments` row (Banzami id, `external_ref` from the provider, status)
  with its own `acquiring_callbacks` (unique idempotency key). A refund names its
  source type (`WALLET_PAYMENT` or `ACQUIRING_PAYMENT`), so the two are never one
  indistinguishable object. No destructive redesign was needed.
- **Provider status.** Acquiring status is normalised to PENDING / CONFIRMED /
  FAILED in `core/acquiring`; raw provider payloads stay in `acquiring_callbacks`.
  `PROVIDER_IS_CANONICAL_LEDGER=0`: settlement posts Banzami's own balanced entry
  from the confirmed payment; it never copies a provider balance.

## 4. Public API and SDK

- Native schemas (sessions, links, refunds, transfers, settlements, test payers)
  carry no provider name or provider identifier; the build checks the OpenAPI and
  the SDK's public types. `PUBLIC_NATIVE_API_PROVIDER_LEAKAGE=0`.
- The refund source type `ACQUIRING_PAYMENT` names Banzami's resource, not a
  provider. The hosted payer page shows Multicaixa Express instructions only in
  LIVE, where it is the external rail the payer chose.
- The test payment response now states `rail: WALLET | EXTERNAL_SIMULATED` — the
  developer can see which failure domain a payment belongs to without learning
  any provider detail.

## 5. Provider switchability

Provider code lives in `core/acquiring/src/providers/{emis,simulated}.rs` behind
`AcquirerProvider`; the ledger, wallets and public API do not reference a provider.
Adding a provider is a new adapter and a configuration value
(`ACQUIRING_PROVIDER`). `PROVIDER_SWITCH_REQUIRES_LEDGER_REDESIGN=0`.
Payouts have no bank adapter yet (operator-driven transitions); when one exists it
belongs at the same boundary.

## 6. Observability

- Core logs `financial_operation=EXTERNAL_RAIL_OPERATION` with `rail_state`
  whenever a rail-dependent operation checks the rail.
- The gateway logs `sandbox.test_payment` with `financial_operation`
  (`INTERNAL_TRANSACTION` / `EXTERNAL_RAIL_OPERATION`) and `rail`.
- Developer request logs carry the error code, so `PROVIDER_UNAVAILABLE` is
  searchable per Project (ADR-054).

## 7. Availability assumptions (current, stated honestly)

- Core and PostgreSQL are single instances on one VM (Sandbox). Rail decoupling
  removes external rails from the internal path; it does not make Core or the
  database highly available. An outage of either stops every financial operation
  — cleanly, with no half-written posting.
- Redis loss degrades idempotency locks and rate limiting to in-process fallbacks.
- The gateway, public-api and developer-api are stateless and restartable.
- No SLO has been measured for public use; public copy promises no instant or
  always-available service.

## 8. Database authority (done in the WALLET-NATIVE-001 closure)

Every PostgreSQL client on the Sandbox host, audited on 2026-09-14 before the
change: core-api, api-gateway (including webhook delivery, realtime and proof
verification, which run inside it), public-api, developer-api and admin-api — all
five as one role, `bl_app_runtime`, which every migration re-granted DML on every
table. No other container connects (pay-frontend, admin-frontend, the website,
the edge and the webhook sink hold no database credential); the legacy
`banzami-postgres-1` is stopped. No SECURITY DEFINER function exists; the one view
is not updatable; there are no sequences; no non-Core service takes a row lock on
a financial table.

After:

| Role | Mounted into | Schemas readable | Financial tables | Writable tables |
|---|---|---|---|---|
| `bl_core_runtime` | core-api | public | read + write | all of `public` except `_sqlx_migrations` |
| `bl_gateway_runtime` | api-gateway | public, developer | read only | 23 (manifest) |
| `bl_public_api_runtime` | public-api | public | read only | 8 |
| `bl_developer_api_runtime` | developer-api | public, developer, account_identity | read only | 13 |
| `bl_admin_api_runtime` | admin-api | public | read only | 15 |
| `bl_app_runtime` | no container — `/root/.banzami/operator_db_url`, root-only | all three | read only | non-financial |
| `bl_migration` / `bl_schema_owner` | the migration executor only | — | owner | owner |
| `sbadmin` (superuser) | the postgres container and the operator's bootstrap/authority containers | — | — | — |

Writes are table-scoped to each service's own footprint (read from its non-test
source by `tools/db-authority.mjs`). Reads remain schema-scoped: narrowing them per
table would fail services at runtime on paths no suite exercises (BANZADMIN review
flows need an operator's MFA), for no gain in financial authority.

Counters: `NON_CORE_FINANCIAL_TABLE_WRITE_ROLES=0`,
`APPLICATION_NAME_SECURITY_AUTHORITY=0`,
`RUNTIME_SERVICE_HAS_MIGRATION_SUPERUSER_CREDENTIALS=0`.

## 9. Future hardening (recorded, not done)

- **Payout bank adapter** at the rail boundary, with provider request and
  correlation identities.
- **Liability vs backing-asset reconciliation** once the regulatory model defines
  the assets (see the regulatory operating model).
