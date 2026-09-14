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
| **Closure review:** "only Core writes financial state" rested on `application_name`, which a client chooses — a compromised service could name itself Core. All five services connected as one role, `bl_app_runtime`, and every migration re-granted it DML on every table | One PostgreSQL role per service, each with its own password and credential file; only `bl_core_runtime` is granted writes on financial tables; grants generated from a manifest and applied in one transaction after every migration; the 0144 guard kept as detection | [Database authority](#database-authority) |
| **Closure review:** the simulated rail was per Business, and a Business can be shared across Workspaces by consent code — one developer's switch reached another's integration | Per-(Project, Business) rail (0145); Core records the creating Project of every link and session from the authenticated key; the Business-wide rail is operator-only | [Rail simulator isolation](#rail-simulator-isolation) |
| Operator tools and harnesses read Core's database credential out of its container | `/root/.banzami/operator_db_url` (`bl_app_runtime`, no container, no financial write authority) | 58 files |

## Architecture

| Property | How it holds | Proof |
|---|---|---|
| Wallet-native | Every participant has a wallet; a payment is a movement between wallets (P2P, Business payment through Session, Link or QR, wallet refund, application settlement, wallet account transfer) | ADR-061 §4; wallet-native journey 16/16 |
| Ledger-native | No balance column; a balance is `SUM` of entries; postings immutable (0033); provider state normalised in `core/acquiring`, raw payloads kept as evidence | `PROVIDER_IS_CANONICAL_LEDGER=0`; ledger reconciliation 6/6 |
| Rail-decoupled | Internal crates do not depend on `acquiring`, `routing`, `payouts`; internal routes never read the rail | gate `RAIL_DEPENDENCY_IN_INTERNAL_CRATES=0`, `RAIL_CHECK_IN_INTERNAL_ROUTES=0`; Core test with the rail table removed |
| Provider boundary | Provider code only in `core/acquiring/src/providers/{emis,simulated}.rs` behind `AcquirerProvider`; native API and SDK types carry no provider identifier | `PUBLIC_NATIVE_API_PROVIDER_LEAKAGE=0`; `PROVIDER_SWITCH_REQUIRES_LEDGER_REDESIGN=0` |
| Failure-domain separation | Core/DB down → every financial operation 503, nothing half-written; rail down → only rail-crossing operations `PROVIDER_UNAVAILABLE`; webhook receiver down → delivery retried from the outbox, movement committed; realtime unusable → movement committed, webhook and GET answer | failure matrix A–G on the deployed Sandbox |
| Core-only financial writing | **PostgreSQL privilege is the authority**: only `bl_core_runtime` holds INSERT/UPDATE/DELETE on the 25 financial tables; every other runtime role reads them. `application_name` (0144) is detection | [Database authority](#database-authority) |

## Database authority

**Inventory before the change (2026-09-14).** PostgreSQL clients on the Sandbox
host: core-api, api-gateway (with webhook delivery, realtime and proof
verification inside it), public-api, developer-api, admin-api — all as
`bl_app_runtime`, with DML on every table in `public`, `developer` and
`account_identity`. pay-frontend, admin-frontend, the website, the edge, the
webhook sink and Redis hold no database credential; the legacy
`banzami-postgres-1` is stopped. No SECURITY DEFINER function, no updatable view,
no sequence; no non-Core row lock on a financial table.

**After — read from PostgreSQL on the deployed Sandbox** (`runtime-authority.sh verify`):

| Role | Used by (process `DATABASE_URL` user) | Login | Superuser / BYPASSRLS | Financial write privileges | Writable tables | Schemas readable |
|---|---|---|---|---|---|---|
| `bl_core_runtime` | core-api | yes | no / no | 75 (25 × INSERT, UPDATE, DELETE) | 97 (`public` except `_sqlx_migrations`) | public |
| `bl_gateway_runtime` | api-gateway | yes | no / no | **0** | 23 | public, developer |
| `bl_public_api_runtime` | public-api | yes | no / no | **0** | 8 | public |
| `bl_developer_api_runtime` | developer-api | yes | no / no | **0** | 13 | public, developer, account_identity |
| `bl_admin_api_runtime` | admin-api | yes | no / no | **0** | 15 | public |
| `bl_app_runtime` | no container (operator tools on the host) | yes | no / no | **0** | 85 (non-financial) | all three |
| `bl_control_plane` | no container | yes | no / no | 0 | 0 | public |
| `bl_migration` → `bl_schema_owner` | the migration executor only (short-lived login) | — | no / no | owner | owner | — |
| `sbadmin` | the postgres container and the operator's bootstrap/authority containers | yes | yes | — | — | — |

Each service mounts exactly one database credential (`/run/secrets/db_url_<service>`);
no container's image environment holds a database credential; no service mounts
`mi_superuser`, `mi_migration`, `mi_control` or the secrets directory. The shared
`evidence/db_url` is retired.

| Proof | Result |
|---|---|
| Deployed: each non-Core role connects **naming itself `banzami-core`** and attempts INSERT, UPDATE and DELETE on all 25 financial tables (rolled back) | gateway 75/75 refused, public-api 75/75, developer-api 75/75, admin-api 75/75, operator 75/75 — every one `permission denied for table`, 0 other errors |
| Deployed: the Core role, same 75 statements | 75 accepted, 0 errors |
| Deployed: the Core role under another name | refused by the 0144 guard (`FINANCIAL_WRITE_OUTSIDE_CORE`) — detection retained |
| Deployed: services after the cutover | 0 permission errors in any service log; Postgres logged exactly the 375 proof refusals and nothing else; admin-api recorded a login attempt as its own role |
| `database_authority_tests.rs` (real PostgreSQL, CI) | 5 tests: non-Core roles refused on 25 × 3 × 5; non-Core roles keep reads and their own writes and cannot write another service's; Core writes all 25; `application_name` is detection; a wallet payment and a P2P transfer complete on a pool connected as the Core role and **fail on one connected as the gateway role running Core's own code** |
| Mutation | `GRANT UPDATE ON wallets TO bl_gateway_runtime` after the apply → the refusal test fails naming it; the same grant inside the SQL → the SQL's own assertion aborts the transaction (`NON_CORE_FINANCIAL_TABLE_WRITE_ROLES: bl_admin_api_runtime UPDATE on public.ledger_entries`) |
| `tools/db-authority.mjs` (CI) + selftest | PASS; 6 mutations: a financial table granted to the gateway; a second all-tables writer; a guarded table dropped from the manifest; service code writing a table it is not granted; service code writing a ledger entry; a hand-edited SQL |
| Core still works | every deployed suite below ran with Core as `bl_core_runtime`: wallet payments, P2P (Core test), refunds (8/8), application settlement (fresh/application journeys), Sandbox funding and reset, hosted acquiring, rail matrix, reconciliation 6/6 |

Reads remain schema-scoped rather than table-scoped: narrowing them per table
would fail services on paths no suite exercises (BANZADMIN review flows need an
operator's MFA) and adds nothing to financial authority. Writes are table-scoped.

### Indirect write authority

The direct grants are necessary, not sufficient. Every indirect PostgreSQL path
was inventoried on the deployed database and is now verified, fail-closed, by
`db/authority/verify-authority.sql` (generated with the grants; run at the end of
every authority apply, by `runtime-authority.sh verify`, and in CI).

| Path | Found on the deployed database | Now |
|---|---|---|
| Routines | 14, all SECURITY INVOKER trigger functions owned by `bl_schema_owner`; 0 SECURITY DEFINER anywhere; one (`create_primary_wallet_account`) writes a financial table and is classified; EXECUTE held by PUBLIC | EXECUTE revoked from PUBLIC and every runtime role (triggers fire without it); any unclassified SECURITY DEFINER routine, one without a pinned search_path, any routine a runtime role may execute, or any unclassified routine writing a financial table fails verification |
| Role membership / SET ROLE | runtime roles are members of nothing; no CREATEROLE, BYPASSRLS or superuser | any membership of a runtime role fails verification |
| TRUNCATE, MERGE, COPY, REFERENCES, TRIGGER on financial tables | none granted to non-Core roles | any of them fails verification |
| Rules, INSTEAD OF triggers, writable views | 0 rules, 0 INSTEAD OF triggers; one view, not updatable, SELECT only | any of them in the application schemas fails verification |
| Object creation / search_path | no schema CREATE; database TEMP via PUBLIC | TEMP and PUBLIC schema CREATE revoked; any CREATE or TEMP for a runtime role fails verification |
| Default privileges | tables: SELECT for services, writes for Core only; routines: PUBLIC EXECUTE by default | routines created by `bl_schema_owner` are no longer executable by PUBLIC; a default granting a non-Core role a write or any routine privilege fails verification |
| New objects | — | a table with a money or ledger column that is neither financial (guarded by 0144) nor classified, or a financial table without its guard, fails verification |

**Before the apply** the deployed verification failed, naming PUBLIC EXECUTE on the
14 routines, database TEMP and the routine default — none a write path (invoker
trigger functions cannot be called directly or write beyond the caller's
privileges), all now closed. **After:** `DB_AUTHORITY_VERIFY=PASS`.

Deployed proof, each non-Core role naming itself `banzami-core`, 18 attempts each:
`SET ROLE` to Core, the schema owner, the migration login and the superuser;
`GRANT` Core to itself; `TRUNCATE` ledger entries and wallets; `MERGE` and `COPY`
into financial tables; executing the financial-write and guard routines; writing
through the view; `CREATE TABLE` in public, `CREATE TEMP TABLE`, a `pg_temp`
function, a schema; a trigger on wallets; `SELECT … FOR UPDATE` on wallets —
**90/90 refused** by PostgreSQL privilege (the view additionally is not updatable).
After it: scenarios 31/31 and the application journey 18/18 with Core writing as
its role; 0 permission errors in any service log.

Mutation proof (`database_authority_tests.rs`, each inside a rolled-back
transaction): A a SECURITY DEFINER financial writer executable by the gateway, B
the gateway made a member of Core, C TRUNCATE on a financial table, D a SECURITY
DEFINER routine with an unpinned search_path, E an unclassified money table, F an
INSTEAD rule writing wallets through a view, G a default privilege giving the
gateway writes, H CREATE on public — each named by the verification. A separate
test shows mutation A would really have let the gateway write a wallet. Removing
the SECURITY DEFINER or membership check from the verification makes the mutation
test fail.

Known limitation, unchanged and not a write path: services keep schema-scoped
reads (tenant and application authorisation remain enforced in the services).

## Rail simulator isolation

Before: `sandbox_external_rail_states` per Business. A Business can be shared —
Project A issues a consent code, Project B in another Workspace redeems it — so
A's switch reached B. Now (0145) the switch is per (Project, Business); a hosted
payment reads the rail of the Project that created its link or session
(`sandbox_link_projects`, written by Core from the gateway's authenticated key);
the Business-wide rail is set only through Core's internal operator route, which
the public edge does not expose (404).

| Proof | Result |
|---|---|
| Deployed `acceptance-suites.mjs rail-isolation`: Workspace A / Project A; Workspace B / Project B1 (own Business) and Project B2 (connected to A's Business — same handle verified) | 7/7 |
| A down | A: `simulate` 503 and hosted 503 `PROVIDER_UNAVAILABLE`; B1: AVAILABLE, `simulate` 402 `PAYMENT_DECLINED`, hosted 201; **B2 on the same Business: AVAILABLE, 402, 201** |
| Reversed (A up, B2 down) | B2 503/503; A and B1 402/201 |
| A key naming another Project and a Business-wide scope in the body | ignored: only the key's own Project changes (A stays AVAILABLE) |
| Another Workspace's Console against A's Project (Explorer, set rail) | 404 |
| Core's internal route from the public edge | 404 |
| The switch on the Live host | 503; no route reaches Financial Live |
| Core tests | `a_projects_rail_switch_never_reaches_another_project_on_the_same_business` (then reversed; nothing written to the Business-wide rail; payouts unaffected), `a_link_no_project_created_reads_only_the_business_wide_rail`, `a_projects_rail_and_attribution_do_not_exist_in_live`. Mutation: key the Project's rail by Business alone → fails ("B, on the same Business, sees A's switch"); ignore the creator Project → fails ("A's own hosted payment fails closed") |
| Gateway tests | `TestSandboxRail_AProjectsSwitchNeverReachesAnotherProject`, `TestCreatorProjectComesFromTheKey` (a body `sandbox_project_id` is never used). Mutations: rail keyed without the Project → fails; creator taken from the body → fails |
| Cannot affect Live | Core refuses the simulator and link attribution in LIVE (`403` / `400`); `require_external_rail` is a no-op in LIVE; the tables exist only in the Sandbox database |

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
| Tenant isolation | isolation 16/16; rail isolation 7/7 across Workspaces sharing a Business; refunds of another Project 404 |
| Authorization | rail routes require `sandbox:read` / `sandbox:write` and a bound Business; the simulator refuses in LIVE (`the_simulator_refuses_in_live`) |
| Direct balance mutation | no balance column; `FINANCIAL_WRITES_OUTSIDE_CORE=0` across 1 157 non-Core files; no non-Core role holds a write privilege on a financial table |
| Core-only writing | PostgreSQL privilege (deployed: 375/375 spoofed non-Core writes refused, Core 75/75 accepted); 0144 guard as detection |
| Migration and superuser credentials | mounted into no runtime service; runtime roles are not superuser, BYPASSRLS, CREATEROLE or owner members (the authority SQL aborts otherwise) |
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

The first closure's regression, then again after the database-authority cutover
and the rail isolation fix (every deployed suite below ran with each service on
its own role).

| Check | Before the closure review | After the cutover |
|---|---|---|
| Rust core (real Postgres) | 695 passed, 0 failed | **703 passed, 0 failed** (+5 authority, +3 rail isolation); clippy `-D warnings` clean under 1.98 |
| Go (CI, real Postgres + Redis) | green on `2b3f34f3` | green on `92fed6eb` and `f1a62575` (CI and Economic gate), including `TestSandboxRail_AProjectsSwitchNeverReachesAnotherProject`, `TestCreatorProjectComesFromTheKey` |
| Website / pay / SDK | 1 121 / 24 / 116 | 1 121 / — / — (pay and SDK unchanged) |
| `make check-docs-prod` | PASS | PASS (includes the wallet-native and database-authority gates) |
| Gates + selftests | architecture 14 mutations | architecture 14, database authority 6 — PASS |
| Scenarios / workbench / refunds / wallet-native | 31/31 / 10/10 / 8/8 / 16/16 | 31/31 / 10/10 / 8/8 / 16/16 (rail matrix PASS, residue 0) |
| Rail isolation | — | **7/7** |
| Public cleanroom (SDK 0.14.1 from npm) | 29/29 | **29/29**, rail steps 3/3, operator interventions 0, residue 0 |
| Realtime / isolation / expiry | 17/17 / 16/16 / 2/2 | 17/17 / 16/16 / — (tokens unchanged) |
| Fresh / application journeys | 24/24 / 18/18 | 24/24 / 18/18 |
| Quickstart / DOA tutorial / Explorer | 12/12 / 13/13 / 11/11 | 12/12 / 13/13 / 11/11 |
| Ledger reconciliation (read-only) | 6/6 | 6/6 — 2 935 postings, 5 870 entries, through the operator credential |
| Service logs since the cutover | — | 0 permission or authentication errors in any service |
| `make security-check` | PASS | PASS |
| `make check-deploy-parity` | every component matches | every component matches the tree |

A first post-cutover pass ran several suites concurrently from one address and
met the Sandbox's own rate limits (gateway 429, and 20 OTP requests per IP per 15
minutes); those runs reported rate limiting, not authority or isolation defects
— no service logged a permission error — and each affected suite was re-run alone
and passed as above.

## Cleanup

| Check | Result |
|---|---|
| Every acceptance run | residue 0; each restores its Projects' rails |
| `sweep-console-fixtures.mjs --min-age-hours 0 --apply` | 26 fixture memberships closed; 0 fixture accounts, workspaces, projects or keys remaining |
| `retire-synthetic-residue.sh --apply` | 0 synthetic value, accounts, keys, webhooks, open links, open sessions, pending payouts, consumers or projects |
| `check-canonical-resources` | everything active is declared canonical, with an owner and a reason |
| Simulated rails left down | 0 — two per-Project rails left UNAVAILABLE by the rate-limited runs (their Projects already archived) were restored through Core's internal route; 13 Project rails and 7 Business-wide rails, all AVAILABLE |
| Shared runtime credential | `evidence/db_url` retired; mounted by no container |
| Ledger after cleanup | 6/6 |

`WALLET_NATIVE_ACCEPTANCE_RESIDUE=0`

## Counters (§81)

```
BANZAMI_WALLET_NATIVE_MODEL=PASS
BANZAMI_RAIL_DECOUPLED_MODEL=PASS
ONE_FINANCIAL_TRUTH=PASS
ONE_LEDGER_AUTHORITY=PASS
CORE_ONLY_FINANCIAL_WRITES=PASS
CORE_ONLY_FINANCIAL_DATABASE_AUTHORITY=PASS
CORE_FINANCIAL_WRITE_AUTHORITY=PASS
APPLICATION_NAME_SECURITY_AUTHORITY=0
NON_CORE_FINANCIAL_TABLE_WRITE_ROLES=0
NON_CORE_DIRECT_FINANCIAL_INSERT=0
NON_CORE_DIRECT_FINANCIAL_UPDATE=0
NON_CORE_DIRECT_FINANCIAL_DELETE=0
NON_CORE_DIRECT_FINANCIAL_TRUNCATE=0
NON_CORE_EXECUTABLE_FINANCIAL_WRITE_FUNCTIONS=0
UNSAFE_SECURITY_DEFINER_FUNCTIONS=0
NON_CORE_CAN_SET_ROLE_TO_CORE=0
NON_CORE_PRIVILEGE_ESCALATION_ROLE_PATHS=0
NON_CORE_FINANCIAL_WRITE_VIA_VIEW_OR_RULE=0
NON_CORE_SEARCH_PATH_PRIVILEGE_ESCALATION=0
NON_CORE_INDIRECT_FINANCIAL_WRITE_PATHS=0
DATABASE_AUTHORITY_DEFAULT_PRIVILEGES=PASS
UNCLASSIFIED_NEW_FINANCIAL_DB_OBJECTS=0
INDIRECT_DB_AUTHORITY_MUTATION_PROOF=PASS
CORE_ONLY_WRITER_MUTATION_PROOF=PASS
RUNTIME_SERVICE_HAS_MIGRATION_SUPERUSER_CREDENTIALS=0
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
SANDBOX_RAIL_SIMULATOR_CROSS_TENANT_EFFECT=0
SANDBOX_RAIL_SIMULATOR_TENANT_ISOLATION=PASS
SANDBOX_RAIL_SWITCH_CAN_AFFECT_LIVE=0
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

**The canonical security principle.** Only Core has database authority — direct
or indirect — to write canonical financial state: PostgreSQL grants INSERT, UPDATE and DELETE on the 25
financial tables to `bl_core_runtime` alone; no other runtime role holds them,
whatever it calls itself. Sandbox simulation controls are scoped to one Project
and cannot reach another developer or Financial Live.
