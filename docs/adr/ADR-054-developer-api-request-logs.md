# Banzami ADR-054: Developer API request logs

**Status:** Accepted
**Date:** 2026-09-05
**Related:** ADR-033 (Developer bounded context) · ADR-046 (developer-key auth) · ADR-047 (project binding) · migration 0104

---

## Context

The Developer Console has a **Logs** screen. Until now it showed webhook events
and their delivery attempts — real data, correctly project-scoped, and not what
the word means to a developer. Someone integrating Banzami opens Logs to find
*the request they just made*: what they called, what came back, and the
`request_id` the error envelope told them to quote in support.

That record did not exist. Nothing persisted a per-request row, so the page said
so in plain words instead of rendering a view over data that was not recorded.
Saying so was the right response to not having it; it was never a substitute for
having it. The docs tell developers to keep the `request_id` and quote it — and
support had nowhere to look it up either.

## Decision

The api-gateway records **one row per Developer API request that authenticated
with a project credential**, and developer-api serves those rows back to the
Console, scoped to one project.

### What is recorded

`developer.dev_api_request_logs` (migration 0104):

| column | why |
|---|---|
| `project_id` | the owner; every read is bound to it |
| `key_id` | which key, by its non-secret id |
| `environment` | `SANDBOX` today; the column does not assume it stays so |
| `method`, `path`, `route` | the call, and its canonical chi pattern |
| `status` | what the caller received |
| `request_id` | the correlation handle from the error envelope |
| `latency_ms` | how long it took |
| `created_at` | when |

### What is not recorded

No `Authorization` header. No API key, raw or hashed. No webhook secret, cookie,
OTP, request body, response body, or header map — **there is no JSONB column**,
so a later handler has nowhere to put one without a migration and a review.
`path` is stored with the query string removed and any `bz_*_(sk|pk)_…` token
replaced with `[REDACTED]`, because the only way a credential reaches a URL is a
caller putting it there, and a log that then stored it would turn their mistake
into ours.

### Where attribution happens

In `resolveDeveloperPrincipal` — the single function where a developer key is
ever accepted (ADR-046) — and nowhere else. A log that depends on each handler
remembering to emit a row has holes exactly where the unusual request was. The
middleware writes the row after the response completes, so **failures are logged
for the same reason successes are**: 403, 404, 422, 500 and recovered panics are
what a developer is trying to find.

A request that fails *authentication* is not written. There is no project to
attribute it to, and attributing it to a guess would let an unauthenticated
caller write rows into a stranger's log. Those stay in the gateway's structured
logs, where they are an operator concern.

### Isolation

Two independent mechanisms, because one is a single point of failure:

1. `Service.ProjectAPIRequestLogs` runs `projectAuthz` — non-members get
   `ErrForbidden`.
2. The SQL binds `project_id` itself; every filter can only narrow. A foreign
   `request_id` returns the same empty list as an id that never existed, so the
   lookup is never an existence oracle for another project's traffic.

Both directions are tested (A cannot read B, B cannot read A), with a
non-vacuity test proving the fixture rows are genuinely readable and a mutation
run confirming removal of the authorization check fails the suite.

### Availability

Recording never blocks a request and never fails one. Entries go to a bounded
channel drained by a single batching worker. Under sustained overload the buffer
fills, and the choice is to block the API on its own telemetry or to drop log
lines: dropping is the only defensible one, because a request log is diagnostic
and a payment is not. Drops are counted and warned about, so a full buffer is
visible as a defect rather than as a quietly incomplete screen.

### Retention

**30 days**, pruned hourly by the gateway in bounded batches
(`RequestLogRetention` / `Prune`). Long enough to debug an integration across a
weekend; short enough that the table does not grow without limit. The Console
reports the window with the results, so an absent old request reads as retention
rather than as a lost record.

This is **diagnostic telemetry, not an audit record**. `developer.audit_events`
is append-only and DB-immutable (migration 0099), is governed by its own policy,
and the pruner never touches it.

## Consequences

- The Console's Logs screen has two tabs — API requests, and the webhook events
  and deliveries it already served. Both are real; neither is named after the
  other.
- Support can resolve a quoted `request_id` to a request.
- One more table grows with traffic. It is bounded by retention and indexed for
  the two queries the Console actually makes.
- If a future capability needs request bodies (replay, for instance), it needs
  its own decision and its own storage. This table is deliberately not that.

## Alternatives considered

**Keep showing webhook activity under the name Logs.** Honest about its own
contents, but it answers a different question than the one the screen is opened
to ask, and the docs' "quote your `request_id`" instruction stayed unhonoured.

**Derive logs from the structured slog stream.** No new table, but no
project attribution (slog has no principal), no query path, and it would make
the Console depend on a log-aggregation stack the operator does not run.

**Log synchronously in the request path.** Simplest to reason about, and it puts
a database write inside the payment critical path (CLAUDE.md §2.6). Rejected.
