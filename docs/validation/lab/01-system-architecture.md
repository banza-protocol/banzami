# 01 — Banzami Validation Lab: system architecture

Version: 1.0
Status: Proposed (Phase A)

---

## 1. What the Lab is

The Banzami Validation Lab is the **canonical autonomous functional validation
system for the deployed Banzami Sandbox**. Its product is not tests. Its product
is an *evidence-backed answer* to a fixed set of questions about the platform:

| Question | Answered by |
|---|---|
| What exists? | Capability Registry |
| What is implemented? | `implementation_status` per capability |
| What works? | Journey results bound to a Run |
| What does not work? | Defect records bound to a Run |
| What is not implemented? | `NOT_IMPLEMENTED` classification |
| What is blocked externally? | `EXTERNAL_DEPENDENCY` + dependency matrix |
| What has no acceptance coverage? | Coverage invariant (§4) |
| What is documented incorrectly? | Contract/docs gates |
| What is deployed? | Run Manifest, read from the runtime |
| What is verified in Sandbox? | Evidence Manifest |

## 2. What the Lab refuses to be

These are binding design constraints, each with a reason found in the audit.

**It is not a fourth registry.** `quality/operator-assurance-manifest.yaml`
(24 capabilities), `docs/validation/BANZAMI_IMPLEMENTATION_MATRIX.json`
(87 items) and `quality/deployed-component-coverage.json` already exist, each
with its own governance. CLAUDE.md §17 freezes governance primitives. The Lab
**extends the assurance manifest** and **consumes** the other two.

**It is not a second test estate.** The repository already contains 309 Rust
test functions, 1 242 Go test functions, 73 Flutter test files, 71 static
gates, 51 operator guards, 37 Phase-0 shell harnesses and 114 E2E `.mjs`
harnesses. The Lab *orchestrates* these and adds journeys only where the
coverage invariant proves a real gap.

**It is not a privileged bypass.** Validation Actors are ordinary Banzami
identities with no Core, authorization, ledger or pricing exception. The Lab's
only privilege is *administrative*: it may read evidence and manage actor
metadata. See [05](05-actor-spec.md) §4.

**It is not a Live validator.** Phase A targets Sandbox only. Real Live is not
provisioned. See [17](17-sandbox-vs-live-matrix.md).

## 3. Layered architecture

```
                      ┌──────────────────────────────────────┐
   OPERATOR SURFACE   │  BANZADMIN → Validation Lab          │  doc 07
                      │  (Sandbox-only, RBAC-gated, read-    │
                      │   mostly; run control + evidence)    │
                      └──────────────┬───────────────────────┘
                                     │  same engine, same registries
                      ┌──────────────┴───────────────────────┐
   CONTROL PLANE      │  validationctl / make targets        │  doc 11
                      │  Claude, CI and BANZADMIN all enter  │
                      │  HERE. No private path exists.       │
                      └──────────────┬───────────────────────┘
                                     │
        ┌────────────────────────────┼────────────────────────────┐
        │                            │                            │
┌───────┴────────┐         ┌─────────┴─────────┐        ┌─────────┴─────────┐
│  REGISTRIES    │         │   RUNNER          │        │  EVIDENCE         │
│                │         │                   │        │                   │
│ Capability     │         │ preflight/health  │        │ manifest + SHA256 │
│ Journey        │◀────────│ journey execution │───────▶│ redaction         │
│ Actor          │         │ verdict discipline│        │ object storage    │
│ Resource       │         │ repair loop       │        │ retention classes │
└───────┬────────┘         └─────────┬─────────┘        └───────────────────┘
        │  doc 03/08/05              │  doc 08/11                 doc 09/10
        │                            │
        │                  ┌─────────┴─────────┐
        │                  │  EXISTING TOOLING │   doc 18 — ORCHESTRATED,
        │                  │  114 e2e harnesses│   NOT REPLACED
        │                  │  71 static gates  │
        │                  │  37 phase0 suites │
        │                  └─────────┬─────────┘
        │                            │
        └────────────────────────────┼────────────────────────────┐
                                     ▼                            ▼
                        ┌────────────────────────┐   ┌────────────────────────┐
                        │  DEPLOYED SANDBOX      │   │  EXTERNAL              │
                        │  8 services, 361 ext.  │   │  npm · pub.dev         │
                        │  routes, 107 tables    │   │  Resend · DOA          │
                        └────────────────────────┘   └────────────────────────┘
```

## 4. The coverage invariant

The Lab's single load-bearing rule, and the reason it exists at all:

> **Every implemented, externally reachable capability must map to at least one
> Validation Journey.**

Three derived failures, all hard:

| Condition | Verdict |
|---|---|
| Implemented capability with no journey | `CAPABILITY_IMPLEMENTED_BUT_UNCOVERED` = FAIL |
| Runtime surface absent from the registry | `CAPABILITY_REGISTRY_DRIFT` = FAIL |
| Documentation claims an unsupported capability | `DOCUMENTED_BUT_NOT_IMPLEMENTED` = FAIL |

The third is exempt only when the capability carries an explicit
`deprecated` or `future` classification with a governance reference.

**The registry-drift arm is not hypothetical.** The current assurance check
passes while Collections runs live with 10 mounted gateway routes, 15 rows and
four applied migrations, and its manifest entry says `api_surface: none
(frozen)` / `status: blocked`. The existing gate verifies that *declared* routes
are mounted; it does not verify that *mounted* routes are declared. Closing
that asymmetry is the first concrete thing the Lab adds. See
[19](19-gap-contradiction-report.md) VL-004.

## 5. Result classification

One vocabulary, used at every level. `SKIPPED` is not in it.

| Status | Meaning | Requires |
|---|---|---|
| `PASS` | Executed and asserted | Evidence Manifest entry |
| `FAIL` | Executed, assertion failed | Evidence + defect record |
| `NOT_IMPLEMENTED` | Capability does not exist | Absence proof (no route/handler) |
| `EXTERNAL_DEPENDENCY` | Blocked outside the operator | Dependency matrix entry |
| `OUT_OF_SCOPE` | Deliberately outside this environment | Governance reference |
| `DEPRECATED` | Reachable but retired | Retirement reference + negative proof |

Roll-up is strict: a suite is `PASS` only if every journey in it is `PASS`,
`OUT_OF_SCOPE` or `DEPRECATED`. `EXTERNAL_DEPENDENCY` does not make a suite
fail, but it does prevent the suite from being described as *complete*, and
both numbers are reported.

## 6. Run types

| Run type | Product changes allowed | Certifies |
|---|---|---|
| `TARGETED` | no | the journeys it ran, nothing more |
| `REGRESSION` | no | the change-impact closure of a diff |
| `FULL_SANDBOX` | no | the whole universe, as executed |
| `REPAIR` | **yes** | nothing — it is a working run |
| `GOLDEN` | no, and any need for one voids it | the platform |

A Golden Run that requires *any* correction — source, contract, configuration,
documentation affecting executable truth, or a deploy — fails as certification.
The correction is made, and a **new** Golden Run starts from the beginning.

## 7. Boundaries the Lab must never cross

- No financial operation against real Live. `REAL_LIVE_TESTS_EXECUTED = 0` is an
  asserted output of every Run Manifest, not a convention.
- No write to `account_identity.identity_otp_codes` or any authentication
  record. Authentication is proven through the product's own door.
- No deletion of economically effective history. See
  [10](10-run-resource-retention.md) §3.
- No unredacted secret in any evidence artifact. An unredacted secret is a
  **defect of the Lab**, not of the product.
