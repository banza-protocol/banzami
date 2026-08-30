# Sandbox Launch — Blocker Inventory

Baseline: `main` @ `28122138` · derived 2026-08-30 from the **real output** of
`make assure-sandbox-launch`, not from any prior summary.

**Verdict: `Banzami Full External Sandbox Launch: HOLD`** — 18 gate failures
across **9 public capabilities** (`public released: 5/14`).

---

## 1. Why nothing in this inventory could be closed by code

Two facts, established by observation, govern every entry below.

**The Sandbox surface is not serving.** `sandbox-api.banzami.com`,
`api.banzami.com` and `developer-api.banzami.com` all answer **503**.

> **Correction (2026-08-30, Stage C).** The sentence that stood here concluded
> from that 503 that "the edge is up and the application containers behind it
> are not." **The second half was wrong.** All four Sandbox services had been
> `Up (healthy)` throughout; the 503 was the website edge's deliberate Stage B
> guard answering for hostnames that no server block claimed. An absent route
> and a dead service are indistinguishable from outside, and the ambiguity was
> resolved from the record instead of from the host. The surfaces were
> unreachable — which is what blocks the E2E below, and that conclusion still
> holds — but they were never down. Routing is now implemented and verified at
> the origin: see `docs/operations/SANDBOX_EDGE_RUNTIME.md` and RA-030.

Every blocking capability carries `deployment_gate: sandbox-e2e-required`, and
`docs/quality/E2E_METHODOLOGY.md` defines that evidence as *"real flows against
sandbox-api.banzami.com"*. With that surface down, **no valid deployed-Sandbox
E2E can be produced for any of them.**

**The public Sandbox route-carrier is deliberately not implemented.**
`docs/infra/BANZAMI_SERVICE_AUTHORITY_MATRIX.md` records `sandbox-edge` — the
proxy that will carry Stage C sandbox public routes — as *"APPROVED DESIGN, NOT
IMPLEMENTED … no runtime artifact may exist before the separately approved Stage
C implementation PR."* `pay`/`checkout` additionally require **Stage F**
approval, and `sandbox-operator` is fails-closed pending Stage C execution
approval.

So closing these blockers requires a governed deployment decision, not
engineering effort in this repository. Producing evidence any other way would be
fabrication, and standing the surfaces up unilaterally would violate the
project's own service authority.

> **Update (2026-08-30, Stage C).** That governed decision was given, and
> `sandbox-edge` is implemented and verified at the origin. **This did not close
> any blocker below**, and the HOLD verdict is unchanged. It removed the first of
> two independent obstacles: the surfaces can now answer. The second remains
> entirely — no E2E evidence exists for any of the nine capabilities, and the
> four harnesses in `tools/e2e/` cover the released transfer path and the
> developer-key path, not one of these nine. Public routing also still needs the
> external Cloudflare + firewall step described in the runtime doc. A reachable
> Sandbox is a precondition for producing this evidence, never a substitute for
> it.

## 2. Blocker inventory

All nine are `status: in-audit`, `surface: public`,
`deployment_gate: sandbox-e2e-required`, `environments: sandbox=true, live=false`.

| Capability | Name | Disposition | Class | Code | Deployed | E2E | Neg/sec |
|---|---|---|---|---|---|---|---|
| CAP-PAY-001 | Payment sessions | pending-e2e | B + C | yes | **no** | no | no |
| CAP-PAY-002 | Payment links | pending-e2e | B + C | yes | **no** | no | no |
| CAP-PAY-003 | QR payment flows | pending-e2e | B + C | yes | **no** | no | no |
| CAP-REFUND-001 | Typed-source refunds | pending-e2e | B + C | yes | **no** | no | no |
| CAP-PAYOUT-001 | Wallet withdrawal / payouts | pending-e2e | B + C | yes | **no** | no | no |
| CAP-WEBHOOK-001 | Signed webhooks | pending-e2e | B + C | yes | **no** | no | no |
| CAP-SDK-001 | TypeScript SDK | blocked-external | **F** | yes | n/a | **yes** | **yes** |
| CAP-SDK-002 | Flutter SDK | pending-e2e | B + C | yes | **no** | no | no |
| CAP-APP-004 | Pay page + checkout | pending-e2e | B + C + gov | yes | **no** | no | partial |

Classes per the closure brief: **B** deployment gap · **C** E2E evidence gap ·
**F** external dependency · **gov** additionally blocked by a governance stage.

### CAP-SDK-001 is the only genuinely external one

It is **not** an engineering gap. Its tests and evidence are already complete —
unit, a real clean-tarball-install E2E artifact
(`evidence/assurance/dev-foundation/sdk-clean-install-1783203531.json`), and
negative/security coverage. Per
`docs/operations/SDK_REGISTRY_OWNERSHIP_AND_RELEASE.md`, the *one* remaining
blocker is **npm organization ownership of the `@banzami` scope**. No token is
stored in the repo, and none should be. Owner action, not code.

### What "E2E: no" means here

Only two E2E harnesses exist — `tools/e2e/transfer-sandbox-e2e.mjs` and
`tools/e2e/transfer-guards.mjs` — and the only capability-level evidence artifact
is `evidence/assurance/transfer-sandbox-e2e-20260704.json` (CAP-WALLET-001),
plus the dev-foundation and mobile artifacts. There is **no harness** for
payments, links, QR, refunds, payouts, webhooks or checkout. Writing them is real
work, but it cannot produce evidence until the Sandbox serves again, so it is
sequenced after the deployment decision rather than before it.

## 3. Fixed in this pass

**The launch gate itself was broken.** `assure-sandbox-launch` depended on
`check-asset-inventory` — a target that never existed (the real one is
`assure-inventory`). Latent, because make stops at the first failing
prerequisite and `check-assurance-release` fails earlier; it would have surfaced
only when the last capability blocker cleared and the gate was expected to say
GO. Fixed, and the four prerequisites it had been shadowing
(`assure-inventory`, `check-mobile-config`, `check-docs-claims`,
`check-sdk-contract`) were each verified to pass.

## 4. Observations worth acting on (not fixed here)

**The inventory gate cannot see liveness.** `ops/asset-inventory.yaml` lists
`banzami-api-gateway-staging-1`, `banzami-public-api-staging-1` and others as
`lifecycle: active-required`, with notes recording *"deployed-sandbox E2E green"*
as of 2026-07-04. Those services are not serving today, yet
`make assure-inventory` passes — because `tools/check-asset-inventory.mjs`
validates lifecycle *states*, secret hygiene and dispositions, and never probes
reality. An `active-required` asset can be down with every gate green.

This is the same shape as the security finding this programme closed earlier: the
information was correct when written, and nothing failed when it stopped being
true. Worth a decision — a liveness probe makes the gate network-dependent and
non-deterministic, which is a real cost, so this is recorded rather than
unilaterally fixed.

**Several blocking capabilities record zero test IDs** (CAP-PAY-001,
CAP-PAY-003, CAP-REFUND-001, CAP-PAYOUT-001, CAP-WEBHOOK-001, CAP-SDK-002) even
though unit and integration coverage demonstrably exists in the tree. That is
likely manifest drift rather than absent testing. It was **not** edited here:
asserting "these tests cover this capability" is an owner's mapping judgement,
and adding unverified claims to the source of truth to make a gap look smaller is
precisely the failure mode the assurance model exists to prevent.

## 5. What would actually close these

In order, and none of it available to an in-repo change:

1. **Stage C implementation PR** — the `sandbox-edge` proxy, separately approved.
2. **Deploy the Sandbox stack** via the approved rt04e flow
   (`./deploy.sh developer-api|core-api-staging|api-gateway-staging|public-api-staging`).
3. **Write the missing E2E harnesses** for payments, links, QR, refunds, payouts,
   webhooks and checkout, each with the negative paths the manifest requires.
4. **Run them against the deployed Sandbox** and record dated evidence artifacts.
5. **Stage F approval** for `pay`/`checkout` before CAP-APP-004 can be released.
6. **npm `@banzami` org ownership** for CAP-SDK-001 — external, owner action.

Only then does promoting `status`/`disposition` in the manifest become truthful.
