# The one simulated assertion, classified

Version: 1.0

`tests/phase0/developer-platform-e2e.sh` reports `pass=20 fail=0 simulated=1
blocked=0`. A green aggregate with a simulation inside it is worth exactly as
much as the classification of that simulation, so here it is.

## What it is

`F0-DP-011 — webhook event emitted/simulated (signed payload)`

The harness records:

> event emission pipeline reachable; Banza-Signature HMAC + retry/backoff
> 1m/5m/30m/2h/8h max-5 + idempotency verified in code+unit tests; live outbound
> 2xx delivery needs a public HTTPS sink — excluded by no-external/no-public

So within that harness the exclusion is deliberate and coherent: it is a suite
with a no-external-egress policy, and it says so rather than pretending.

## The classification

The question is not whether the harness is honest about its own scope. It is
whether **live signed webhook delivery has deployed proof anywhere**.

Checked, not assumed. The Sandbox runs a webhook sink:

    banzami-webhook-sink   Up 4 days (healthy)   listening on 8090

Its log holds exactly one line — `{"msg":"webhook sink listening","port":8090}`.
Zero deliveries. Zero `Banza-Signature` headers observed.

The suites that would prove it end-to-end (`webhook-lifecycle-e2e.sh`,
`webhook-delivery-to-doa.sh`) both require an existing developer project, and
creating one through the public lifecycle is the open P0.

**Verdict: (B) — missing deployed proof.**

Not a legitimate test-only simulation. Live signed webhook delivery has never
been demonstrated against this runtime, and it remains a blocker until real
deployed evidence replaces it. It is recorded here rather than left inside a
green count, because a `simulated=1` that nobody classifies is indistinguishable
from a gap nobody noticed.

## Where it gets closed

Not by a change to this suite. It closes inside the Developers P0: an ordinary
external developer completing Financial Setup through the public lifecycle,
registering a webhook, and the sink recording a signed delivery with a
verifiable `Banza-Signature`. Until that journey runs, this stays open.
