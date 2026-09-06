# ADR-056 — A webhook belongs to the financial owner, not to the project

Version: 1.0
Status: Accepted
Date: 2026-09-07

## Context

The external cleanroom found that a fresh Sandbox project could not configure a
webhook: `GET /projects/{id}/webhooks/endpoints` answered not-found because the
project had no financial owner. The obvious reading was that this is an
accidental coupling — webhook configuration is integration setup, financial
binding is a separate concern, and a developer ought to be able to register an
endpoint before taking their first payment.

That reading was tested against the implementation rather than assumed, because
the change it implies is a migration of `webhook_endpoints` — a table that
carries DOA's live endpoint, its signing-secret lifecycle and its delivery
history.

## Evidence

**Every event that exists is a financial event of a financial owner.** The event
types ever emitted are `payment_link.paid`, `payment_session.created`,
`payment_session.paid` and `refund.completed`. There is no Developer Platform
event — no key rotated, no project created, no member invited — that a webhook
could carry.

**`webhook_events.merchant_id` is NOT NULL.** An event has no meaning without the
owner whose money moved. It is not a nullable association that happens to be
populated; it is what the row is about.

**Delivery routes by merchant, in both paths.** The transactional dispatch selects
`FROM webhook_endpoints WHERE merchant_id = $1 AND active`, and the outbox
fan-out does the same. Endpoint selection has never consulted a project.

**Project and financial owner are now 1:1 for external projects.** Self-service
Sandbox financial setup provisions each project its own owner. So project-scoping
would introduce a level of indirection that changes nothing about who receives
what — it would resolve project → owner and arrive at the same endpoints.

## Decision

**Webhook endpoints stay owned by the financial owner.** `webhook_endpoints` is
not migrated, DOA's endpoint is not touched, and no `project_id` column is added.

The consequence for the developer's route through the product is that financial
setup comes before webhooks:

```
Sign in → Workspace → Project → Sandbox financial setup → API key → webhook → wallet destination → payment
```

That order is not a limitation to apologise for. Before a project has a financial
owner there are no events for an endpoint to receive, so registering one would be
configuring a subscription to nothing — an endpoint that exists, looks
configured, and can never fire. The product refusing it is more honest than the
product accepting it.

## What must remain true

An authorised project that has not been set up gets
`409 PROJECT_FINANCIAL_SETUP_REQUIRED` from the webhook routes — a state with a
name and an action, not the not-found it used to get. Not-found stays the answer
for a project the caller is not a member of, and for one that does not exist,
because telling those two apart is the oracle that answer exists to prevent.

## What would reopen this

A non-financial Developer Platform event. The moment there is something to
deliver that is about a project rather than about money — a key nearing
expiry, a member added, a quota reached — the argument above stops holding and
webhooks need an owner that exists before the money does.

## Alternatives considered

**Add `project_id`, make `merchant_id` nullable, dispatch by either.** Rejected:
it migrates a table holding live delivery history and a signing-secret lifecycle
to buy an ordering convenience, and it makes every dispatch query answer two
questions where one will do. The risk is DOA's, and the benefit is a sentence in
a Quickstart.

**Keep merchant ownership but let the Console pre-register endpoints against the
project, binding them at setup.** Rejected: it is the first option with a delay,
and it introduces a state — a webhook that exists and is not yet deliverable —
that the developer would have to understand for no gain.
