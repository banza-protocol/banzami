# 08 — Complete Validation Journey Catalog

Version: 1.0
Status: Proposed (Phase A) — nothing executed.

---

## 1. Journey definition format

Every entry in `quality/validation/journeys.yaml`:

```yaml
- journey_id: S06-COL-001
  suite: S06
  name: Split a charge two ways and settle both shares
  capabilities: [CAP-COLLECT-001, CAP-PAY-002, CAP-LEDGER-001, CAP-PROOF-001]
  actors: [B01, C01, C02]
  preconditions:
    - B01 active, not suspended
    - C01 and C02 each funded ≥ the share amount
  entry_point: { surface: app-banzami-web-business, path: /business/cobrar }
  steps: [ … ordered, each with an expected UI or API state … ]
  financial_expectations:
    - { account: B01.available, delta_minor: +45200 }
    - { account: C01.available, delta_minor: -22600 }
    - { account: C02.available, delta_minor: -22600 }
    - invariant: debits_equal_credits
  negative_assertions:
    - paying a settled share again creates no second effect
    - B02 cannot read B01's collection
  evidence_required: [screenshot, video, trace, api, qr, ledger, receipt]
  cleanup: { disposable: [draft collections], preserved: [paid shares, receipts, ledger] }
  depends_on: [S01-BIZ-001, S09-FIN-001]
  automation: full
  existing_harness: tools/e2e/app-web/proofs/19-collections-split-settlement.mjs
```

`existing_harness` is the field that keeps the Lab honest about §106: a journey
that an existing harness already performs is **orchestrated**, never rewritten.

## 2. Suite taxonomy

The prompt's S00–S20 is kept and extended by three suites the audit showed are
real and did not fit: operator finance, onboarding lifecycle, and the rail
boundary.

| Suite | Name | Journeys (est.) | Existing coverage |
|---|---|---:|---|
| S00 | Environment / governance | 10 | strong (`check-*` gates) |
| S01 | Identity / auth / session | 18 | strong |
| S02 | App Banzami (Consumer) | 22 | strong (proofs 01–09) |
| S03 | App Banzami Business | 20 | strong (proofs 10–18) |
| S04 | Business Receive Point | 9 | strong |
| S05 | Payment Links | 12 | strong |
| S06 | Collections | 14 | strong (proofs 19–20) |
| S07 | Refunds | 10 | good (API), none UI |
| S08 | Consumer transfers / P2P | 11 | partial |
| S09 | Financial truth | 12 | strong |
| S10 | Settlements / payouts | 12 | good |
| S11 | Developer Platform | 24 | strong |
| S12 | SDKs | 10 | TS only |
| S13 | Webhooks | 11 | strong |
| S14 | DOA | 8 | good |
| S15 | Receipts / comprovativos | 9 | good |
| S16 | BANZADMIN | 20 | **weak** |
| S17 | Security / authority / isolation | 24 | good |
| S18 | Platform / web-mobile parity | 10 | good |
| S19 | Contracts / OpenAPI / docs | 12 | strong |
| S20 | External dependencies | 6 | partial |
| **S21** | **Business onboarding lifecycle** (ADR-058/059) | 10 | good |
| **S22** | **Operator finance** (pricing, fees, recon) | 14 | **weak** |
| **S23** | **Rail boundary** (ADR-061 fail-closed) | 7 | **unit only** |
| | **Total** | **~315** | |

## 3. Catalog by suite

Journeys marked ⛔ have no existing harness and are new work.

### S00 — Environment / governance
`S00-ENV-001` environment identity is SANDBOX · `-002` migration head == repo head ·
`-003` all 8 services healthy · `-004` deploy parity clean **incl. `app-frontend`** ⛔ ·
`-005` feature flags recorded · `-006` schema drift zero · `-007` **zero real-Live
reachability** ⛔ · `-008` no uncommitted tree · `-009` repo == `origin/main` ·
`-010` budget headroom sufficient for this run ⛔
Reuses: `check-sandbox-{migration,deploy,operational}`, `check-schema-reality`,
`check-live-fail-closed`, `check-deploy-parity`.

### S01 — Identity / auth / session
Consumer register/login/PIN/session-persist/hard-reload/logout/replay-after-logout ·
Business `@handle`+PIN, refresh, logout, wrong PIN, suspended Business ·
Console OTP sign-in (real email), fixture session, expired session ·
BANZADMIN password + TOTP + step-up + step-up expiry ⛔ ·
cross-product session isolation (Consumer token ≠ Business authority) ·
dual-context cross-tab isolation.
Reuses: proofs 01, 12, 17; `auth-email-e2e`; `business-app-session-e2e`.

### S02 — App Banzami (Consumer)
Home + balance · `@banza` profile · P2P send/receive · QR scan through **real
pixels** · payment-link payer flow · deep-link resume · invalid deep link ·
history · transaction detail · receipt view + PDF · realtime incoming payment ·
realtime resilience · profile · security/PIN change · notifications · KYC banner
absent in Sandbox · large-text reflow ⛔ · offline/retry ⛔.
Reuses: proofs 01–09.

### S03 — App Banzami Business
Login · dashboard + KPIs · Cobrar (simple charge) · **Dividir cobrança** ·
Receive · persistent Receive Point · history · collection tracking · payment
links · receipts · payout request ⛔ · profile · KYB status · project link ·
campaign accounts ⛔ · realtime · fail-closed when suspended · large text ·
cross-tab.
Reuses: proofs 10–18.

### S04 — Business Receive Point (ADR-065)
`S04-BRP-001` persistent QR renders and is stable across sessions ·
`-002` scan mints a **fresh** session · `-003` mint idempotency (0155) ⛔ ·
`-004` amount entry → payer review → explicit confirm → payment ·
`-005` receipt · `-006` Business sees it in realtime · `-007` suspended Business
fails closed · `-008` disabled Receive Point fails closed ·
`-009` persistent QR ≠ ephemeral Payment Session ⛔.
Reuses: `business-receive-{point,web}-e2e`, proof 11.

### S05 — Payment Links
create · retrieve by id · public slug resolution · payer page · pay · mark-used ·
expire · cancel · status · receipt · **id vs public slug are different
namespaces** · cross-tenant read denied.
Reuses: `cap-pay-002`, `hosted-checkout-*`, `pay-frontend-lifecycle-e2e`.

### S06 — Collections
create · **idempotency (same key/same op, same key/changed op)** · public
authority · 2-way split · **odd minor-unit remainder** · surface a share as a
payment link · QR pixels · two payers · PARTIAL → COMPLETED · QR-sheet
auto-dismiss · realtime · history + detail · receipts · ledger balanced · no
duplicate effect on re-pay · cross-Business isolation.
Reuses: proofs 19, 20. **This universe is already proven and must be preserved.**

### S07 — Refunds
eligible payment → refund · idempotency · full and partial where supported ·
`refund_source` typing · balance effects · ledger · status · receipt ·
history · cross-tenant authority denied · refund of a refunded payment denied.
Reuses: `refund-devkey-e2e`, `refund-published-sdk-e2e`, `refund-settlement-matrix`.
Gap: Console and Business **UI** refund journeys ⛔.

### S08 — Consumer transfers / P2P
send by `@banza` · recipient receives · balances move · both histories ·
receipt for both sides · idempotency · **insufficient funds** ⛔ ·
**invalid recipient** ⛔ · **self-transfer** ⛔ · cross-user authority denied ·
duplicate prevention.
Reuses: proof 02, `transfer-guards.mjs`. Most negatives are new.

### S09 — Financial truth (cross-cutting)
double-entry balance per run · signed ledger sum == 0 · financial-effect
uniqueness · book vs balance-reader agreement · no hidden liabilities ·
no duplicate transfers · receipt ↔ ledger correspondence · history consistency ·
pre/post conservation per actor · **boundary reconciliation** (ADR-063) ·
financial position · customer liabilities == backing assets.
Reuses: `ledger-reconciliation.sh`, `money-model-e2e.sh`, `economic-model-smoke.sh`.

### S10 — Settlements / payouts
application settlement create/complete/cancel/fail · idempotency-key lookup ·
fee destination · binding seal (ADR-055) · payout request → PROCESS → SENT →
CONFIRM · payout RETURNED and FAIL · **0.75 % withdrawal fee, paired postings** ·
authority · **payout when the rail is down → fails closed** ⛔.
Reuses: `settlement-economics-e2e`, `payout-sandbox-e2e`, `adr055-binding-seal-e2e`.

### S11 — Developer Platform
workspace CRUD · members · invites · leave/archive · project CRUD · keys
create/rotate/revoke/one-time reveal · Financial Setup + use-case ·
financial-onboarding application and link · share code · wallet accounts ·
wallet-account transfers · payment links via project key · refunds via project
key · webhooks CRUD + rotate + test + replay · logs + request_id correlation ·
explorer · balances · transactions · footprint · sandbox reset · **cross-project
isolation** · **publishable key is read-only**.
Reuses: `developer-platform-e2e`, `developer-journey-50`, `developer-golden-journey-e2e`,
`cross-project-isolation`, `sandbox-delete-e2e`.

### S12 — SDKs
Per published SDK: clean external consumer · install the **published artifact** ·
configure Sandbox credentials · execute supported operations · validate types
and error hierarchy · verify README examples execute · webhook signature
verification. TS is covered; `banzami_client`, Go, PHP, Python are ⛔.
See [12](12-sdk-inventory-and-publication.md).

### S13 — Webhooks
endpoint create · secret rotate · test event · real delivery · **signature
verification** · event identity · payload shape · retry on failure · duplicate
delivery → consumer idempotency · delivery attempts visible · replay ·
cross-environment isolation.
Reuses: `webhook-{delivery-to-doa,lifecycle,retry-cleanroom}-e2e`,
`cap-webhook-001`, and the running `banzami-webhook-sink`.

### S14 — DOA — see [13](13-doa-validation-plan.md).

### S15 — Receipts — see [14](14-receipt-validation-plan.md).

### S16 — BANZADMIN ⛔ (the weakest suite)
login + MFA + step-up · attention summary · **Candidaturas vs Comerciantes
distinction** · application review → approve → activate · KYB accept/reject ·
consumer view/suspend/badge · wallet payments · proofs · settlements · payouts
lifecycle · reconciliation run · disputes resolve ⛔ · risk freeze/resolve ⛔ ·
compliance case lifecycle ⛔ · pricing rule create/enable/disable/version ⛔ ·
fee policies ⛔ · operator fees ⛔ · operator lifecycle · platform mode
(read-only assertion) · audit log · **no PIN or secret is ever rendered**.

### S17 — Security / isolation — see [15](15-security-isolation-matrix.md).

### S18 — Platform parity
`flutter analyze` · Flutter tests · web build · iOS build · Android build ·
native adapters vs web BFF adapters · replica-residue guard · shared-source
parity · consumer-residue guard · app scheme registration.
Reuses: `check-mobile-config`, `assure-mobile-ios`, `check-consumer-residue`,
`app-schemes-registered`.

### S19 — Contracts / docs
runtime route absent from OpenAPI · OpenAPI route absent from runtime ·
SDK method absent from contract · docs using a retired route · wrong reason
codes · wrong environment in an example · **documented example executes against
Sandbox** · broken links · PT/EN structural parity · error catalogue ·
webhook event catalogue · public-site truth.
Reuses: `check-openapi-route-drift`, `check-docs-*` (13 gates), `docs/quickstart-e2e`,
`docs/cold-reader`, `check-public-site-truth`.

### S20 / S23 — External dependencies and the rail boundary
Rail simulator down → hosted payment `503 PROVIDER_UNAVAILABLE`, **nothing
created, credited or confirmed** ⛔ · internal movements unaffected while the
rail is down ⛔ · per-(Project, Business) rail scope (0145) ⛔ · payout blocked
at the rail ⛔ · Cash-In classified `NOT_IMPLEMENTED` with an absence proof ·
Cash-Out classified `EXTERNAL_DEPENDENCY` at the rail.
This is the highest-value new suite: ADR-061's table is documented and
unit-tested but never proven end-to-end in the Sandbox.

### S21 — Business onboarding lifecycle
public application · handle check · document upload · resubmit · admin
start-review / request-information / reject / approve · activation validate +
complete · PIN set · first payment · **one KYB authority (ADR-059)** ·
link-existing · reissue-activation · consent-code link to a Project.
Reuses: `candidatura-e2e`, `approved-business-e2e`, `project-onboarding-e2e`,
`kyb-*`.

### S22 — Operator finance ⛔
pricing rule lifecycle + versions · pricing profile assignment · fee policy
enable/disable · operator fee visibility · finance dashboard · application
settlements admin lifecycle · **critical-financial confirmation (strong confirm
+ reason + audit)** · boundary reconciliation run · acquiring reconciliation.
Reuses: `pricing-authority-e2e`, `check-economic-authority`. UI journeys are new.

## 4. Happy path is not enough

Every capability in `threat_category: financial-money-movement` requires, at
minimum: valid execution · duplicate/replay · invalid authority · invalid state ·
insufficient balance · not found · expired · cancelled · concurrent ·
dependency unavailable · cross-tenant attempt. That rule alone produces roughly
40 % of the ~315 journeys.

## 5. Idempotency inventory

Operations that declare or require idempotency, each needing the four proofs
(same key + same op → replay; same key + changed op → refused; concurrency;
scope isolation):

`POST /v1/collections` · `/v1/collections/{id}/shares` ·
`/v1/collection-shares/{id}/surface` · `/v1/transfers` · `/v1/payment-links` ·
`/v1/payment-sessions` · `/v1/refunds` · `/v1/payouts` ·
`/v1/application-settlements` · `/v1/wallet-account-transfers` ·
`/v1/receive-points/{slug}/pay` · `/internal/v1/receive-points/{slug}/sessions`
(0155) · `/v1/sandbox/fund` · `/v1/consumer-pay-links/{code}/pay` ·
`POST /public/pay/{slug}/pay`.

Collections is one example of the pattern, not the whole of it.

## 6. Realtime is observed, never inferred

Where the product promises automatic convergence, the journey **watches the UI
update without a manual refresh** and records the latency. A database row
changing is not evidence that a user saw it. Proof 05 already does this for
Consumer Home; the Business side is a gap.
