# 03 — Capability Registry specification

Version: 1.0
Status: Proposed (Phase A)

---

## 1. Decision: extend, do not create

The prompt proposed `validation/capabilities.yaml`. **This package recommends
against it**, and the reason is architectural, not stylistic.

Three capability-shaped registries already exist:

| Registry | Items | Governance | Purpose |
|---|---:|---|---|
| `quality/operator-assurance-manifest.yaml` | 24 | `make check-assurance`; doc generated from it | *Is this capability assured?* |
| `docs/validation/BANZAMI_IMPLEMENTATION_MATRIX.json` | 87 | CLAUDE.md §16 approval phrases | *Is this item validated?* |
| `quality/deployed-component-coverage.json` | — | `make check-component-coverage` | *Is this component deployed and covered?* |

CLAUDE.md §17 freezes governance primitives unless a concrete operational need
exists. The operational need here is real — the coverage invariant cannot be
evaluated today — but it is satisfied by **extending the assurance manifest**,
which already carries `implementation`, `api_surface`, `environments`, `tests`,
`evidence`, `deployment_gate` and `status`. A fourth registry would create the
parallel authority CLAUDE.md §19.2 forbids.

**Canonical location: `quality/operator-assurance-manifest.yaml`.**
Actor, Journey and Resource registries are new concepts with no existing home
and go to `quality/validation/` — see §5.

## 2. Required extensions to the manifest schema

The existing schema is close. Nine fields are added; nothing is removed.

```yaml
  - id: CAP-COLLECT-001            # existing, unchanged
    name: …
    owner: …
    public_status: …
    environments: { sandbox: bool, live: bool }
    authority: protocol | operator-extension | internal
    authority_ref: …
    implementation: [ … ]
    api_surface: [ … ]
    threat_category: …
    tests: { unit: [], integration: [], e2e_sandbox: [], negative_security: [] }
    deployment_gate: …
    cleanup_disposition: …
    evidence: [ … ]
    status: …

    # ─── ADDED BY THE VALIDATION LAB ──────────────────────────────────────
    validation_status: PASS | FAIL | NOT_IMPLEMENTED | EXTERNAL_DEPENDENCY |
                       OUT_OF_SCOPE | DEPRECATED
    ui_surfaces:                   # doc 26 — API-only proof is insufficient
      - app-banzami-web:/receive
      - banzadmin:/businesses
    journeys: [ S06-COL-001, S06-COL-002 ]     # the coverage invariant's edge
    actors_required: [ B01, C01, C02 ]
    depends_on: [ CAP-WALLET-001, CAP-PAY-002 ]  # doc 102 dependency graph
    financial_effects:             # doc 39 — what the ledger must show
      posts_ledger: true
      idempotent: true
      idempotency_scope: project | merchant | public-slug | none
    realtime_expectation: none | poll | sse | push
    external_dependency: null | { name: …, boundary: …, status: … }
    evidence_required: [ screenshot, trace, api, ledger, receipt ]
```

`validation_status` is deliberately distinct from the existing `status`.
`status` answers *has this been assured by the release programme*;
`validation_status` answers *did the last Validation Run prove it*. Collapsing
them would destroy the distinction between a Repair Run and a Golden Run.

## 3. Capability identity

Existing convention `CAP-<AREA>-<NNN>` is kept. The prompt's
`BUSINESS_COLLECTIONS` style is **rejected** — 24 capabilities and every piece
of evidence under `evidence/assurance/` already use `CAP-…`, and renaming them
would orphan the evidence trail for no gain.

New areas needed (none exist today): `CAP-BRP-*` (Business Receive Point),
`CAP-APPWEB-*`, `CAP-P2P-*`, `CAP-KYB-*`, `CAP-KYC-*`, `CAP-SETTLE-*`,
`CAP-DISPUTE-*`, `CAP-RISK-*`, `CAP-RECON-*`, `CAP-PRICING-*`,
`CAP-SELFSERVE-*`, `CAP-DELETE-*`, `CAP-REALTIME-*`, `CAP-HANDLE-*`,
`CAP-DOA-*`, `CAP-SITE-*`, `CAP-RAIL-*`.

## 4. Closing the drift asymmetry

`tools/check-assurance-manifest.mjs` today proves *declared ⊆ mounted*. The Lab
adds the other direction, *mounted ⊆ declared*:

```
for every externally reachable route in the four Go routers:
    it MUST be claimed by exactly one capability's api_surface
    …or by an explicit `unclassified_routes:` block carrying a reason
       and an owning milestone
otherwise → CAPABILITY_REGISTRY_DRIFT = FAIL
```

361 routes must be claimed. The `unclassified_routes` escape hatch exists so
this can be adopted incrementally without a 361-entry big bang — but it is
itself a reported number, and a Golden Run requires it to be empty.

## 5. New registries (no existing home)

```
quality/validation/
  actors.yaml       # doc 05 — persistent Validation Actors
  journeys.yaml     # doc 08 — the Journey Catalog
  suites.yaml       # suite taxonomy S00…S20+
  resources.yaml    # doc 10 — run-scoped resource classes + cleanup policy
```

`quality/` is already defined by CLAUDE.md §19.1 as "the canonical operator
assurance manifest … the single authoritative registry of capability status".
These files sit under that authority. Adding `quality/validation/` requires no
new top-level directory and therefore no §19.2 layout change.

Schemas: [`schemas/`](schemas/).

## 6. Traceability contract

```
implementation (file:line)  ──▶  capability_id  ──▶  journey_id  ──▶  evidence artifact
        │                             │                  │                   │
   grep-verifiable            manifest entry       journeys.yaml      evidence-manifest.json
                                                                       (+ SHA-256)
```

Every edge is machine-checkable, and the Lab checks all four:

1. every `implementation` path exists in the tree;
2. every capability's `journeys` resolve in `journeys.yaml`;
3. every journey's `capabilities` resolve in the manifest;
4. every journey's `evidence_required` appears in its run's Evidence Manifest.

## 7. What must not be recorded here

Secrets, credential values, actor PINs, TOTP seeds, session tokens. The
registries carry **references** only — see [06](06-auth-email-automation.md) §5.
