# 23 — Architecture: control plane and execution plane

Version: 1.0
Status: **Canonical** (owner clarification, Phase B)
Supersedes the architecture sections of [01](01-system-architecture.md) and
[07](07-banzadmin-validation-studio.md) where they differ.

---

## 1. The canonical model

```
                     BANZAMI VALIDATION STUDIO
                              │
             ┌────────────────┴────────────────┐
             │                                 │
       CONTROL PLANE                    EXECUTION PLANE
             │                                 │
             ▼                                 ▼
     BANZADMIN /validation            apps/validation-studio
     (Validação)                              +
                                       validation tooling
                                              │
                            ┌─────────────────┼─────────────────┐
                            │                 │                 │
                          Browser            APIs              SDKs
                          QR/Camera          Core              DOA
                          Consumer           Finance           Webhooks
                          Business           Receipts          Email
                          BANZADMIN E2E      DB checks         Builds
```

| Layer | Is | Is not |
|---|---|---|
| BANZADMIN `/validation` | control + observability: start, watch, navigate, audit | the thing that runs Playwright, builds, or publishes |
| `apps/validation-studio` + tooling | the execution plane and its foundation | a public surface, or a second product |
| `www.banzami.com` | public product, developer and institutional content | **any** operational validation surface |

## 2. Why BANZADMIN is not the engine

A Validation Run takes tens of minutes to hours, launches browsers, drives a
fake camera, runs builds, and in a Repair Run deploys and publishes packages.
Binding that to an HTTP request, a browser tab or a frontend process means the
run dies when the tab closes and its state lives nowhere.

So BANZADMIN **must not** directly: launch Playwright · run Flutter tests · run
native builds · drive fake-camera infrastructure · publish SDKs · execute
shell-heavy validation · orchestrate financial E2E · receive long-running
webhook validation · run database validation jobs · manage repair runs in a
browser-process lifecycle.

**The execution engine owns durable run state.** BANZADMIN reads it.

`BANZADMIN_AS_LONG_RUNNING_TEST_ENGINE=0`.

## 3. Why there is no public Validation Studio surface

The Studio handles Validation Actor identities, internal account identifiers,
internal routes, database and migration state, deployed revisions,
security-isolation findings, configuration, secret references, quota controls,
run controls, raw evidence, Playwright traces, HAR files, internal logs, SDK
publication controls and financial test controls.

Every one of those belongs behind the administrative authentication and RBAC
boundary. Putting them on the public website would expand the public security
surface to host internal operations — a trade with no upside.

`PUBLIC_WEBSITE_OPERATIONAL_VALIDATION_ACCESS=0`.

A future, **separately approved** `www.banzami.com/assurance` page may publish a
sanitised, read-only digest (last approved Golden Run, high-level status,
validated capability count, SDK contract status, verifier status, an evidence
attestation reference). That is not the Validation Studio, and it is
**deferred** — not part of Phase B.

## 4. One engine, multiple control surfaces

```
ENGINE (one)      tools/validationctl.mjs, extending tools/e2e/run-assurance.mjs
REGISTRIES        quality/operator-assurance-manifest.yaml       (capabilities)
                  quality/validation/{actors,journeys,suites,resources}.yaml
                  quality/validation/unclassified-routes.yaml

CONTROL SURFACES  BANZADMIN /validation   → the control contract (§5)
                  apps/validation-studio  → matrix governance, execution-plane home
                  CLI                     → make validation-*
                  Claude                  → the same make targets
                  CI                      → the same make targets
```

No surface may implement its own journeys, its own runner, its own evidence
model or its own capability definitions. A BANZADMIN-specific journey and a
Claude-specific journey for the same capability would disagree exactly when it
matters, and nobody would know which was right.

Enforced by `make check-validation-engine`
([tools/check-validation-engine.mjs](../../../tools/check-validation-engine.mjs)).

## 5. Control contract

BANZADMIN talks to the engine through one narrow, typed contract — never
arbitrary shell:

| Operation | Purpose |
|---|---|
| `createRun(type, scope)` | start an allowed run |
| `getRun(id)` / `getRunStatus(id)` | observe state and progress |
| `cancelRun(id)` | cancel where safe |
| `listJourneys()` / `listSuites()` | catalog |
| `getCapabilityCoverage()` | the coverage invariant |
| `getHealth()` / `getActorHealth()` | preflight |
| `getRunManifest(id)` | revisions, flags, budgets, assertions |
| `getEvidenceIndex(runId)` | metadata and object-storage keys |
| `getDefects(runId)` | findings |

Two rules: **no arbitrary shell execution is exposed through BANZADMIN**, and a
run's lifecycle is never bound to the request that started it.

## 6. Deployment topology is deliberately not fixed

Whether `apps/validation-studio` runs as its own deployment, an internal
service, behind a BANZADMIN reverse proxy, or inside another internal
deployment is to be decided from repository and runtime evidence when the
engine actually needs to run somewhere. Phase B fixes the **logical** boundary
only:

```
BANZADMIN          = control plane
Validation Studio  = execution / validation system
```

Source-tree co-location is not required and must not be done for cosmetic
reasons. `apps/validation-studio` stays where it is; architectural separation is
worth keeping for security, process isolation, long-running execution, test
tooling, deployment, resource management and failure isolation.

## 7. Authentication, RBAC and the security boundary

Operator access reuses the **existing BANZADMIN identity and authorization
model** — no second operator authentication system. Dedicated permissions
follow the existing `Cap*` convention
(`services/admin-api/internal/auth/rbac.go`, 38 capabilities today):

| Capability | Grants | Default roles |
|---|---|---|
| `CapValidationView` | overview, capabilities, journeys, runs | SUPER_ADMIN, OPERATIONS, READ_ONLY |
| `CapValidationRun` | start / cancel a run | SUPER_ADMIN, OPERATIONS |
| `CapValidationEvidence` | open evidence artifacts | SUPER_ADMIN, OPERATIONS |
| `CapValidationActors` | actor lifecycle + credential *references* | SUPER_ADMIN |
| `CapValidationConfig` | registries, retention, policy | SUPER_ADMIN |
| `CapValidationPublish` | authorise an SDK publication in a Repair Run | SUPER_ADMIN + **step-up** |

MFA, session security, audit, environment separation, Sandbox-only controls and
secret isolation are preserved unchanged. Nothing about the Studio weakens
BANZADMIN to make automation easier.

## 8. Environment boundary

The Studio validates **Sandbox only**. No BANZADMIN control may enable real-Live
validation, financial mutation or provisioning — the `/validation` section is
hidden entirely (not merely disabled) when the active environment is LIVE.

```
REAL_LIVE_VALIDATION_CONTROL_EXPOSED = 0
REAL_LIVE_TESTS_EXECUTED             = 0
REAL_LIVE_FINANCIAL_MUTATIONS        = 0
REAL_LIVE_INFRASTRUCTURE_MUTATIONS   = 0
```

## 9. Validation Actors stay ordinary

BANZADMIN may *display* an actor's validation metadata. That metadata must never
alter Core authority, financial semantics, payment eligibility, ledger rules,
merchant policy or authorization. Enforced by the actor-leakage guard
([05](05-actor-spec.md) §4).

## 10. `apps/validation-studio` — audit before extending

Existing components, with their Phase B disposition:

| Component | Disposition | Why |
|---|---|---|
| `lib/matrix.ts` | **KEEP** | reads the implementation matrix — still the governance record |
| `lib/governance.ts` | **KEEP** | CLAUDE.md §16 approval phrases; a governance primitive, frozen |
| `lib/fingerprint.ts` | **KEEP** | the §16.6 fingerprint contract |
| `lib/readiness.ts` | **KEEP** | readiness scoring over matrix items |
| `lib/git.ts`, `actions/git.ts` | **KEEP** | diff + commit flow the approval gate needs |
| `components/Studio.tsx`, `ItemList`, `ItemEditor` | **KEEP** | working matrix-governance UI |
| `components/DiffModal`, `CommitModal` | **KEEP** | the two-phase §16.4 approval |
| `components/ReadinessDashboard` | **REUSE** | its presentation is the model for BANZADMIN's Overview |
| `app/studio/validation/page.tsx` | **KEEP** | local-only governance route |
| `README.md` | **REFACTORED** (B1) | was 3 months stale; now states the engine/control split |
| — | **NONE RETIRED** | nothing here is superseded by BANZADMIN's control plane |

The Studio governs the implementation matrix; BANZADMIN `/validation` controls
and observes runs. They answer different questions, which is why neither
replaces the other and no screen is duplicated.

## 11. Operator experience

```
BANZADMIN → Validação → Validation Studio
```

Not "leave BANZADMIN and visit a validation website". Whether the rendering is
native BANZADMIN UI, shared components or an authenticated internal
integration is an implementation detail, settled after the engine exists.
