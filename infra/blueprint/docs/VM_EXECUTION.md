# Gated Same-VM Execution Adapter

Version: 1.0

The **only** sanctioned path for VM-side operations in the Banzami Environment
Blueprint. It performs a verified transfer, a manifest-scoped legacy reset, a
fresh internal Sandbox bootstrap, a controlled `banzami_staging` migration and a
provenance-first deployment of the four approved services — each fail-closed,
plan-by-default and with sanitised evidence.

All bootstrap / migration / deployment logic **reuses the already-merged,
already-validated local Sandbox adapters** (`infra/blueprint/sandbox-ops/`),
executed on the VM against the VM's own Docker. This adapter adds only the thin,
gated remote-orchestration and the legacy-reset layer.

## Safety model

- **No VM target in source.** The SSH destination and remote root are read only
  from the runtime environment (`BZVM_SSH_TARGET`, `BZVM_REMOTE_ROOT`), supplied
  by the operator's own SSH context. They are never committed, printed or
  persisted. The static gate `check-vm-execution-adapter` fails on any IPv4
  literal, hostname, SSH key, credentialed URL or literal `ssh` target in source.
- **Plan by default.** Every mutating subcommand requires BOTH an explicit
  `--apply` flag AND a per-execution authorisation file (`BZVM_AUTH_FILE`) whose
  scope matches the action. Without them, apply refuses.
- **Manifest-scoped deletion only.** The reset builds a manifest from a read-only
  inventory, classifying each resource as `IN` (positively Banzami/BANZA/BanzAI
  affiliated) or `EXCLUDED` (`UNRELATED` / `AMBIGUOUS`). Only `IN` resources are
  deleted, one scoped `docker rm|volume rm|network rm|image rm` per resource.
  **No `prune`, no unscoped or global deletion** can ever be generated; the plan
  is re-scrubbed for prune/unscoped tokens before execution.
- **Fail-closed target handling.** `remote()` / `xfer()` require a runtime target
  before any contact; even a fully-authorised apply cannot proceed without one.
- **Sanitised evidence.** The adapter records categories and counts only — never
  ids, names, paths, hosts or secrets.

## Runtime inputs (never committed)

| Variable | Purpose |
|----------|---------|
| `BZVM_SSH_TARGET`   | SSH destination (alias or `user@host`) from the operator's SSH context |
| `BZVM_REMOTE_ROOT`  | Remote staging/work root on the VM |
| `BZVM_AUTH_FILE`    | Per-execution authorisation file for `--apply` (see below) |

The authorisation file is a local KEY=VALUE file:

```
BZVM_APPLY=yes
BZVM_APPLY_SCOPE=all        # or a single scope: legacy-reset | release-transfer | sandbox-bootstrap | sandbox-migration | sandbox-deploy
```

## Local validation (no VM)

```bash
make check-vm-execution-adapter   # static gate
make vm-execution-test            # synthetic-fixture classification + guard tests
```

`vm-execution-test` proves — offline — that the family is selected (including old
LIVE/staging/settlement Banzami resources), unrelated and ambiguous workloads are
excluded, delete plans are scoped-only, apply is refused without flag/authz, and
an authorised apply still fails closed without a runtime target.

## Phase 5 runbook (operator supplies the target at runtime)

```bash
export BZVM_SSH_TARGET=...        # from your SSH context — not committed, not printed
export BZVM_REMOTE_ROOT=...

make vm-execution-preflight
make vm-release-transfer-plan
make vm-release-transfer-apply          # transfer + materialise source tree + VM release state

make vm-dry-run                         # non-destructive rebuild proof in a TEMP project (legacy untouched)

make vm-legacy-reset-plan               # sanitised manifest preview
make vm-legacy-reset-apply              # irreversible, manifest-scoped — REFUSED unless vm-dry-run passed

make vm-sandbox-bootstrap-apply
make vm-sandbox-migration-apply
make vm-sandbox-deploy-apply
make vm-sandbox-final-verify
```

The `vm-release-transfer-apply` step also materialises the canonical source tree on
the VM from the transferred git bundle (revision-verified) and the VM-local release
state the reused Sandbox adapters read. `vm-dry-run` reuses the merged rehearsal
harness (bootstrap → migrate → deploy → verify → teardown) in a temporary isolated
project and writes a marker; the legacy reset fails closed unless that marker exists,
so the irreversible wipe can never precede a proven-good rebuild.

## Scope

Deploys exactly and only `core-api-staging`, `api-gateway-staging`,
`developer-api`, `public-api-staging`. Never provisions LIVE, Production,
real-money rails, external payment providers, public routes, DNS, certificates or
SMTP. Preserves the OS, SSH access, authorised keys, Docker Engine and any
confirmed unrelated non-Banzami workload.
