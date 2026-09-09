# Assurance evidence — who owns it, and where it goes

Version: 1.0

## The rule

    release input        tracked source, tests, static fixtures, expectations
    verification output  generated evidence about ONE deployed revision,
                         written OUTSIDE the worktree

Generated runtime evidence must never modify tracked source.

## Why this is a rule and not a preference

The canonical post-deploy golden journey used to write its result to a fixed
path inside the repository: `evidence/assurance/golden/developer-golden-journey.json`.

That made the release invariant unsatisfiable by any sequence of actions:

    run the canonical verification
      → the tracked tree is dirty
      → commit the evidence to clean it
      → HEAD moves, so the verified revision is no longer the head
      → verify again
      → dirty again

It is not a papercut, it is a category error. A post-deploy suite observes a
runtime; its output is a fact *about* a revision and cannot be part of that
revision. Committing it produces an artifact describing a commit that has
already stopped being current.

## How a harness persists a result

`tools/e2e/lib/assurance-output.mjs` owns the destination:

```js
import { writeAssuranceResult } from '../lib/assurance-output.mjs';

const { file, verdict } = writeAssuranceResult({
  suiteSlug: 'my-suite', suite: 'HUMAN NAME',
  runtime_sha, pass, fail, blocked, simulated,
  started_at, payload: { /* suite-specific detail */ },
});
process.exit(verdict === 'PASS' ? 0 : 1);
```

Destination, in order:

1. `EVIDENCE_OUT_DIR` — explicit, wins over everything
2. `BANZAMI_ASSURANCE_ROOT/<sha>/<suite>`
3. `<tmpdir>/banzami-assurance/<sha>/<suite>` — the default

**The default is outside the tree on purpose.** A harness that defaulted into
`evidence/` and had to be told otherwise would put the burden on whoever runs
it, and a release ceremony is exactly when that is forgotten. Writing into the
repository now has to be asked for by name, and
`tests/ops/assurance-tree-cleanliness.test.sh` fails if anything does.

The revision is part of the path, so two runs against two runtimes cannot
overwrite each other — the other half of the same mistake.

## Reading a verdict

Never from prose. A release check once classified four passing suites as
failures by grepping output for `PASS|FAIL`, because every passing suite prints
`FAIL=0` — the substring is the label of the zero.

Trust, in order:

1. **process exit status** — `0` all required assertions passed, `1` at least
   one failed, `3` a required assertion could not run (blocked)
2. **the machine-readable result** — `banzami-assurance-result/v1`
3. **an anchored summary parse** — `tools/e2e/lib/parse-suite-summary.mjs`, for
   suites whose contract is still textual

An unparseable suite is `UNKNOWN`. Never `PASS`.

`node tools/e2e/run-assurance.mjs` runs the canonical post-deploy set this way
and writes one combined artifact.

## What stays in Git

Test definitions, schemas, static fixtures, guards, documentation.

The 110 evidence files already tracked under `evidence/` remain as historical
records. Nothing rewrites them any more.

## Guards

| guard | what it catches |
|---|---|
| `tests/ops/assurance-tree-cleanliness.test.sh` | a harness writing into the worktree; an evidence dir resolving inside it; a suite that dirties the tree |
| `tests/ops/suite-summary-parsing.test.mjs` | `FAIL=0` read as a failure; a verdict inferred from prose; a vacuous pass; blocked counted as passed |

Both are mutation-proven: reintroduce the old behaviour and they fail for the
right reason.

## Durability — /tmp is execution space, not authority

The harnesses write to `<tmpdir>/banzami-assurance/<sha>/`. That is correct as a
workspace and wrong as a system of record: temp is swept by the OS, and evidence
that disappears on reboot cannot support a release claim made a week later.

So publication is a second, distinct step:

```bash
node tools/release/publish-assurance.mjs --sha <full-sha>
```

It copies every file into `$BANZAMI_ASSURANCE_STORE` (default
`~/.banzami/assurance/<sha>/`), **re-reads each one at the destination and
compares checksums** — a copy that reports success and lands truncated is
precisely what a full disk produces — and writes an `index.json` carrying the
candidate SHA, the per-suite verdicts, and the totals for `simulated` and
`blocked` so a non-zero count cannot hide inside a file.

It never deletes the workspace, so a failed publish cannot destroy the only copy.
`proveDurable()` asserts the destination is outside both the repository and temp.

## Capacity — fail before the build, not inside it

```bash
make release-preflight     # runs automatically before sandbox-release-package
```

Checks free capacity and whether the Docker daemon actually answers, then lists
regenerable consumers largest-first if it fails.

**The threshold is measured, not chosen.** Two observations bound it: a full
release package build starting with 13 GiB free completed; one starting with
≈2.3 GiB free died with ENOSPC. The floor sits inside that interval. After the
first build completed under `recordBuildConsumption()`, the requirement becomes
that measurement × 1.25 — the number calibrates itself out of the guess.

Measured artefact sizes, for classification: one source bundle ≈92 MiB; one
release package directory ≈770 MiB.

### Cleanup

Only regenerable build products are ever candidates. **Never** deleted:

    */banzami-source-deploy/*.manifest.json    the bundle → full source SHA chain
    */banzami-source-deploy/*.receipt.txt      deploy receipts
    <assurance store>/**                       published evidence
    /run/secrets/**, databases, runtime state, deployed images

A cleanup must never destroy the chain that proves *bundle → full source SHA →
deployed runtime*. `tests/ops/release-preflight.test.mjs` asserts the classifier
cannot select any of them.

## Not acceptable

Reverting evidence after a run · `git checkout --` after each suite ·
tolerating a dirty tree · committing generated evidence on every verification ·
a broad `.gitignore` that hides the mutation · excluding post-deploy evidence
from the cleanliness check.

Each of those hides the defect. The fix is to give the evidence an owner.
