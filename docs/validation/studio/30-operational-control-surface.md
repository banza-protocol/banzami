# 30 — The Validation Studio operational control surface

Version: 1.0
Status: Built, deployed and proven. No Validation Run has been started.

---

## 1. What Phase C built

Phase B produced an engine, nine actors and a set of registries. It produced no
way to *operate* them: the only interface was a developer with a shell.

Phase C makes BANZADMIN `/validation` the canonical operational surface. Not a
second validation product — [23](23-architecture-control-and-execution.md) is
unchanged and enforced by `make check-validation-engine`:

```
ONE_VALIDATION_ENGINE=PASS              PARALLEL_VALIDATION_PLATFORM=0
BANZADMIN_AS_LONG_RUNNING_TEST_ENGINE=0 PUBLIC_WEBSITE_OPERATIONAL_VALIDATION_ACCESS=0
```

BANZADMIN prepares, describes and cancels. It does not execute a journey and
holds no long-running work — an admin request handler that runs a test suite is
an admin request handler that times out halfway through one, leaving a run whose
real state nobody knows.

## 2. Where each decision lives

The governing principle is that **no policy lives in a request handler or a
React component.**

| Decision | Lives in | Why there |
|---|---|---|
| What a run IS | `db/migrations/0160` | a state machine that lives only in the process currently writing is one crash away from being untrue |
| What a profile claims and may spend | `quality/validation/profiles.yaml` | a governance decision needs a diff and a reviewer, not a dropdown default |
| Who the actors are | `quality/validation/actors.yaml` | one registry, reviewed as code |
| The pilot limits | `core/compliance/src/pilot.rs` | the financial core owns financial truth |
| How volume is measured | `core/compliance/src/pilot_enforce.rs` | the engine that enforces a limit defines it |
| Whether the lab is fit | `admin-api` preflight | computed, never stored as an opinion |
| How any of it looks | `apps/admin` | presentation only, never authority |

The two generated files are the seam, and each is drift-guarded:

```
quality/validation/*.yaml  ─gen-validation-registry─▶  registry_gen.go
core/compliance/src/*.rs   ─gen-pilot-limits───────▶  pilot_gen.go
```

Compiled in rather than read from disk, so the deployed binary carries the exact
registry its revision was reviewed at. A registry read from a mounted path can
differ from the reviewed one — which is precisely the drift the Studio exists to
detect.

The pilot extraction is the one that matters most. A preflight that measured
headroom differently from the engine that enforces it would clear a run the
ledger then refuses halfway through: worse than no preflight at all.

## 3. The run state machine

```
PREPARING ──▶ PREFLIGHT_RUNNING ──▶ READY ──▶ QUEUED ──▶ RUNNING ──▶ COMPLETED
     │              │    │            │          │          │
     │              │    └▶ BLOCKED ──┘(re-preflight only)   │
     └──────────────┴─────┴───────────┴──────────┴───────────┴──▶ CANCELLED
                                                 └──────────────▶ ABANDONED
```

Four invariants, enforced by the database and mutation-proven by
`make check-validation-run-model`:

1. **Sandbox only.** A run against Live cannot be represented.
2. **One active run.** Two would spend the same budget and interleave in the
   same nine actors' balances.
3. **Legal transitions only**, and a terminal state is terminal.
4. **Append-only history**, with a non-cascading foreign key — so a Validation
   Run cannot be deleted at all.

A `COMPLETED` run has a verdict and no other state does. `BLOCKED` cannot be
queued; the only way forward is to preflight again.

## 4. The preflight

Separates an infrastructure fault from a product defect, so its vocabulary
(`HEALTHY` / `DEGRADED` / `UNHEALTHY`) shares no word with a run's (`PASS` /
`FAIL`).

**It costs nothing.** No authentication, no email, no submission, no money, no
row written. That is what lets an operator ask as often as they like without
spending the budget the answer is about — and it is proven structurally against
the source, because asserting afterwards that nothing changed cannot distinguish
"wrote nothing" from "wrote something idempotent".

Any `FAIL` is `UNHEALTHY`. Any `WARN` or `UNAVAILABLE` is `DEGRADED`. GOLDEN
requires `HEALTHY`; FULL accepts `DEGRADED` because discovering what a degraded
Sandbox does is part of what a FULL run is for. Nothing starts `UNHEALTHY`.

## 5. Evidence and provenance

Outcomes are `PLANNED · OBSERVED · ASSERTED · PASSED · FAILED · SKIPPED ·
UNAVAILABLE`. A journey that did not run is not a failure, and one whose
dependency was unreachable is not a product defect; collapsing those into FAIL
is how a validation system starts lying.

Evidence rows are a pointer plus a sha256, never inlined content: the admin
database is not an artifact store, and an artifact that fits in a column is an
artifact someone will paste.

Provenance is per component per run — which revision of each service the run
actually ran against — plus the pinned `profile_id`, `profile_version` and
`profile_digest`. Editing a profile afterwards cannot re-describe a run that
already happened.

## 6. Secrets

The Studio never holds a password, PIN, TOTP seed, recovery code, session
cookie, API key or invite token — not in the database, not in a DTO, not in a
log line.

An actor reports **which** credentials it holds, by name (`pin`, `totp_seed`),
because an operator needs to know that A01 has a TOTP seed registered. It
reports neither the value nor the `secret://` reference: identifying where a
secret lives is a service nobody needs and a hint an attacker would take.

Proven by `TestActor_NeverCarriesACredentialValue`, and visible in the deployed
response:

```json
{ "id": "A01", "type": "operator", "credential_names": ["password","recovery_codes","totp_seed"] }
```

## 7. Permissions

| Route | Capability | Step-up |
|---|---|---|
| `GET /admin/v1/validation/overview` `actors` `profiles` `preflight` `runs` `runs/{id}` | `validation.view` | — |
| `POST /admin/v1/validation/runs` (prepare) | `validation.run` | **yes** |
| `POST /admin/v1/validation/runs/{id}/cancel` | `validation.run` | — |

The preflight is a read and costs nothing, so it sits with `validation.view`.
Preparation spends nothing either, but it takes the Sandbox's one run slot and
names what will be spent — a lifted cookie must not be enough. Cancelling
deliberately has no step-up: a second factor between a human and the stop button
is a worse failure than the one it prevents.

| Role | view | run | evidence | config | publish |
|---|---|---|---|---|---|
| SUPER_ADMIN | ✓ | ✓ | ✓ | ✓ | ✓ (step-up) |
| OPERATIONS | ✓ | ✓ | ✓ | — | — |
| COMPLIANCE | ✓ | — | — | — | — |
| SUPPORT | ✓ | — | — | — | — |
| READ_ONLY | ✓ | — | — | — | — |

`SUPPORT` holding `validation.view` diverges from the Phase A proposal in
[07](07-banzadmin-validation-studio.md) §8, deliberately. SUPPORT already holds
every read capability READ_ONLY holds; denying this one would make it the only
role that can read payouts and disputes but cannot see whether the Sandbox is
up — which is the question a help desk is actually asked. Evidence stays behind
its own capability.

## 8. Nothing has been started

Stated as a guard rather than a sentence. `make check-validation-no-start`
fails if any non-test code path writes `QUEUED`, and refuses to pass vacuously
if `QUEUED` ever leaves the model:

```
VALIDATION_RUN_START_IMPLEMENTED=0
GOLDEN_RUN_EXECUTED=0
FULL_RUN_EXECUTED=0
```

When the execution plane is authorised, the change that adds a starter will fail
there, and whoever makes it will have to delete that check deliberately — which
is the amount of deliberation the decision deserves.

## 9. Remaining owner boundary

Migration 0160 has not been applied. It requires the controlled ceremony
([runbook](../../runbooks/validation-studio-migration-ceremony.md)), which is
owner-executed on the Sandbox host.

Until then the deployed Studio reports itself correctly rather than hiding it:
`studio.schema` is `UNAVAILABLE`, the verdict is `DEGRADED`, a GOLDEN run is
refused for the true reason, and the runs endpoints answer 503 instead of an
empty list — because "no runs" and "cannot tell you about runs" are different
answers and only one of them is safe to act on.
