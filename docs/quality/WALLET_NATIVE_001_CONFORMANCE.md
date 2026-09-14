# WALLET-NATIVE-001 — conformance

Version: 1.0

The after-state on 2026-09-14, read from the code, the deployed Public Sandbox and
the deployed public surfaces. The decision is
[ADR-061](../adr/ADR-061-wallet-native-rail-decoupled-financial-network.md); the
vocabulary is [WALLET_NATIVE_TERMINOLOGY.md](../architecture/WALLET_NATIVE_TERMINOLOGY.md);
the dependency classification is
[WALLET_NATIVE_DEPENDENCY_AUDIT.md](../architecture/WALLET_NATIVE_DEPENDENCY_AUDIT.md).

> Banzami is designed as a wallet-native, ledger-native financial network. Once
> value is represented inside the Banzami network, eligible transfers and payments
> between Banzami participants are executed natively through the Banzami Core and
> ledger rather than requiring an external payment rail for every movement.
> External rails remain essential interoperability boundaries for funding,
> withdrawal, external settlement and other rail-dependent operations. This
> architecture is rail-decoupled, not rail-free, and does not bypass regulatory
> requirements. Public Sandbox models this architecture with fictitious value;
> Financial Live remains unavailable and fail-closed until the applicable
> regulatory, contractual and operational requirements are met.

## What was found, and what changed

| Gap found | Change | Evidence |
|---|---|---|
| Every service connected to PostgreSQL as one runtime role; nothing stopped a second financial writer. Four operator scripts wrote financial state around Core (a reset deleting ledger rows with triggers suspended, a staging seed writing wallets, two fixture tools cancelling links by `UPDATE`) | Migration `0144`: `banzami_financial_writer_guard()` on 25 financial-state tables; Core names its pool `banzami-core`. The reset, the seed and the harness that only ran after the reset are retired; the fixture tools cancel links through Core | `core/ledger/tests/financial_writer_guard.rs` (mutation-proven); deployed: a non-Core `UPDATE wallets` as the runtime role → `FINANCIAL_WRITE_OUTSIDE_CORE`, 25 triggers, migration head 144 |
| No test proved an internal movement survives a rail outage; rail-dependent routes did not declare their rail | `require_external_rail` at the boundary (`core/api/src/routes/external_rail.rs`), called by acquiring initiation and confirmation and payout submission and confirmation; never by internal routes | `external_rail_tests.rs`: 7 tests, including `internal_movements_never_read_the_rail` (rail table renamed away, wallet payment and P2P still complete); mutation-proven |
| `simulate` described "the external rail" for a wallet payment that had none | Per-Business simulated rail (`GET/PUT /v1/sandbox/external-rail`, Console switch); test payments report `rail: WALLET \| EXTERNAL_SIMULATED`; `simulate` with the rail down → `503 PROVIDER_UNAVAILABLE`, nothing moved | gateway tests; scenarios `EXTERNAL_RAIL_DOWN_WALLET_PAYMENT`, `EXTERNAL_RAIL_DOWN_FAILS_CLOSED` |
| A rail outage on hosted-payment confirmation surfaced as `502 UPSTREAM_ERROR` (a Banzami outage) | Gateway passes Core's `503 PROVIDER_UNAVAILABLE` through (`Retry-After: 30`) | `TestHostedAcquiringRailDownIsProviderUnavailable`; deployed matrix G |
| Deployed `PUT /v1/sandbox/external-rail` answered 415 (no `Content-Type` to Core) | Client sets it; client test | deployed scenarios 31/31 |
| Reference entries for the rail were written but in no resource group, so the page never rendered them | Added to the Sandbox group; `reference-completeness.test.tsx` fails for any unrendered entry (mutation: fix reverted → both ids named) | deployed docs audit 85/0, `OPENAPI_ENDPOINTS_UNDOCUMENTED=0` |
| Glossary: LIVE as "real money, real rails" with no status; settlement and wallet in pre-ADR words | Rewritten; *External rail* added | — |
| `BANZAMI_REFERENCE.md`: withdrawals "immediately via EMIS", "Ledger BANZA", "pay instantly" | A withdrawal is rail-dependent, confirmed only by the rail, not available; the ledger is Core's; no instant promise | — |
| Payer page description "Envie dinheiro instantaneamente"; README "instant settlement", "integration in hours" (§68) | Measured wording; `PUBLIC_UNMEASURED_INSTANT_CLAIMS` in the architecture gate (mutation-proven) | deployed `pay.banzami.com/u/doa` description |
| Public claims and the model's wording were unguarded | `tools/check-wallet-native-architecture.mjs` in CI: 9 counters, 14 mutations | selftest PASS |
| CI red since the first wallet-native commit: `clippy::err_expect` under Rust 1.98 (local clippy was 1.90) | `expect_err` | CI and Economic gate green on `2b3f34f3` |

## Architecture

| Property | How it holds | Proof |
|---|---|---|
| Wallet-native | Every participant has a wallet; a payment is a movement between wallets (P2P, Business payment through Session, Link or QR, wallet refund, application settlement, wallet account transfer) | ADR-061 §4; wallet-native journey 16/16 |
| Ledger-native | No balance column; a balance is `SUM` of entries; postings immutable (0033); provider state normalised in `core/acquiring`, raw payloads kept as evidence | `PROVIDER_IS_CANONICAL_LEDGER=0`; ledger reconciliation 6/6 |
| Rail-decoupled | Internal crates do not depend on `acquiring`, `routing`, `payouts`; internal routes never read the rail | gate `RAIL_DEPENDENCY_IN_INTERNAL_CRATES=0`, `RAIL_CHECK_IN_INTERNAL_ROUTES=0`; Core test with the rail table removed |
| Provider boundary | Provider code only in `core/acquiring/src/providers/{emis,simulated}.rs` behind `AcquirerProvider`; native API and SDK types carry no provider identifier | `PUBLIC_NATIVE_API_PROVIDER_LEAKAGE=0`; `PROVIDER_SWITCH_REQUIRES_LEDGER_REDESIGN=0` |
| Failure-domain separation | Core/DB down → every financial operation 503, nothing half-written; rail down → only rail-crossing operations `PROVIDER_UNAVAILABLE`; webhook receiver down → delivery retried from the outbox, movement committed; realtime unusable → movement committed, webhook and GET answer | failure matrix A–G on the deployed Sandbox |
| Honest limit | The guard trusts `application_name`, which a client sets: it stops an accidental second writer, not a compromised service. Per-service database roles are recorded as future hardening | dependency audit §8 |

## Resilience — deployed rail failure matrix (`acceptance-suites.mjs wallet-native`)

| Case | Result |
|---|---|
| A–E Account, Project, key, Financial Setup, Business | PASS |
| F–G Test participants, fictitious funding (Core creates the value) | PASS |
| H Internal payment, rail available | 200, `rail: WALLET`, PAID |
| I P2P with the rail down | Core: `a_down_rail_does_not_stop_p2p`, `internal_movements_never_read_the_rail` (consumer P2P is not a project-key surface, ADR-061 §4) |
| J Rail UNAVAILABLE | 200, state read back |
| K–L Internal payment with the rail down; same idempotency key does not debit twice | 200, `rail: WALLET`, PAID; replay 200, same transfer, debited 25 000 once |
| M Receipt for the rail-down payment exists and verifies publicly, with no external receipt behind it | 200 |
| N Signed `payment_session.paid` webhook for it | delivered |
| O Realtime stream turns PAID | `snapshot:ACTIVE,status:PAID` |
| P Canonical GET | PAID |
| C Rail-dependent payment with the rail down | `simulate` 503 `PROVIDER_UNAVAILABLE`, hosted initiation 503, session ACTIVE, payer unchanged |
| G Delayed external confirmation | initiated 201; confirmation while down 503, session ACTIVE; confirmation after 200, session PAID |
| E Webhook receiver answering 500 | payment committed |
| F Realtime unusable (wrong token 401) | payment committed |
| Q Ledger invariants over the whole book | 6/6 |
| R Rail restored | AVAILABLE |

Measured, not published: internal payment median 56 ms with the rail available,
53 ms with it down (5 samples each, Sandbox, one VM).

## Sandbox and cleanroom

| Check | Result |
|---|---|
| Scenarios (`acceptance-suites.mjs all`) | 31/31, including both rail scenarios; predicates mutation-proven |
| Wallet-native journey | 16/16, residue 0 |
| Webhook workbench / refunds | 10/10 / 8/8 |
| Public cleanroom — new identity, `@banzami/sdk` 0.14.1 from registry.npmjs.org, public Sandbox only | 29/29 — steps 15–17: rail down → wallet payment 200 `rail: WALLET`, PAID, debited 50 000; `simulate` 503 and hosted initiation 503 `PROVIDER_UNAVAILABLE`, session ACTIVE, payer unchanged; rail restored, hosted initiation 201. Operator interventions 0, residue 0 |
| Realtime / isolation / expiry | 17/17 / 16/16 (a Sandbox key refused by the Live host; test value stays among test participants) / 2/2 (a status token refused after 30 minutes) |
| Fresh / application journeys | 24/24 / 18/18 |
| Quickstart / DOA tutorial | 12/12 residue 0 / 13/13 |
| Explorer in a browser | 11/11, secret leaks 0 |
| Console (populated fixture) | accessibility 41/41, responsive 52/52, routes 18/18; external-rail switch toggles, survives reload, restores |

## Security

| Property | Evidence |
|---|---|
| Tenant isolation | isolation 16/16; the rail belongs to the key's own Business (gateway test); refunds of another Project 404 |
| Authorization | rail routes require `sandbox:read` / `sandbox:write` and a bound Business; the simulator refuses in LIVE (`the_simulator_refuses_in_live`) |
| Direct balance mutation | no balance column; `FINANCIAL_WRITES_OUTSIDE_CORE=0` across 1 157 non-Core files; DB guard refuses non-Core writes |
| Core-only writing | deployed refusal; Core test suite writes through the guard |
| Secrets | `make security-check` PASS; no secret printed in any evidence of this milestone |

## Documentation and public claims

| Deliverable | Where |
|---|---|
| ADR | [ADR-061](../adr/ADR-061-wallet-native-rail-decoupled-financial-network.md) |
| Canonical definitions | [WALLET_NATIVE_TERMINOLOGY.md](../architecture/WALLET_NATIVE_TERMINOLOGY.md); glossary aligned |
| Dependency / schema / API / SDK audit | [WALLET_NATIVE_DEPENDENCY_AUDIT.md](../architecture/WALLET_NATIVE_DEPENDENCY_AUDIT.md) |
| Diagram (SVG) | [docs/diagrams/banzami-wallet-native-network-v1.svg](../diagrams/banzami-wallet-native-network-v1.svg); in the developer docs as `MoneyMovementDiagram` |
| Developer docs | Concepts → *Como o dinheiro se move* / *How money moves*; Testing → external rail; two recipes; reference `GET`/`PUT /v1/sandbox/external-rail`; error catalogue `PROVIDER_UNAVAILABLE`; OpenAPI and Postman |
| Website | banzami.com hero: wallet-native platform with interoperability with external rails; banzami.com/developers: payments move inside the ledger, rails carry value in and out (Financial Live) |
| Strategy | [Porque nativo de carteira](../Banzami_Posicionamento_Competitivo_Angola.md) |
| Internal competitive taxonomy | [DEVELOPER_PLATFORM_COMPETITIVE_MATRIX.md](DEVELOPER_PLATFORM_COMPETITIVE_MATRIX.md) §Architectural taxonomy, with the PayPay and BitPay research rules; no competitor on public product pages |
| README | "What Banzami is not"; "Wallet-native, rail-decoupled" with the canonical paragraph |
| Public claim audit | architecture gate over 268 public-copy files: bypass claims 0, unmeasured instant claims 0; `check-public-site-truth` PASS; deployed public site 60/60; docs sweep 600/0 (re-run after the last deploy); docs audit 85/0 |

## Regulatory

Current status: Banzami holds no BNA authorisation, no EMIS certification and no
licence. Financial Live is NOT READY / FAIL-CLOSED: `bz_live_` keys are refused
before any lookup, no public capability declares `live: true`, and the simulator
does not exist in LIVE. The fifteen questions only a regulator or counsel can
answer are recorded, each **REQUIRES REGULATORY CONFIRMATION**, in
[FUTURE_FINANCIAL_LIVE_OPERATING_MODEL.md](../regulatory/FUTURE_FINANCIAL_LIVE_OPERATING_MODEL.md).
PST-SP is not assumed as the model. No public surface claims authorisation,
certification, electronic-money status, independence from banks or EMIS, or
unregulated money.

## Regression

| Check | Result |
|---|---|
| Rust core (real Postgres) | 695 passed, 0 failed; clippy `-D warnings` clean under 1.98 |
| Go (CI, real Postgres + Redis) | all services green on `2b3f34f3` |
| Website / pay / SDK | 1 121 / 24 / 116 tests |
| `make check-docs-prod` | PASS (includes the wallet-native gate) |
| Architecture gate + selftest | PASS, 14 mutations |
| Ledger reconciliation (read-only) | 6/6 during regression (2 766 postings) and after cleanup (2 771 postings, 5 542 entries) |
| SDK install proof / docs examples | 30/30 / PASS against npm 0.14.1, `SDK_DOCS_REGISTRY_DRIFT=0` |
| `make security-check` | PASS |
| `make check-deploy-parity` | every deployed component matches the tree |

## Cleanup

| Check | Result |
|---|---|
| Every acceptance run of this closure | reported its own residue 0 and restored its Business's rail |
| `sweep-console-fixtures.mjs --min-age-hours 0 --apply` | 19 fixture memberships closed; 0 fixture accounts, workspaces, projects or keys remaining |
| `retire-synthetic-residue.sh --apply` | 0 synthetic value, accounts, keys, webhooks, open links, open sessions, pending payouts, consumers or projects |
| `check-canonical-resources` | everything active on the Sandbox is declared canonical, with an owner and a reason; 0 unclassified keys |
| Simulated rails left down | 0 (7 rows, all AVAILABLE) |
| Ledger after cleanup | 6/6 — 2 771 postings, 5 542 entries |

`WALLET_NATIVE_ACCEPTANCE_RESIDUE=0`

## Counters (§81)

```
BANZAMI_WALLET_NATIVE_MODEL=PASS
BANZAMI_RAIL_DECOUPLED_MODEL=PASS
ONE_FINANCIAL_TRUTH=PASS
ONE_LEDGER_AUTHORITY=PASS
CORE_ONLY_FINANCIAL_WRITES=PASS
DIRECT_BALANCE_MUTATION_PATHS=0
DUPLICATE_FINANCIAL_TRUTH_DOMAINS=0
INTERNAL_TRANSFER_REQUIRES_EXTERNAL_PROVIDER=0
PROVIDER_IS_CANONICAL_LEDGER=0
ACCIDENTAL_EXTERNAL_RAIL_DEPENDENCIES=0
EXTERNAL_RAIL_CONCERNS_CONTAINED=PASS
PROVIDER_SWITCH_REQUIRES_LEDGER_REDESIGN=0
INTERNAL_TRANSFER_EXTERNAL_RAIL_DOWN=PASS
EXTERNAL_RAIL_FAILURE_FAILS_CLOSED=PASS
RAIL_FAILURE_MATRIX=PASS
PUBLIC_NATIVE_API_PROVIDER_LEAKAGE=0
LEDGER_INVARIANTS=PASS
SANDBOX_LIVE_WALLET_CROSSOVER=0
RAIL_DECOUPLING_REGULATORY_BYPASS_CLAIMS=0
WALLET_NATIVE_SANDBOX_E2E=PASS
WALLET_NATIVE_PUBLIC_CLEANROOM=PASS
WALLET_NATIVE_CONCEPT_CONTRADICTIONS=0
RAIL_DECOUPLING_CONTRADICTIONS=0
WALLET_NATIVE_ACCEPTANCE_RESIDUE=0
FINANCIAL_LIVE_STATUS=NOT_READY
FINANCIAL_LIVE_FAIL_CLOSED=PASS
```

`SANDBOX_LIVE_WALLET_CROSSOVER=0`: a Sandbox key is refused by the Live host
(isolation step 13), `bz_live_` is refused before lookup, and test value cannot
leave test participants (isolation step 14, `SANDBOX_VALUE_PERIMETER`).
`RAIL_DECOUPLING_CONTRADICTIONS=0`: the surfaces of §79 were read — banzami.com,
the Developers landing, developer docs, OpenAPI, SDK README, Console, FAQ, Sobre
and the internal architecture documents; the four contradictions found (glossary,
`BANZAMI_REFERENCE.md`, payer page, README) are corrected above, and Multicaixa
Express appears on the payer page only behind the LIVE-only external-rail flag.
