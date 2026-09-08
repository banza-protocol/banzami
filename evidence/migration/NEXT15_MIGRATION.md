# Next.js 14 → 15 migration

Date: 2026-09-08 · Reason: every remaining high dependency advisory sat in
`next@14.2.35`, and no 14.x release fixes them — the first patched version is
15.5.x, so the upgrade *is* the remediation.

## Result

| App | Next | React | Typecheck | Tests | Build | Standalone | CSP | Deployed |
|---|---|---|---|---|---|---|---|---|
| website | 15.5.25 | 19.2.8 | clean | 485 pass | ✓ | ✓ | nonce | ✓ banzami.com + developers.banzami.com |
| pay | 15.5.25 | 19.2.8 | clean | — | ✓ | ✓ | nonce | ✓ pay.banzami.com |
| admin | 15.5.25 | 19.2.8 | clean | — | ✓ | ✓ | static | ✓ admin.banzami.com |
| dashboard | 15.5.25 | 19.2.8 | clean (first time) | — | ✓ | ✓ | nonce | **not deployed** |
| validation-studio | 15.5.25 | 19.0.0 | clean | 106 pass | local-only | n/a | n/a | local tool |

`dashboard-frontend` is built, typechecked and smoke-tested but **not deployed**:
`deploy.sh`'s service authority matrix refuses it — "merchant surface: Stage D
covers the operator console only; this needs its own approval and runbook". That
gate was not bypassed.

## What the migration actually required

Next 15 makes the request APIs asynchronous. The compiler does not find all of
it, because a page's own `Props` interface hides the change from TypeScript —
`params: { slug: string }` still typechecks while the runtime hands you a
Promise. So every site was migrated by inspection, not by chasing errors:

* `apps/pay/app/layout.tsx` — `headers()` → `(await headers())`. Left unawaited
  this reads `.get` off the Promise, the CSP nonce becomes `undefined`, and our
  own policy then blocks every inline script Next emits. The page renders dead
  rather than failing loudly.
* `apps/pay` — `params`/`searchParams` awaited in `pay/[slug]`, `r/[code]`,
  `u/[handle]`, `profiles/[handle]`, `[slug]`, and in `generateMetadata`.
* `apps/pay/app/api/pay-link/[code]/route.ts` — a route handler's `params` are a
  Promise too, and the route is pinned `dynamic = 'force-dynamic'`: it answers
  with the live state of one payment request, and a cached answer would show a
  payer a request that has already been paid, cancelled or expired.
* React 19 removed the no-argument `useRef` overload and the global `JSX`
  namespace — both fixed in `components/app/AppDemo.tsx`.
* `lucide-react` 0.363 peer-depends on React ≤18; upgraded rather than forced.
  No `--legacy-peer-deps`, no `--force`.

## Cache semantics (the part that matters for pay)

Next 15 changes what is cached by default. Nothing in `apps/pay` relies on a
default: every server fetch already carried an explicit directive, and they were
re-read rather than assumed —

| Call | Directive | Why |
|---|---|---|
| payment link | `next: { revalidate: 0 }` | payable state |
| link status | `cache: 'no-store'` | polled while paying |
| pay | `cache: 'no-store'` | the mutation itself |
| platform mode | `cache: 'no-store'` | operator-flippable |
| merchant profile | `next: { revalidate: 60 }` | public profile, deliberate |

Verified on the deployed surface: every payment route builds as `ƒ` (dynamic,
server-rendered on demand), the response carries
`cache-control: private, no-cache, no-store, max-age=0, must-revalidate`,
Cloudflare reports `cf-cache-status: DYNAMIC`, and two requests for the same
payment page return different CSP nonces — so no payer is served another payer's
document.

## Hosted checkout, on the deployed migrated surface

| Check | Result |
|---|---|
| ACTIVE link renders | 200, amount 250000 AOA and its description present |
| USED link | "Pagamento recebido" / "já foi utilizado" — not a payable form |
| cross-checkout leakage | the ACTIVE slug and description appear 0 times on the USED page |
| unknown slug | 404, not an error page |
| deep link | `banzami://pay/link/<slug>` emitted correctly |
| `/r/[code]`, `/u/[handle]`, both `.well-known` files | 200 |

Not covered: an expired link, because no link in the Sandbox currently has an
expiry set (`expiresAt: null` on the active one). Recorded rather than claimed.

## Advisories

`next` accounted for 92 of the 205 alerts that appeared when the repository was
published. After the migration, **zero remain against `next`**, and the open set
is 0 critical.
