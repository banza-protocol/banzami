# Diagram Remediation Plan

**Version:** 1.0
**Date:** 2026-05-29
**Audit:** BANZAMI-CANONICAL-ALIGNMENT-AUDIT-013
**Status:** Complete

---

## Evaluation Criteria

Each diagram is scored 0–100 on:
- **Accuracy** (40pts): Does it correctly show what exists?
- **Completeness** (30pts): Does it omit major components?
- **Clarity** (20pts): Is it legible and well-composed?
- **Consistency** (10pts): Does it use canonical terminology?

---

## SVG Inventory — Banza docs/images/architecture/

26 SVG files found. Evaluated by category:

---

### Tier 1 — ACCURATE & COMPLETE (score 80+)

| SVG | Score | Notes |
|-----|-------|-------|
| `protocol-operating-system.svg` | 87/100 | 8 capabilities correct, orbital layout clear, subtitle text fix applied. Minor: could label the 8 capabilities with their Portuguese names |
| `federation-intelligence.svg` | 82/100 | Correctly shows dual-operator input, analysis engine, compatibility score, blocking issues. Clear. |
| `protocol-simulator.svg` | 85/100 | before/after state comparison clear. Deterministic nature shown. |
| `protocol-memory.svg` | 83/100 | Timeline + memory store + trajectory clear. |
| `operator-digital-twin.svg` | 84/100 | 6-panel dashboard structure correct. Accurate. |
| `certification-copilot.svg` | 81/100 | L0→L4 readiness analysis shown. Canonical level names correct. |
| `roadmap-architecture.svg` | 79/100 | 5-column status breakdown. Accurate to current roadmap. |
| `banzamia-cognitive-layer.svg` | 83/100 | 4-layer protocol model (Physical, Financial, Governance, Cognitive) is architecturally sound. |
| `banzamia-truth-model.svg` | 85/100 | "Tools determine truth / AI explains truth" separation is correct. |
| `banzamia-knowledge-gap.svg` | 80/100 | Before/After comparison effective. |
| `protocol-graph-architecture.svg` | 82/100 | Node types and relationship types shown. |
| `protocol-graph-explorer.svg` | 80/100 | UI panels accurate to implementation. |

---

### Tier 2 — NEEDS MINOR UPDATE (score 65–79)

| SVG | Score | Issue | Recommendation |
|-----|-------|-------|---------------|
| `banzami-ecosystem.svg` | 72/100 | Likely shows the ecosystem without current Protocol OS framing | Verify: add Protocol OS as explicit layer between Protocol and Operators |
| `banzamia-force-multiplier.svg` | 70/100 | May show 8 components — needs to reflect 16-module scope | Update component count if hardcoded |
| `rag-evaluation-architecture.svg` | 74/100 | Accurate but doesn't show Protocol Graph integration with RAG (hybrid retrieval) | Add graph-assisted retrieval path |
| `graph-enhanced-retrieval.svg` | 76/100 | Shows graph + vector retrieval — needs to reflect 17 node types vs old count | Verify node type count |
| `agentic-research-flow.svg` | 75/100 | Multi-step research flow — verify it shows the 6-step process correctly | Validate against current research.ts implementation |
| `quality-dashboard-architecture.svg` | 71/100 | May not include all new metrics from Protocol OS modules | Verify metrics shown match QualityModule.tsx |

---

### Tier 3 — REQUIRES REPLACEMENT (score below 65)

| SVG | Score | Issue | Action Required |
|-----|-------|-------|----------------|
| `banzamia-product-architecture.svg` | 35/100 | Shows 8 modules in 4×2 grid — now 16 modules exist. Every page using this SVG presents false information. | **Replace with 16-module 3-layer diagram** |
| `ecosystem-intelligence-layer.svg` | 60/100 | May use outdated "intelligence layer" framing vs. "Protocol Operating System" | Audit terminology; replace if "Protocol Intelligence" still present |
| `protocol-adoption-economics.svg` | 62/100 | Protocol adoption funnel — verify it reflects current certification 5-level model | Verify L0–L4 labels are canonical |
| `force-multiplier-model.svg` | 58/100 | Possibly a duplicate of `banzamia-force-multiplier.svg` with older component list | Consolidate or verify uniqueness |
| `protocol-self-explanation.svg` | 63/100 | Old framing likely — "self-explanation" was pre-Protocol OS concept | Audit for "Protocol Intelligence" references; update positioning |
| `autonomous-protocol-vision.svg` | 62/100 | Future vision diagram — verify it doesn't conflict with current capabilities | Add "delivered" markers for completed items |

---

## Priority Replacements

### URGENT: Replace `banzamia-product-architecture.svg`

**Current:** 8 modules in a 2×4 grid  
**Required:** 16 modules in 3-layer structure

Proposed layout:
```
┌──────────────────────────────────────────────────────────────────┐
│  Camada de Protocolo: Chat · Protocol Research · Protocol Graph   │
│                        Knowledge Search · RFC/ADR Explorer        │
├──────────────────────────────────────────────────────────────────┤
│  Camada de Operador: Operator Builder · Certification Copilot     │
│               Conformance · Manifest Validator · Protocol Simulator│
├──────────────────────────────────────────────────────────────────┤
│  Camada de Inteligência: Trace Explainer · SDK Assistant          │
│     Federation Intelligence · Protocol Memory · Digital Twin      │
│                          Quality Dashboard                        │
└──────────────────────────────────────────────────────────────────┘
```

SVG dimensions: viewBox="0 0 700 420"  
Style: consistent with protocol-operating-system.svg (same colors, gradients, shadow)

---

## Diagram Standards (canonical)

All architecture SVGs must use:
- `viewBox="0 0 700 *"` (width 700px)
- Background: `fill="#F5F1EE"`
- Primary gradient: `#990011 → #B11226` (title bars)
- Gold gradient: `#C89B3C → #D4A843` (taglines, highlights)
- Card fill: `white`, stroke: `#E2D9D7`, `stroke-width="1.5"`
- Card height: minimum 48px (subtitle text must be contained)
- Text colors: `#374151` (headings), `#9CA3AF` (subtitles)
- Font: `ui-sans-serif, system-ui, -apple-system, sans-serif`
- Drop shadow filter: `feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#00000012"`

---

## Action Plan

| Action | SVG | Effort | Priority |
|--------|-----|--------|---------|
| Replace with 16-module diagram | `banzamia-product-architecture.svg` | 2h | Critical |
| Audit + update terminology | `ecosystem-intelligence-layer.svg` | 30min | High |
| Audit + update terminology | `protocol-self-explanation.svg` | 30min | High |
| Verify node type count | `graph-enhanced-retrieval.svg` | 15min | Medium |
| Add graph integration path | `rag-evaluation-architecture.svg` | 1h | Medium |
| Verify adoption model level names | `protocol-adoption-economics.svg` | 15min | Medium |
| Consolidate or archive | `force-multiplier-model.svg` | 15min | Low |
| Add "delivered" markers | `autonomous-protocol-vision.svg` | 30min | Low |
