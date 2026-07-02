# Application Webhooks — how the operator confirms events to an app

**Status:** Implemented · **Version:** 1.0 · **Part of:**
[application-integration-engine.md](application-integration-engine.md) ·
**Decision:** [ADR-032](../adr/ADR-032-application-integration.md)

## Why webhooks are the primary confirmation channel

An application must **never depend on the payer's browser** to learn that a
payment happened. A browser poll is UX only — it is lost if the payer closes the
page. The authoritative confirmation is server-to-server:

```
Payer pays
  → operator marks payment_session.paid
  → operator delivers a SIGNED webhook to the app
  → app records the event idempotently
  → app updates its projection (e.g. campaign raised total)
```

If an app relies only on the poll, donations/payments where the payer leaves early
are silently missed by the app (the money is still safe in the operator ledger).

## Registering an endpoint

`POST /v1/webhooks/endpoints` (merchant-scoped):
```
{ "url": "https://app.example/api/webhooks/banzami",
  "events": ["payment_session.paid", "application_settlement.completed", …] }
```
The operator **generates the signing secret**, stores it encrypted at rest
(SEC-002) and returns it **once** — configure it in the app immediately
(`BANZAMI_WEBHOOK_SECRET`). Endpoints match an event when the event type is in
`events[]` (or `'*'`). Delivery is per-endpoint with retries (`webhook_deliveries`).

## Events

- `payment_session.paid` — a session was paid through any interface (link/QR).
  Carries `reference_type` / `reference_id` (e.g. `DOA_DONATION` + intent id, or
  `DOA_CAMPAIGN` + campaign id) so the app maps it to its own record.
- `application_settlement.completed | failed | cancelled` — terminal settlement
  state (ADR-029).

## Signature & security

- Header `banza-signature`, HMAC over the raw body with the endpoint secret.
- The app **verifies via the SDK** (`webhooks.constructEvent`) — never trusts an
  unsigned body, never trusts client-supplied values.
- Idempotent processing (dedupe on the event/session id); secrets never logged.

## Making webhooks part of readiness (roadmap)

Because a missing webhook silently degrades an integration to poll-only, Business
Resolution should surface a `WEBHOOK_ENDPOINT_MISSING` blocker when an application
business has no active endpoint — so the app prompts the operator/owner to
register one before going live. Until then, apps must pair the webhook with a
**reconciliation backstop** (see the DOA reference:
`~/doa/docs/integration/reconciliation.md`).

## The three channels (defence in depth)

| Channel | Role |
|---|---|
| Webhook | primary — server-push, browser-independent |
| Poll | UX only — updates the payer's screen |
| Reconciliation | backstop — sweeps the operator for anything missed |
