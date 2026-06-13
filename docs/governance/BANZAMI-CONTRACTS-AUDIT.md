# BANZAMI — Contracts Audit

**Audit:** BANZAMI-V1.0-PURIFICATION-AUDIT-001
**Version:** 1.0
**Date:** 2026-06-13
**Phase:** 7 — Contracts Audit

> The test for every artifact in `contracts/`: **Is this a protocol specification (defines interoperability for all operators) or an operator implementation detail (one operator's internal shape)?** Protocol spec → BANZA. Implementation → Banzami (but implementation rarely belongs in a `contracts/` dir at all).

---

## Inventory of `~/banzami/contracts/`

| Artifact | Type | In `~/banza`? | Ruling |
|---|---|---|---|
| `openapi/transfers.yaml` | Protocol API contract | **Byte-identical** in `~/banza/contracts/openapi/` | **BANZA** — delete duplicate |
| `openapi/activity.yaml` | Protocol API contract | **Byte-identical** in BANZA | **BANZA** — delete duplicate |
| `openapi/wallet-onboarding.yaml` | Protocol API contract | **Byte-identical** in BANZA | **BANZA** — delete duplicate |
| `events/` | Event envelope schemas | Canonical: `~/banza/contracts/events/{envelope.schema.json,types.json,webhook-types.json}` | **BANZA** — delete (BANZA richer) |
| `qr/` | QR payload format | Canonical: `~/banza/contracts/qr/{payload-format.json,lifecycle.json}` | **BANZA** — delete (BANZA richer) |
| `webhooks/` | Webhook envelope + signature | Canonical: `~/banza/contracts/webhooks/{envelope.schema.json,signature.json}` | **BANZA** — delete (BANZA richer) |
| `sdk-certification/` (README) | Certification pointer | Conformance: `~/banza/conformance/sdk` | **BANZA** — delete |

**Observation:** `~/banza/contracts/` is the **superset** — it additionally contains `federation/` (federation-event, federation-manifest, federation-obligation, federation-routing, federation-trust, operator-certificate) and `openapi/reference-operator.yaml`, none of which Banzami has. This confirms BANZA is the canonical source and Banzami holds a *stale subset*.

---

## Top-level `~/banzami/sdk-certification/`

| Artifact | Type | Ruling |
|---|---|---|
| `vectors/webhook_signatures.json` | Conformance test vectors (protocol signature) | **BANZA** — reconcile into `~/banza/conformance/` (verify BANZA's vectors match/supersede), then delete |
| `python/test_webhook_vectors.py` | Conformance runner (consumes vectors) | **BANZA** — move with vectors |
| `typescript/webhook_vectors.test.ts` | Conformance runner | **BANZA** — move with vectors |

This directory is the **clearest CRITICAL contamination**: certification vectors are, by definition, the protocol's compliance bar. An operator running its own copy is an operator grading its own exam.

---

## Is anything here a genuine *operator* contract?

Reviewed for operator-specific API shapes that are *not* protocol contracts (e.g., admin-only internal endpoints). **None found in `contracts/`** — every artifact is a protocol contract or a duplicate. Operator-internal API shapes live (correctly) as code in `services/` and as Go handlers, not as published contracts.

➡️ Therefore `contracts/` and `sdk-certification/` can be **emptied from the operator entirely**, with two safeguards:
1. Confirm BANZA's copies are equal-or-superset before deleting (done for openapi: identical; do the same diff for events/qr/webhooks/vectors before deletion).
2. Honor `CLAUDE.md §19.2` — which currently *requires* implemented features to have an artifact in `contracts/`. That rule must be **amended** (it assumes contracts live in the operator). The amendment: "implemented features must reference their canonical contract in `~/banza/contracts/`." This is a `CLAUDE.md` + §19 edit, part of the plan.

---

## Verdict

`contracts/` is 100% protocol-owned and largely a **stale duplicate** of `~/banza/contracts/` (which is a strict superset). `sdk-certification/` is protocol certification. Both leave the operator. The only non-mechanical step is amending the operator's own frozen-layout rule (§19.2) that currently presumes contracts live locally.

---

*Next: `BANZAMI-PRODUCT-AUDIT.md` (Phase 8).*
