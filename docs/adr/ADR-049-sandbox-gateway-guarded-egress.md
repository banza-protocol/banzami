# ADR-049 — Guarded egress for Sandbox services that must reach out

- **Status:** Accepted — implemented and verified on the deployed Sandbox
- **Date:** 2026-09-04
- **Programme:** BANZAMI-SANDBOX-RELEASE-ASSURANCE-001 / Developer Platform
- **Layer:** Banzami operator infrastructure policy. **Not** BANZA protocol.

## Context

The Sandbox bootstrap (`infra/blueprint/sandbox-ops`) creates the data and
application planes as `internal: true` and asserts it — `SANDBOX
networks_internal PASS` — with the documented intent "no external connectivity".
For a payments stack that is a good default: no component should be able to
reach the internet merely because it is running.

Outbound webhook delivery contradicts that default directly. A webhook is an
outbound HTTPS connection to an address the *merchant* chooses, and the
api-gateway was attached only to those two internal networks. An internal Docker
network has no external route and no external DNS forwarding, so the gateway
could not resolve any public hostname at all:

```
wget: bad address 'sandbox-webhook.banzami.com'
```

The failure was silent in the worst way. The delivery worker ran, recorded
attempts and backed off correctly; the application-layer destination policy
(RA-023) passed all of its tests; the endpoint lifecycle, signing and event
production all passed. Nothing pointed at the network. CAP-WEBHOOK-001's data
plane simply never delivered anything — to the test sink or, had one existed, to
a real merchant. The capability was inert while its control plane looked
healthy.

## Decision

Services that genuinely need to reach a third party get a **dedicated,
non-internal egress network** (`bzsb-egress`, `172.31.240.0/24`), attached
per-service and to nothing else. The data and application planes stay
`internal: true` and unchanged.

Two services qualify today, and both were silently broken by the missing egress:

- **api-gateway** — outbound webhook delivery to merchant endpoints.
- **developer-api** — OTP email via Resend. This one is worth stating plainly:
  `EMAIL_PROVIDER` and `RESEND_API_KEY` were correctly declared in
  `docker-compose.yml` and `.env` the whole time, and the code was correct. The
  container simply could not resolve `api.resend.com`, so **no developer could
  ever receive a login code**. The Console's own E2E passed throughout, because
  it recovers the code server-side and never exercises delivery.

Attachment is per-service and deliberate. A service with no third-party
dependency does not get egress by default.

Egress from that subnet is **filtered at the host** (`DOCKER-USER`), DROPping
private and special-purpose destinations: RFC1918, loopback, link-local
(including cloud metadata at `169.254.169.254`), CGNAT, IETF protocol
assignments, benchmarking, multicast and reserved space.

Both halves are codified in `infra/blueprint/sandbox-ops/scripts/sandbox-egress.sh`
(`apply` / `verify`), which is idempotent and applies the filter **before**
attaching the container, so the gateway never has a moment of unfiltered egress.

## Rationale

The obvious alternative — making the application plane non-internal — was
rejected. It would have restored delivery by granting general internet access to
*every* service in the stack, including ones that have no reason to make an
outbound connection, and it would have silently invalidated an invariant the
bootstrap explicitly asserts.

Narrowing egress to the one component that needs it keeps the blast radius to
the gateway. Filtering that egress keeps RA-023 in its proper role. Destination
validation in the application is worth having, but as the *sole* control it is
one parsing bug, one followed redirect, or one DNS answer that changes between
validation and connection away from reaching the private network. With the
ranges dropped at the host as well, an application-layer bypass still does not
get out.

## Consequences

- External developer sign-in works at all: the OTP mail that the platform's
  entire onboarding depends on can now leave the network.
- CAP-WEBHOOK-001 is provable and released: 55/55 deployed-Sandbox assertions,
  0 blocked, against a genuinely public HTTPS receiver, with no SSRF exception
  granted to the test rail.
- The bootstrap's `networks_internal` assertion still holds and is unweakened.
  The new invariant is asserted alongside it: the egress network exists, is
  filtered, only the gateway is attached, and the data/app planes are still
  internal (`sandbox-egress.sh verify`).
- **Recreating a Sandbox container by hand drops its network aliases.** The
  blueprint gives developer-api the alias `developer-api` on the app network,
  and the Gateway resolves key introspection through exactly that name. A
  `docker run` recreation that omits `--alias` leaves the container healthy and
  serving its own port while every Gateway call fails
  `503 AUTHORIZATION_UNAVAILABLE`. Restore aliases explicitly after any manual
  recreation, and prefer the declared deployment path over a hand-rolled one.
- **Neither the attachment nor the filter survives a host reboot or a Docker
  restart**, and a container recreated by a rollout comes back without the
  network. `sandbox-egress.sh apply` must run after any of those; a gateway that
  silently loses egress looks healthy while delivering nothing, which is exactly
  the failure this ADR exists to remove.
- LIVE is unaffected and remains unprovisioned. Nothing here authorises a Live
  rail or a real-money path.

## Alternatives considered

- *Make the application plane non-internal*: rejected — grants egress to every
  service to fix one, and voids an asserted invariant.
- *Run the receiver inside the internal network*: rejected — it would require an
  SSRF exception for a private destination, weakening RA-023 for the sake of the
  test rail. A webhook destination has to be as public as a merchant's.
- *Unfiltered egress on a dedicated network*: rejected — leaves RA-023 as the
  only barrier to the private network.
- *An explicit outbound proxy*: a reasonable future refinement (central egress
  logging and per-destination policy). Deferred: it adds a component on the
  delivery path for control the host filter already provides.
