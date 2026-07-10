# Banzami — Single Source of Truth (local repo & server)

Version: 1.0

> **Scope note.** Sanitised: contains no IPs, hostnames, SSH users, secrets, tokens, DB
> URLs or private paths beyond the two paths the operator has explicitly named (the single
> authorised local repository and the prohibited duplicate). Governs where Banzami source
> lives and how it reaches the server.

## The rule

- **The only authorised local Git working directory is `/Users/fm65/banzami`.**
- There must be **no** second Banzami Git checkout locally. In particular, **no
  `/Users/fm65/banzami-canonical`** and no other duplicate checkout.
- The Sandbox/production **server must not contain** Git checkouts, `.git` directories,
  GitHub credentials, deploy keys, repository history, or any `banzami-canonical` directory.
- Deployment is **initiated from `/Users/fm65/banzami`** using `./deploy.sh <service>`.
- The server **receives verified source bundles, not Git history**. Only bundle-derived,
  versioned release directories (without `.git`) and built runtime artifacts may exist on
  the server; see [BANZAMI_SANDBOX_DEPLOY_FLOW_SIMPLIFICATION.md](BANZAMI_SANDBOX_DEPLOY_FLOW_SIMPLIFICATION.md).
- Any `banzami-canonical` directory is **prohibited** and must be removed once uniqueness
  checks confirm it holds no unpushed work.

## Why

Duplicate checkouts (e.g. a parallel `banzami-canonical`) create ambiguity about which tree
is authoritative, risk divergent local commits, and make "what is deployed?" unanswerable.
A single local source of truth plus a bundle-only server (no `.git`, no credentials) keeps
the deploy chain auditable and the server credential-free.

## Enforcement

`./deploy.sh <service>` runs a **preflight guard before any action**. It refuses to run when:

- the Git worktree root basename is not exactly `banzami` (rejects `banzami-canonical` and
  any other duplicate), or
- the Git remote is not `banza-protocol/banzami`.

Refusal message:

```
ERROR: Wrong Banzami working directory. Use the single authorised local repository:
/Users/fm65/banzami. Do not use banzami-canonical or any duplicate checkout.
```

## Server posture

**Forbidden on the server:** Git clones · `.git` directories · `banzami-canonical` ·
repository history (including history-bearing bundle files kept as a source of truth) ·
GitHub credentials · deploy keys · any `git clone`/`git pull` based deployment path.

**Allowed on the server (runtime only):** verified source-bundle release directories
**without `.git`** · built Docker images · Docker volumes · runtime secrets mounted as
files · rollback release directories **without `.git`**.

If an actual Git checkout, `.git` directory or history bundle is found on the server, remove
it **only after** confirming it is **not the active runtime directory** and contains **no
unique unpushed work**. If either is uncertain, stop and treat it as a blocker for a
separate, approved maintenance window — never delete an active runtime tree or retained
incident-forensics evidence blindly, and never during an unrelated incident.

## Canonical facts

- Authorised local repository: `/Users/fm65/banzami` (remote `banza-protocol/banzami`).
- Prohibited duplicate: `/Users/fm65/banzami-canonical` (must not exist).
- Deploy entrypoint: `./deploy.sh <service>` from the authorised repository.
