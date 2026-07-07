# Increment 2A — Disposable PostgreSQL Runtime Lab and Role Bootstrap

**Status:** Increment 2A (first runtime proof; local disposable lab only). **Version:** 1.0

> **Scope boundary.** This increment implements and executes a **local, disposable
> Docker validation laboratory** only. It is not a VM deployment, not the Banzami
> Sandbox, and not LIVE. It does not contact, inspect, modify or depend on the VM.
> No source bundle, push, merge, or remote change is part of this increment.

## Objective
Provide the first *runtime* evidence for the merged Blueprint contracts
(ADR-BLUEPRINT-001..004): the isolated-network / no-host-port model, the read-only
file secret interface, and the stable-owner / runtime / control-plane role model —
using a throwaway PostgreSQL 16 lab that is created, proven and destroyed
deterministically, twice, leaving zero residue.

## Lifecycle
```
static gates → docker availability → generated labelled disposable project
→ isolated pg16 startup (no host port) → protected local temp secrets
→ one-shot role bootstrap → role + network + no-host-port + secret-boundary checks
→ deterministic scoped teardown → zero-residue verification
```

Orchestrated by `infra/blueprint/lab/scripts/lab.sh` (fail-closed; identities
generated per run; uncontrolled env overrides cleared; cleanup limited to
current-run labelled resources).

## Role model proven at runtime
| Logical role       | LOGIN | Owns app schema/object | Admin caps | Notes |
|--------------------|:-----:|:----------------------:|:----------:|-------|
| stable schema owner | no   | yes                    | no         | `NOLOGIN`; owns synthetic schema + object |
| runtime application | yes  | no                     | no         | least privilege; cannot create role/db |
| control-plane       | yes  | no                     | no         | reserved; isolated from app schema |

The short-lived **migration role** is intentionally **not** created here — it
belongs to Increment 2D.

## Runtime validations (sanitised PASS/FAIL only)
PostgreSQL reachable only on the lab network · no host port published · single
isolated labelled lab network · digest-pinned image · secret file-mounted
read-only · secret value absent from inspectable env / compose config / logs ·
role attributes and ownership per contract · runtime role owns nothing and cannot
create roles/databases · zero residue after teardown · existing Blueprint / RT04E
/ secret-hygiene / repo-layout / Dockerfile-lint gates remain green.

## Explicitly unproven until later increments
- **2B** — migration-runner image build + SBOM/provenance proof.
- **2C** — disposable migration-test database applying the canonical migration set;
  migration level / checksum / drift / object-ownership verification.
- **2D** — short-lived migration role (create → act-through-owner → expire/remove)
  and least/most-privilege proof.
- **2E** — read-only secret-mount proof end-to-end for the migration runner;
  migration receipt single-use + advisory-lock runtime behaviour.
- **2F** — secret non-leak proof across the full migration path and controlled
  teardown; only then any Sandbox provisioning decision.

No Sandbox, LIVE, migration runner, migration role model or autonomous migration
execution is operationally validated by Increment 2A.
