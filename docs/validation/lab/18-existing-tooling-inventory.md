# 18 — Existing test / E2E tooling inventory

Version: 1.0
Conclusion: **the Lab orchestrates this estate. It does not rebuild it.**

---

## 1. Scale

| Layer | Count | Location |
|---|---:|---|
| Rust test functions | 309 | `core/**` |
| Go test functions | 1 242 (303 files) | `services/**` |
| Flutter test files | 73 | `apps/mobile/test`, `sdk/flutter` |
| TypeScript SDK tests | 18 | `sdk/typescript` |
| Static gates (`check-*.mjs`) | 71 | `tools/` |
| Operator guards | 51 | `tests/ops/` |
| Security tests | 2 | `tests/security/` |
| Phase-0 shell harnesses | 37 | `tests/phase0/` |
| E2E `.mjs` harnesses | 114 | `tools/e2e/**` |
| Make targets | 236 | `Makefile` |
| CI jobs | 23 | `.github/workflows/ci.yml` |
| **Total automated checks** | **≈ 1 900** | |

## 2. The browser E2E estate — the Lab's backbone

`tools/e2e/app-web/` drives the **real Flutter application** on
`app.banzami.com` with pinned Chromium via Playwright.

| Proof | Journey |
|---|---|
| 01 | registration → PIN → Home |
| 02 | Web→Web P2P |
| 03 | invalid deep link |
| 04 | deep-link resume and pay |
| 05 | realtime incoming payment (latency measured) |
| 06 | realtime resilience |
| 07 | **Web QR camera — real fake-camera media pipeline** |
| 08 | QR decoder integrity (self-hosted ZXing, strict CSP, version pin) |
| 10 | Business Web `@handle`+PIN login → Receive Point |
| 11 | **cross-context: Business renders QR → Consumer scans real pixels → settles** |
| 12 | web session security |
| 13 | Business Web lifecycle |
| 14 | Business Web fail-closed |
| 15 | Business Web commerce |
| 16 | Business Web UX security |
| 17 | dual-context cross-tab (one cookie, two contexts) |
| 18 | Business Web under large accessibility text |
| 19 | **Collections split settlement (452 → 226+226)** |
| 20 | Collections public idempotency |

Supporting libraries already solve the hard parts:
`lib/browser.mjs` (pinned Chromium), `fixtures/make-qr-y4m.mjs` (fake-camera
video), `lib/pay-collection-share-camera.mjs`, `lib/webhook-sink.mjs`,
`lib/operator-read.mjs` (read-only ledger), `lib/{consumer,business-provision}.mjs`,
`lib/money.mjs`, `lib/report.mjs`, plus seven page objects.

**QR through real pixels is already solved** — §28's pipeline
(producer UI → rendered QR → Y4M → Chromium fake camera → ZXing → canonical
parser → payer) exists and runs. No new work is required for it.

## 3. Reusable by suite

| Suite | Existing assets |
|---|---|
| S00 | `check-sandbox-{migration,deploy,operational,bootstrap}`, `check-schema-reality`, `check-deploy-parity`, `check-live-fail-closed`, `check-repo-layout` |
| S01 | proofs 01/12/17, `console/auth-email-e2e`, `console/mint-session`, `business-app-session-e2e` |
| S02 | proofs 01–09 |
| S03 | proofs 10–18 |
| S04 | `business-receive-{point,web}-e2e`, proof 11 |
| S05 | `cap-pay-002`, `hosted-checkout-{e2e,payment-e2e}`, `pay-frontend-lifecycle-e2e` |
| S06 | proofs 19, 20 |
| S07 | `refund-{devkey,published-sdk}-e2e`, `refund-settlement-matrix`, `console/refund-rbac` |
| S08 | proof 02, `transfer-{devkey-e2e,guards,sandbox-e2e}` |
| S09 | `ledger-reconciliation`, `money-model-e2e`, `economic-model-smoke`, `financial-assurance-sql` |
| S10 | `settlement-economics-e2e`, `payout-sandbox-e2e`, `adr055-binding-seal-e2e`, `pricing-authority-e2e` |
| S11 | `developer-platform-e2e`, `developer-journey-50`, `golden/developer-golden-journey-e2e`, `dev-key-gateway-e2e`, `api-logs-correlation-e2e`, `console/*` (15 tools) |
| S12 | `sdk-types-cleanroom`, `sdk-public-install-proof`, `check-sdk-{contract,dual-package,payment-boundary,refund-contract}` |
| S13 | `webhook-{delivery-to-doa,lifecycle,retry-cleanroom}-e2e`, `cap-webhook-001`, **the running sink** |
| S14 | `doa-{canonical-binding,public-donation-e2e}`, `campaign-payment-segregation`, `doa/{sweep,route-sweep,field-sweep}` |
| S15 | `receipt-assurance`, `proof-lookup-assurance`, `payment-receipt-identity-e2e`, `proof-reference-canonicality` |
| S16 | `console/{matrix-bw-proof,rbac-matrix,accessibility,responsive,route-suite,click-audit,locale-sweep}` |
| S17 | `business-tenant-isolation`, `retired-authority-denied`, `cross-project-isolation`, `ra-054-authority`, `realtime-isolation-e2e` |
| S18 | `check-mobile-config`, `assure-mobile-ios`, `check-consumer-residue`, `app-schemes-registered`, `mobile/app-001-device-journey` |
| S19 | `check-openapi-route-drift`, 13 `check-docs-*` gates, `docs/{quickstart-e2e,cold-reader,audit,sweep,visual-qa}`, `check-public-site-truth` |
| S21 | `candidatura-e2e`, `approved-business-e2e`, `project-onboarding-e2e`, `kyb-{attention,storage-boundary}-e2e` |
| S22 | `pricing-authority-e2e`, `check-economic-authority`, `check-pricing-{consumers,assignment}` |
| S23 | `external_rail_tests.rs` (**unit only** — E2E is new) |

## 4. The runner already exists in embryo

`tools/e2e/run-assurance.mjs` is the Validation Runner's direct ancestor:

- runs canonical suites, remote (on the VM) and local;
- produces **one machine-readable result**, never scraped prose;
- trust order: exit status → anchored summary line → **UNKNOWN, never PASS**;
- writes generated evidence **outside the worktree**, keyed by revision;
- **reads the served revision from the containers** rather than assuming it.

Every one of those properties is a requirement of this design. The Lab extends
this module rather than starting over.

Other infrastructure to keep: `tools/e2e/lib/{assurance-output,parse-suite-summary}.mjs`,
`tests/phase0/lib/{e2e-run.sh,synthetic-tenant.sh}`, `tests/phase0/sanitise.mjs`,
`tools/e2e/cleanroom/*`, `infra/sandbox/webhook-sink/sink.mjs`.

## 5. Gaps this estate does not cover

| Gap | Why it matters |
|---|---|
| No single orchestrator over all 114 harnesses | there is no "run everything" |
| No capability↔test mapping | coverage cannot be computed |
| No Evidence Manifest or hashing | evidence is per-harness and ad hoc |
| No persistent actors | every harness builds and suspends its own tenant |
| Nine capability areas with zero Sandbox E2E | doc 04 §5 |
| `app-frontend` outside deploy parity | the primary E2E surface is ungated |
| Rail fail-closed never proven end to end | ADR-061's central table |
| BANZADMIN thinly covered | 146 routes, 27 pages |
| Go/PHP/Python SDKs have no acceptance | four of six mandatory SDKs |

## 6. Physical-device dependence

`tools/e2e/mobile/app-001-device-journey.mjs` and the iOS assurance targets
exist because the iOS Simulator cannot run `mobile_scanner`/MLKit on arm64 —
camera scanning must be verified on a real iPhone.

This does **not** block routine validation. §27's principle applies: the Web
build of the same Flutter source executes the functional journeys, and the
native targets keep **build/compile/platform gates** plus a periodic manual
device pass. Only native camera capture is genuinely device-bound, and it is
classified `OUT_OF_SCOPE` for routine runs with an explicit reason rather than
silently skipped.

## 7. Browser matrix

**Chromium via Playwright, pinned**, is the primary and only automated browser.
It is the one with fake-camera support, which is non-negotiable for §28.

WebKit and Firefox smoke tests are **not recommended** for Phase C. The
application is a Flutter CanvasKit target: its rendering is its own, so
cross-browser differences surface as *platform-integration* issues (camera,
service worker, storage) rather than layout differences. A targeted WebKit
smoke of the payer surface (`pay.banzami.com`, ordinary HTML) is the only case
with a plausible return, and it can be added later on evidence.
