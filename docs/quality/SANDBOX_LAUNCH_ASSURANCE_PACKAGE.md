# Banzami Sandbox Launch Assurance Package

**Programme:** BANZAMI-SANDBOX-RELEASE-ASSURANCE-001
**Date:** 2026-07-04 · **Scope:** Sandbox readiness only (no real money, Live disabled)

Machine-authoritative sources (this document is a human summary; capability
status is never duplicated as fact here — it is generated from the manifest):
[assurance manifest](../../quality/operator-assurance-manifest.yaml) ·
[generated capability doc](BANZAMI_OPERATOR_ASSURANCE.md) ·
[asset inventory](../../ops/asset-inventory.yaml) ·
[repair log](REPAIR_LOG.md).

---

## 1. Two verdicts (enforced by two gates)

| Verdict | Gate | State |
|---|---|---|
| **Banzami Sandbox Reference Financial Path: GO** | `make assure-reference` | **PASS** |
| **Banzami Full External Sandbox Launch: HOLD** | `make assure-sandbox-launch` | **HOLD (fails)** |

The single "GO" issued earlier was overstated and has been corrected. The
assurance gate no longer shows green for a broad external launch: it enforces
deployed-E2E for every public surface and **HOLDs** until each is `released`.

- **Reference path (GO):** wallet-native P2P transfer → ledger/audit → receipt/
  proof, verified end-to-end against the deployed sandbox
  ([evidence](../../evidence/assurance/transfer-sandbox-e2e-20260704.json)):
  valid transfer COMPLETED with exact balance movement, idempotency dedup,
  receipt PDF, 7 negatives rejected with balances intact. Ledger + audit_log are
  immutable (DB triggers, deployed).
- **Full external launch (HOLD):** 12 of 14 public surfaces are `pending-e2e`
  — code-audited and (for most) real-DB tested, but WITHOUT the required
  deployed-Sandbox E2E. They must reach `released` (or be quarantined/removed)
  before an external launch. See the disposition table below.

## 2. External-Sandbox disposition (every public surface)

Source of truth: manifest `surface` + `disposition`. Current state:

| Capability | Surface | Disposition | Why |
|---|---|---|---|
| Wallet-native transfer (CAP-WALLET-001) | public | **released** | deployed E2E green |
| Ledger + audit immutability (CAP-LEDGER-001) | internal | **released** | real-DB tests + deployed immutability triggers |
| Receipts/proofs + /r/{ref} (CAP-PROOF-001) | public | **released** | receipt PDF + proof probe via deployed E2E |
| Payment sessions (CAP-PAY-001) | public | pending-e2e | audited SOUND; no deployed E2E |
| Payment links (CAP-PAY-002) | public | pending-e2e | needs merchant-fixture deployed E2E |
| QR flows (CAP-PAY-003) | public | pending-e2e | needs deployed E2E |
| Refunds (CAP-REFUND-001) | public | pending-e2e | needs merchant-fixture deployed E2E |
| Payouts (CAP-PAYOUT-001) | public | pending-e2e | needs deployed E2E |
| Webhooks (CAP-WEBHOOK-001) | public | pending-e2e | SSRF fixed+unit-tested; needs deployed delivery E2E |
| Developer Console (CAP-DEV-001) | public | pending-e2e | deployed probes only; needs scripted OTP/session E2E |
| API key lifecycle (CAP-DEV-002) | public | pending-e2e | needs deployed reveal/rotate/revoke E2E |
| Developer Docs (CAP-DOCS-001) | public | pending-e2e | needs deployed docs-route + link E2E |
| TypeScript SDK (CAP-SDK-001) | public | pending-e2e | needs real-package-build E2E vs deployed sandbox |
| Flutter SDK (CAP-SDK-002) | public | pending-e2e | needs real-package E2E |
| Pay/checkout (CAP-APP-004) | public | pending-e2e | needs deployed pay-flow browser E2E |
| Collections (CAP-COLLECT-001) | none | **quarantined** | frozen (ADR-036); /v1/splits → 410 |
| Consumer mobile (CAP-APP-001) | none | **quarantined** | no deployed iOS Simulator E2E matrix |
| Merchant mobile (CAP-APP-005) | none | **quarantined** | no deployed iOS Simulator E2E matrix |
| Admin portal (CAP-APP-003) | internal | **internal_only** | internal operators only, server-side authz |
| Merchant dashboard (CAP-APP-002) | none | **quarantined** | unrouted (NXDOMAIN); pre-existing SDK-build break |
| Live rails (CAP-LIVE-001) | none | **quarantined** | disabled, fail-closed, pending authorization |

Public released: **2/14**. Full external launch requires 14/14 released (or the
remaining ones quarantined/removed from the external surface).

## 3. Defects fixed and deployed

CRITICAL/HIGH: `canonical` remote leak (RA-001), transfers IDOR (RA-022,
deployed), webhook SSRF (RA-023, deployed), audit_log immutability (RA-019,
deployed), no DB backups (RA-006 → automated, restore-verified), root containers
(RA-024), Next.js CVEs (RA-025 → 14.2.35), Chromium non-root receipt regression
(caught by E2E, fixed+deployed). MEDIUM: disk 80%→10% (RA-027), staging tag/
overlay drift consolidated (RA-008), nginx drift imported (RA-013), 23 local +
18 origin stale branches removed (RA-028). Full log: [REPAIR_LOG.md](REPAIR_LOG.md).

## 4. Protocol conformance

[PROTOCOL_CONFORMANCE_MATRIX.md](PROTOCOL_CONFORMANCE_MATRIX.md): compliant on
typed sources, refund contract, `banza-signature`, idempotency, ledger
invariants, proof states, ceilings, proofs/verification pages. `refund_source`
labeled operator extension (ADR-045 draft). No `TRANSACTION`/`transaction_id`
leak to public surfaces. Governance-pending: QR `BANZA-SBX:` prefix (L2 gap; L0
claimed today so no false claim). No federation/L3 claim.

## 5. Environment separation

[ENVIRONMENT_MATRIX.md](ENVIRONMENT_MATRIX.md): **Live has no data plane** (host
Postgres holds only `postgres` + `banzami_staging`). Sandbox rejects live keys;
Live paths fail closed. Live activation is sealed behind a fail-closed protocol
([LIVE_ACTIVATION_GATE.md](../operations/LIVE_ACTIVATION_GATE.md)) guarded by
`make check-live-fail-closed` — no single flag/deploy can enable Live.

## 6. Security posture

SOUND (verified): auth lifecycle, OTP single-use/rate-limit, CSRF, HttpOnly
`__Host-` cookies, parameterized SQL, strict nonce CSP, core constant-time
internal auth, webhook signing+replay window, ledger/audit immutability, git-
history secret scan (no active server-secret leak). Residual (tracked): Next.js
DoS-class advisories require a Next 15 migration (edge-mitigated, RA-025);
`:8443` static-site origin reachable (LOW, RA-005); dashboard JWT-in-localStorage
is moot for launch (dashboard quarantined, RA-026).

## 7. Mobile

Both apps **quarantined**. iOS Simulator build is **feasible** (consumer sandbox
build succeeds, exit 0 — no MLKit/arm64 blocker; neither app uses camera QR
scanning). A static config-isolation guard passes (`make check-mobile-config`).
But per [MOBILE_E2E_REQUIREMENTS.md](MOBILE_E2E_REQUIREMENTS.md) static/build
evidence is **not** launch evidence — the deployed-Sandbox iOS Simulator E2E
matrices (consumer, merchant, cross-app) are not authored/registered, so
`make assure-mobile-ios` fails closed and both apps stay quarantined. macOS
release runner required.

## 8. Infrastructure & cleanup

Asset inventory reconciled to zero obsolete-candidates. Host disk 80%→10%;
images 40→18 (superseded removed, rollback tags kept); 4 stale compose overlays
removed (backed up); automated restore-verified backups; local+origin stale
branches removed; GitHub: 1 workflow, 0 artifacts, 1 environment, only `main`
branch. DOA (SDK-only, sandbox/prod split) and BanzAI (internal-only, no
financial authority) audited SOUND.

## 9. Enforcement (no local-only gates)

`deploy.sh` runs the assurance gates (manifest, layout, inventory, live-fail-
closed) **before every deploy** and ABORTS on failure — enforcement no longer
depends on GitHub-hosted Actions (billing-blocked, RA-007). Gates: `make
assure-reference`, `make assure-sandbox-launch`, `make assure-mobile-ios`,
`make check-live-fail-closed`, `make check-mobile-config`, `make assure-inventory`.

## 10. Blocked on external decisions

GitHub org transfer (fm65), Actions billing (fm65), QR prefix + ADR-045 (BANZA
governance), Live activation (regulatory), off-host encrypted backup bucket
(ops provisioning). Each has a safe in-place fallback.

## 11. Recommendation

- **Banzami Sandbox Reference Financial Path: GO** — the reference wallet/
  ledger/proof path is deployed-E2E verified and safe for controlled testing.
- **Banzami Full External Sandbox Launch: HOLD** — do not open the broad
  external sandbox until every public surface is `released` with deployed-Sandbox
  E2E (12 remain `pending-e2e`) and both mobile apps are either `released-sandbox`
  (with iOS Simulator E2E) or remain quarantined. The path is defined and
  enforced; the remaining work is executing the deployed-E2E matrices.

This is **not** a statement of Production readiness or authorization for
real-money movement.
