# Phase 0 — Updated Plan V1.0 Gap Matrix

Version: 1.0

Compares the **updated Plano de Teste Detalhado Banzami V1.0** (QR, payment links,
payment intents, online payments, API/SDK, platform/integrator flows, webhooks/events,
reconciliation, complaint/refund) against the **current Phase 0 evidence on main**
(`617afa0a`). Statuses: DONE · PARTIAL · MISSING · SIMULATED · NOT_IN_SCOPE.

Internal technical Sandbox only. Synthetic data only. No LIVE, Production, real money,
external providers, customer data or public access.

## Matrix

| Area | Plan V1.0 expectation | Current state on main | Status | Action this PR |
|------|-----------------------|-----------------------|--------|----------------|
| QR payment | scan→confirm→settle, double-entry, idempotency | F0-006/009/010/012/013–016 PASS live | DONE | none |
| Payment link | create + pay + verify | F0-007: create + simulated-provider confirm live; acquiring settlement is external EMIS/HMAC rail | SIMULATED (settlement) | re-affirm; settlement stays external-rail SIMULATED |
| Payment intent | create → confirm → complete + failed path | F0-008 PASS live (payment-requests create→pay→decline) | DONE | none |
| Online checkout | online payment-session success | payment-sessions API exists (`/v1/business/payment-sessions`), settles as WALLET_PAYMENT via QR; not exercised live | PARTIAL | F0-027 run live (merchant-auth) |
| API/SDK integration | authenticate + create payment via API key / SDK shape | dev-key auth enabled + developer schema migrated; F0-025 live PASS; SDK-shape request F0-026 live PASS | DONE | live dev-key auth + SDK-shape request |
| Platform participant | synthetic platform/integrator fixture (id, key, status, allowed ops) | `POST /internal/v1/fixture-projects` added (sandbox+internal-key gated); developer schema applied to banzami_staging via gated adapter | DONE | fixture provisions a live synthetic platform + key |
| Webhook delivery | deliver signed event on payment | Full outbox+worker+HMAC(`Banza-Signature`)+deliveries system exists; SSRF blocks private sinks → live outbound needs a public https sink | PARTIAL | F0-028: emission observed live via `/v1/webhooks/events`; live outbound delivery SIMULATED (no external/public sink allowed) |
| Webhook retry/failure | backoff, max attempts, terminal FAILED | Implemented (1m/5m/30m/2h/8h, max 5, `webhook_deliveries`) + unit-tested | PARTIAL | F0-029: retry schedule + terminal state contract-verified; live outbound SIMULATED |
| Platform reconciliation | list created vs settled, compare balances | `GET /v1/transactions`, `/v1/merchant/wallet-payments`, `/v1/wallets/{id}/balance` exist | PARTIAL | F0-030 run live |
| API key revocation | revoked key rejected | invalid/revoked → 401 (indistinguishable by design); active keys authenticate | DONE | F0-032 live PASS |
| Unauthorised platform attempt | reject invalid/absent/wrong-scope | dev-key attempt with auth disabled → 401; invalid/revoked → 401; missing scope → 403 INSUFFICIENT_SCOPE; unbound → 403 PAYMENTS_UNAVAILABLE | DONE (rejection) | F0-033 live (dev-key → 401) |
| Verifiable receipt | receipt/reference, queryable, matches state, privacy, non-fabricable | authenticated merchant receipt (reference + state-match + handle-only + non-fabricable); public `/r/{ref}` proof is transaction-scoped | DONE | F0-031 live PASS |
| External-provider settlement | real EMIS/HMAC settlement | intentionally excluded from Phase 0 | NOT_IN_SCOPE | none (documented) |
| Tabletop (restart/incident) | operational drills | F0-019/F0-022 tabletop | SIMULATED | none |

## Summary of gaps to close in this PR

1. **Add** a Sandbox-only synthetic platform/integrator fixture endpoint (Project creation) — DONE (`POST /internal/v1/fixture-projects`, gated to `ENVIRONMENT=sandbox` + `X-Internal-Key`, mirroring `fixture-keys`; unit-tested). The platform holds no money, computes no balances and issues no receipts.
2. **Provision** the dev-key sandbox enablement — DONE (file-only pepper/keys/session/OTP + master switch + payment-capability release + developer-api network alias).
3. **Run live** — DONE. F0-025/026/027/030/031/032/033/034/035 all PASS live (see outcomes). The prior F0-025 blocker is resolved by applying the canonical developer migrations via the gated adapter.
4. **Keep honest** — DONE: webhook outbound (F0-028/029) SIMULATED; payment-link acquiring settlement (F0-007) external-rail SIMULATED/NOT_IN_SCOPE.

## Outcomes (2026-07-09)

| ID | Result | Note |
|----|:------:|------|
| F0-026 SDK-shape payment request | PASS | payment-link create (merchant-auth) |
| F0-027 online checkout | PASS | QR-direct, COMPLETED + balance movement |
| F0-030 platform reconciliation | PASS | created vs settled vs balance, zero discrepancy |
| F0-032 revoked/invalid key | PASS | invalid → 401 (revoked indistinguishable) |
| F0-033 unauthorised platform | PASS | no-auth / forged key → 401 |
| F0-034 link expiry/cancel | PASS | cancel → LINK_NOT_ACTIVE |
| F0-035 intent idempotency | PASS | double-pay single-debit |
| F0-025 platform key auth | PASS | developer schema migrated; active synthetic key → /v1/me active |
| F0-031 receipt verification | PASS | authenticated receipt: state-match + handle-only + non-fabricable |
| F0-028 / F0-029 webhooks | SIMULATED | emission + signature + retry contract; outbound needs external sink |

