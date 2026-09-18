# 24 — Phase B completion report

Version: 1.0
Status: `BANZAMI_VALIDATION_STUDIO_PHASE_B=COMPLETE` · `PHASE_C_READY=YES`
Commits: `970cbe9d` … `d6f95384` on `main`

---

## Acceptance

| Invariant | State | Held by |
|---|---|---|
| `VALIDATION_STUDIO_NAMING_DRIFT` | **0** | `check-validation-naming` |
| `SANDBOX_ROLLING_VOLUME_POLICY` | **PASS** | 53 unit + 20 real-DB tests |
| `SANDBOX_MERCHANT_CREDIT_POLICY_PATH_COVERAGE` | **PASS** | `check-merchant-credit-policy` |
| `SANDBOX_LIMIT_POLICY_FINANCIAL_HISTORY_MUTATIONS` | **0** | whole-ledger fingerprint test + `raise_ledger_immutable` |
| `ADR048_RUNTIME_CONTRADICTIONS` | **0** | `check-merchant-credit-policy` (ADR arm) |
| `VALIDATION_VOLUME_BUDGET_PREFLIGHT` | **designed** | [23](23-architecture-control-and-execution.md) §5, doc 22 D1 — implemented in Phase C |
| `CAPABILITY_SOURCE_OF_TRUTH` | **PASS** | one registry; the ledger is its complement |
| `CAP_COLLECT_001_RECONCILED` | **PASS** | `check-assurance` |
| `RUNTIME_ROUTE_CAPABILITY_DRIFT_TRACKED` | **PASS** | `check-route-registration` |
| `NEW_EXTERNALLY_REACHABLE_UNREGISTERED_ROUTE` | **FAIL_GUARD_PROVEN** | mutation test |
| `APP_FRONTEND_DEPLOY_PARITY` | **PASS** | `check-deploy-parity` |
| `WEBHOOK_SINK_DEPLOY_PARITY` | **TRACKED** | fails as `VALIDATION_DEPLOY_REVISION_UNKNOWN` — see owner actions |
| `ONE_VALIDATION_ENGINE` | **PASS** | `check-validation-engine` |
| `MULTIPLE_CONTROL_SURFACES` | **PASS** | same guard + [23](23-architecture-control-and-execution.md) §4 |
| `PARALLEL_VALIDATION_PLATFORM` | **0** | `check-validation-engine` |
| `BANZADMIN_AS_LONG_RUNNING_TEST_ENGINE` | **0** | `check-validation-engine` |
| `PUBLIC_WEBSITE_OPERATIONAL_VALIDATION_ACCESS` | **0** | `check-validation-engine` |
| `EXISTING_APPS_VALIDATION_STUDIO_PRESERVED` | **PASS** | `check-validation-engine` |
| `VALIDATION_STUDIO_ADMIN_RBAC_BOUNDARY` | **PASS** | `TestCan_ValidationStudioMatrix` |
| `BANZADMIN_VALIDATION_FOUNDATION` | **PASS** | RBAC + control contract + architecture; pages are Phase C |
| `VALIDATION_ACTOR/JOURNEY/SUITE_REGISTRY_READY` | **PASS** | `check-validation-registries` |
| `VALIDATION_ACTORS_PROVISIONED` | **0** | `check-validation-registries`, `validation-actor-health` |
| `REAL_LIVE_VALIDATION_CONTROL_EXPOSED` | **0** | Sandbox-only by construction |
| `REAL_LIVE_TESTS_EXECUTED` | **0** | no Live host was contacted |
| `DOA_SPECIAL_BANZAMI_TENANT_BEHAVIOR` | **0** | re-verified; unchanged |

`make check-validation` runs five of these guards together.

## What was REUSED

- **`tools/e2e/run-assurance.mjs`** — named as the engine's basis rather than
  replaced. Its properties are already the ones required: one machine-readable
  result, exit-status-first trust, `UNKNOWN` never `PASS`, evidence written
  outside the worktree, and the served revision **read** from the containers.
- **The 114 E2E harnesses, 71 static gates, 37 Phase-0 suites.** Nothing was
  reimplemented. The journey registry's `existing_harness` field exists so an
  omission is visible.
- **`tools/assurance-manifest-lib.mjs`** — the inverse drift gate reuses its
  chi parser rather than writing a fourth route extractor.
- **The fixture identity model** — `@banzami-e2e.test` and Resend
  sent-message readback. No new mail domain was provisioned (D3).
- **BANZADMIN's RBAC, MFA, session and audit model** — six capabilities added
  inside it; no second operator authentication system.
- **The Sandbox's own email convention** — `.test` TLDs, already used by 32
  merchants.
- **`core/api/src/routes/sandbox_funds.rs`** — the reverse-posting retirement
  mechanism is the resource model's `retirable-value` policy.

## What was EXTENDED

| Thing | Extension |
|---|---|
| `core/compliance/src/pilot.rs` | four rolling-window limits, four codes, `RollingVolumeUsage`, five compile-time invariants |
| `core/compliance/src/pilot_enforce.rs` | rolling queries, `check_merchant_credit` (connection-scoped) |
| `core/transfers`, `qr_pay.rs`, `acquiring.rs` | the gate, wired |
| `quality/operator-assurance-manifest.yaml` | `CAP-COLLECT-001` reconciled; `CAP-APPWEB-001` added |
| `quality/deployed-component-coverage.json` | `app-frontend` registered |
| `tools/check-deploy-parity.mjs` | `app-frontend`, `webhook-sink`, per-component exclusions |
| `services/admin-api/internal/auth/rbac.go` | six `CapValidation*` |
| `deploy.sh` | `deploy_webhook_sink`, registered as approval-pending |
| `Makefile` | 7 targets |

## What was REFACTORED

- **`docs/validation/lab/` → `docs/validation/studio/`** with history preserved,
  every occurrence of the retired name rewritten, and `07` renamed.
- **`apps/validation-studio/README.md`** — three months stale; described
  `apps/dashboard`, `apps/checkout` and `apps/merchant` as current (the first two
  retired and enforced-absent, the third never existing), and warned about matrix
  evidence pointing at removed files when all 96 paths now resolve.
- **`ADR-048`** — an enforcement table replacing a claim that was not true.
- **`check-merchant-credit-policy`'s gate detection** — a bare substring passed a
  renamed call; tightened to the qualified call, with comments stripped.
- **`check-validation-studio-naming`'s file reading** — `git show HEAD:` skipped
  newly added files, which are the ones most likely to carry drift.

## What was deliberately NOT built

| Not built | Why |
|---|---|
| A second validation product | `REUSE > EXTEND > REFACTOR > REPLACE`; enforced |
| A fourth capability registry | the manifest is canonical; the ledger is its complement |
| A parallel E2E engine | the existing estate is the execution plane |
| BANZADMIN `/validation` pages | Phase C. The boundary they sit behind exists now |
| `tools/validationctl.mjs` | Phase C; its basis is named, not forked |
| The nine Validation Actors | **B10, deliberately last and not authorised** |
| A public assurance page | deferred, separately approvable |
| `e2e.banzami.com` | the platform already has both email paths |
| Consumer per-payment/daily wiring | out of D1's scope; recorded in ADR-048 rather than implied |

## D1 runtime evidence

Sized from the Sandbox's own history (12 active days, 1 240 credits,
92 988 840 minor; p50 4 725 300, p90 15 889 000, max 31 165 620; 98,8 % harness,
1,2 % DOA, zero third-party):

```
global   24h  Kz   500 000   ≈ 1,6× the heaviest day ever observed
global   30d  Kz 4 000 000   ≈ 20 full validation runs
merchant 24h  Kz   250 000   ≈ 3,7× one run concentrated on one Business
merchant 30d  Kz 1 000 000
```

Order of operations was followed exactly: rolling semantics → boundaries proven
→ history-immutability proven → wired into payment paths → fail-closed tested →
ADR reconciled. **The old lifetime semantics were never activated at any point.**

Two things the work taught that the plan did not anticipate:

1. **`MERCHANT_MAX_BALANCE` (Kz 100 000) is lower than `MERCHANT_ROLLING_24H`
   (Kz 250 000).** A merchant that never settles hits the balance cap first;
   only one that moves money onward reaches its volume window. Intended — a
   stock cap and a flow cap answer different questions — but it surprised the
   tests until they seeded realistically.
2. **The database refuses to mutate a posted ledger entry.** An early draft of
   the aging test tried to age a row with an `UPDATE` and
   `raise_ledger_immutable` rejected it. That is a stronger guarantee than the
   test was asking for, and it is now asserted directly.

## Capability drift, before and after

| | Before | After |
|---|---:|---:|
| Capabilities in the registry | 24 | **25** (`CAP-APPWEB-001`) |
| Capabilities contradicting runtime | ≥1 (`CAP-COLLECT-001`) | **0** |
| Externally reachable routes measured | not measured | **370** |
| Unregistered routes | unknown | **0** (337 in the ledger) |
| Deployed components unclassified | 1 (`apps/app-banzami`) | **0** |

### Unclassified route ledger — `quality/validation/unclassified-routes.yaml`

```
337 entries   146 operator-surface (/admin/v1/**, CAP-APP-003, RBAC + audit)
              191 pending-classification  → must reach 0 before a Golden Run
baseline 337  CI fails if it GROWS
```

337 is larger than Phase A's ~145 estimate because that estimate omitted
admin-api and developer-api.

## Deploy-parity matrix

| Component | State |
|---|---|
| api-gateway-staging, public-api-staging, pay-frontend, admin-frontend, **app-frontend** | ✓ matches the tree |
| core-api-staging | ✗ divergent — the B2 policy change awaits deploy |
| developer-api, admin-api | ✗ `services/common/documents/receipt.html` (pre-existing) |
| website-frontend | ✗ `apps/website/components/site/Footer.tsx` (pre-existing) |
| **webhook-sink** | ✗ `VALIDATION_DEPLOY_REVISION_UNKNOWN` — built by hand as `:local` |

## Defects found and handled during Phase B

| # | Found | Handling |
|---|---|---|
| 1 | Naming guard read `HEAD`, skipping new files | Fixed; it then caught a real hit the broken version had passed |
| 2 | Coverage guard matched a renamed call by substring | Tightened to the qualified call; comment-stripped |
| 3 | Route detection flagged 9 read-only files | Narrowed to writers |
| 4 | `apps/app-banzami` deployed with no capability | `CAP-APPWEB-001` + component entry |
| 5 | `package.json` wrongly excluded for `app-frontend` | Per-component exclusions |
| 6 | `COMPLIANCE` missed `validation.view` (identical role blocks) | Caught by the matrix test |
| 7 | `B01` carried a placeholder email | Resolved against the Sandbox's own convention |
| 8 | Boundary test could not isolate a 30d window | The policy was right; the test was wrong, and now says so |

## Owner actions

1. **Deploy** — `./deploy.sh core-api` (B2 policy), plus `developer-api`,
   `admin-api`, `website-frontend` for the pre-existing divergence.
2. **Approve `webhook-sink`'s deploy** — one line in `_authority_gate`; the
   path exists and tags with the commit.
3. **Authorise B10** — provisioning the nine actors, once the above is done.

Deferred as recommended, unchanged: D2 residue, D4 npm Trusted Publishing,
D5 SDK licensing, D6 `sandbox-operator`, D9 retention, D11 native device.

## Phase C blockers

| Blocker | Needed for |
|---|---|
| `core-api` deploy | the rolling policy is not live until it ships |
| B10 actor provisioning | every journey needs actors |
| `webhook-sink` deploy approval | attributable webhook results |
| Evidence object storage (R2 bucket + credential) | the evidence model |
| npm Trusted Publishing (D4) | a Repair Run that must ship an SDK fix |

None blocks starting Phase C; each blocks a specific part of it.

```
BANZAMI_VALIDATION_STUDIO_PHASE_B = COMPLETE
PHASE_C_READY                     = YES
REAL_LIVE_TESTS_EXECUTED          = 0
```

No tag. No freeze.
