# 04 — Capability → validation coverage matrix

Version: 1.0
Basis: repository `0cdc05a2`; 114 E2E harnesses and 24 manifest capabilities audited.

---

## 1. How to read this

`Registry` — is there a capability entry today?
`Automated` — is there an existing harness that executes it against the deployed
Sandbox (not a unit test)?
`UI-first` — does that harness drive the real user surface, as §26 requires?
`Gap` — what the Lab must add.

Rows marked ⛔ are the coverage-invariant failures a first Full Run will report.

## 2. Capabilities with a registry entry (24)

| Capability | Registry | Automated Sandbox E2E | UI-first | Gap |
|---|---|---|---|---|
| CAP-LEDGER-001 ledger | ✅ verified | `ledger-reconciliation.sh`, `money-model-e2e.sh` | n/a | — |
| CAP-WALLET-001 wallets | ✅ verified | `wallet-subaccount-e2e.sh`, `sdk-wallet-accounts-public.sh` | ❌ API only | Business/Consumer balance UI |
| CAP-TRANSFER-002 wallet-account transfers | ✅ verified | `transfer-devkey-e2e.sh`, `transfer-sandbox-e2e.mjs` | ❌ | Console UI journey |
| CAP-PAY-001 payment sessions | ✅ verified | `cap-pay-001-sandbox-e2e.mjs` | partial | payer-surface UI assertion |
| CAP-PAY-002 payment links | ✅ verified | `cap-pay-002-sandbox-e2e.mjs`, `hosted-checkout-*` | ✅ pay-frontend | — |
| CAP-PAY-003 QR | ✅ verified | `qr-payment-e2e.sh`, proofs 07/08 | ✅ **real pixels** | — |
| CAP-REFUND-001 refunds | ✅ verified | `refund-devkey-e2e.sh`, `refund-published-sdk-e2e.sh`, `refund-settlement-matrix.sh` | ❌ API only | Console + Business UI |
| CAP-PAYOUT-001 payouts | ✅ verified | `payout-sandbox-e2e.sh` | ❌ | Business app payout screen |
| **CAP-COLLECT-001 Collections** | ⚠️ **stale** (`blocked`/`surface: none`) | proofs 19, 20 | ✅ | **registry contradicts runtime** (VL-004) |
| CAP-WEBHOOK-001 webhooks | ✅ verified | `webhook-{delivery-to-doa,lifecycle,retry-cleanroom}`, `cap-webhook-001` | n/a | — |
| CAP-PROOF-001 receipts/verifier | ✅ verified | `receipt-assurance.sh`, `proof-lookup-assurance.sh` | partial | verifier page UI |
| CAP-DEV-001 Console | ✅ verified | `developer-foundation-e2e`, `auth-email-e2e`, `route-suite` | ✅ | — |
| CAP-READINESS-001 financial readiness | ✅ verified | `project-readiness-{e2e,probe}.sh` | partial | Console Financial Setup UI |
| CAP-DEV-002 API keys | ✅ verified | `dev-key-gateway-e2e.mjs` | ✅ | — |
| CAP-DEV-003 request logs | ✅ verified | `api-logs-correlation-e2e.mjs` | ✅ | — |
| CAP-DOCS-001 docs site | ✅ verified | `docs/{audit,sweep,quickstart-e2e,cold-reader}` | ✅ | — |
| CAP-SDK-001 TypeScript SDK | ✅ verified | `sdk-types-cleanroom.sh`, `sdk-public-install-proof.mjs` | n/a | — |
| CAP-SDK-002 `banzami_client` | ✅ verified | `check-sdk-dual-package.mjs` | n/a | **published-artifact proof** (VL-011) |
| CAP-APP-001 Consumer app | ⚠️ `blocked` | proofs 01–09 (**web**), `app-001-device-journey` | ✅ | registry says blocked; web is proven |
| CAP-APP-005 Business app | ⚠️ `blocked` | proofs 10–18 (**web**) | ✅ | same |
| CAP-APP-002 dashboard | ✅ `removed` | `check-retired-surfaces` | n/a | — |
| CAP-APP-003 BANZADMIN | ⚠️ `in-audit` | `matrix-bw-proof`, `rbac-matrix`, `refund-rbac` | partial | ⛔ 146 routes, 27 pages, thin coverage |
| CAP-APP-004 pay + checkout | ✅ verified | `pay-frontend-lifecycle-e2e.sh`, `hosted-checkout-payment-e2e.sh` | ✅ | — |
| CAP-LIVE-001 Live rails | ✅ `blocked` | `check-live-fail-closed` | n/a | correctly out of scope |

## 3. Implemented capabilities with **no registry entry** ⛔

Each is externally reachable today. Each is a `CAPABILITY_REGISTRY_DRIFT`
failure until entered.

| Area | Evidence it exists | Existing coverage | Journey gap |
|---|---|---|---|
| **Consumer P2P** `/v1/transfers` | 831 transfer rows; proof 02 | proof 02 (web-to-web) | negatives: self-transfer, insufficient funds, invalid recipient, replay |
| **Business Receive Point** (ADR-065) | 3 routes, migrations 0154–0155 | `business-receive-{point,web}-e2e`, proof 11 | suspension fail-closed, mint idempotency |
| **App Banzami Web** (ADR-064/066) | `app-frontend` container | proofs 01–18 | dual-context, session security beyond proof 12/17 |
| **Business application / KYB** (ADR-058/059) | 137 applications, 8 KYB routes | `candidatura-e2e`, `kyb-attention-e2e`, `kyb-storage-boundary-e2e` | approve→activate→first-payment closure |
| **Consumer KYC** | 5 routes, `kyc_cases` | — | ⛔ none (Sandbox requires no KYC — classify `OUT_OF_SCOPE`) |
| **Application settlements** (ADR-029) | 2 gateway + 7 core routes | `settlement-economics-e2e.sh`, `adr055-binding-seal-e2e.sh` | Console + BANZADMIN UI |
| **Disputes** | 5 gateway + 3 admin routes | `disputes_ownership_test.go` (unit) | ⛔ no Sandbox E2E |
| **Risk / freeze** | 6 admin routes, `risk_flags` | `freeze_tests.rs` (unit) | ⛔ no Sandbox E2E |
| **Reconciliation / boundary** (ADR-063) | 2 admin + 3 core routes | `money-model-e2e.sh` | boundary recon UI + run lifecycle |
| **Pricing rules / profiles / fee policies** | 17 admin routes | `pricing-authority-e2e.sh`, `check-pricing-*` | ⛔ BANZADMIN UI journeys |
| **Operator fees** | 2 admin routes | `economic-model-smoke.sh` | UI |
| **Sandbox self-service** (ADR-060) | public registration | `self-service-e2e.mjs` | — (covered) |
| **Sandbox delete** (ADR-062) | `/projects/{id}/sandbox/reset`, retire routes | `sandbox-delete-e2e.mjs` | — (covered) |
| **Sandbox rail simulator** (ADR-061) | `GET/PUT /v1/sandbox/external-rail` | `external_rail_tests.rs` (unit) | ⛔ **no E2E of fail-closed at the rail** |
| **Realtime (SSE)** | `/v1/me/realtime`, `/v1/realtime/payment-sessions/{id}` | proofs 05, 06 | Business-side realtime |
| **Push topics / FCM** | 2 routes, `POST /v1/debug/push-test` | — | ⛔ none |
| **Handle registry / @banza** | 1 843 handles, 43 SYSTEM reserved | `handle_namespace_tests.rs` | reserved-name negatives |
| **Team members** | 3 gateway routes | — | ⛔ none |
| **Beta testers** | 2 admin + 1 public route | — | ⛔ none |
| **Compliance cases** | 11 admin routes | `compliance_tests.rs` | ⛔ no Sandbox E2E |
| **Consumer pay links** | 3 routes | `verify-consumer-pay-link.sh` | UI |
| **Public profiles** `/public/profiles/{handle}` | live | — | ⛔ none |
| **Website public surfaces** | 85 pages | `public-truth-live.mjs`, `live-crawl.mjs` | — (covered) |
| **DOA integration** | 1 ACTIVE tenant | `doa-*` (4 harnesses), `doa/sweep.mjs` | see doc 13 |
| **Go / PHP / Python SDKs** | 3 packages | `online-platform-sdk.sh` (partial) | ⛔ no published-artifact proof |

## 4. Quantified coverage position

| Measure | Count |
|---|---:|
| Externally reachable routes | 361 |
| Routes claimed by a capability `api_surface` | ~216 |
| **Unclaimed routes** | **~145** |
| Capabilities in the registry | 24 |
| Capability areas discovered with no entry | **26** |
| Estimated registry size after Phase B | **~70** |
| Existing Sandbox E2E harnesses reusable | 114 |
| Capability areas with zero Sandbox E2E ⛔ | **9** |

The nine with zero deployed-Sandbox E2E: disputes, risk/freeze, compliance
cases, pricing UI, push topics, team members, beta testers, public profiles,
rail-simulator fail-closed.

## 5. Coverage invariant on day one

A first Full Run against today's tree would report approximately:

```
CAPABILITY_IMPLEMENTED_BUT_UNCOVERED  =  9   (FAIL)
CAPABILITY_REGISTRY_DRIFT             = 145  (FAIL, route-level)
DOCUMENTED_BUT_NOT_IMPLEMENTED        =  ≥3  (see doc 19: VL-004, VL-009, VL-010)
```

This is the expected and intended first result. It is what Phase D is for.
