# 13 — DOA validation plan

Version: 1.0
Governing principle: **DOA is an ordinary external integrator, and the Lab's job
is to keep proving it.**

---

## 1. What DOA is, in Banzami terms

DOA is an independent donation application with its own repository, its own
Supabase-backed identity and its own product surfaces. Against Banzami it is
exactly one thing: **a Developer Project bound to a Business**.

| DOA's Banzami footprint | Value (Sandbox, 2026-09-18) |
|---|---|
| Business | `Sandbox · Doa-Sandbox`, `255afb6c-0f19-4867-9b96-28108ce416c9`, ACTIVE |
| Handle | `@doa` (`handle_registry`, owner_type MERCHANT) |
| Business account type | `APPLICATION` |
| Developer Project | the single ACTIVE project |
| Binding | one ACTIVE, sealed (ADR-055); the superseded one is DISABLED, not erased |
| Wallet accounts | segregated per campaign (ADR-042) |

DOA's production runs against the **Banzami Sandbox** — live donation data,
sandbox payments. That is deliberate and recorded; nothing in this plan should
be read as DOA having a Live Banzami rail.

## 2. The isolation invariant, and why it currently holds

```
DOA_SPECIAL_BANZAMI_TENANT_BEHAVIOR = 0
```

Audited at `0cdc05a2`: every occurrence of `doa`, `@doa`, `Doa-Sandbox` and the
canonical DOA identifiers across `services/**` and `core/**` is either

- a **comment** explaining a bug DOA once surfaced (receipt payee semantics,
  integration-health handle mismatch, campaign account routing), or
- a **`_test.go` fixture name**.

There is **no executable branch on a DOA identifier**. DOA is served by the same
generic primitives every integrator gets: `APPLICATION` business account type,
sealed project binding, segregated wallet accounts, application settlements,
webhooks.

The Lab keeps this true with a guard, not a hope:

```
grep for DOA identifiers in services/**, core/**, apps/** excluding *_test*
  → any hit is DOA_SPECIAL_TENANT_BEHAVIOUR = FAIL
```

This is the same technique used for actor leakage ([05](05-actor-spec.md) §4),
and it is cheap enough to run every time.

## 3. Two harness classes, kept apart

The repository already draws this line and it must be preserved:

| Class | Names DOA | Runs when | Example |
|---|---|---|---|
| **Generic** | never — builds its own tenant | always | `tests/phase0/lib/synthetic-tenant.sh` |
| **Reference-application** | yes, acts in DOA's real tenant | only with `BANZAMI_ALLOW_DOA_TENANT_WRITES=1` | `doa-canonical-binding.sh` |

A generic harness that names DOA has stopped testing the platform and started
testing DOA. The gate stays.

## 4. Actors

`B03` in [05](05-actor-spec.md) is an ordinary Business that *stands in for* an
application integrator, so S14's generic journeys never touch DOA's tenant.

**`DOA01`/`DOA02` are not Banzami Validation Actors.** DOA's users are not
Banzami identities — they are DOA's own Supabase accounts. Registering them as
Banzami actors would encode precisely the coupling this suite exists to
disprove. DOA-side test identities belong to the DOA repository; the Lab
consumes them across the network boundary, like any external system.

## 5. S14 journeys

| Journey | What it proves | Tenant |
|---|---|---|
| `S14-DOA-001` DOA user signs in | DOA's own auth works | DOA |
| `S14-DOA-002` campaign created and visible | DOA product | DOA |
| `S14-DOA-003` donation initiated → Banzami payer surface | the hand-off contract | both |
| `S14-DOA-004` Consumer pays via App Banzami Web | **UI-first**, real payer | Banzami (`C01`) |
| `S14-DOA-005` payment confirmed; DOA campaign total updates | end-to-end settlement | both |
| `S14-DOA-006` webhook delivered and DOA reconciles | `webhook-delivery-to-doa.sh` | both |
| `S14-DOA-007` receipt correct: payee is `@doa`, not a display name | `receipt_semantics` regression | Banzami |
| `S14-DOA-008` campaign account segregation holds | `campaign-payment-segregation.sh` | Banzami |
| `S14-DOA-009` binding is sealed and singular | `doa-canonical-binding.sh` | DOA tenant ⚠ |
| `S14-DOA-010` failure handling: rail down → DOA degrades cleanly | ADR-061 boundary | both |
| `S14-DOA-011` **generic equivalence**: `B03` performs 003–008 with no DOA code path | the isolation claim | Banzami |

`S14-DOA-011` is the one that matters most. If the identical journey works for
an anonymous Business, DOA's success is evidence about *the platform*. If it
only works for DOA, every other DOA result is evidence about DOA.

## 6. Reuse

`tests/phase0/doa-{canonical-binding,public-donation-e2e}.sh`,
`campaign-payment-segregation.sh`, `webhook-delivery-to-doa.sh`,
`tools/e2e/doa/{sweep,route-sweep,field-sweep}.mjs`,
`tools/e2e/docs/doa-tutorial-e2e.mjs`, `docs/doa/{readiness,settlement-contract}.md`.

Three of these are already labelled as gated DOA-tenant tests. The Lab
orchestrates them under the same gate.

## 7. Boundaries

- The Lab **never deploys DOA** and never writes to DOA's production Supabase.
- DOA-tenant writes require the explicit environment gate, always.
- DOA evidence is redacted like any other: no Supabase keys, no service tokens.
- A DOA product defect is reported to DOA; it is **not** fixed in this
  repository, and it does not fail a Banzami capability unless the Banzami side
  is at fault.
