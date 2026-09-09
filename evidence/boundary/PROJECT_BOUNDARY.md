# Banzami ↔ DOA — the project boundary

Version: 1.0

## The invariant

    BANZAMI is the platform provider.
    DOA is an external consumer.

The relationship exists **only** through the same public contracts available to
any unrelated application. Banzami does not read, test, deploy or repair DOA,
and does not depend on DOA to assure itself.

    DOA MAY BE SPECIAL AS AN APPLICATION.
    DOA MUST NEVER BE SPECIAL AS A BANZAMI TENANT.

## What Banzami may observe

Public, externally reachable surfaces, and Banzami's own records:

* `https://www.doadoa.app` and any public DOA HTTP behaviour
* a webhook endpoint DOA configured, reached over the ordinary Internet
* Banzami-side outcomes: delivery attempts, emitted signatures, HTTP responses,
  retry history, ledger, payment and settlement results
* DOA project metadata visible to normal Banzami operator surfaces

## What Banzami must never touch

The DOA repository, database, service-role credentials, Vercel configuration,
environment secrets, private logs, auth internals, mailbox stores or deployment
tooling — and never to make a Banzami test pass.

Nor the DOA developer lifecycle: Banzami does not log in as
`contact@doadoa.app`, read its OTP, create its Workspace or Project, mint its
key, or install its runtime credentials. Those are external-tenant actions and
belong to the DOA project.

Operator tooling is not a substitute for the public Developer lifecycle. A
pricing profile such as `sandbox-reference` may be assigned to DOA only through
the same operator workflow that applies to any equivalent tenant.

## Corrections made when this boundary was established (2026-09-09)

The boundary was stated after work had already crossed it. Recorded rather than
quietly dropped:

* this session had read and written files inside `/Users/fm65/doa`, including
  editing its handoff document
* it had queried DOA's Supabase projects directly and enumerated their contents
* it had applied a DOA database migration

All of that now belongs to the DOA project. Banzami-owned evidence describes
external observations only; cross-project state moves by report, never by
repository mutation.

## When Banzami observes a DOA defect

Produce an external handoff — never open the DOA repository to diagnose it:

    TITLE
    PUBLIC DOA SURFACE
    STEPS TO REPRODUCE
    EXPECTED
    OBSERVED
    HTTP / externally observable result
    BANZAMI IMPACT
    BLOCKER: YES / NO

No DOA source filenames, no SQL diagnosis, no internal implementation
assumptions. The DOA project owns the fix. The reverse holds too: a DOA report
of a Banzami defect gives Banzami only the externally observable reproduction,
and Banzami reproduces, diagnoses, fixes, tests and releases it independently.

## Consequences for Banzami assurance

`F0-DP-011` — real signed webhook delivery — is a **Banzami** gap, not a DOA
dependency. It closes with an independent cleanroom sink that is part of
Banzami's own external assurance environment, proving the public lifecycle
without DOA.

Banzami's ordinary external developer cleanroom must pass **before** DOA is used
as a reference application. DOA is a reference application, never a privileged
fixture, never a required dependency, never a substitute for Banzami QA.

## Information that must not cross

Public concepts only: Workspace, Project, Financial Setup, API key metadata,
Wallet Account, Payment, Refund, Transaction, Balance, Webhook.

Never: root wallet, non-public PRIMARY semantics, owner or merchant database
UUIDs, Core secrets, the Banzami DSN, or internal service credentials.

## The standard this is aiming at

> An unrelated company with no access to Banzami internals can build an
> application like DOA — and Banzami can operate and assure its platform without
> access to that company's source code or infrastructure.

Mutual independence is the architecture, not a courtesy.
