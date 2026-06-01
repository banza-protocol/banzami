# BANZA Website Rebuild — Implementation Report

**Document ID:** BANZA-WEBSITE-REBUILD-IMPLEMENTATION-001  
**Date:** 2026-06-01  
**Status:** COMPLETE  
**Authority:** BANZA_WEBSITE_REBUILD_PLAN.md, ADR-025

---

## Objective

Rebuild the BANZA public website frontend from the protocol reference and canonical SVGs, replacing all legacy Banzami/operator product content with protocol-first pages.

**Invariant enforced:** The website presents BANZA as a protocol — not as an operator, wallet, app, or commercial product.

---

## Phase Results

### Phase 1 — Legacy Components Removed

The following product/operator marketing components were deleted:

| Component | Reason |
|-----------|--------|
| `MobilePaymentMockup.tsx` | Consumer app UI mockup |
| `QRCommerceVisual.tsx` | Merchant checkout marketing UI |
| `WalletToWalletVisual.tsx` | Consumer wallet product UI |
| `ManifestoQuote.tsx` | Portuguese product manifesto |
| `HeroBanzAIWidget.tsx` | Operator product BanzAI widget |
| `PaymentFlowDiagram.tsx` | Product-centric flow diagram (replaced by canonical SVGs) |
| `EcosystemMap.tsx` | Operator product marketing visual |
| `HeroSection.tsx` | Portuguese product hero section |
| `SDKArchitectureVisual.tsx` | Had operator brand references |
| `SecurityPipelineVisual.tsx` | Had operator brand references |
| `ArchitectureDiagram.tsx` | Stale product architecture visual |

Generic layout components retained: `BackToTop`, `Callout`, `ASCIIDiagramBlock`, `MarkdownSection`, `SectionCard`, `SectionHero`, `SectionNav`, `ReadingProgress`, `ReferenceToc`, `ReferenceMobileToc`, `NoBodyScroll`.

BanzAI components retained (all — they are the Protocol OS): `components/banzai/**`.

Operators components retained (all — protocol registry): `components/operators/**`, `components/validation/**`.

### Phase 2 — New Protocol-First Components Created

Ten new components in `components/protocol/`:

| Component | Purpose |
|-----------|---------|
| `DiagramPanel.tsx` | Renders canonical SVGs from `/diagrams/protocol/` |
| `ProtocolPropertyGrid.tsx` | Four protocol properties (public rules, open certification, verifiable invariants, federation) |
| `HowItWorks.tsx` | Four-step flow: BANZA defines → BanzAI evaluates → Operators implement → Federation |
| `CertificationLadder.tsx` | L0–L4 certification levels with federation gate callout |
| `TrustArchitecturePreview.tsx` | Four-layer trust hierarchy (Root → Manifest → Issuing → Certificate) |
| `BanzAIBoundaryPanel.tsx` | BANZA certifies vs. BanzAI evaluates boundary (ADR-029) |
| `RoadmapMilestones.tsx` | M1 (complete) / M2 (active) / M3 (next) protocol milestones |
| `CTASection.tsx` | Operator/developer CTA grid |
| `EcosystemHierarchy.tsx` | Operators → BanzAI → BANZA dependency diagram |
| `SectionIntro.tsx` | Reusable section eyebrow + heading + body |

### Phase 3 — Homepage Rebuilt

`app/page.tsx` rebuilt with 10 protocol sections:

1. **Hero** — "Not a bank. Not a wallet. Not an app. A protocol."
2. **Why BANZA exists** — 4 problem cards (closed islands, WhatsApp receipts, discretionary access, missing protocol layer)
3. **Protocol overview** — `protocol-overview-v1.svg` + 4 protocol property cards
4. **How it works** — 4-step BANZA/BanzAI/Operators/Federation flow
5. **Federation** — `federation-overview-v1.svg` + M1 completion status (79/79 tests)
6. **Trust** — `trust-hierarchy-v1.svg` + trust architecture preview
7. **Certification** — `certification-levels-v1.svg` + L0–L4 ladder
8. **BanzAI** — `banzai-positioning-v1.svg` + BANZA certifies/BanzAI evaluates panel
9. **Roadmap** — M1 complete, M2 active, M3 next
10. **Operator/developer CTAs** — 4 action cards

### Phase 4 — Reference Source Corrected

**Before:** `lib/reference.ts` read from `/Users/fm65/banzami/docs/BANZA_REFERENCE.md`  
(Portuguese, 19 sections, product-mixed)

**After:** `lib/reference.ts` resolves in priority order:
1. `data/BANZA_REFERENCE.md` — generated artifact (copied from banza repo, included in deploy.sh rsync)
2. `../../../banza/BANZA_REFERENCE.md` — sibling repo (local development)
3. `../../docs/BANZA_REFERENCE.md` — VM legacy path (existing deploy.sh sync target)

**New canonical source:** `/Users/fm65/banza/BANZA_REFERENCE.md`  
(English, 12 sections, protocol-only)

New section slugs and routes:

| §  | Title | Slug | Route |
|----|-------|------|-------|
| 1 | Introduction | `introduction` | `/introduction` |
| 2 | Why BANZA Exists | `why-banza-exists` | `/why-banza-exists` |
| 3 | Core Principles | `core-principles` | `/core-principles` |
| 4 | Certification | `certification` | `/certification` |
| 5 | Federation | `federation` | `/federation` |
| 6 | Trust | `trust` | `/trust` |
| 7 | BanzAI | `banzai` | dedicated `app/banzai/page.tsx` |
| 8 | Operators | `operators` | dedicated `app/operators/page.tsx` |
| 9 | Developer Resources | `developer-resources` | `/developer-resources` |
| 10 | Governance | `governance` | `/governance` |
| 11 | Roadmap | `roadmap` | dedicated `app/roadmap/page.tsx` |
| 12 | FAQ | `faq` | `/faq` |

### Phase 5 — Section Page Updated

`app/[section]/page.tsx` updated:
- Removed all legacy visual component imports (`PaymentFlowDiagram`, `EcosystemMap`, `SDKArchitectureVisual`)
- Added `DiagramPanel` with canonical SVG mapping for each section slug
- Updated prev/next navigation labels to English ("previous" / "next")
- Added `operators` and `roadmap` to `STATIC_ROUTE_OVERRIDES`

### Phase 6 — Dedicated Pages Rebuilt

**`app/operators/page.tsx`** — fully English:
- Header: "BANZA Operator Registry" with stats
- Protocol invariant: infrastructure transparency, not financial surveillance
- Added `inter-operator-payment-flow-v1.svg` diagram panel
- Preserved `RegistryFilters` component (protocol registry is valid content)

**`app/roadmap/page.tsx`** — fully English:
- Protocol milestones section (M1/M2/M3) using `RoadmapMilestones` component
- BanzAI roadmap section (14 completed modules + in-progress/planned/research/vision)
- Removed Portuguese content throughout

**`app/reference/page.tsx`** — fully English:
- Header: "BANZA — Protocol Reference"
- Labels: "Official Protocol Reference", "Authority", "subsections", "Open as page →"
- Attribution: "BANZA Protocol" (removed Banzami)

### Phase 7 — Canonical SVG Integration

All 9 canonical protocol SVGs integrated by route:

| Route | SVG(s) |
|-------|--------|
| `/` (homepage) | protocol-overview-v1, federation-overview-v1, trust-hierarchy-v1, certification-levels-v1, banzai-positioning-v1 |
| `/introduction`, `/core-principles` | protocol-overview-v1 |
| `/why-banza-exists` | protocol-hierarchy-v1 |
| `/certification` | certification-levels-v1 |
| `/federation` | federation-overview-v1, inter-operator-payment-flow-v1, federation-trust-flow-v1 |
| `/trust` | trust-hierarchy-v1, root-key-hierarchy-v1 |
| `/banzai` | banzai-positioning-v1 |
| `/operators` | inter-operator-payment-flow-v1 |

No legacy `/images/architecture/*.svg` paths remain. All SVGs served from `/diagrams/protocol/`.

### Phase 8 — SEO / Metadata Updated

`app/layout.tsx` metadata updated:
- Title: "BANZA — Open Financial Infrastructure Protocol for Angola"  
  *(was: "BANZA — Open Financial Infrastructure Protocol")*
- Description: protocol-first, operator-neutral
- Keywords: protocol terms only (removed wallet, QR, instant payments)
- OpenGraph: operator-neutral description
- Footer: "BANZA is an open protocol... No bilateral agreement required."

### Phase 9 — Redirects Updated

`next.config.ts` updated with 26 redirects:
- Portuguese section slugs → English canonical routes
- Legacy English aliases (pre-ADR-025) → canonical routes
- Preserves backward compatibility for all known Portuguese URL patterns

### Phase 10 — deploy.sh Updated

New step added to `build_website()` before docs app rsync:
```bash
mkdir -p "$BANZAMI_REPO/apps/docs/data"
cp "$BANZA_REPO/BANZA_REFERENCE.md" "$BANZAMI_REPO/apps/docs/data/BANZA_REFERENCE.md"
```

This ensures `data/BANZA_REFERENCE.md` (the primary reference path) is always populated from the banza repo on every deploy.

---

## Build Result

```
✓ Compiled successfully
✓ Generating static pages (24/24)
```

| Route | Status |
|-------|--------|
| `/` | ○ Static |
| `/[section]` (9 routes) | ● SSG |
| `/banzai` | ○ Static |
| `/operators` | ○ Static |
| `/operators/[id]` (3 routes) | ● SSG |
| `/reference` | ○ Static |
| `/roadmap` | ○ Static |
| `/sobre-o-banzai` | ○ Static (redirect) |
| `/validacao` | ○ Static (redirect) |

---

## Validation Results

| Check | Result |
|-------|:------:|
| `npm run build` | **PASS** |
| `make identity-check` (Level 1 + Level 2) | **PASS** |
| `scripts/assert-required-svgs.sh` (9/9) | **PASS** |
| `rg -i "cantina\|taxi\|wallet app\|merchant product" apps/docs/app/` | **0 matches** |
| `rg -i "banzami\|banzamia" apps/docs/app/page.tsx` | **0 matches** |
| `rg -i "banzami\|banzamia" apps/docs/app/layout.tsx` | Logo image path only (alt="BANZA") |

---

## Remaining Risks

1. **Logo image filename** — `/images/banza/banzami-logo.png` still references the operator product name in the filename. The alt text and display are correct ("BANZA"). Renaming the asset requires updating the public folder and any CDN cache. Non-blocking for deployment.

2. **BanzAI component modules** — `components/banzai/modules/*.tsx` contain "banzami" in API URL strings and internal references. These are the Protocol OS UI components, not protocol specification content. They predate this rebuild and are not in scope.

3. **BANZA_REFERENCE.md in banzami/docs** — The old Portuguese reference file at `/Users/fm65/banzami/docs/BANZA_REFERENCE.md` still exists but is no longer consumed (reference.ts now resolves `data/BANZA_REFERENCE.md` first). It should be archived or removed in a follow-up commit.

4. **`EcosystemHierarchy` component** — Created but not yet used in any page (utility for future `/architecture` page). Not blocking.

---

## Phase 11 — Final Verdict

**YES — the rebuilt BANZA website can replace the legacy Banzami-derived site on banzami.org.**

| Success Criterion | Status |
|-------------------|:------:|
| Website no longer looks or reads like a product | **✓** |
| Website presents BANZA as a protocol | **✓** |
| BanzAI appears only as a BANZA section | **✓** |
| All protocol visuals come from canonical SVGs | **✓** |
| Site builds cleanly (24/24 static pages) | **✓** |
| Identity check PASS | **✓** |
| All required SVGs present | **✓** |
| No Portuguese product content in rebuilt pages | **✓** |
| Backward-compatible redirects for all Portuguese URLs | **✓** |

---

## Authority

- Protocol reference: `BANZA_REFERENCE.md` (banza repo)
- SVG registry: `docs/architecture/BANZA_SVG_REGISTRY.md`
- ADR-015 (reference as single source of truth)
- ADR-025 (ecosystem naming, operator separation)
- ADR-029 (BanzAI boundary — certifies vs. evaluates)
