# Banzami — Evidence Audit

**Audit:** PHASE NEXT — EVIDENCE AUDIT
**Date:** 2026-06-14
**Method:** Read-only, code-level audit of every PLANNED/BLOCKED validation item
against the Rust core, Go services, Flutter apps, SDKs, DB migrations, and tests.
**Goal:** Increase readiness by validating existing capabilities before writing new
code. **Trust code, not assumptions. Nothing was implemented.**

> **Headline:** of 50 PLANNED/BLOCKED items, **~26 are already IMPLEMENTED in code**
> (handlers + core engines + migrations exist), ~19 are PARTIALLY implemented, and
> only ~5 are genuinely absent or infra-only. The matrix badly understates real
> readiness. Status changes are a §16 follow-up — see end.

---

## IMPLEMENTED — code fully supports the capability (recommend → VALIDATED)

| ID | Current | Evidence (files) | Conf |
|----|---------|------------------|-----:|
| `QR-001` Static QR | PLANNED | `core/qr/src/engine.rs` (`create_static`) · `services/api-gateway/.../handler/qr.go` (POST `/v1/qr/static`) · `db/migrations/0013_qr_codes_schema.sql` | 80 |
| `QR-002` Dynamic QR | PLANNED | `core/qr/src/engine.rs` (`create_dynamic`, HMAC) · `core/qr/src/expiry_worker.rs` · POST `/v1/qr/dynamic` | 80 |
| `QR-003` Scan/decode QR | PLANNED | `core/qr/src/engine.rs` (`decode`, `mark_used`) · POST `/v1/qr/decode` | 75 |
| `PL-001` Pay link creation | PLANNED | `core/payment-links/` (+test) · `handler/payment_links.go` · `db/0014_payment_links_schema.sql` | 80 |
| `PL-002` Public pay page | PLANNED | `apps/pay/` · `handler/consumer_pay_links.go` · public GET by slug | 75 |
| `PL-003` Pay link settlement + webhooks | PLANNED | `handler/payment_links.go` + webhook dispatch | 75 |
| `PR-001` Payment request creation | PLANNED | `handler/payment_requests.go` · `db/0030_payment_requests.sql` | 75 |
| `PR-002` Pay / decline request | PLANNED | `handler/payment_requests.go` | 70 |
| `API-001` REST tx/wallets/transfers | PLANNED | `handler/{transactions,wallets,transfers}.go` | 80 |
| `API-002` REST QR/links/requests | PLANNED | `handler/{qr,payment_links,payment_requests}.go` | 80 |
| `API-003` REST payouts/refunds/disputes | PLANNED | `handler/{payouts,refunds,disputes}.go` | 75 |
| `WH-001` Webhook delivery | PLANNED | `internal/service/postgres_webhooks.go` · `handler/webhooks.go` · `db/0009_webhooks_schema.sql` | 80 |
| `WH-002` HMAC-SHA256 signature | PLANNED | `internal/webhook/signer.go` (constant-time `hmac.Equal`, replay window) | 85 |
| `WH-003` Retry with backoff | PLANNED | `postgres_webhooks.go` (`retrySchedule`, max 5 retries, `scheduled_at`) | 75 |
| `SBX-001` Isolated sandbox | PLANNED | `handler/sandbox.go` · `db/0018_sandbox_environment.sql` · simulated acquirer · env claim in JWT | 75 |
| `LED-002` Ledger immutability | PLANNED | `db/0033_ledger_immutability.sql` · append-only ledger engine | 85 |
| `SEC-003` Payment idempotency | PLANNED | `internal/middleware/idempotency.go` (Idempotency-Key, 24h TTL, lock) + ledger idempotency keys | 85 |
| `SEC-004` Immutable audit trail | PLANNED | `db/0025_audit_log.sql` · `core/api/src/routes/risk.rs` (immutable INSERT) · admin query | 80 |
| `OBS-001` OpenTelemetry + Prometheus | PLANNED | `internal/observability/otel.go` (OTLP traces + Prometheus exporter) | 80 |
| `OBS-002` Grafana dashboards | PLANNED | `infra/monitoring/grafana/dashboards/`, `prometheus.yml` | 70 |
| `OBS-003` Structured JSON logs | PLANNED | `internal/middleware/logger.go` (slog structured) | 80 |
| `REF-001` Refunds | PLANNED | `handler/refunds.go` · `db/0027_refunds.sql` | 70 |
| `REF-002` Dispute resolution | PLANNED | `handler/disputes.go` · `db/0028_disputes.sql` | 65 |
| `HDL-003` Handle search/suggest | PLANNED | `handler/consumers.go` (`Search` → `/v1/consumers/search`) · `core/identity` | 70 |
| `RSK-001` Real-time risk engine | PLANNED | `core/risk/src/engine.rs` (`StaticRiskEngine`, `RiskLimits`, `any_breach`) · `db/0024_risk_fraud.sql` | 70 |
| `SDK-001` TypeScript SDK | PLANNED | `sdk/typescript/src/` (client, money, webhooks, errors, types + tests) | 75 |
| `SDK-003` Flutter SDK | PLANNED | `sdk/flutter/lib/` (41 source files) | 70 |
| `SDK-005` Python SDK | PLANNED | `sdk/python/banza/` (resources, models, signature, exceptions + tests) | 70 |

## PARTIALLY_IMPLEMENTED — engine/structure exists, capability incomplete (recommend → IN_PROGRESS)

| ID | Current | What exists / what's missing | Conf |
|----|---------|------------------------------|-----:|
| `QR-004` Public merchant QR store | PLANNED | QR engine exists; public storefront UI not evidenced | 45 |
| `QR-005` P2P QR | PLANNED | QR + P2P engines exist; dedicated P2P-QR flow not evidenced | 40 |
| `BM-001` Merchant mobile app | PLANNED | `apps/merchant/` (Flutter, screens) exists; coverage partial | 50 |
| `BM-002` Real-time payment notifications | PLANNED | `internal/notify/fcm.go` (FCM) exists; end-to-end partial | 50 |
| `BM-003` QR generation in mobile | PLANNED | QR backend exists; mobile UI partial | 40 |
| `BW-001` Web dashboard | **RETIRED 2026-09-12** | `apps/dashboard/` was deleted (CAP-APP-002); what merchants and developers use is the Developers Console in `apps/website/app/developers` | — |
| `BW-002` Analytics & reports | **RETIRED 2026-09-12** | the dashboard that presented them was deleted; `core/api/src/routes/analytics.rs` remains and has no released public surface | — |
| `BW-003` API key management | **SUPERSEDED 2026-09-12** | now the Developers Console (`/api-keys`): scopes, reveal-once, rotation, revocation, last-used — all swept and released | — |
| `BW-004` Team & permissions | **SUPERSEDED 2026-09-12** | now Console workspace members and roles, proven by the RBAC matrix sweep (22/22) | — |
| `SDK-002` PHP SDK | PLANNED | `sdk/php/src/` (client, webhooks, exceptions); resource coverage partial | 55 |
| `SDK-004` Go SDK | PLANNED | `sdk/go/banzami/` (client, webhook, types + tests); coverage partial | 55 |
| `RSK-002` Suspicious-tx review & alerts | PLANNED | `services/admin-api/.../risk.go` (freeze/flags/audit) exists; alerting partial | 50 |
| `KYC-001` Consumer KYC | **BLOCKED** | `core/compliance/` state machine (`CustomerCompliance`, `can_process_transactions`) + `db/0008`; **real identity-verification provider absent** | 45 |
| `KYC-002` Merchant KYB | PLANNED | `core/compliance/` (`MerchantCompliance`) exists; real verification absent | 45 |
| `PAY-001` Bank withdrawals | PLANNED | `core/payouts/` (1194 lines, +test) + `handler/payouts.go` + `db/0006`; **real disbursement requires at least one approved withdrawal provider/rail (EMIS or partner bank — currently stubbed)** | 55 |
| `PAY-002` Payout reconciliation (EMIS) | **BLOCKED** | `core/reconciliation/` + admin handler exist; EMIS leg stubbed | 40 |
| `LED-004` Automatic daily reconciliation | PLANNED | `core/reconciliation/` engine + admin manual trigger; **no scheduled daily job** (`core/jobs` absent) | 50 |
| `EMS-001` EMIS / Multicaixa integration | **BLOCKED** | `core/acquiring/` framework + working `SimulatedProvider`; **real `EMISProvider.initiate_payment` is a stub (TODO)** | 50 |
| `EMS-002` Interbank settlement via EMIS | **BLOCKED** | `core/settlement/` (1030 lines, +test) exists; EMIS leg stubbed | 35 |

## NOT_IMPLEMENTED / infra-only (remain PLANNED)

| ID | Current | Note | Conf |
|----|---------|------|-----:|
| `P2P-002` Split payments by QR | PLANNED | No code evidence — genuinely planned | 20 |
| `SEC-001` TLS 1.3 everywhere | PLANNED | Infra concern (Cloudflare/nginx), not application code — verify at deployment, not in repo | 30 |
| `SEC-002` AES-256 encryption at rest | PLANNED | Infra concern (DB/disk encryption) — not evidenced in code; verify at infra | 20 |

---

## Summary

| Actual status | Count |
|---------------|------:|
| IMPLEMENTED (→ VALIDATED candidate) | 28 |
| PARTIALLY_IMPLEMENTED (→ IN_PROGRESS) | 19 |
| NOT_IMPLEMENTED / infra-only (remain PLANNED) | 3 |

**The launch gate is narrower than the matrix implies.** The product surface (QR,
pay links, payment requests, webhooks, REST API, sandbox, refunds, disputes,
observability, idempotency, audit, immutability) is **already built**. The genuine
blockers are concentrated in **one place: the EMIS rail** (real funding,
withdrawals, interbank settlement — currently simulated/stub) **and real KYC/KYB
verification**. Everything else is implementation-present and mostly needs tests +
the §16 validation gate, not new code.

---

## Recommended next step (governance)

These are **recommendations**; applying them is a §16 matrix change. Caveats:

- **Financial-critical items** (`cat-ledger`, `cat-wallet`, `cat-p2p`, `cat-qr`,
  `cat-payouts`, `cat-refunds`) require **all invariants PASS + confidence ≥ 80**
  before `VALIDATED` — several IMPLEMENTED items here lack integration tests, so the
  honest move for them is **`IMPLEMENTED`**, then `VALIDATED` once tests run.
- Non-financial IMPLEMENTED items (webhooks, observability, sandbox, API, SDKs,
  audit) can move toward `VALIDATED` with evidence.
- PARTIAL items → `IN_PROGRESS`. The 3 infra/absent items → remain `PLANNED`.

A §16 proposal can be prepared to: promote the 28 IMPLEMENTED items to
`IMPLEMENTED`/`VALIDATED`, move the 19 partials to `IN_PROGRESS`, and attach the
evidence files above. **No code is written — this only corrects the matrix to match
the code that already exists.**
