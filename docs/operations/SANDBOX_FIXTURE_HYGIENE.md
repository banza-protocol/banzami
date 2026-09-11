# Sandbox fixture hygiene

Version: 1.0

The Public Sandbox holds the product's current state and nothing else. Tests
create what they use, prove it, and give all of it back. Owner decision
2026-09-11: nothing synthetic stays active — not in Banzami, not in DOA.

## How a harness stays clean

Every stateful harness under `tests/phase0/` follows CREATE → TEST → VERIFY →
CLEANUP → VERIFY CLEANUP, on success and on failure.

- **Its own tenant.** `tests/phase0/lib/synthetic-tenant.sh` builds a Workspace,
  a Project with a key, a Business with a derived @banza and a Wallet, bound the
  way Console Financial Setup binds them. No harness borrows DOA's Project or
  any other tenant (`tests/ops/fixture-suite-doa-tenant.test.mjs`).
- **Ownership by exact id.** `tests/phase0/lib/e2e-run.sh` records everything a
  run creates the moment it exists (`e2e_own <kind> <id> [owner]`) and retires
  exactly those objects from a trap on EXIT/INT/TERM.
- **Money goes back.** Retiring a Business retires the value of its segregated
  accounts and closes them, then retires its primary balance; retiring a
  consumer retires its balance. The value returns to the Sandbox funding source
  through a balanced posting (`POST /internal/v1/sandbox/retire-funds`), so a run
  leaves the pilot funding cap where it found it.
- **Proof of the model:** `tests/phase0/synthetic-tenant-selftest.sh` builds a
  tenant, uses it, and checks that after cleanup its key is revoked, its project
  archived, its session cancelled, its account closed and its Business suspended.

Integration tests **of DOA itself** carry `# REFERENCE_APPLICATION_DOA` and run
only with `BANZAMI_ALLOW_DOA_TENANT_WRITES=1`.

## Sweeping what is already there

`tools/ops/retire-synthetic-residue.sh` (dry run by default; `--apply` changes):

- selects **positively** — a harness name shape, a true test email domain
  (`synthetic.test`, `banzami-e2e.test`, …), or a binding to a harness project.
  Never the Console's `projects.banzami.test` domain, which every Console
  Business carries (RA-097). DOA's workspaces are excluded as a whole;
- changes nothing itself: every step is a canonical operator call — payout fail,
  link cancel, session cancel, fund retirement, account close, key revoke,
  webhook deactivate, project retire, Business/consumer suspend;
- prints BEFORE/AFTER counts and the survivors, so a wrong pattern leaves a
  fixture alive rather than touching a real account.

`tools/ops/retire-stale-doa-tenant-state.sh` retires DOA-related state that is
not DOA's current canonical state, by exact id. `--doa-campaigns-ended` covers the
four campaign accounts behind campaigns DOA's own datastore still shows, and is
run only after DOA has ended them.

In DOA's datastores, `scripts/e2e/prune-e2e-state.mjs` removes what DOA's
journeys left, and `scripts/e2e/retire-fixture-authority.mjs` demotes and bars
suite identities that financial history holds. DOA's financial history comes out
only through its sanctioned `scripts/ops/launch-reset.mjs`.

## What is never done

- No row is written or deleted by hand; no Sandbox reset script; no bulk
  deletion by name pattern.
- The ledger and the audit log keep every entry. Retirement is a new posting.
- Real accounts (`fm65`, `oxfannio`, `priscila`, DOA's operational tenant) are
  never a destination for synthetic value and never selected.
- Old sweeps that mutate by SQL (`prune-fixture-authority.sh --apply`,
  `sweep-console-fixtures.mjs`, `tools/e2e/console/lib/run-cleanup.mjs`) are not
  used.
