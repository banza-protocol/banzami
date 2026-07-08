# ADR — Pilot Limit Policy Overlay for Internal Sandbox

Version: 1.0
Status: Accepted
Date: 2026-07-08

## Context

The Phase 0 / Fase 1 internal test plan (Plano de Teste Detalhado Banzami V1.0)
defines automatic, system-enforced pilot limits for a controlled pilot. The
operator already enforces a general **KYC-tier** limit model (single/daily limits
by verification level) plus request rate limits. The specific V1.0 pilot limits
(per-payment 25.000, consumer daily 50.000, balance caps, merchant receiving
limits, and aggregate pilot caps) are stricter than, and distinct from, that
general model, and were not previously enforced by the system.

## Decision

- The existing **KYC-tier limits remain the general profile/regulatory model** and
  are unchanged.
- A **V1.0 pilot-limit policy** is added as a **stricter overlay** applied on top of
  the KYC-tier model, in `core/compliance/src/pilot.rs`.
- The pilot limits are enforced **by the system under test** (not merely by a test
  harness), because the test plan defines them as automatic system controls. The
  consumer per-payment and daily caps are wired into the compliance
  authorization point (`authorize_operation`), before ledger posting; the
  consumer/merchant balance, merchant receiving, and aggregate caps are provided as
  deterministic policy functions to be enforced at the data layers that own the
  relevant balance/aggregate context.
- The overlay is **config-gated** and **disabled by default**. It enables only for
  the internal Sandbox / Phase 0 profile (`BANZAMI_PILOT_LIMITS` truthy) and
  **never** activates on a live/production environment.
- Rejections use deterministic codes (`PILOT_LIMIT_*`); internal thresholds are
  never exposed in responses.

## Rationale

- Pilot limits are required because the test plan defines automatic system controls
  for the controlled pilot; enforcing them in a harness only would not validate the
  system.
- Keeping them a separate, gated overlay avoids weakening or entangling the general
  KYC-tier model and keeps them off for any non-pilot environment.
- **Phase 0 uses synthetic balances only.** No real money, no real customers.
- **Fase 1 with real funds remains subject to BNA approval and an approved
  safeguarding structure.** This ADR does not claim BNA approval or admission to the
  BNA Regulatory Sandbox.

## Consequences

- A new `pilot` module with unit-tested, deterministic limit evaluation.
- A gated behavioural change at the authorization point when the pilot profile is
  enabled (no change in default/live operation).
- Remaining enforcement wiring (balance/merchant/aggregate at their engines) is
  tracked as follow-up; the policy functions and their unit tests are in place.

## Alternatives considered

- **Harness-only enforcement** — rejected: the plan requires system-enforced
  controls.
- **Changing the KYC-tier thresholds to the pilot values** — rejected: that would
  weaken/replace the general model rather than add a controlled overlay.
