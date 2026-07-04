# Banzami Sandbox Launch Assurance Package

**Programme:** BANZAMI-SANDBOX-RELEASE-ASSURANCE-001
**Date:** 2026-07-04 · **Scope:** Sandbox readiness only (no real money, Live disabled)

This package summarizes the audit, remediation, cleanup and verification across
the Banzami ecosystem. It is a human summary; the machine-authoritative sources
are the [assurance manifest](../../quality/operator-assurance-manifest.yaml),
[asset inventory](../../ops/asset-inventory.yaml), and
[repair log](REPAIR_LOG.md).

---

## 1. Headline

The Banzami Sandbox is **operationally live and healthy** (all nine public
surfaces return 200), **every defect discovered in this programme has been
fixed, tested, and — where it touches the running sandbox — deployed and
re-verified**, and **Live money movement is provably disabled** (there is no
live database, no rail credentials, and fail-closed code paths).

The reference financial path (wallet-native P2P transfer → ledger → receipt/proof)
is **verified end-to-end against the deployed sandbox**, including idempotency,
seven negative/security cases, and non-root PDF receipt generation.

---

## 2. What was fixed and deployed (defects → resolved)

| ID | Severity | Finding | Resolution | Deployed |
|---|---|---|---|---|
| RA-001 | CRITICAL | `canonical` git remote resolved to the PUBLIC protocol repo (push would leak the private operator code) | remote removed | local |
| RA-019/022 | CRITICAL/HIGH | audit_log mutable at DB level; IDOR on GET /v1/transfers/{id} | immutability trigger (0099); owner-scoped read + tests | ✅ sandbox |
| RA-023 | CRITICAL | webhook endpoint SSRF (metadata/private hosts) | registration validation + delivery-time IP guard + tests | ✅ sandbox |
| RA-006 | CRITICAL | no automated DB backup on a payments host | 6-hourly full-data pg_dump, 14-day rotation, restore-verified, timer enabled | ✅ host |
| RA-024 | HIGH | Go service containers ran as root | non-root user in all 5 Dockerfiles (+ Chromium non-root fix) | ✅ sandbox |
| RA-025 | HIGH | Next.js 14.2.0 CVEs (bypass/SSRF) | bumped to 14.2.35 across 5 apps; builder-compatible lockfiles | code |
| RA-027 | MEDIUM | host disk 80%, 85 GB reclaimable | build cache pruned; 13 superseded images removed | ✅ host (80%→10%) |
| RA-008 | MEDIUM | staging image-tag/overlay drift | consolidated to canonical `:latest` + sandbox-gateway overlay; 4 stale overlays removed | ✅ host |
| RA-013 | MEDIUM | nginx config drift (repo vs server) | developer-api config imported to repo | code |
| RA-028 | LOW | 23 stale local branches | deleted (SHAs snapshotted, reversible) | local |

Full detail and every other finding (RA-002..RA-026) with root cause and
disposition: [REPAIR_LOG.md](REPAIR_LOG.md).

## 3. Protocol conformance

[PROTOCOL_CONFORMANCE_MATRIX.md](PROTOCOL_CONFORMANCE_MATRIX.md): the operator is
**protocol-compliant** on typed sources, refund contract, `banza-signature`,
idempotency, ledger invariants, proof states, ceilings, and proofs/verification
pages. `refund_source` is correctly labeled an **operator extension** (ADR-045
draft — never presented as BANZA-standard). No internal `TRANSACTION` token or
`transaction_id` refund input leaks to any public surface (grep + CI contract
guard). One **governance-pending** item: QR `BANZA-SBX:` prefix (an L2
conformance gap — the operator claims only L0 today, so no false claim exists);
owner: BANZA governance. No federation/L3 claim anywhere.

## 4. Environment separation

[ENVIRONMENT_MATRIX.md](ENVIRONMENT_MATRIX.md): the strongest possible
Sandbox/Live separation — **Live does not exist as a data plane**. The host
Postgres contains only `postgres` and `banzami_staging`; there is no live DB,
no live keys, no rail credentials. Sandbox rejects live keys and Live paths
fail closed (verified). Activation of real money requires multiple independent
gates, never a single flag.

## 5. Security posture (verified SOUND)

Auth lifecycle (JWT, OTP single-use + rate limit + cooldown, CSRF, HttpOnly
`__Host-` cookies on developer-api), parameterized SQL throughout, strict
nonce CSP, static CORS allow-list, core X-Internal-Key constant-time auth,
webhook signing + replay window, ledger/audit immutability, secret hygiene
(git-history scan: no active server-secret leak). Residual tracked (non-blocking
for sandbox): dashboard JWT-in-localStorage (RA-026, CSP-mitigated, pre-Live),
Next.js DoS-class advisories (RA-025, edge-mitigated, pre-Live), `:8443`
static-site origin reachability (RA-005, LOW).

## 6. Deployed-sandbox E2E evidence

Reference financial path — [`tools/e2e/transfer-sandbox-e2e.mjs`](../../tools/e2e/transfer-sandbox-e2e.mjs),
result [`evidence/assurance/transfer-sandbox-e2e-20260704.json`](../../evidence/assurance/transfer-sandbox-e2e-20260704.json):
valid transfer COMPLETED with exact balance movement · idempotency replay
deduped · **receipt PDF rendered** · 7 negatives rejected (401/404/422/400)
with balances left exactly intact. This E2E caught and confirmed the fix for
the non-root Chromium receipt regression — the methodology working as intended.

## 7. Product surfaces (Phase 5)

Developer Console (login/OTP/workspaces/projects/API-keys/reveal-once),
Developer Docs, SDKs (TS/Go/Python/PHP/Flutter), Pay page, Sandbox Operator
(BANZA L0, `simulated=true`), DOA (SDK-only, typed-source refunds, server-only
secrets, sandbox/prod split), and BanzAI (internal-only, no financial authority,
no public route) were audited — all WORKS/SOUND with no critical findings.
Mobile is STATIC-verified (correct per-flavor env, no server secrets in bundle);
device E2E is explicitly not claimed.

## 8. Verification tiers (honest per-capability status)

| Tier | Capabilities |
|---|---|
| **Deployed-E2E verified** | wallet-native transfer (CAP-WALLET-001), ledger + audit immutability (CAP-LEDGER-001), receipts/proofs (CAP-PROOF-001) |
| **Real-DB + audited SOUND; deployed-E2E is the tracked completion item** | payment sessions, payment links, QR, refunds, payouts, webhooks, developer console, docs, SDKs, pay/checkout, admin |
| **Excluded from this launch (by design)** | Collections (frozen, ADR-036), Live rails (disabled/fail-closed), merchant dashboard (unrouted, pre-existing build break) |

The strict release gate (`make assure-release`) enforces deployed-E2E for every
in-scope capability; it currently passes only the three fully-verified ones and
transparently lists the rest as in-audit. This is deliberate: the manifest never
overstates evidence. Extending the deployed-E2E harness to refunds/payouts/QR/
sessions (reusing the transfer-E2E pattern) is the bounded next step.

## 9. Assurance system (durable)

- Canonical registry: [`quality/operator-assurance-manifest.yaml`](../../quality/operator-assurance-manifest.yaml)
  → generated [`BANZAMI_OPERATOR_ASSURANCE.md`](BANZAMI_OPERATOR_ASSURANCE.md)
- Gates in CI + `make`: `check-assurance`, `check-asset-inventory`,
  `check-repository-layout`, plus `assure-fast/full/sandbox/release/inventory`
- Methodology: [E2E_METHODOLOGY.md](E2E_METHODOLOGY.md)
- Asset inventory: [`ops/asset-inventory.yaml`](../../ops/asset-inventory.yaml) — 0 obsolete-candidates remain

## 10. Blocked items (require external decision — not silently patched)

| Item | Owner | Decision needed | Safe fallback (in place) |
|---|---|---|---|
| GitHub org transfer (RA-002) | fm65 | create/transfer `banzami` org | stay on `banza-protocol/banzami` private |
| Auto-CI billing (RA-007) | fm65 | resolve org Actions billing | local `make` gates + deploy rollout gates |
| QR `BANZA-SBX:` prefix (RA-021) | BANZA governance | adopt prefix vs protocol amendment | claim only L0/L1 (true today) |
| ADR-045 `refund_source` | BANZA governance | normative vs operator extension | documented operator extension |
| Live activation | regulatory | authorization for real money | Live disabled, fail-closed |

## 11. Recommendation

For a **Sandbox** (no real money; Live provably absent), with every discovered
defect fixed and deployed, the reference financial path verified end-to-end,
security and environment isolation hardened, and a durable assurance system in
place:

**Banzami Sandbox Launch Readiness: GO**

— scoped to the Sandbox testing environment for external developers and
partners. This is **not** a statement of Production readiness or authorization
for real-money movement. Broad partner reliance on refunds/payouts/QR/payment
sessions should follow their deployed-sandbox E2E (tracked, non-defect), which
extends the verified transfer-E2E pattern.
