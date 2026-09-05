# ADR-051 — Webhook management for developer credentials, and secret rotation

- **Status:** Accepted — gateway, scopes and SDK implemented; Console visibility pending
- **Date:** 2026-09-05
- **Programme:** BANZAMI-SANDBOX-RELEASE-ASSURANCE-001 / Developer Platform
- **Layer:** Banzami operator authority policy. **Not** BANZA protocol.
- **Extends:** ADR-050 (project-bound sub-accounts) with the same authority split

## Context

Webhook endpoints were reachable only with a merchant JWT. An application built
on the Developer Platform therefore could not register, inspect, or manage the
endpoint that carries **its own** events. The only way to do it was to hold a
merchant credential — the exact authority level the Developer Platform exists to
withhold, so "use a merchant key" was never an answer, it was the problem.

A second gap sat underneath it. A signing secret was issued once at registration
and had no management path at all. The handler comment said `use the rotate
endpoint (future)`. A secret suspected of exposure could only be retired by
deleting the endpoint and creating another under a new id — which changes the
integration rather than the credential, and loses the delivery history that
makes an incident reviewable. A production credential with no rotation is a
credential that is never rotated.

## Decision

**Webhook routes join the dual-credential group**, mounted at
`/v1/business/webhooks/*`. The merchant is resolved the same way ADR-050 resolves
a wallet: from the project binding for a developer key, from itself for a
merchant JWT. The legacy `/v1/webhooks/*` merchant routes stay mounted.

Notably there is **no client-supplied merchant field to reject** on these routes.
The question ADR-047 had to answer for payments — "may a client name its payee?"
— does not arise here, because no request body or query carries an owner. The
absence is the design: nothing to offer means nothing to get wrong.

**Each operation demands its own scope.** `webhooks:read` covers endpoints,
events, deliveries and health; `webhooks:write` covers register, deactivate,
replay and rotate. A read scope never authorizes a mutation, and a payment scope
never stands in for a webhook one.

**Neither scope is gated on the payment capability release.** They touch no
money. That classification is deliberate rather than incidental — see ADR-050's
consequence about payee-adjacent fields, which applies equally to scopes.

**Secret rotation exists**: `POST /v1/business/webhooks/endpoints/{id}/rotate-secret`
issues a new secret and returns it once, in the same shape as registration. The
UPDATE is scoped by `merchant_id` in the statement itself rather than by a
read-then-check, so it cannot authorize against a row that changes underneath it
and cannot answer differently for an endpoint that exists but belongs to someone
else.

**The cutover is immediate, not overlapping.** A signature is verified against
one secret. A receiver updates its secret and the next delivery is signed with
the new one; anything already queued keeps the signature it was given. This is a
real operational constraint and the SDK documents it: rotate when you can
redeploy the receiver. Because delivery is at-least-once with retries, a
delivery rejected during the window is not a lost event.

**A foreign endpoint reads `NOT_FOUND`, never `FORBIDDEN`** — the same rule
ADR-050 sets for accounts, for the same reason: a status code that distinguishes
"yours" from "someone else's" is an enumeration oracle for endpoint ids.

**An unbound project is refused, not answered with an empty list.** An empty list
would assert that the question was meaningful and the answer was "none".

## Consequences

- DOA can register and rotate its own webhook endpoint with a project key. No
  merchant credential anywhere in the integration.
- `BANZAMI_WEBHOOK_SECRET` becomes a rotatable credential rather than a
  permanent one.
- The SDK's legacy `registerWebhookEndpoint` / `deleteWebhookEndpoint` named the
  merchant-only routes a project key cannot reach. They now delegate to the
  canonical methods, so a merchant integration is unaffected and a project key
  works for the first time.
- **Not yet done:** the Console's webhooks and logs screens still render
  illustrative data and say so on the page. Showing real deliveries there needs
  the Console's session-authenticated backend to reach gateway data on the
  project's behalf, which requires a new internal authority path. That decision
  is deliberately not taken here — inventing a way for the developer-api to
  speak for a merchant is exactly the kind of authority shortcut this ADR series
  exists to refuse, and it deserves its own decision rather than being smuggled
  in as UI work.

## Alternatives considered

- *Let the Console hold an API key in the browser*: rejected outright — a secret
  key in client code is the one rule the platform states without exception.
- *Have developer-api mint a merchant JWT to read webhook data*: rejected for
  now. It would give the developer-api the standing ability to speak as any
  merchant it has a binding for, turning a Console compromise into a merchant
  compromise, in exchange for a read-only screen.
- *Overlapping secrets during rotation (accept old and new for a window)*:
  deferred, not rejected. It removes the redeploy-ordering constraint and is the
  better long-term contract, but it changes verification semantics on both sides
  and belongs in its own change with its own tests.
- *Keep webhooks merchant-only and document the limitation*: rejected — it makes
  every Developer Platform integration either blind to its own deliveries or
  dependent on a credential it should not hold.
