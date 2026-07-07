# Banzami Blueprint — Disposable PostgreSQL Runtime Lab (Increment 2A)

**Status:** Increment 2A — first runtime proof of the merged Blueprint contracts. **Version:** 1.0

> **LOCAL · DISPOSABLE · SYNTHETIC · non-Sandbox · non-LIVE · non-production.**
> This lab is a throwaway local Docker validation laboratory. It is **not** a VM
> deployment, **not** the Banzami Sandbox, and **not** LIVE. It never contacts,
> inspects, modifies or depends on the VM. Every resource is created per-run,
> labelled `com.banzami.blueprint.lab`, and removed at teardown.

## What this increment proves (runtime)
- A disposable PostgreSQL **16** instance starts on an **isolated** per-run bridge
  network with **no host-published port** and scram auth (no `trust`).
- Credentials come only from **read-only mounted secret files** — never env values,
  argv, labels or image args. Temporary secrets are generated cryptographically
  **outside** the repo (`0700` dir, `0600` files) and removed at teardown.
- The three-role model holds at runtime: a **stable schema owner** (`NOLOGIN`,
  owns the synthetic schema/object), a **runtime application role** (`LOGIN`, no
  superuser/createdb/createrole/replication/bypass-RLS, owns nothing, cannot
  create roles or databases), and an isolated **control-plane role** (`LOGIN`,
  reserved, no app-schema access).
- Deterministic teardown leaves **zero** labelled residue, reproducibly.

## What this increment does NOT do
No migration-runner image build · no SQLx · no canonical migrations · no
short-lived migration role (Increment 2D) · no migration receipt · no advisory-lock
runtime test · no application services · no `banzami_staging` · no Sandbox/LIVE
provisioning · no VM contact · no bundle · no push/merge.

## Layout
```
infra/blueprint/lab/
  image.lock                 immutable postgres:16 digest pin
  docker-compose.lab.yml      disposable lab: postgres + one-shot bootstrap + verify jobs
  scripts/
    gen-lab-secrets.sh        CSPRNG temp secret generator (outside repo, 0700/0600)
    bootstrap-roles.sh        one-shot role bootstrap (runs in-container)
    verify-roles.sh           runtime role-model verifier (sanitised PASS/FAIL)
    lab.sh                    fail-closed orchestrator (up|verify|down|verify-clean|full)
infra/blueprint/contracts/lab-runtime.contract.json   the lab contract
infra/blueprint/validators/check-blueprint-lab.mjs     static gate (no Docker)
```

## Use
```bash
make check-blueprint-lab      # static gate (no Docker required)
make blueprint-lab-up         # generate secrets, start pg16, bootstrap roles
make blueprint-lab-verify     # role-model + isolation + no-host-port + secret-boundary
make blueprint-lab-down       # scoped teardown (this run's labelled resources + secrets)
make blueprint-lab-verify-clean  # zero-residue verification
```
`lab.sh full` runs the whole cycle (up → verify → down → verify-clean) with
trap-based cleanup, and is the form used for the reproducibility runs.

All control identifiers (Compose project, network, volume, secret root, db name)
are **generated internally per run**; uncontrolled environment overrides are
cleared. Cleanup only ever removes resources labelled by the current run — never
`docker system prune`, global volume/network prune, or an unscoped `down -v`.
