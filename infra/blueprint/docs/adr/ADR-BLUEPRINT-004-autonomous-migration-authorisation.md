# ADR-BLUEPRINT-004 — Autonomous migration authorisation and receipt lifecycle

**Status:** Accepted (Increment 1.1 — contract + validation layer only; hard-disabled, non-deploying). **Version:** 1.0

## Context
The shipped RT04E `migration-only` mode requires a human at an interactive TTY to
enter the credential at a hidden prompt. That is correct for manual operation, but a
governed autonomous Sandbox path needs an explicit machine-checkable authorisation —
**without** faking a TTY, injecting a PTY, or automating a hidden prompt.

## Decision
Add a separately-governed mode **`sandbox-autonomous-migration-only`**
(`base/contracts/migration-controller.contract.json` + the controller script). It
replaces the human hidden-prompt with:

1. a **single-use authorisation record** — a root-protected, non-symlink, single-link
   regular file, bound to the source revision, the target (`banzami_staging`) and the
   canonical **migration-directory digest**, short-lived, atomically consumed
   (`issued → consumed`) before the migration starts, containing **no credential**;
2. the read-only file credential interface (ADR-BLUEPRINT-003);
3. all RT04E preconditions (clean checkout, no remotes, pinned full-SHA revision,
   unchanged approved service set, static + semantic checks, runner provenance,
   secret-file contract, no concurrent migration lock).

The mode **never** uses fake TTYs, PTY injection, `expect`, keyboard simulation or
hidden-input automation. The existing manual RT04E path is retained unchanged.

In **Increment 1** the controller is a hard-**disabled**, non-deploying contract +
validation layer: its precondition functions are unit-tested, but it performs no
migration and refuses to run outside a future approved Sandbox runtime boundary.

## Receipt lifecycle
Unchanged from the shipped RT04E model: `pending → consumed`/`expired`,
filesystem-authoritative, 30-minute freshness, single-use atomic consumption before
capture/build, sanitised content only (no secret), never cryptographically signed.

## Policy differences
- **Sandbox:** controlled autonomous execution, single authorised release record.
- **Live:** explicit separate approval, dual-control capability, maintenance window,
  verified backup/restore, immutable release attestation, **no** autonomous migration
  without explicit Live approval. Same controller implementation; only policy differs.
