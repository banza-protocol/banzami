# BANZAMI — Product Audit

**Audit:** BANZAMI-V1.0-PURIFICATION-AUDIT-001
**Version:** 1.0
**Date:** 2026-06-13
**Phase:** 8 — Product Ownership Audit

> Question: do all of `apps/*` belong to the operator, and does any product belong in BANZA instead?

---

## `apps/` ownership ruling

| App | Stack | Belongs to operator? | Ruling |
|---|---|---|---|
| `mobile` | Flutter | Consumer + merchant wallet app — pure operator product | **Banzami ✓** |
| `dashboard` | Next.js | Merchant dashboard — operator product | **Banzami ✓** |
| `merchant` | assets | Merchant brand assets | **Banzami ✓** |
| `admin` | Next.js | Operator backoffice | **Banzami ✓** |
| `pay` | Next.js | Public pay page — operator product | **Banzami ✓** |
| `checkout` | Next.js | Hosted checkout — operator product | **Banzami ✓** |
| `validation-studio` | Next.js | Internal validation tool | **Banzami ✓** (operator-internal) |
| `docs` | Next.js | **banzami.com — renders BANZA protocol content** | **Operator site, BANZA-governed content** ⚠️ |

**Result: 7 of 8 apps are cleanly the operator's.** No operator product belongs in BANZA — BANZA is a protocol, it ships no consumer/merchant apps. This is correct and reassuring: the *product surface is pure*.

---

## The one product that needs a decision: `apps/docs` (banzami.com)

This is the only product with mixed identity. It currently presents BANZA as protocol, certification, federation, trust, governance — via `components/protocol/*` and `components/banzai/modules/*` (Federation, CertificationCopilot, RFCExplorer). That was the deliberate output of `BANZA-WEBSITE-REBUILD-IMPLEMENTATION-001`.

**The boundary problem:** an *operator's* website acting as the *protocol's* public homepage blurs exactly the line this purification defends. Two clean end-states exist:

1. **Operator-first site:** banzami.com markets the Banzami product ("paga e recebe Kwanza ao instante"), with a clearly-labeled "Built on the BANZA protocol →" section linking to a BANZA-owned property (e.g., banza-protocol.org). Protocol/certification/federation deep content lives at the BANZA property; BanzAI widgets are thin clients of BanzAI's API.
2. **Operator-hosted protocol portal (explicit stewardship):** Banzami openly hosts the protocol's public site *as a service to the ecosystem*, clearly attributed to BANZA, with content sourced read-only from `~/banza`. Honest, but keeps the operator entangled with protocol presentation.

**Recommendation: option 1.** It is the only end-state consistent with "Banzami = operator, nothing more." Option 2 re-creates the very ambiguity the audit removes.

➡️ This is a **product/strategy decision for the founder**, flagged (not executed) here, because it conflicts with recently-shipped work. See Final Report §Open Decision.

---

## BanzAI widgets inside the operator site

`apps/docs/components/banzai/modules/*` should **consume BanzAI's API** (knowledge-search, conformance, manifest-validator), not reimplement protocol logic locally. If they call `lib/banzai-client.ts` → BanzAI API, that is correct (operator embedding BanzAI as a client). If they hardcode protocol knowledge, that is contamination to extract.

---

## Verdict

The product layer is the **cleanest part of the operator** — 7/8 apps are unambiguously Banzami, and BANZA correctly owns zero products. The single open item is the *identity of banzami.com*, which is a strategy decision, not a file move, and collides with just-shipped work — so it is surfaced for explicit founder resolution rather than auto-changed.

---

*Next: `BANZAMI-SERVICES-AUDIT.md` (Phase 9).*
