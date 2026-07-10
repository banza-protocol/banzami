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

## VM/server Git-checkout inventory result — BLOCKER (deferred)

Read-only inventory found the server is **not yet compliant**: it contains legacy Git
checkouts (`.git` present), history-bearing bundle artifacts (git bundles), and a retained
**incident-forensics** area of retired checkouts. Their checked-out tips are all ancestors
of the current `origin/main` (no unique tip), and no GitHub credential files or deploy keys
were found. **However**, one of the checkouts is the **active runtime source of the
currently running Sandbox / Developer Platform stack**, and the forensics area appears to be
deliberately retained for investigating a prior infrastructure incident. Removing server
Git artifacts was therefore **not performed**:

```
BLOCKER — SERVER DIRECTORY MAY BE ACTIVE OR UNIQUE
```

Server cleanup is deferred to a **separate, approved maintenance window** so it does not
touch the active Developer Platform runtime or destroy retained forensics, and is not done
during the unrelated public-website incident. The bundle-based deploy flow already ensures
**new** deploys ship bundles without `.git`; the residual `.git` and bundle artifacts are
legacy from an earlier clone/bundle-unpack method.

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
service was touched. No deploy, publish, Docker command, database/migration, VM reset,
destructive prune, or DNS/certificate/SMTP change was performed. The public-website incident
was not acted upon under this task. Server state was left unchanged (read-only inventory
only).

## Final state

- `/Users/fm65/banzami` — exists; the single authorised local Banzami checkout.
- `/Users/fm65/banzami-canonical` — does not exist (locally).
- Server — Git artifacts remain pending an approved cleanup window (blocker recorded above);
  no server changes were made.
