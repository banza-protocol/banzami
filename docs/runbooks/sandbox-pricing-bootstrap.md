# Sandbox pricing — where the canonical state comes from

**Version:** 1.0

The Sandbox pricing matrix is not configured by hand and is not restored from a
backup. It is created by migrations, on a database that starts empty:

| profile | SETTLEMENT | PAYOUT |
| --- | --- | --- |
| `sandbox-default` | 0 bps | 75 bps |
| `sandbox-reference` | 200 bps | 75 bps |

`db/migrations/0106_pricing_model.sql` builds the schema; `0107_canonical_pricing_matrix.sql`
seeds exactly those two profiles and four rules. Nothing else seeds a profile or
a rule, so "what is the Sandbox priced at" has one answer and it is in the
repository.

---

## Checking it

```bash
node tools/check-pricing-assignment.mjs
```

Every assigned profile must have exactly one enabled, open rule for **both**
SETTLEMENT and PAYOUT. Anything else fails: a missing rule is a refusal waiting
to happen at settlement or payout time, and a duplicate is a refusal too.

```bash
DATABASE_URL=postgres://…/postgres tools/ci/fresh-migration-check.sh
```

Replays `0001 → latest` into a database created for the purpose and throws it
away. This runs on every economic-gate build; run it locally when you touch a
migration.

---

## When the completeness gate fails

**An owner has no profile.** Assign one. Profile assignment is operator
authority — there is no request field, SDK parameter or console control that
sets it, deliberately.

```bash
node tools/ops/assign-pricing-profiles.mjs
```

**A profile has no rule for an operation.** Write the rule. Do not "fix" it by
making the resolver fall back: a missing rule is not a fee of zero, and the two
being the same number is the reason this model exists.

**A profile has two applicable rules.** The database allows at most one enabled,
open-ended rule per (environment, profile, operation), so this can only be an
open rule overlapping a still-current dated one. Close one of the windows. The
runtime refuses in the meantime rather than choosing.

---

## Rebuilding the Sandbox database

The pre-release Sandbox is disposable. If its schema has drifted, the answer is
to rebuild it, not to reconcile it — a reconciled database is one whose state
cannot be reproduced from source, which is how the drift happened.

**The only sanctioned path** is the blueprint adapter. It binds the target to
the generated Sandbox project's own network and secrets, so it cannot reach a
database that merely shares the name:

```bash
infra/blueprint/sandbox-ops/scripts/sandbox-migration.sh apply
```

It needs a **git checkout** at the release revision (it creates a `git bundle`),
the blueprint state under `TMPDIR`, and a release package built from that same
revision. Its own header says the rest: *"the ONLY controlled path that migrates
banzami_staging … never the legacy RT04E path"*.

Do not use `docs/operations/RT04E_*`. Those describe the rollout of migration
`0100` and are kept as a record; they identify their target by database name,
and two clusters on this host held a database with the same name.

Do not use `psql` to apply migrations. That is what produced the 0090–0095
history drift, and `tools/sqlx-backfill.sh` is disabled because of it.

---

## Why a name is not an identity

`tools/migrate-and-verify.sh` refuses a target whose stored cluster identity
disagrees with the cluster it is reached in, and refuses a populated database
that carries no identity at all. Both refusals exist because a runbook once
pointed at a disused instance that shared the name of the real one, and every
check in the path compared the name.
