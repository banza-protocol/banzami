# Banzami Unified E2E & Assurance Methodology

Programme: BANZAMI-SANDBOX-RELEASE-ASSURANCE-001

One repeatable methodology every material Banzami feature follows. It is the
contract behind the canonical manifest ([`quality/operator-assurance-manifest.yaml`](../../quality/operator-assurance-manifest.yaml))
and the gates in `make check-assurance` / CI.

## Test levels

| Level | What | Where | Gate |
|---|---|---|---|
| static/security | lint, vet, clippy, secret scan, layout, manifest, SDK contract | local + CI | `make check-all` |
| unit | pure logic, validators (e.g. webhook SSRF, money math) | per package | CI |
| real-DB | financial invariants against real PostgreSQL — never mocks | `#[sqlx::test]`, go test +DB | CI |
| service integration | gateway↔core↔public-api wired | compose | CI/local |
| **deployed Sandbox E2E** | real flows against sandbox-api.banzami.com | `tools/e2e/*` | **release** |
| browser E2E | console/pay flows | (playwright, per app) | release |
| mobile E2E | device/simulator flavors | manual, STATIC-ONLY until device | noted |
| failure-injection | timeouts, retries, rollback, no-mutation | unit + E2E negatives | CI |

## The unified financial-operation E2E pattern

Every financial operation (transfer, refund, payout, payment session, QR pay)
must prove, against the deployed sandbox, the applicable steps of:

1. isolated, clearly-tagged fixture creation (e2e-tagged handles, nominal amounts)
2. explicit environment confirmation (sandbox host only; guarded opt-in)
3. authenticated actor identity
4. success-path execution
5. idempotency replay (no-op, same id)
6. incompatible idempotency reuse rejected
7. cross-tenant attempt rejected (non-enumerable 404)
8. unauthorized attempt rejected (401)
9. concurrent attempt serialized (advisory lock / FOR UPDATE)
10. rollback / no-mutation negative paths (balances intact)
11. ledger + balance verification
12. proof / receipt / history verification
13. audit verification
14. cleanup of removable fixtures
15. explicit handling of append-only evidence that cannot be deleted

Reference implementation: [`tools/e2e/transfer-sandbox-e2e.mjs`](../../tools/e2e/transfer-sandbox-e2e.mjs)
— guarded, sandbox-only, proves steps 1–13 for the consumer P2P transfer and
leaves balances exactly intact on every negative. Latest run evidence:
[`evidence/assurance/transfer-sandbox-e2e-20260704.json`](../../evidence/assurance/transfer-sandbox-e2e-20260704.json).

## What every material feature declares (in the manifest)

owner · environment applicability · protocol/operator authority · required test
IDs (unit/integration/e2e_sandbox/negative_security) · deployment_gate ·
expected side effects and non-side-effects (negatives) · cleanup behaviour ·
evidence location · launch_scope. Enforced by `tools/check-assurance-manifest.mjs`.

## Assurance command bundles

```bash
make assure-fast       # static + manifest + layout + unit (seconds; pre-commit)
make assure-full       # + real-DB + service tests (full local; = check-all + test-all)
make assure-sandbox    # deployed-sandbox E2E against sandbox-api.banzami.com
make assure-release    # release-readiness gate (in-scope capabilities clean)
make assure-inventory  # asset inventory + cleanup disposition check
```

## Merge / deploy gate — a change is blocked if

- required tests are missing, or a known test fails;
- environment wiring is inconsistent (Sandbox/Live status mismatch);
- the schema manifest drifts (migrate-and-verify rollout gate);
- a test/live credential boundary is violated;
- docs claim a capability without matching evidence;
- a new public route lacks authz + tenant-isolation + error-leak tests;
- a financial feature lacks real-DB **and** deployed-sandbox E2E coverage;
- the assurance manifest is stale or a material capability is unregistered.
