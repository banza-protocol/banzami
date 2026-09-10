# ADR-032 — Application Integration Engine

**Status:** Accepted · **Date:** 2026-07-02 · **Supersedes:** none ·
**Relates to:** ADR-025 (env router), ADR-027 (wallet accounts), ADR-028
(application business account), ADR-029 (application-defined settlement fees),
ADR-030 (payment sessions), ADR-031 (transaction-type pricing).

> **Superseded in part (2026-09-10):** the app-defined application fee this ADR references (`application_fee_bps`, ADR-029; decisions 4 and 7) was superseded by [ADR-057](ADR-057-project-financial-readiness.md) — the operator's assigned pricing profile sets the rate, the app names only the fee destination, and a Project reads its readiness from `GET /v1/financial-setup`.

## Context

Multiple applications integrate with the Banzami operator — first-party apps,
partners, and third parties (the reference case is **DOA**, a donation app). Over
time, integration knowledge was implicit and scattered. Without a hard, written
boundary an application could drift into computing money (fees, settlement) or
holding balances, which would break financial correctness, auditability and the
protocol-first governance of the ecosystem (ADR-025, ADR-035).

We need one authoritative statement of *what an application may and may not do*,
and of *which engine owns each responsibility*, so every integration — present
and future — is consistent and safe.

## Decision

We formalise the **Application Integration Engine** as the canonical model for
app↔operator integration. The following are binding:

1. **Applications never compute money.** No application computes fees, settlement
   amounts, balances or ledger postings. Ever.
2. **The operator always computes money.** Pricing, the operator fee, the
   application-fee split, settlement, and every ledger posting are the operator's.
3. **Business Resolution is mandatory.** An application resolves its business via
   `GET /v1/business/me` (identity, status, wallet, sub-accounts, pricing,
   settlement readiness, blockers) and renders that state — it never derives it.
4. **The application fee belongs to the application.** The app defines its own
   `application_fee_bps`; the operator validates and executes the split (ADR-029).
5. **The operator fee belongs to the operator.** It is chosen by the business
   *category* via the pricing rule (ADR-031), never by the application.
6. **The wallet belongs to the operator.** Applications hold *references*, never
   balances. Funds may sit in segregated sub-accounts (ADR-027) and are `held`
   until settlement.
7. **Settlement belongs to the operator.** The app requests it and supplies the
   application fee + beneficiary reference; the operator does the rest and drives
   terminal state via `application_settlement.*` webhooks.
8. **SDK-first, environment-isolated, business-isolated.** Integrations use an
   official SDK (never raw HTTP in official material), on sandbox or live only
   (ADR-025), with an API key scoped to exactly one business.

The canonical documentation is [application-integration-engine.md](../architecture/application-integration-engine.md)
plus the per-engine documents and the `SVG-BZ-*` diagrams.

## Rationale

- **Financial correctness & audit** require a single ledger owned by one party.
  Splitting money logic into apps would make reconciliation and proof impossible.
- **Protocol-first (ADR-035/ADR-025):** apps consume capabilities; they do not
  define financial behaviour. This ADR encodes that at the integration layer.
- **Uniformity:** one model means any app (marketplace, school, delivery, DOA)
  integrates the same way, and the operator can evolve pricing/settlement without
  touching apps.
- **Security:** business isolation + server-only secret keys + signed webhooks
  keep an app unable to affect another business or forge money movement.

## Alternatives considered

- **Apps compute their own fees/settlement, operator reconciles.** Rejected:
  breaks correctness, audit and protocol-first; every app would reinvent money.
- **No mandatory resolution (apps cache their own status).** Rejected: leads to
  stale/incorrect gating (e.g. paying to an un-approved business).
- **Per-app bespoke integrations.** Rejected: unmaintainable; no canonical story
  for `developers.banzami.com`.

## Consequences

- **Positive:** one clear contract; safe third-party integration; the operator
  can change pricing/settlement centrally; DOA becomes the reference example.
- **Cost:** apps must round-trip to the operator for state (mitigated by a cheap
  `GET /v1/business/me` + short poll). Apps cannot “fix” money issues locally —
  by design.
- **Follow-ups:** publish the developer portal ([../developer/](../developer/));
  keep the per-engine docs in sync with the code as the surface evolves.
