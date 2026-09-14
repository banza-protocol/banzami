# ADR-061 — Banzami is a wallet-native, ledger-native financial network; external rails are interoperability boundaries

Version: 1.0
Status: Accepted
Date: 2026-09-14
Relates to: ADR-013 (wallet-native identity), ADR-029 (settlement), ADR-047/055 (Project binding), ADR-052 (hosted payer surface), ADR-057 (financial readiness), ADR-060 (self-service Public Sandbox)
Milestone: WALLET-NATIVE-001

## The principle in one paragraph

Banzami is designed as a wallet-native, ledger-native financial network. Once
value is represented inside the Banzami network, eligible transfers and payments
between Banzami participants are executed natively through the Banzami Core and
ledger rather than requiring an external payment rail for every movement.
External rails remain essential interoperability boundaries for funding,
withdrawal, external settlement and other rail-dependent operations. This
architecture is rail-decoupled, not rail-free, and does not bypass regulatory
requirements. Public Sandbox models this architecture with fictitious value;
Financial Live remains unavailable and fail-closed until the applicable
regulatory, contractual and operational requirements are met.

## Context

Banzami could be built as a payment gateway: every payment a request to an
external switch, every balance whatever the provider last reported. That design
makes every Banzami movement depend on a rail being up, makes the provider's
state the financial truth, and makes a provider change a redesign of the product.

The implementation already went the other way — every account is a wallet, every
movement a double-entry posting written by Core, the hosted acquiring rail and
payouts isolated behind their own crates and lifecycles — but nothing held it
there. Four things were conventions, not guarantees:

1. **Who writes financial state.** Every service connects to PostgreSQL as the
   same runtime role. Nothing stopped the gateway, public-api, developer-api,
   admin-api or an operator script from writing a ledger entry or a wallet. Four
   operator scripts did: a Sandbox reset that deleted ledger rows with the
   triggers suspended, a staging seed that wrote consumer wallets, and two
   fixture tools that cancelled payment links with a direct UPDATE.
2. **Which operations need a rail.** The acquiring and payout routes cross a
   rail; wallet payments, P2P, refunds of wallet payments and application
   settlements do not. No test proved a wallet payment keeps working with a rail
   down, and no Sandbox scenario let a developer see it.
3. **What `simulate` means.** The Sandbox's `simulate: DECLINED |
   PROVIDER_UNAVAILABLE | TIMEOUT | DELAYED` was glued onto a test payer's wallet
   payment, describing "the external rail" for a movement that had none.
4. **Public language.** Nothing stopped public copy from promising what the
   architecture does not grant: independence from banks, a licence, instant
   availability.

## Decision

### 1. Definitions

The canonical vocabulary is
[docs/architecture/WALLET_NATIVE_TERMINOLOGY.md](../architecture/WALLET_NATIVE_TERMINOLOGY.md).
In short: a **wallet** is a participant's financial position in the network; a
**wallet account** is an authorised segregated destination inside it, never a
second ledger; an **internal financial movement** is a balanced posting between
network accounts written by Core; an **external rail** is any system outside the
network through which value enters, leaves or settles; **rail-decoupled** means
an internal movement does not technically require an external rail.

### 2. Core is the only financial writer — enforced by database authority

**PostgreSQL privilege is the authority; the connection name is detection.**

Every runtime service connects to PostgreSQL as its own role, with its own
password (`db/authority/runtime-authority.json` → generated
`db/authority/runtime-authority.sql`, applied by the superuser in one
transaction after every migration by
`infra/blueprint/sandbox-ops/scripts/runtime-authority.sh`):

| Role | Service | Financial tables | Other writes |
|---|---|---|---|
| `bl_core_runtime` | core-api | SELECT, INSERT, UPDATE, DELETE | every `public` table except the migration ledger |
| `bl_gateway_runtime` | api-gateway | SELECT only | its 22 onboarding, webhook, proof and request-log tables (+ `merchants`, through a trigger) |
| `bl_public_api_runtime` | public-api | SELECT only | its 8 KYC, credential and test-payer tables |
| `bl_developer_api_runtime` | developer-api | SELECT only | its 13 account, workspace, project, key and webhook tables |
| `bl_admin_api_runtime` | admin-api | SELECT only | its 15 operator, KYC-review, compliance and settings tables |
| `bl_app_runtime` | none (operator tooling on the host) | SELECT only | non-financial tables |

No runtime role is superuser, BYPASSRLS, CREATEROLE, CREATEDB, a member of the
schema owner, or able to write the migration ledger; the SQL aborts its own
transaction if any non-Core role holds INSERT, UPDATE, DELETE or TRUNCATE on a
financial table. Migration authority (`bl_migration` → `bl_schema_owner`) and the
superuser are mounted into no service. `tools/db-authority.mjs` fails the build
if the manifest drifts from 0144's table list, grants a financial table to a
non-Core role, or omits a table a service's own code writes.

Migration `0144` adds `banzami_financial_writer_guard()` as a statement-level
trigger on the 25 tables that hold financial state (ledger accounts, postings,
entries; wallets, consumer wallets, wallet accounts, their transfers and
reservations; wallet payments, transfers, transactions; payment sessions and
links; refunds, refund events, restitution allocations; acquiring payments and
callbacks; consumer deposits; payouts; application settlements, settlements,
operator fees; split sessions and contributions). A write is accepted only from
a connection whose `application_name` is `banzami-core` — Core sets it on its one
pool (`core/api/src/main.rs`) — or from the table's owner (the migration
identity, or a superuser in a disposable test database). Anyone else gets
`FINANCIAL_WRITE_OUTSIDE_CORE`.

That guard is defence in depth and observability, never the authority:
`application_name` is client-set. A non-Core role that names itself
`banzami-core` is refused by PostgreSQL's privilege check before any trigger
runs (`core/api/src/routes/database_authority_tests.rs`, all 25 tables × INSERT,
UPDATE, DELETE × 5 non-Core roles); the Core role under another name is still
refused by the guard.

Tables that hold money columns but are not financial state are classified, with
the reason, in `core/ledger/tests/financial_writer_guard.rs`: receipts
(evidence), disputes (case workflow), payment requests, consumer pay links and
QR codes (intents and interfaces), velocity counters (risk), Sandbox funding
reservations (quota), reconciliation items and attempts (evidence). A new table
with a money or ledger column fails that test until it is guarded or classified.

The reset and the seed are retired (with the harness that only ran after the
reset); the two fixture tools cancel links through Core's
`/internal/v1/payment-links/:id/cancel`.

### 3. Balance is a ledger derivation

There is no balance column. A balance is `SUM` over ledger entries
(`core/ledger/src/repository.rs`); postings and entries are immutable (0033). No
service can `SET balance = X`, because there is nothing to set.

### 4. Which operations cross an external rail

| Operation | Crosses a rail | Where it asks | With the rail down |
|---|---|---|---|
| Wallet payment (session, link, QR) | no | never | completes |
| Consumer P2P (`/v1/transfers`) | no | never | completes |
| Refund of a wallet payment | no | never | completes |
| Application settlement | no | never | completes |
| Wallet account transfer | no | never | completes |
| Hosted acquiring payment — initiation | **yes** | `acquiring::initiate_payment` | `503 PROVIDER_UNAVAILABLE`, nothing created |
| Hosted acquiring payment — confirmation | **yes** | `acquiring::test_confirm` (Sandbox) / provider callback (Live) | stays `PENDING`, nothing credited |
| Payout — submission / confirmation | **yes** | `payouts::mark_sent` / `payouts::confirm` | not submitted / not confirmed |
| Cash-in (consumer deposit) | **yes** | the funding session lifecycle: credited only on SETTLED, after provider confirmation | not credited (not on the developer surface, so it has no Sandbox switch) |

The boundary lives in `core/api/src/routes/external_rail.rs`
(`require_external_rail`). Rail-dependent routes call it before touching the
provider or writing anything; internal routes never reference it, and crates that
move value inside the network (`ledger`, `wallets`, `transfers`, `transactions`,
`app-settlement`, `collections`, `payment-links`, `qr`, `consumer-wallets`,
`settlement`) do not depend on the rail crates (`acquiring`, `routing`,
`payouts`). Provider specifics — EMIS signatures, Multicaixa references — end at
`core/acquiring/src/providers`.

### 5. The Sandbox models the boundary

Each Project has its own simulated external rail for the Business its key is
bound to (`sandbox_project_rail_states`, 0145; AVAILABLE by default). A Project
key sets it with `PUT /v1/sandbox/external-rail`; the Console's Test data page has
the switch. The scope is the Project, not the Business, because a Business can be
shared: a Project issues a consent code for its synthetic Business and a Project
in another Workspace connects to it. Neither can take the other's rail down. Core
records the Project that created each Payment Link or Session
(`sandbox_link_projects`, from the gateway's authenticated key, never a request
body), and a hosted payment reads that Project's rail. The Business-wide rail
(`sandbox_external_rail_states`) is set only through Core's internal operator
route and is what payouts read. With a Project's rail UNAVAILABLE:

- a test payer's payment **without** `simulate` is a wallet payment: it completes
  and reports `rail: "WALLET"` — the gateway does not even read the rail;
- a payment **with** `simulate` stands in for one whose funds cross an external
  rail (`rail: "EXTERNAL_SIMULATED"`) and fails closed with `503
  PROVIDER_UNAVAILABLE`, nothing moved;
- a hosted acquiring payment on a session or link that Project created cannot be
  initiated or confirmed;
- another Project on the same Business sees AVAILABLE and is unaffected.

`simulate` keeps its v1 contract; its meaning is now stated precisely, and the
response says which rail the payment used. Two scenarios make this executable:
`EXTERNAL_RAIL_DOWN_WALLET_PAYMENT` and `EXTERNAL_RAIL_DOWN_FAILS_CLOSED`.

In LIVE the simulator does not exist: its routes refuse, and
`require_external_rail` returns immediately — a real adapter reports its own
availability.

### 6. Failure domains

| Domain | What fails | What does not |
|---|---|---|
| Core or PostgreSQL unavailable | every financial operation (503) | nothing is half-written: postings are atomic |
| A specific external rail unavailable | operations that cross it (`PROVIDER_UNAVAILABLE`) | internal movements; the ledger |
| Webhook receiver unavailable | delivery (retried from the outbox, per attempt recorded) | the committed movement |
| Realtime stream unavailable | the screen update (`REALTIME_UNAVAILABLE`) | the committed movement; webhook and GET still answer |
| External reconciliation delayed | the external confirmation (acquiring stays PENDING) | the internal ledger, which balances |

Webhooks and realtime are projections of committed state: webhook events are
written to a transactional outbox with the movement and delivered afterwards
(0048), and the realtime stream reads the committed session state. Neither
participates in execution.

### 7. Idempotency and reconciliation across the rail

Every rail-crossing operation carries three identities: Banzami's idempotency key
(the acquiring payment id / payout idempotency key), the provider's reference
(`external_ref`), and the provider callback's own idempotency key
(`acquiring_callbacks`, unique). Settlement of a confirmed acquiring payment is
idempotent (a second callback does not credit twice). Reconciliation
(`core/reconciliation`, `acquiring_reconciliation_*`) compares and reports; a
correction is always a new balanced posting, never an edit.

### 8. Public language

Public copy may say: wallet-native, programmable financial infrastructure, the
Banzami network, integrates with financial rails. It must not say Banzami
bypasses, replaces or does not need banks or EMIS, is independent of the banking
system, holds a licence or authorisation, or moves unregulated money.
`tools/check-wallet-native-architecture.mjs` fails the build on those claims.

## Consequences

- A second financial writer fails at the database the first time it runs, in the
  Sandbox and in every `#[sqlx::test]` database that takes a non-owner role.
- A rail outage is visible as the rail's outcome (`PROVIDER_UNAVAILABLE`), never as
  a Banzami outage or a corrupted ledger.
- Replacing or adding a provider changes `core/acquiring/src/providers` (and a
  payout adapter when one exists), not the ledger, the wallet model or the public
  API.
- Operator scripts can no longer repair financial state by SQL. That is the point:
  repairs are balanced postings through Core.

## Non-goals

This decision does not enable Financial Live, simulate regulatory authorisation,
create real-money capability, introduce offline payments, change the BANZA
protocol's governance, create a legal entity or decide Banzami's legal category.
Architecture may be ready; authorisation is not.

## Regulatory boundary

Rail decoupling is not regulatory bypass. The more economically meaningful value
is represented inside Banzami, the more its safeguarding, redemption and
reconciliation model matters. The questions that require regulatory confirmation
are recorded, unanswered, in
[docs/regulatory/FUTURE_FINANCIAL_LIVE_OPERATING_MODEL.md](../regulatory/FUTURE_FINANCIAL_LIVE_OPERATING_MODEL.md).

## Alternatives considered

- **Gateway model** (every movement a rail request). Rejected: it makes every
  Banzami movement depend on a rail, the provider the financial truth, and a
  provider change a redesign. It would also change the product strategy
  (wallet, P2P, merchant payments) and would need explicit founder approval.
- **The application_name guard as the authority.** Rejected (WALLET-NATIVE-001
  closure): a client chooses its own name. Per-service roles were adopted instead;
  the guard remains as detection.
- **A simulated rail per Business.** Replaced by per-Project scope (0145): a
  Business shared by consent code would have given one developer a switch over
  another's integration.
- **Removing `simulate` from wallet payments.** Rejected: it is a published v1
  contract. Its meaning is stated and reported instead (`rail`).

## Evidence

- `core/api/src/routes/external_rail_tests.rs` — wallet payment and P2P complete
  with the rail down and with the rail-state table renamed away; acquiring
  initiation, confirmation and payout submission and confirmation fail closed.
  Mutation-proven.
- `core/api/src/routes/database_authority_tests.rs` — with the generated
  authority SQL applied, every non-Core role naming itself `banzami-core` is
  refused INSERT, UPDATE and DELETE on all 25 financial tables with SQLSTATE 42501;
  the Core role writes all of them; a wallet payment and a P2P transfer complete on
  a pool connected as the Core role and fail on one connected as the gateway role.
  Mutation-proven (a stray grant fails the test; the same grant inside the SQL
  aborts the apply).
- `tools/db-authority.mjs` (+ selftest, 6 mutations), in CI.
- `core/ledger/tests/financial_writer_guard.rs` — the 0144 guard: a non-owner,
  non-Core write to nine financial tables is refused; every money table is guarded
  or classified. Mutation-proven.
- `external_rail_tests.rs::a_projects_rail_switch_never_reaches_another_project_on_the_same_business`
  and `rail_project_scope_test.go` — two Projects on one Business, each switch
  reaching only its own payments, then reversed. Mutation-proven.
- `services/api-gateway/internal/handler/sandbox_external_rail_test.go` — a wallet
  payment never reads the rail; every `simulate` fails closed when it is down.
- `tools/check-wallet-native-architecture.mjs` (+ selftest, 14 mutations), in CI.
- Deployed: scenarios 31/31 including both rail scenarios; the Sandbox database
  refuses `UPDATE wallets` from a non-Core connection.
