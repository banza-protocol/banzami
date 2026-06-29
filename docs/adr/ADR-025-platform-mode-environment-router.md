# ADR-025: Platform Mode as the Environment Router

**Status:** Accepted — implementing
**Date:** 2026-06-30
**Authors:** Banzami Engineering
**Related:** ADR-024 (Platform Status) · supersedes the implicit "environment = API host" convention

---

## Context

ADR-024 introduced **Platform Status** (`platform_settings.platform_mode` ∈ {LIVE,
SANDBOX}) as the audited source of truth for *whether the platform is in production
or testing*, and made it **communicated** (silent in LIVE, banner/badge in SANDBOX).

But ADR-024 treated the mode as **cosmetic** — a banner. The *data universe* a
request actually wrote to was still decided independently by each surface:

```
website (banzami.com → api.banzami.com)   →  stamps environment = "LIVE"
Business app build (sandbox-api...)        →  reads SANDBOX stack
gateway Submit                             →  default "LIVE" unless body says SANDBOX
```

### The incident that forced this ADR

The platform was globally **SANDBOX**, yet a real merchant (`@jrm`) was created and
fully activated in **LIVE** (`banzami` DB) because the public website is built
against `api.banzami.com` and submitted `environment: "LIVE"`. Approval was atomic
and every record existed — but the Business app the operator tested points at the
**SANDBOX** stack (`sandbox-api.banzami.com` → `banzami_staging`), where the
merchant does not exist. Result: *"Conta Business não encontrada."* — a silent,
misleading failure for a correctly-approved, ACTIVE merchant.

Root cause: **no component bound the environment of a write to the global Platform
Mode, and the two stacks each read their own `platform_mode` row** (the table is
per-database, so the values can silently diverge).

### Deployment topology (the constraint)

Two fully parallel stacks on one Postgres instance:

| Stack | Host | Gateway | Core | Database |
|-------|------|---------|------|----------|
| LIVE | `api.banzami.com` | `api-gateway-1` | `core-api-1` | `banzami` |
| SANDBOX | `sandbox-api.banzami.com` | `api-gateway-staging-1` (`ENVIRONMENT=SANDBOX`) | `core-api-staging` | `banzami_staging` |

Each gateway is physically wired to **one** database. A gateway cannot "route" a
write to the other DB. So Platform Mode cannot be a runtime DB-switch inside one
process; it must be enforced as a **policy each stack applies to itself**.

## Decision

**Platform Mode is the single, authoritative environment router for onboarding.**
A new merchant may be provisioned **only on the stack whose environment equals the
current Platform Mode.** This is enforced server-side and made impossible to bypass
from any client.

### 1. The keystone — gateway `EnvGate` (server-side, non-bypassable)

Each gateway knows its own environment (`ENVIRONMENT` env var → `LIVE`/`SANDBOX`;
unknown/`development` → gate disabled for single-DB local runs). On **application
submission** and **approval** the gateway calls `EnvGate.Verify`:

- stack env **==** Platform Mode → allow; the application's `environment` is stamped
  from the **stack**, never from the client body.
- stack env **≠** Platform Mode → **409 `ENVIRONMENT_MISMATCH`** ("…the platform is
  currently in `<MODE>` mode"). The provisioning service is never reached.

This makes *"create a LIVE merchant while the platform is SANDBOX"* (and the
reverse) **structurally impossible**, regardless of any client-routing bug.

### 2. Single source of truth — propagation (admin-api)

`platform_mode` is set via the LIVE admin-api (SUPER_ADMIN, typed confirmation,
audited — unchanged from ADR-024). `SetMode` now **propagates the value to
`banzami_staging`** after the primary commit, so both stacks read an identical
global mode. History remains the LIVE DB's audit trail. Propagation failure is
surfaced and is idempotent-safe to retry.

### 3. The live gateway must self-identify

`ENVIRONMENT=LIVE` is set on `api-gateway-1` (previously unset → `development`,
which would have left the gate disabled on the live stack).

### 4. Client routing follows Platform Mode

The website and the Business/Consumer apps resolve their API host from Platform
Mode at bootstrap, so onboarding reaches the active stack directly (defence in
depth — the gate is the guarantee, routing is the ergonomics).

### 5. Login surfaces the environment, never a silent "not found"

Handle lookup reports the stack environment; the app shows *"Esta conta pertence ao
ambiente LIVE/SANDBOX."* instead of *"Conta não encontrada."*

## Rationale

- The hazard is a **financial-onboarding correctness** problem; the fix must be a
  server-side invariant, not a client convention (CLAUDE.md §2.1).
- The two-DB topology means the only honest meaning of "route by Platform Mode" is
  *each stack refuses work that isn't its environment* — which is exactly the gate.
- Most downstream flows (QR, receipts, proofs, wallets, KYC/KYB, compliance,
  payments) already inherit environment from the stack they execute in
  (`core-api-staging` only writes `banzami_staging`). They need **no** change; the
  single leak was onboarding's client-stamped environment + the missing guard.

## Alternatives considered

1. **Single gateway with dual DB pools, switch per request.** Rejected: a large,
   risky change to a financial service; doubles every connection path; contradicts
   the isolation the two-stack topology already provides.
2. **Fix only the website to send the right environment.** Rejected: leaves the
   server trusting a client field — the same class of bug recurs from any client.
3. **Treat Platform Mode as cosmetic and tell operators to use the matching build.**
   Rejected: that is the status quo that produced the incident.

## Consequences

- While the platform is SANDBOX, the LIVE gateway **refuses** new applications and
  approvals (409). This is intended: nothing should be provisioned LIVE pre-launch.
- Symmetric by mandate: while LIVE, the SANDBOX gateway refuses onboarding too.
  **Trade-off:** this disables a developer sandbox during production. Revisit at
  launch — the gate is a single policy point and can be relaxed to one-directional
  (block LIVE-while-SANDBOX only) without touching call sites.
- `@jrm` (provisioned in LIVE during SANDBOX) is repaired by **re-running the real
  onboarding pipeline in SANDBOX** — never by manual row inserts.

## Validation / tests

- `EnvGate` unit tests: match allows; LIVE-while-SANDBOX and SANDBOX-while-LIVE both
  refused; `development` disables; nil-safe.
- Handler tests: Approve returns 409 `ENVIRONMENT_MISMATCH` on mismatch and the
  provisioning service is **not** reached; match proceeds.
- Deploy smoke: toggle propagation reaches both DBs; SANDBOX onboarding → approve →
  activate → handle login works end-to-end; LIVE onboarding is refused while SANDBOX.
