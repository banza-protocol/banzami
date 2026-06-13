# BANZAMI — Documentation Audit

**Audit:** BANZAMI-V1.0-PURIFICATION-AUDIT-001
**Version:** 1.0
**Date:** 2026-06-13
**Phase:** 4 — Documentation Role Audit

> Goal: find language that confuses the three roles, restates protocol rules locally, or carries pre-purification narrative.

---

## Headline finding: the README contradicts itself about ownership

The operator README **claims** protocol artifacts live in BANZA, then **documents them as resident here**:

| Line | Text | Problem |
|---|---|---|
| `README.md:14` | "Protocol governance, **SDKs, and contracts live at** github.com/banza-protocol/banza" | Claim: not here |
| `README.md:373` | "`contracts/` \| Protocol truth — OpenAPI, webhook schemas, QR specs, event contracts" | Reality: here |
| `README.md:491` | "`contracts/` Protocol truth — canonical contract definitions" | Reality: here |
| `README.md:496-499` | "`sdk-certification/` … (currently at sdk-certification/ — **migration pending**)" | Already self-identified as transitional contamination |
| `README.md:546` | "`sdk-certification/` → `contracts/sdk-certification/` \| Test runner import paths" | Half-done internal migration |

**Interpretation:** the team already knows these artifacts don't belong here ("migration pending"), but the migration was aimed *inside* the operator repo (`sdk-certification/` → `contracts/sdk-certification/`) rather than *out* to BANZA. The correct destination is `~/banza`. The documentation describes a contradiction the purification must resolve by making reality match the claim on line 14.

---

## Role-confusion phrase sweep

Searched for: "Banzami governs/defines/owns/certifies the protocol", "Banzami is the protocol", "BANZA processes/holds wallets/settles".

| Pattern | Hits | Verdict |
|---|---|---|
| "Banzami is the protocol / governs / defines / certifies" | Only `CLAUDE.md:124` ("Banzami is the protocol — NO. BANZA is the protocol.") | **Clean** — this is the *correct* corrective statement, not contamination |
| "BANZA processes payments / holds wallets / settles" (protocol doing operator work) | None | **Clean** |
| README role framing (lines 3–14) | Correct — "the protocol is not owned by Banzami", "operates independently" | **Clean** |
| `BANZAMI_GOVERNANCE.md` | Explicitly defers protocol governance (RFCs, ADRs, certification, federation) to ~/banza | **Clean / exemplary** |

**Good news:** the *narrative* role separation is already well-disciplined. There is almost no text claiming Banzami owns the protocol. The contamination is **structural (files), not rhetorical (words)** — with the one exception of the README's structure section documenting protocol artifacts as local.

---

## Documents that restate protocol knowledge (should reference, not host)

| File | Issue | Fix |
|---|---|---|
| `docs/certification.md` | Explains protocol certification levels | Replace body with a pointer to `~/banza/BANZA_CERTIFICATION.md` + one paragraph on *Banzami's* certified level |
| `docs/conformance.md` | Explains protocol conformance | Pointer to `~/banza/BANZA_CONFORMANCE.md` + Banzami's conformance status |
| `docs/glossary.md` | Mixes protocol + operator terms | Split; protocol terms → link to BANZA glossary |
| `docs/BANZA_REFERENCE.md` | Full copy of protocol reference | Acceptable **only** as a read-only build-time mirror to drive the site; add a header banner "MIRROR — canonical source: ~/banza. Do not edit here." |
| `README.md` (~1973 lines) | Operator README carrying large protocol/ecosystem narrative | Trim to operator-first; move ecosystem theory to a single linked section |

---

## Website narrative (must be reconciled, not silently changed)

`apps/docs` (banzami.com) presents BANZA-as-protocol via `components/protocol/*` and `components/banzai/modules/*` (Federation, CertificationCopilot, RFCExplorer). This was the **explicit intent** of the just-completed `BANZA-WEBSITE-REBUILD-IMPLEMENTATION-001`. 

This audit does not unilaterally reverse that. It flags an unresolved strategic question for the operator: *should banzami.com be the public face of the BANZA protocol, or should it be the operator's product site that links to a BANZA-owned property?* Both are defensible; they cannot both be true. See Final Report §Open Decision.

---

## Verdict (documentation)

Narrative discipline: **strong.** The words rarely confuse the roles. The defect is a **structural contradiction the README honestly admits** ("migration pending") and a handful of operator docs that host protocol knowledge instead of linking it. Low rhetorical cleanup; the real work is structural (Phases 6–10) plus reconciling the website's role.

---

*Next: `BANZAMI-STRUCTURE-AUDIT.md` (Phase 5).*
