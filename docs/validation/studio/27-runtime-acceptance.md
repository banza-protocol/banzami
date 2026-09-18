# 27 — Phase B runtime acceptance

Version: 1.0
Date: 2026-09-18 · Tree `79460b66` (clean, `== origin/main`)
Environment: **SANDBOX ONLY**

---

## 1. Deployed revisions

| Component | Revision | State |
|---|---|---|
| **core-api-staging** | `82283af0` → **`79460b66`** | healthy · parity ✓ |
| **banzami-webhook-sink** | `:local` → **`79460b66`** | healthy · parity ✓ |
| app-frontend | `2fbdd20f` | healthy · **parity ✓** |
| api-gateway-staging, public-api-staging, pay-frontend | `b2bfedb5` | parity ✓ |
| admin-frontend | `5ce51b5b` | parity ✓ |
| developer-api, admin-api, website-frontend | see [25](25-deploy-divergence-classification.md) | classified, not deployed |

Migration head `0159`, unchanged — the policy change touched no schema.

## 2. The rolling policy is live, and the old one is gone

Read from the **running binary**, not from source:

```
PILOT_LIMIT_MERCHANT_24H_VOLUME_EXCEEDED   4 occurrences
PILOT_LIMIT_GLOBAL_30D_VOLUME_EXCEEDED     4 occurrences
PILOT_LIMIT_AGGREGATE_VOLUME_EXCEEDED      0      ← the retired lifetime cap
PILOT_LIMIT_MERCHANT_DAILY_EXCEEDED        0      ← the retired calendar-day cap
```

Zero occurrences of either retired code is the load-bearing half: it shows the
lifetime and calendar-day semantics are not merely unused in the new build, they
are absent from it. `BANZAMI_PILOT_LIMITS=1`, `ENVIRONMENT=sandbox`.

## 3. Windows, measured against the deployed Sandbox

| Window | Used | Cap | Headroom |
|---|---:|---:|---:|
| global 24h | 4 565 120 | 50 000 000 | 45 434 880 |
| global 30d | 92 988 840 | 400 000 000 | 307 011 160 |
| aggregate funds | 9 532 600 | 50 000 000 | 40 467 400 |

The 30d window equals the lifetime total only because the Sandbox's entire
credit history is younger than 30 days. It will begin falling as September ages
out — which is the property the lifetime counter never had.

For contrast: under the retired cap the same 92 988 840 was **46,5 % of a budget
that could never be recovered**. It is now 23,2 % of a window that refills.

## 4. No financial history was mutated

`SANDBOX_LIMIT_POLICY_FINANCIAL_HISTORY_MUTATIONS=0`, on three independent
grounds:

1. both the old counter and the new windows are **derived by query** — there is
   no stored counter to move, and the change was a `created_at` predicate;
2. no migration ran (head unchanged at `0159`);
3. the database itself refuses: `raise_ledger_immutable` rejects any `UPDATE` of
   a posted entry, asserted by `the_ledger_itself_refuses_mutation`.

## 5. Payment paths still work

Proven without spending merchant-credit volume:

- `POST /consumer/v1/auth/register` → `201` × 3 (C01–C03 created)
- `POST /consumer/v1/auth/token` → `200` × 3 (each PIN proven)
- Console OTP sign-in → workspace → project × 2 (D01, D02)
- `/health`, `/readyz` (database + redis `ok`), `/v1/platform-mode` → `SANDBOX`

Merchant-credit volume before and after provisioning: **4 565 120 → 4 565 120.**
Zero burnt. `aggregate_funds` rose by 3 000 000 — three automatic Kz 10 000
`registration-grant` credits that Sandbox consumer registration issues by design
(`services/public-api/internal/handler/auth.go:130`), not an action taken here,
and reversible by retirement.

## 6. Gate matrix

| Gate | Result |
|---|---|
| `VALIDATION_STUDIO_NAMING_DRIFT` | **0** |
| `SANDBOX_ROLLING_VOLUME_POLICY_RUNTIME` | **PASS** (§2, §3) |
| `SANDBOX_MERCHANT_CREDIT_POLICY_PATH_COVERAGE` | **PASS** |
| `ADR048_RUNTIME_CONTRADICTIONS` | **0** |
| `SANDBOX_LIMIT_POLICY_FINANCIAL_HISTORY_MUTATIONS` | **0** |
| `VALIDATION_VOLUME_BUDGET_PREFLIGHT` | **PASS** (FULL and GOLDEN fit; REPAIR refused — §7) |
| `CAPABILITY_SOURCE_OF_TRUTH` | **PASS** |
| `CAP_COLLECT_001_RECONCILED` | **PASS** |
| `RUNTIME_ROUTE_CAPABILITY_DRIFT_TRACKED` | **PASS** (370 routes, 0 unregistered) |
| `NEW_EXTERNALLY_REACHABLE_UNREGISTERED_ROUTE` | **FAIL_GUARD_PROVEN** |
| `APP_FRONTEND_DEPLOY_PARITY` | **PASS** |
| `WEBHOOK_SINK_DEPLOY_PARITY` | **PASS** |
| `VALIDATION_DEPLOY_REVISION_UNKNOWN` (webhook-sink) | **0** |
| `ONE_VALIDATION_ENGINE` · `MULTIPLE_CONTROL_SURFACES` | **PASS** |
| `PARALLEL_VALIDATION_PLATFORM` | **0** |
| `BANZADMIN_AS_LONG_RUNNING_TEST_ENGINE` | **0** |
| `PUBLIC_WEBSITE_OPERATIONAL_VALIDATION_ACCESS` | **0** |
| `VALIDATION_STUDIO_ADMIN_RBAC_BOUNDARY` | **PASS** |
| `BANZADMIN_VALIDATION_FOUNDATION` | **PASS** |
| `VALIDATION_ACTOR/JOURNEY/SUITE_REGISTRY_READY` | **PASS** |
| `VALIDATION_ACTORS_UNOWNED` | **0** |
| `VALIDATION_ACTORS_ENVIRONMENT` | **SANDBOX** |
| `VALIDATION_ACTOR_FINANCIAL_POLICY_BYPASS` | **0** |
| `REAL_LIVE_*` (tests, financial, infrastructure, control) | **0** |

Not yet reachable, all on the same boundary:

| Gate | Blocked by |
|---|---|
| `VALIDATION_ACTOR_COUNT=9` | 5 of 9 — [26](26-b10-owner-ceremony.md) |
| `VALIDATION_ACTORS_HEALTHY=9` | 5 of 5 provisioned are HEALTHY |
| `VALIDATION_VOLUME_BUDGET_PREFLIGHT_WITH_ACTORS` | no Business actor exists yet |

## 7. A finding worth keeping

The preflight refuses a **worst-case REPAIR run**: 45 000 000 + 20 % margin =
54 000 000 against a 50 000 000 global 24h window. That is not a mis-sizing — it
says a repair cycle cannot be compressed into a single day at full breadth, and
must either spread across more than 24h or run as targeted change-impact
closures. `FULL` and `GOLDEN` both fit comfortably.

## 8. Actors

| Actor | Handle / identity | Product ids | Health |
|---|---|---|---|
| `C01` | `@e2ec01` | consumer `19f54fd1` · wallet `36a72f51` | **HEALTHY** |
| `C02` | `@e2ec02` | consumer `9515b44d` · wallet `b2b6ea3c` | **HEALTHY** |
| `C03` | `@e2ec03` | consumer `4abcfcb0` · wallet `b6741a08` | **HEALTHY** |
| `D01` | `d01@banzami-e2e.test` | user `5e38060c` · ws `57777855` · project `10eaec58` | **HEALTHY** |
| `D02` | `d02@banzami-e2e.test` | user `7b20ebab` · ws `52a8e812` · project `b04810bb` | **HEALTHY** |
| `B01` `B02` `B03` | `@e2eb01-03` (all available) | — | blocked on `A01` |
| `A01` | — | — | blocked on the owner ceremony |

Every one came through the product's own door. No SQL identity injection, no
auth bypass, no merchant-lifecycle bypass, no Core special case, no financial
policy bypass. Each consumer PIN was proven by signing in with it; PINs live at
`/root/.banzami/validation/` (0700 dir, 0600 files) and are referenced, never
recorded, in the registry.
