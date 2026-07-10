# Single Source of Truth — Cleanup Evidence

Version: 1.0

> **Scope note.** Sanitised: no IPs, hostnames, SSH users, secrets, tokens, DB URLs, raw
> command output, private endpoints or private paths beyond the two paths the operator has
> explicitly named (the authorised local repository and the prohibited duplicate). Internal
> operations record only.

## Why cleanup was required

A second local Banzami Git checkout (`/Users/fm65/banzami-canonical`) existed alongside the
authorised repository (`/Users/fm65/banzami`), creating ambiguity about the source of truth
and the risk of divergent local work. The operator mandated a single authorised local
working directory and a server that holds no Git checkout, `.git`, credentials, deploy keys
or repository history.

## Local duplicate inventory result

- **Authorised repo** `/Users/fm65/banzami`: Git worktree, remote `banza-protocol/banzami`,
  branch `main`, clean, no untracked files. Its `main` was stale and was fast-forwarded to
  the current `origin/main` before any removal.
- **Duplicate** `/Users/fm65/banzami-canonical`: Git worktree, same remote, clean, no
  untracked files, no stashes. **Uniqueness check: zero commits reachable locally but absent
  from the remote** (all local branches were fully pushed; only reproducible build artifacts
  — dependency and build-output directories — were present as ignored files). Verdict:
  **fully redundant, no unique work.**
- No other Banzami duplicate checkouts under the operator home. (The separate `banza` and
  `banzai` repositories are different projects, not Banzami duplicates.)

## banzami-canonical removal result

Removed via the safe flow: (1) moved to a quarantine path in the same parent; (2) confirmed
the authorised repo still functions and is clean; (3) confirmed no active shell or script
references the quarantine; (4) deleted the quarantine definitively. **Final: the duplicate
no longer exists.**

## Canonical repo confirmation

`/Users/fm65/banzami` exists, is the **only** authorised local Banzami Git checkout, remote
is `banza-protocol/banzami`, branch `main` at the current `origin/main`, clean worktree,
`origin/main` reachable.

## Server legacy directory classification

Read-only inventory classified every legacy Banzami directory (sanitised labels):

- **build-context** — production build source with a stale `.git` (production stack was
  down; **not** bind-mounted into any container). → `BUILD_CONTEXT_ONLY`.
- **active-runtime-source** — the release source tree whose working files include the
  compose file of the running Sandbox / Developer Platform project. Verified **not**
  bind-mounted into any container (container mounts are runtime secret files only), so its
  `.git` could be removed without touching the running stack. → `ACTIVE_RUNTIME_SOURCE`.
- **forensics-area** — a retained archive of retired source checkouts (each with `.git`),
  full-history git bundles, and `banzami-canonical` import bundles. → `FORENSICS_ARCHIVE`.

## Unique work check — PASS (no unique work)

All server checkouts were clean (no uncommitted or untracked changes). Every commit across
all their refs/HEADs/stashes was verified present in the authorised source of truth and an
ancestor of `origin/main`. Every commit inside the history bundles was likewise verified
present in the authorised local repository (the older, non-ancestor tips are early
pre-history-rewrite bootstrap commits, still reachable from a local ref). **Zero unique
unpushed work existed on the server** — removal could lose nothing not already in the
source of truth. No GitHub credential files, `gh` config or deploy keys were present.

## Server cleanup actions taken — COMPLETE

Filesystem-only removals (no Docker command, no container/service/compose touched, no
deploy, no prune):

- removed the two legacy `.git` directories (build context + active release source),
  **preserving the working trees** — the running Sandbox stack stayed healthy throughout
  (6/6 containers healthy, verified after each stage);
- removed the release history bundle;
- removed the `banzami-canonical` import bundles (and manifests);
- removed all git-bearing forensics material (retired source checkouts, `.git`
  directories, full-history bundles) and replaced it with a **sanitised note** recording
  that forensics is retained without repository history, without `.git` and without
  secrets.

The previously recorded blocker (`SERVER DIRECTORY MAY BE ACTIVE OR UNIQUE`) is **resolved**:
uniqueness was disproven and the active runtime was shown not to depend on any `.git`.

## Script guard result

`deploy.sh` now runs a preflight guard **before any routing or action**: it refuses to run
when the worktree root basename is not exactly `banzami` (explicitly rejecting
`banzami-canonical`) or when the Git remote is not `banza-protocol/banzami`, with a clear
error directing the operator to `/Users/fm65/banzami`. Verified: passes from the authorised
repo; refuses from a `banzami-canonical`-named directory and from a wrong-basename directory.

## Documentation updated

- New: `docs/infra/BANZAMI_SINGLE_SOURCE_OF_TRUTH.md`.
- Updated: `docs/infra/BANZAMI_SANDBOX_INFRASTRUCTURE_RUNBOOK.md`,
  `docs/infra/BANZAMI_SANDBOX_DEPLOY_FLOW_SIMPLIFICATION.md`,
  `docs/infra/BANZAMI_SERVER_MIGRATION_CHECKLIST.md`.

## Services not touched

No Production, Sandbox payment, admin, gateway, API, checkout, pay or Developer Platform
**service** was touched. No deploy, publish, Docker command, database/migration, VM reset,
destructive prune, or DNS/certificate/SMTP change was performed. The public-website incident
was not acted upon under this task. Server changes were **filesystem-only** (removing Git
metadata, history bundles and duplicated source); the running Sandbox / Developer Platform
containers were left running and healthy throughout (verified read-only after each stage).

## Final state

- `/Users/fm65/banzami` — exists; the single authorised local Banzami checkout.
- `/Users/fm65/banzami-canonical` — does not exist (locally).
- **Server — compliant:** no Banzami `.git` directory, no `banzami-canonical`, no Git
  checkout, no repository history, no git-bundle artifacts, no GitHub credentials or deploy
  keys, no git clone/pull deployment path. Only allowed runtime residue remains: the release
  source tree **without `.git`**, built Docker images/volumes, and runtime secret files. A
  sanitised forensics note remains (no history, no `.git`, no secrets).
