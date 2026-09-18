# 07 — BANZADMIN Validation Lab specification

Version: 1.0
Status: Proposed (Phase A) — no route, component or migration created.

---

## 1. Route and navigation

**Canonical route: `/validation`.** BANZADMIN uses single-segment,
domain-named routes (`/merchants`, `/businesses`, `/proofs`, `/settlements`,
`/reconciliation`, `/platform-mode`). `/validation-lab` would be the only
hyphenated compound in the information architecture.

Navigation: a **sixth section** in `apps/admin/components/layout/nav-config.ts`,
after *Preços e finanças*:

```ts
{
  section: 'Validação',
  items: [
    { href: '/validation',              label: 'Visão geral',   Icon: FlaskConical,
      roles: ['SUPER_ADMIN', 'OPERATIONS'] },
    { href: '/validation/capabilities', label: 'Capacidades',   Icon: ListChecks },
    { href: '/validation/journeys',     label: 'Percursos',     Icon: Route },
    { href: '/validation/runs',         label: 'Execuções',     Icon: PlayCircle,
      attentionKey: 'validation_failures' },
    { href: '/validation/actors',       label: 'Actores',       Icon: UsersRound },
    { href: '/validation/evidence',     label: 'Evidência',     Icon: FolderSearch },
    { href: '/validation/health',       label: 'Saúde',         Icon: HeartPulse },
  ],
}
```

Portuguese labels, matching the rest of the portal. The English product name
*Validation Lab* is used in documentation and in the page title; the sidebar
speaks the operator's language, as every other section does.

**The whole section is Sandbox-only.** BANZADMIN already defaults to SANDBOX
via `lib/admin-env.ts`; the Validation section is hidden entirely when the
active environment is LIVE — not merely disabled — because there is nothing
there to show.

## 2. Overview (`/validation`)

One question per tile: *can I trust the Sandbox right now?*

```
┌─ SANDBOX VALIDATION ───────────────────────────────────────────────────┐
│  Última execução completa   BZV-20260918-0001-0cdc05a2   há 6h  ✅      │
│  Última Golden Run          BZV-20260916-0003-8f21ac09   há 2d  ✅      │
│  Real-Live mutations        0                                   🔒      │
├────────────────────────────────────────────────────────────────────────┤
│  CAPACIDADES        70 total                                           │
│    PASS 58 · FAIL 2 · EXTERNAL 4 · NOT_IMPL 3 · DEPRECATED 3           │
│    ⛔ sem cobertura  0        ⛔ drift de registo  0                     │
├────────────────────────────────────────────────────────────────────────┤
│  REVISÕES   repo 0cdc05a2 (clean, == origin/main)   migração 0159      │
│    gateway b2bfedb5 · core 82283af0 · app 2fbdd20f · admin bc9080ec    │
│    ⚠ paridade de deploy: 3 componentes divergem da árvore              │
├────────────────────────────────────────────────────────────────────────┤
│  ORÇAMENTOS   volume agregado  ▓▓▓▓▓░░░░░  46.5 %  IRREVERSÍVEL  ⚠      │
│               fundos em circulação  ▓░░░░░░░░░  13.1 %  reversível     │
│               candidaturas 24 h  4/30    e-mail fixture  6/40          │
├────────────────────────────────────────────────────────────────────────┤
│  ACTORES 9/9 ✅   SDK npm 0.14.1 ✅   DOA ✅   verificador ✅            │
└────────────────────────────────────────────────────────────────────────┘
```

The budget row is the tile the owner will actually use. It is placed on the
overview because [19](19-gap-contradiction-report.md) VL-001 makes it the single
number that determines whether the Sandbox survives the programme.

## 3. Capabilities (`/validation/capabilities`)

Table over the extended assurance manifest. Columns: id, name, owner,
`implementation_status`, Sandbox, Live, `validation_status`, journeys, last
verified, SDK coverage, docs, external dependency.

Two filters carry the coverage invariant, and both are one click from the
overview: **sem cobertura** and **drift de registo**.

Detail view: implementation paths (linked to the repository), `api_surface`,
`depends_on` graph, every journey that covers it, last evidence, and the
history of its `validation_status`.

## 4. Journeys (`/validation/journeys`)

The Journey Catalog, grouped by suite. Per journey: id, suite, capabilities,
actors, preconditions, steps, surfaces, financial expectations, negative
assertions, required evidence, cleanup policy, dependencies, last result,
attempt count and flake history.

Read-only. Journeys are defined in `quality/validation/journeys.yaml` and
reviewed as code — not edited in a web form, because a journey definition is
executable truth.

## 5. Runs (`/validation/runs`) and evidence

List: run id, type, started/ended, verdict, capability roll-up, defects,
triggering identity (Claude, CI, operator), and revisions.

Run detail is a drill-down from *why is S06 PASS?* to the exact artifact:

```
Run → Suite → Journey → Step → Evidence artifact (SHA-256, redaction status)
```

Evidence viewer streams from object storage; large artifacts are never proxied
through the admin database. Access requires `validation.view_evidence`, and
every view is audited — evidence contains real financial detail about synthetic
actors, and the audit trail is what makes that acceptable.

## 6. Health (`/validation/health`) — the preflight

A Full Run must not start into a broken lab, and an infrastructure failure must
never be reported as a product failure. Health is the gate that separates them.

| Group | Checks |
|---|---|
| Actors | each actor authenticates; balance within pilot caps; not suspended |
| Credentials | every `secret://` reference resolves (existence only, never value) |
| Email | fixture budget remaining; Resend reachable; cooldowns clear |
| Services | `/health` + `/readyz` on all 8 components |
| Database | migration head == repository head; no drift |
| Deploy parity | `check-deploy-parity` clean — **extended to `app-frontend`** |
| Browser | pinned Chromium present (`app-web-browser-check`) |
| Camera | Y4M fixture generation works |
| Webhooks | sink reachable, `/admin/reset` works |
| SDK | npm `latest` == expected; pub.dev reachable |
| DOA | reachable; its Banzami binding resolves |
| Evidence | object storage writable |
| **Budgets** | aggregate volume, aggregate funds, application-submit, fixture email |

Verdict vocabulary is separate on purpose: `HEALTHY` / `DEGRADED` /
`UNHEALTHY`. An `UNHEALTHY` preflight **refuses to start** a Full Run rather
than producing failures that look like product defects.

## 7. Actors, Resources, Configuration

**Actors** — per actor: id, type, synthetic display name, handle, email where
applicable, environment, product ids (consumer/merchant/project/wallet), status,
auth-health, mailbox-health, balance summary, last run, owned resources.
Never a PIN, password, seed, session token or key.

**Resources** — everything journeys created, attributed to `run_id`, with
lifecycle state and cleanup disposition, so an operator can answer *what did
run X leave behind, and which of it is economic history that must stay?*
See [10](10-run-resource-retention.md).

**Configuration** — registry revisions in force, run-type policy, retention
classes, flake policy, concurrency lock. Changes are audited.

## 8. RBAC

Following the existing `Cap*` convention in
`services/admin-api/internal/auth/rbac.go` (38 capabilities today):

| Capability | Grants | Default roles |
|---|---|---|
| `CapValidationView` | overview, capabilities, journeys, runs | SUPER_ADMIN, OPERATIONS, READ_ONLY |
| `CapValidationRun` | start/cancel a run | SUPER_ADMIN, OPERATIONS |
| `CapValidationEvidence` | open evidence artifacts | SUPER_ADMIN, OPERATIONS |
| `CapValidationActors` | actor lifecycle + credential *references* | SUPER_ADMIN |
| `CapValidationConfig` | registries, retention, policy | SUPER_ADMIN |
| `CapValidationPublish` | authorise an SDK publication in a Repair Run | SUPER_ADMIN + **step-up** |

`CapValidationPublish` joins the `RequireStepUp` set, alongside repricing,
settlement and wallet credit. Publishing a package to a public registry is at
least as irreversible as those, and npm versions cannot be republished.

## 9. Audit

Every administrative action is written to `admin_audit_log` through the existing
`middleware.Audit`: actor lifecycle changes, credential-reference changes, run
start/cancel, configuration changes, evidence access and deletion, and SDK
publication.

**Manual result override is not offered.** If an operator could mark a journey
PASS, every PASS in the system would need a provenance check before it could be
trusted. Where a human genuinely verified something, it is recorded as
`EVIDENCE=MANUAL_USER_VERIFIED` on a distinct axis
([09](09-evidence-model.md) §6) — visibly, permanently, and never as automated
evidence.
