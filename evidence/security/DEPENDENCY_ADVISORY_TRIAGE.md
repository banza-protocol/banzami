# Dependency advisory triage — what the 205 alerts actually mean

Date: 2026-09-08 · Trigger: publishing the repository turned Dependabot on for
the first time, which indexed every manifest at once.

The headline number is not the risk. This records which advisories reach a
Banzami surface, which cannot, and why — so the residual decision is made on
what applies rather than on a count.

## Where it started and where it stands

| | open | critical | high |
|---|---|---|---|
| first full index | 205 | 23 | 79 |
| after this session | 163 | 2 | 70 |

Cleared: `golang.org/x/crypto` and `google.golang.org/grpc` across the three Go
services (42 alerts), and the transitive npm build tooling — `postcss`,
`nanoid`, `browserslist`, `esbuild`, `postcss-selector-parser`, `sharp` — plus
`vitest` to 3.x, which was both remaining criticals.

## The Go criticals were not reachable

All 21 critical `x/crypto` advisories are in `golang.org/x/crypto/ssh`: agent
forwarding constraints, key constraints, the FIDO/U2F presence check, channel
writes. No Banzami service speaks SSH. This is why `govulncheck` reported no
vulnerable dependencies while Dependabot reported twenty-one criticals — the two
tools answer different questions, reachability versus pinned version.
`govulncheck` was correct. The pin was raised anyway; it costs a lockfile line.

## What remains: Next.js 14.2.35

Every remaining high is `next`. There is no 14.x release that fixes them — the
first patched version is 15.5.x — so the only remediation is a framework
migration. That makes the applicability question load-bearing rather than
academic.

| Advisory | Requires | Present here | Reaches us |
|---|---|---|---|
| CVE-2026-44573 middleware/proxy bypass | Pages Router **with i18n** | all five apps are App Router; no `i18n` in any `next.config` | no |
| CVE-2026-64645 SSRF in rewrites | `rewrites` with attacker-controlled destination | no `rewrites` in any `next.config` | no |
| CVE-2026-44578 SSRF on WebSocket upgrade | WebSocket upgrade handling | none of the apps upgrade connections | no |
| CVE-2026-64641 DoS in Server Actions | `'use server'` | only `apps/validation-studio`, a local tool that is in no compose file and no deploy target | not on a deployed surface |
| CVE-2026-64649 SSRF in Server Actions on custom servers | `'use server'` + custom server | as above, and no custom server | no |
| GHSA-8h8q-6873-q5fj, GHSA-q4gf-8mx6-v5v3, GHSA-h25m-26qc-wcjf — DoS via Server Components | App Router RSC | **yes** — all five apps | **yes** |

### The middleware question, stated carefully

The middleware-bypass class is the one that deserves care, because when
middleware is what enforces a session, bypassing it is an authentication bypass.

Three apps shipped a middleware when this was written: `apps/website`, `apps/pay`, `apps/dashboard` (the last was retired on 2026-09-12 — CAP-APP-002).
**None of them authenticates or authorises.** `website` does host-based console
routing and 308 redirects; `pay` and `dashboard` mint a CSP nonce and set
`Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options` and
`Referrer-Policy`. Authentication is a bearer token checked by the Gateway and
the APIs, on the server side of the request, not in the edge layer.

So a middleware bypass here costs the response its hardening headers and its
canonical routing. That is a real defence-in-depth regression on a payment
surface and not something to leave forever — but it is not an access-control
failure, and the distinction is the whole reason this table exists.

## Residual risk, stated plainly

Denial of service against the App Router's Server Components rendering, on
Sandbox surfaces, with no real money behind them (Financial LIVE remains
fail-closed and unactivated). No confidentiality or integrity advisory in the
remaining set reaches a deployed Banzami surface.

## Recommendation

Migrate to Next 15 as **its own change**, not folded into a dependency sweep.
14 → 15 changes request APIs to async (`cookies()`, `headers()`, `params`,
`searchParams`), changes fetch caching defaults from cached to uncached, and
wants React 19 — three things that alter behaviour rather than versions, on
`pay.banzami.com` and `admin.banzami.com`. It needs its own end-to-end proof of
the payment journey, not a green build.

Doing it inside this sweep would have meant shipping a framework migration to a
payment surface under cover of a `postcss` bump. The advisories that actually
reach us are DoS on Sandbox; that does not buy the risk of a rushed migration.
