# Banzami ADR-055: A Project binding seals on its first payment artifact

**Status:** Accepted
**Date:** 2026-09-05
**Supersedes:** ADR-047 § *Binding immutability — decision (RT04C §2)*
**Related:** ADR-046 (developer-key authority) · ADR-047 (Project→Merchant binding) · migrations 0100, 0105

---

## Context

ADR-047 made a Project's Sandbox payment binding **immutable once created**, and
was explicit about how it achieved that: *"No operator rebind endpoint exists in
this release. No binding disable endpoint exists in this release."* Artifacts
were safe **by construction** — nothing could alter a binding, so nothing could
reinterpret an artifact's payee.

It also said what was missing: *"A future rebind/disable capability (with reason,
controlled action and immutable audit, plus a transactional artifact seal) is
explicitly out of scope here and will be designed in its own ADR."*

Two things then happened.

**The `artifact_created` column shipped without the design.** Migration 0100
carries it, `SealBindingArtifact` exists to set it, and nothing has ever called
it. The column reads as an enforced guarantee and is inert — an appearance of
safety, which is worse than a documented absence.

**Immutability turned out to be too strong.** The DOA Project was bound to a
merchant an E2E run created (RA-073). There was no `@doa` on the Sandbox at all.
Under ADR-047 that was uncorrectable: every donation would settle to a fixture
forever, because the rule that protects a correct binding protects a wrong one
identically. `RebindProjectSandbox` was added to fix it, which contradicted
ADR-047 as written.

This ADR is that promised design. It replaces "immutable always" with the rule
ADR-047 anticipated: **immutable from the moment it can matter.**

## Decision

A Project's financial binding is **mutable only while no qualifying payment
artifact has ever been created under it.** The first such artifact seals it,
permanently.

### What a qualifying artifact is

A **payer-facing payment artifact issued against the Project's payee**:

| artifact | route | scope |
|---|---|---|
| Payment session | `POST /v1/business/payment-sessions` | `payment_sessions:write` |
| Payment link | `POST /v1/business/payment-links` | `payment_links:write` |

The test is *"has a payer been handed something that names this payee?"*, not
*"has money moved?"*. A link that exists is a promise to a payer about who gets
paid; changing the payee afterwards would silently reinterpret it. Waiting for
settlement would leave a window in which an issued artifact still points at a
mutable owner.

**Not qualifying**, and deliberately so — none of these creates a new economic
relationship between a Project and a payee:

- identity (`/v1/me`, `/v1/business/me`), API keys, Project settings;
- webhook endpoints — delivery configuration, not payee;
- wallet accounts — a child *of* the owner the binding already fixed;
- refunds and transfers — these operate on artifacts that already exist, and by
  definition a binding carrying them is already sealed;
- every read.

The boundary is economic meaning, not "some Project resource exists".

### Seal ordering, and the failure mode we choose

Seal and artifact cannot share one database transaction: the binding lives in
`developer.*` in the operator database, and the artifact is created by Core over
HTTP. So the order is fixed:

```
UPDATE … SET artifact_created = true
  WHERE project_id = $1 AND state = 'ACTIVE'
    AND merchant_id = $2 AND wallet_id = $3      -- the payee we are about to use
RETURNING id
→ 0 rows  ⇒ the binding moved under us; refuse the artifact
→ 1 row   ⇒ sealed; create the artifact against exactly this payee
```

Seal **before** create. The failure mode is therefore **over-sealing**: an
artifact creation that fails afterwards leaves a binding sealed with no artifact.
That is the direction we want to fail in. The opposite — an artifact under a
still-mutable binding — is the defect this ADR exists to prevent, and a binding
sealed slightly too eagerly costs nothing but an operator correction window.

The `WHERE` clause is also the TOCTOU guard. The row lock the `UPDATE` takes
means a concurrent rebind either commits first (our payee no longer matches, we
refuse) or waits and then sees `artifact_created = true` (it refuses). There is
no interleaving in which an artifact is issued for owner A while the ACTIVE
binding ends as owner B.

Two concurrent first artifacts serialise on the same row, resolve the same
binding, and both proceed: the seal is idempotent by construction (`SET
artifact_created = true` on an already-true row is a no-op that still returns
the row).

### Operator correction, narrowly

`RebindProjectSandbox` remains, as the lifecycle tool ADR-047 anticipated:

- SANDBOX only; no LIVE equivalent exists or may be added under this ADR;
- operator authority only — internal key, never the Developer API or Console;
- refused if the binding is sealed, at the service **and** in the SQL;
- the new payee passes the same Core validation as a first binding;
- explicit (`supersede: true`); the default still conflicts;
- one transaction; the old row becomes `DISABLED` and is kept;
- both binding ids in the audit event.

### Enforcement lives in the database too

A trigger refuses to disable or repoint a sealed ACTIVE binding, and refuses to
un-seal one. The service guard can then be removed by a future edit without
silently removing the guarantee — which is the point of having two.

## Consequences

- A Project can be corrected while it is still only a configuration, and not
  after it has made a promise to a payer.
- `SealBindingArtifact` is replaced by the shared authority path and removed.
  A function that looks authoritative and is never called is a hazard.
- `artifact_created` stops being decorative and becomes the load-bearing state
  it was always named for.
- Existing Projects need a backfill: bindings whose artifacts agree with the
  current payee are sealed; any disagreement is an integrity defect and is not
  auto-repaired.

## Alternatives considered

**Keep ADR-047's absolute immutability.** Honest and simple, and it makes a
wrong binding permanent — which is not a safety property, it is a trap. RA-073
is the proof.

**Seal on settlement.** Leaves issued links pointing at a mutable payee.

**Seal on any Project resource.** Would seal on an API key or a webhook, which
have nothing to do with who gets paid, and would make correction impossible for
reasons unrelated to money.
