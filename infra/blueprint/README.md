# Banzami Environment Blueprint

**Status:** Increment 1 — source foundation (reviewable; non-deploying). **Version:** 1.0

One shared, immutable logical architecture, instantiated per environment as an
isolated **profile**. Sandbox is the first instance; **Live** is a structurally
valid but **unprovisioned** profile that will later be deployed in a *separate*
infrastructure boundary. Sandbox and Live never share hosts, networks, databases,
volumes, secrets, credentials, receipts, authorisations, rollback anchors, logs,
backups, domains or external-integration bindings.

## Layout
```
infra/blueprint/
  base/                     shared contracts only (no secrets, no endpoints)
    blueprint.contract.json   the shared logical model + overridable/never-share sets
    contracts/                database-roles · secret-interface · receipt-lifecycle ·
                              service-topology · migration-runner · migration-controller
  profiles/
    sandbox/profile.json      Sandbox-specific NON-secret bindings (provisioned)
    live/profile.json         Live profile — structurally valid, UNPROVISIONED
  migration-runner/         immutable multi-stage runner image + read-only-file entrypoint
  migration-controller/     autonomous mode contract + validation layer (DISABLED here)
  validators/               executable static validators (make check-blueprint)
  docs/                     ADRs + operator lifecycle
```

## What this increment does / does not do
- **Does:** define the shared contracts, both profiles, the immutable migration-runner
  image definition, the autonomous migration-controller contract + validation layer,
  executable validators, and documentation — all as reviewable source on a branch.
- **Does not:** modify the VM, build/run images, run migrations, provision databases
  or secrets, deploy services, merge to `main`, bundle, or promote source. The
  autonomous controller is hard-disabled and performs no migration.

## Validate
```bash
make check-blueprint      # blueprint checks 1-13
```

The migration receipt lifecycle, hermetic Compose wrapper, immutable image tags,
provenance-before-health and application-rollback semantics are the **shipped RT04E**
model (`infra/deployment/rt04e-*`, `tools/rt04e-*`); this Blueprint references and
reuses them rather than re-implementing them.
