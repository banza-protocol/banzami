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
| API/SDK integration | authenticate + create payment via API key / SDK shape | developer-api (:8086) key authority + TS/Go/PHP/Python SDK packages exist; dev-key auth path NOT enabled in sandbox deploy | PARTIAL | provision dev-key enablement; F0-025/026 live + SDK-contract shape |
| Platform participant | synthetic platform/integrator fixture (id, key, status, allowed ops) | Workspace→Project→APIKey model exists; only session-guarded Console creates a Project — **no internal/fixture route to create a synthetic platform** | MISSING (fixture) | add Sandbox-only `POST /internal/v1/fixture-projects` (X-Internal-Key + ENVIRONMENT=sandbox gated, mirrors fixture-keys) |
| Webhook delivery | deliver signed event on payment | Full outbox+worker+HMAC(`Banza-Signature`)+deliveries system exists; SSRF blocks private sinks → live outbound needs a public https sink | PARTIAL | F0-028: emission observed live via `/v1/webhooks/events`; live outbound delivery SIMULATED (no external/public sink allowed) |
| Webhook retry/failure | backoff, max attempts, terminal FAILED | Implemented (1m/5m/30m/2h/8h, max 5, `webhook_deliveries`) + unit-tested | PARTIAL | F0-029: retry schedule + terminal state contract-verified; live outbound SIMULATED |
| Platform reconciliation | list created vs settled, compare balances | `GET /v1/transactions`, `/v1/merchant/wallet-payments`, `/v1/wallets/{id}/balance` exist | PARTIAL | F0-030 run live |
| API key revocation | revoked key rejected | `DELETE /projects/{id}/keys/{keyID}` revoke + introspection → 401 on revoked | PARTIAL | F0-032 live after enablement |
| Unauthorised platform attempt | reject invalid/absent/wrong-scope | dev-key attempt with auth disabled → 401; invalid/revoked → 401; missing scope → 403 INSUFFICIENT_SCOPE; unbound → 403 PAYMENTS_UNAVAILABLE | DONE (rejection) | F0-033 live (dev-key → 401) |
| Verifiable receipt | receipt/reference, publicly verifiable, privacy | `proof_reference` (BZM-…) + public `GET /v1/public/proofs/{ref}` (handle-only privacy) exists | PARTIAL | F0-031 run live |
| External-provider settlement | real EMIS/HMAC settlement | intentionally excluded from Phase 0 | NOT_IN_SCOPE | none (documented) |
| Tabletop (restart/incident) | operational drills | F0-019/F0-022 tabletop | SIMULATED | none |

## Summary of gaps to close in this PR

1. **Add** a Sandbox-only synthetic platform/integrator fixture endpoint (Project creation) — the one genuinely MISSING fixture; gated to `ENVIRONMENT=sandbox` + `X-Internal-Key`, mirroring the existing `fixture-keys` path. The platform holds no money, computes no balances and issues no receipts.
2. **Provision** the dev-key sandbox enablement (API-key pepper, matched internal keys, payee-validation key, payment-capability release, dev-key-auth master switch, session/OTP peppers) — file-only where secret.
3. **Run live**: F0-025 (key auth), F0-026 (SDK-shape payment request), F0-027 (online checkout), F0-030 (reconciliation), F0-031 (receipt verification), F0-032 (revoked key), F0-033 (unauthorised), F0-034 (link expiry/cancel), F0-035 (intent idempotency).
4. **Keep honest**: webhook live outbound delivery (F0-028/029) is SIMULATED (SSRF requires a public sink; no-external/no-public constraint); payment-link acquiring settlement stays external-rail SIMULATED/NOT_IN_SCOPE.
