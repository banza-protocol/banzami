# Developer Platform — E2E Gap Matrix

Version: 1.0

Compares `main` (`793a44d0`) against the expected Developer Platform lifecycle for a
synthetic platform/integrator in the internal Sandbox. Statuses: DONE · PARTIAL ·
MISSING · SIMULATED · BLOCKED · NOT_IN_SCOPE. Synthetic data only — no LIVE, Production,
real money, external providers, customer data or public access.

## Matrix

| Capability | Current state on main | Status | Action this PR |
|------------|-----------------------|--------|----------------|
| Developer onboarding / auth | Dev-key auth enabled in sandbox (`DEVELOPER_KEY_AUTH_ENABLED`); introspection via developer-api; `GET /v1/me` returns key context | DONE | exercise live (F0-DP-001) |
| Workspace creation | `developer.dev_workspaces` schema migrated; created by the sandbox fixture (`POST /internal/v1/fixture-projects` mints workspace+project) | DONE | exercise live (F0-DP-002) |
| Project creation | `developer.dev_projects`; `POST /internal/v1/fixture-projects` (sandbox+internal-key gated) | DONE | exercise live (F0-DP-003) |
| API key creation / reveal | `POST /internal/v1/projects/{id}/fixture-keys` returns reveal-once secret; only a peppered hash stored | DONE | exercise live (F0-DP-004) |
| API key revocation | Revoke exists only on the Console self-service route (session-guarded); **no internal/fixture revoke path** | MISSING (fixture) | add sandbox-gated `POST /internal/v1/fixture-keys/{keyID}/revoke` (mirrors fixture-keys); exercise F0-DP-012 |
| API key scope enforcement | DualAuth + `developerPaymentAuthority`: missing scope → 403 INSUFFICIENT_SCOPE | DONE | exercise live (F0-DP-005) |
| Webhook configuration | Full outbox+worker+HMAC(`Banza-Signature`)+deliveries + inspection APIs exist; SSRF blocks private sinks | PARTIAL | F0-DP-011: emission + signature + retry contract verified; outbound needs a public HTTPS sink → SIMULATED |
| Payment link creation | `POST /v1/payment-links`; merchant- or dev-key-authenticated | DONE | exercise live (F0-DP-006) |
| Payment intent creation | Payment-requests (create → pay → decline) wallet-native lifecycle | DONE | exercise live (F0-DP-007) |
| Online checkout | Consumer pays online via QR against the merchant bound to the project | DONE | exercise live (F0-DP-008) |
| Receipt verification | Authenticated receipt (`/v1/merchant/wallet-payments`: reference + state + handle-only); public `/r/{ref}` proof is transaction-scoped | DONE | exercise live (F0-DP-009) |
| Transaction listing | `GET /v1/transactions`, `/v1/merchant/wallet-payments` | DONE | exercise live (part of F0-DP-010) |
| Reconciliation export/view | list created vs settled vs wallet balance | DONE | exercise live (F0-DP-010) |
| Error handling | deterministic rejections (401/403/422) with stable codes; no mutation on rejection | DONE | exercise live (F0-DP-012..015) |
| Audit trail | `developer.audit_events`; fixture actions audited (created/revoked) | DONE | exercise/observe (F0-DP-016) |
| Sanitised evidence | `tests/phase0/sanitise.mjs` fails closed on any secret/token/id/host/IP/path | DONE | run over all evidence trees |
| **Developer Console UI** | **No developer/console frontend app exists** (`apps/` has admin, checkout, dashboard, mobile, pay, validation-studio, website — none is the Developer Console) | **BLOCKED** | mark `BLOCKED — DEVELOPER CONSOLE UI E2E PATH MISSING`; do not fake UI via API |

## Summary of gaps to close in this PR

1. **Add** a Sandbox-only internal fixture revoke endpoint (`POST /internal/v1/fixture-keys/{keyID}/revoke`), hard `ENVIRONMENT=sandbox` + internal-key gated, mirroring the existing fixture-keys/fixture-projects gating — the one genuinely MISSING lifecycle piece (enables a real revoked-key test F0-DP-012).
2. **Run live** the full developer-platform lifecycle (F0-DP-001..016) via an API E2E harness.
3. **UI E2E**: BLOCKED (no Developer Console frontend) — reported honestly, not faked.
4. **Webhooks**: SIMULATED (emission + signing + retry contract; outbound needs a public HTTPS sink, excluded by no-external/no-public).
