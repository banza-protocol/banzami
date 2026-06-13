# BANZAMI — SDK Ownership Audit

**Audit:** BANZAMI-V1.0-PURIFICATION-AUDIT-001
**Version:** 1.0
**Date:** 2026-06-13
**Phase:** 6 — SDK & Plugin Ownership

---

## The technical question

> Does an SDK encode *the protocol's contract surface* (request/response shapes, signing, idempotency, error taxonomy, QR/webhook formats) — or *one operator's product*?

If the former, any certified operator can ship the same SDK and it belongs to **BANZA**. If the latter, it belongs to the operator.

**Evidence it is protocol-level:**
- Identifiers are Banza-prefixed: `@banza/sdk` + class `BanzaClient` (TS), `banza_flutter` + `BanzaPay` (Flutter), `banza` (Python), `banza/sdk-php` (PHP).
- `CLAUDE.md §19.1` defines the `sdk/` zone as **"Official BANZA protocol SDKs."**
- `CLAUDE.md §15.5` lists SDK naming under **protocol-level** naming, not operator products.
- `BANZAMI_GOVERNANCE.md` lists "Changes to SDK contract surfaces" as a **protocol-affecting decision** (defer to ~/banza).
- The webhook signature header (`banza-signature`) and env var (`BANZA_WEBHOOK_SECRET`) are protocol constants, not operator names.

➡️ **Conclusion: the SDKs are BANZA's.** They are hosted in the operator repo for historical/convenience reasons, not by right.

---

## Per-SDK ownership ruling

| SDK | Correct owner | Note |
|---|---|---|
| TypeScript (`@banza/sdk`) | **BANZA** | Clear protocol prefix |
| Flutter (`banza_flutter`) | **BANZA** | Protocol prefix; powers mobile checkout |
| Python (`banza`) | **BANZA** | Protocol prefix |
| Go | **BANZA** | ⚠️ currently module path uses `banzami` — naming inconsistency (LOW finding L1). Standardize to protocol prefix on move. |
| PHP (`banza/sdk-php` + laravel) | **BANZA** | Protocol prefix |
| checkout-web (browser checkout widget) | **BANZA** (protocol checkout client) | Generic checkout client; protocol-level |

## Plugins

| Plugin | Correct owner | Disposition |
|---|---|---|
| generic-node | **BANZA** (SDK ecosystem) | Move with SDKs |
| generic-php | **BANZA** | Move with SDKs |
| generic-laravel | **BANZA** | Move with SDKs |
| shopify | **Delete** | Off-strategy — Banzami strategy excludes Western commerce platforms (focus: payment links, QR, generic local plugins) |
| woocommerce | **Delete** | Same — off-strategy |

> Plugins are thin wrappers over the protocol SDK. The *generic* ones are reusable ecosystem assets → BANZA. The Western-platform ones contradict the operator's own market strategy and add maintenance cost for a market it is not pursuing.

---

## Critical caveat for execution

**`~/banza` has no `sdk/` directory today.** Moving the SDKs is therefore not "delete a duplicate" — it is *establishing a new canonical home* in the protocol repo, with all that entails:
- create `~/banza/sdk/`, wire its build/test/CI and publishing (npm `@banza/sdk`, pub.dev `banza_flutter`, PyPI `banza`, Packagist `banza/sdk-php`, Go module);
- repoint Banzami's consumers: `apps/checkout`, `apps/mobile` (Flutter SDK), `plugins/*`, docs examples, deploy.sh;
- standardize the Go module prefix.

Per `BANZAMI_GOVERNANCE.md` and `CLAUDE.md §19.4`, "Changes to SDK contract surfaces" are **protocol-affecting** → this must be an **ADR in `~/banza`**, executed as a coordinated two-repo migration, **not** a unilateral operator deletion.

---

## Interim correctness (until the move lands)

If the SDKs cannot move immediately, the *honest* interim state is to **stop claiming they live in BANZA** (README:14) and label `sdk/` explicitly as "protocol SDKs hosted transitionally in the operator repo; canonical home pending ADR in ~/banza." Truth-in-documentation beats a half-true claim.

---

## Verdict

All six SDKs and the three generic plugins belong to **BANZA**; Shopify/WooCommerce should be **deleted**. The ruling is unambiguous; only the *migration mechanics* (new home, publishing, references) make it non-trivial. This is the highest-effort, highest-value item of the entire purification.

---

*Next: `BANZAMI-CONTRACTS-AUDIT.md` (Phase 7).*
