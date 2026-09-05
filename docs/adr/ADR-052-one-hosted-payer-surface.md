# Banzami ADR-052: One hosted payer surface

**Status:** Accepted — implementing
**Date:** 2026-09-05
**Authors:** Banzami Engineering
**Related:** ADR-025 (Platform Mode as the environment router) · ADR-030 (session link carries the destination account) · ADR-043 (payment session interfaces) · BANZA ADR-024 (verification pages) · CAP-APP-004

> Note on numbering: this is a **Banzami operator** ADR. BANZA ADR-052 (internal
> wallet-account transfers) is a protocol ADR in `~/banza` and is unrelated.

---

## Context

The operator ships two Next.js applications that both present a payment to a
payer, and `apps/checkout/README.md` claims the same hostname `apps/pay` serves:

```
apps/pay       /[slug]  /pay/[slug]  /u/[handle]  /profiles/[handle]  /r/[code]
               /.well-known/apple-app-site-association  /.well-known/assetlinks.json
               /api/pay-link/[code]
apps/checkout  /[slug]  /pay/[slug]  /u/[handle]  /pay
               /api/pay/[slug]/status
```

Neither is deployed. `pay.banzami.com` answers **503** and
`checkout.banzami.com` has no DNS record at all.

That is not a cosmetic gap. The published TypeScript SDK maps **both**
environments to the same hosted origin:

```ts
const DEFAULT_PAY_BASE_URLS = { live: 'https://pay.banzami.com',
                                sandbox: 'https://pay.banzami.com' };
```

So every Sandbox payment link the platform hands a payer today — including the
link a real donor receives on `www.doadoa.app` — points at a page that does not
answer. The deployed donation E2E passed only because the harness settles the
link through the API; a human following the link would have hit the 503.

### What each application actually is

`apps/pay` is a superset. It alone carries:

- `.well-known/apple-app-site-association` and `assetlinks.json` — the Universal
  Link / App Link association that binds `pay.banzami.com` to the Banzami mobile
  apps. Serving that host from any other application silently breaks mobile deep
  links.
- `/r/[code]` — the authenticated verification page (BANZA ADR-024).
- `/profiles/[handle]`, `/api/pay-link/[code]` — consumer pay links and profiles.
- `PlatformBadge` — a fail-safe SANDBOX disclosure driven by
  `GET /v1/platform-mode` (shows the badge on any read failure; silent only when
  the platform positively answers `LIVE`).

`apps/checkout` has better-decomposed UI components and nothing functionally
unique.

---

## Decision

**1 — `apps/pay` is the single canonical hosted payer surface.** `apps/checkout`
is retired: it is a redundant earlier iteration that claims a host it must not
serve, and keeping it invites the two to drift into different answers for the
same payment.

**2 — `pay.banzami.com` is the canonical origin and does not move.** It is baked
into the published SDK, into QR payloads, into `banzami://` deep links, and into
the mobile association files. Changing it would break integrations that are
already published.

**3 — `checkout.banzami.com` is an alias, not an application.** It resolves and
serves a permanent redirect to the canonical origin, preserving the path. An
alias that fails to resolve is indistinguishable from a mistake; an alias that
serves a second application is a second source of truth.

**4 — The environment is resolved by Platform Mode, per ADR-025 §4, not by the
hostname.** One origin serves whichever stack the platform is in. While Platform
Mode is `SANDBOX` the hosted surface reads the Sandbox gateway, and the SANDBOX
badge is shown. This is the pattern ADR-025 already establishes for the website
and the apps; the hosted payer surface was simply never brought under it.

**5 — The browser is never an authority.** The hosted page resolves a payment by
its public slug and displays it. Every state that moves money is authorised by
the payer in their own authenticated app, reached by QR or deep link. The page
holds no credential, names no merchant, and cannot choose a recipient — a slug
selects an existing payment resource and grants nothing.

**6 — External provider rails stay off while they are not approved.** The
Multicaixa Express path on the hosted page is an external acquiring rail. The
assurance manifest records external provider rails as `not_approved`, so the
hosted surface must not offer that button while Platform Mode is `SANDBOX`.
Offering a rail the platform declares unavailable is an overclaim rendered as a
button.

---

## Rationale

- The hazard being fixed is that **the operator issues links to a dead host**.
  That is a payer-facing correctness problem, not a deployment chore.
- One origin with one application is the only shape in which the QR payload, the
  deep link, the association files and the SDK default can all be true at once.
- Environment-by-Platform-Mode is not invented here; ADR-025 chose it for exactly
  this class of client, and its rationale (the gate is the guarantee, routing is
  the ergonomics) applies unchanged.
- Keeping the browser out of the authority chain means the hosted surface adds no
  new attack surface to defend: there is no field it could tamper with that any
  server would read.

## Alternatives considered

1. **Deploy both apps, one per host.** Rejected: two implementations of the same
   payment page drift, and only one of them can hold the mobile association
   files, so the other silently breaks deep links.
2. **Give Sandbox its own pay host (`sandbox-pay.banzami.com`).** Rejected for
   now: the published SDK already emits `pay.banzami.com` for Sandbox, so a
   separate host would leave every existing integration pointing at the wrong
   place. Revisit only alongside an SDK major.
3. **Make the hosted page authorise payments itself.** Rejected: it would make a
   public browser page a financial authority, which is the shape RA-053 and
   RA-057 removed from the API.

## Amendment (2026-09-05) — deployment topology

The Sandbox blueprint forbade `pay-frontend` from its deploy set, website-edge
Decision 3 forbids payment upstreams, and a standalone stack would be a fourth
topology. The owner resolved this: **`pay-frontend` is an authorised Sandbox
application surface**, deployed into the existing Sandbox project and routed by
`sandbox-edge`.

| | Previous invariant | New invariant |
|---|---|---|
| Sandbox deploy set | `pay-frontend` **forbidden** | `pay-frontend` **required** |
| Reason | the Sandbox project was API-only | CAP-APP-004 makes the hosted payer surface part of the external Sandbox product, and every payment link the platform issues points at it |

The guard was **replaced, not deleted**. What the old rule was really protecting
— that no admin or LIVE surface is deployed here — is now stated precisely
rather than by substring (`pay` and `frontend` were blanket terms), and the
validator checks membership in both directions: the authorised surfaces must be
present, the forbidden ones absent. Three mutations prove it detects the wrong
topology.

Bounded, and the bounds are enforced:

- **website-edge is untouched.** Decision 3 stands; the payer surface sits
  behind `sandbox-edge`, which is already on the application plane.
- **Application plane only.** Every other Sandbox service is also on the data
  plane because every other service talks to Postgres. This one must not: it
  holds no secret mount, no database URL and no Core credential, and reads the
  gateway over HTTP like any other client. Adding a frontend does not broaden
  what the Sandbox exposes.
- **Authorisation does not travel.** `pay-frontend` remains forbidden in the
  release-package and VM-execution topologies. One topology's authorisation is
  not every topology's.
- **LIVE is unchanged.** The hosted payer surface being available in Sandbox
  does not enable Banzami financial LIVE, which remains separately gated and
  fail-closed.

## Consequences

- `apps/checkout` is deleted; its distinctive UI components are not lost work,
  they are simply not the canonical surface.
- The hosted surface's gateway origin becomes runtime configuration, so one image
  serves whichever stack Platform Mode selects.
- CAP-APP-004 can be released on deployed evidence: a public browser journey that
  resolves a real Sandbox payment link, refuses tampering, and cannot double-pay.
- Nothing here activates a live rail. While Platform Mode is `SANDBOX` the hosted
  surface is a Sandbox surface, and the LIVE gateway remains offline and
  fail-closed.
