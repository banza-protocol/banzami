# Banza Documentation Audit

**Version:** 1.0  
**Date:** 2026-05-28  
**Status:** Active  
**Author:** Banza Engineering

---

## Purpose

This audit captures the gap between the Banza codebase and its documentation as of May 2026. It drives the BANZAMI-DOCUMENTATION-CONSOLIDATION-009 effort.

---

## Current Document Inventory

| Document | Language | Lines | Status | Coverage |
|----------|----------|-------|--------|----------|
| `docs/BANZA_REFERENCE.md` | Portuguese | 3046 | Active | Product-focused; missing kernel architecture, conformance, BanzAI |
| `README.md` | English | 1966 | Active | Developer-focused; good architecture coverage |
| `docs/adr/ADR-001..017` | Portuguese | — | Active | 17 ADRs; gaps in certification, conformance, BanzAI governance |
| `docs/sandbox/README.md` | English | ~500 | Active | Comprehensive; accurate |
| `docs/validation/INVARIANT_TAXONOMY.md` | English | — | Active | Accurate |
| `docs/validation/VALIDATION_DOMAINS.md` | English | — | Active | Accurate |
| `docs/validation/README.md` | Portuguese | — | Active | Governance model accurate |
| `docs/architecture/README.md` | — | ~50 | Stub | Placeholder only |
| `docs/architecture/integration-ecosystem.md` | — | — | Active | Limited scope |
| `docs/domains/*/README.md` | — | ~30 each | Stubs | All domain READMEs are placeholders |
| `docs/api/README.md` | — | — | Stub | Placeholder only |
| `docs/brand/README.md` | — | — | Active | Partial |
| `docs/product/positioning.md` | — | — | Active | Accurate |
| `docs/product/strategy.md` | — | — | Active | Accurate |

### Missing Documents

| Document | Priority | Impact |
|----------|----------|--------|
| `docs/architecture/BANZAMI_ECOSYSTEM_REFERENCE.md` | Critical | No single architecture source of truth |
| `docs/banzamia/` (entire directory) | Critical | BanzAI has zero documentation |
| `docs/glossary.md` | High | Terminology inconsistency across all docs |
| `docs/index.md` | High | No navigation entry point for new contributors |
| `docs/reference-operator.md` | High | Reference operator details scattered or missing |
| `docs/conformance.md` | High | Conformance model undocumented |
| `docs/certification.md` | High | Certification levels 0–4 undocumented |
| `docs/images/architecture/banzami-ecosystem.svg` | Medium | No visual ecosystem diagram |

---

## Issues by Category

### 1. Obsolete Concepts

| Location | Issue | Impact |
|----------|-------|--------|
| `BANZA_REFERENCE.md` §17 | "Banza Kernel" described as 5 crates; actual codebase has 19 | Incorrect for any technical reader |
| `BANZA_REFERENCE.md` §18 | Lists "BanzAI" as a future roadmap item; it now exists and is deployed | Misleading |
| `BANZA_REFERENCE.md` §20 | References `gen-icons-sandbox.sh` and `make-sandbox-icon.py` as current tools; both are deprecated | Incorrect |
| `README.md` | Does not mention conformance suite, certification framework, or BanzAI | Architecture drift |
| `docs/sandbox/README.md` | Lists Python SDK example; no Python SDK exists or is planned | Incorrect SDK example |

### 2. Missing Concepts

| Concept | Status in Docs | Actual Status |
|---------|---------------|---------------|
| Banza Kernel (19 crates) | Partially described | Fully implemented |
| Financial Invariants (taxonomy) | Only in `INVARIANT_TAXONOMY.md` | Not surfaced in public docs |
| Conformance Suite | Not documented | Implemented |
| Certification Framework (Levels 0–4) | Not documented | Defined in matrix |
| BanzAI | Mentioned as future in REFERENCE | Deployed at /banzamia |
| Operator Manifests | Not documented | Defined in schema |
| Capabilities System | Not documented | Implemented |
| Federation Foundations | Not documented | Planned |
| Traceability System (trace_id) | Mentioned in README only | Fully implemented |
| Observability (OTel) | Partial in REFERENCE | Fully implemented |
| RFC Governance | Not documented externally | Process exists |

### 3. Inaccurate Descriptions

| Location | Issue |
|----------|-------|
| `BANZA_REFERENCE.md` §17 | Kernel described as 5 crates (ledger, wallets, transactions, settlements, api-gateway); actual is 19+ crates split across `core/` |
| `apps/docs/app/layout.tsx` | Nav includes only 8 items; missing: Conformance, Certification, Operators detail |
| Footer links in layout | References `/o-que-e-o-banzami` and `/seguranca-e-integridade-financeira` as direct paths; both are dynamic `[section]` routes driven by BANZA_REFERENCE.md section slugs |
| `docs/sandbox/README.md` | Python SDK example uses `banzami.Client` — no Python SDK is planned; TypeScript and Flutter are the official SDKs |

### 4. Architecture Drift

| Area | Documentation State | Implementation State |
|------|--------------------|--------------------|
| **Operator model** | Not described in any public doc | Reference Operator + Sandbox Operator both implemented |
| **Certification** | Not described | Level 0–4 system defined in validation matrix |
| **BanzAI modules** | Not described | 8 modules deployed: Chat, Operator Builder, Conformance, Manifest Validator, Trace Explainer, SDK Assistant, RFC/ADR Explorer, Knowledge Search |
| **Validation Studio** | Only README/governance docs | Full web UI at /validacao |
| **Traceability** | Brief mention in README | Full trace_id propagation, causality chains, invariant verification |
| **Observability** | Described in §20.12 of REFERENCE | OTel implemented across all services |
| **Financial invariants** | Only in INVARIANT_TAXONOMY.md | 15+ invariants enforced, BanzAI surfaces them live |

### 5. Terminology Inconsistencies

| Term | Used as | Correct usage |
|------|---------|--------------|
| "Banza" | Both org and product in older docs | Org/infrastructure only (ADR-016) |
| "Banzami SDK" vs "Banza SDK" | Mixed | "Banzami SDK" (product SDK) |
| "Operator" | Undefined in public docs | Party that implements Banza protocol |
| "Kernel" | Sometimes "core", sometimes "kernel" | "Banza Kernel" = Rust financial core |
| "Conformance" | Not defined | Protocol compliance verification |
| "Certification" | Not defined | Official level earned by passing conformance |
| "Manifest" | Only in code | Operator capability declaration |
| "Invariant" | Technical docs only | Financial rule that must never be violated |
| "Provider" | Undefined | Payment rail provider (EMIS, Multicaixa) |
| "Trace" | Brief mention | Causally ordered event sequence for a payment |

### 6. Duplicated Explanations

| Content | Locations |
|---------|-----------|
| Sandbox environment description | `docs/sandbox/README.md`, `BANZA_REFERENCE.md §20`, `README.md` |
| Brand architecture (Banza vs Banzami) | `ADR-016`, `BANZA_REFERENCE.md §1`, `README.md §intro` |
| Double-entry ledger description | `ADR-002`, `BANZA_REFERENCE.md §17`, `README.md` |
| Authentication strategy | `ADR-003`, `ADR-010`, scattered in README |
| SDK architecture | `ADR-007`, `ADR-012`, `README.md`, `BANZA_REFERENCE.md §12` |

### 7. Broken References

| Location | Reference | Status |
|----------|-----------|--------|
| `docs/sandbox/README.md` | Python SDK `banzami.Client` | No Python SDK exists |
| `BANZA_REFERENCE.md` | `gen-icons-sandbox.sh` | Deprecated |
| `docs/architecture/README.md` | "See architecture diagrams" | No diagrams exist |
| `docs/domains/*/README.md` | "See full specification" | All are stubs with no content |
| `BANZA_REFERENCE.md §18` | BanzAI as future roadmap | BanzAI is deployed |

---

## Required Fixes by Priority

### Critical (blocks institutional coherence)

1. **Create `BANZAMI_ECOSYSTEM_REFERENCE.md`** — architecture-first master reference for the full ecosystem, not the product narrative in BANZA_REFERENCE.md
2. **Create `docs/banzamia/` documentation suite** — BanzAI is deployed with 8 modules and zero documentation
3. **Create `docs/glossary.md`** — terminology drift is pervasive; a single authoritative glossary fixes it
4. **Update `BANZA_REFERENCE.md §18`** — remove BanzAI from "future roadmap"; describe it accurately

### High (blocks developer onboarding)

5. **Create `docs/certification.md`** — Levels 0–4, workflow, badge system; nothing is documented
6. **Create `docs/conformance.md`** — conformance suite, test structure, pass/fail semantics
7. **Create `docs/reference-operator.md`** — detailed reference for the canonical operator implementation
8. **Create `docs/index.md`** — navigation entry point for new contributors
9. **Update architecture overview** — kernel is 19 crates, not 5; update all references

### Medium (improves quality)

10. **Create SVG ecosystem diagram** — visual architecture map
11. **Website homepage** — expand narrative from "instant payments" to "programmable financial infrastructure"
12. **Remove Python SDK example** from sandbox docs
13. **ADR cross-links** — all major concepts should trace to their governing ADR

### Low (polish)

14. **Populate domain READMEs** — all are stubs
15. **Deduplication** — consolidate repeated sandbox descriptions into single source
16. **Navigation audit** — ensure all website nav items have corresponding docs

---

## Impact Assessment

| Impact Area | Current State | Target State |
|-------------|---------------|-------------|
| New contributor onboarding | Must read 3046-line Portuguese document | Entry point index + modular docs |
| Operator onboarding | No documentation exists | Full certification workflow |
| BanzAI understanding | Zero documentation | 9-file documentation suite |
| Architecture comprehension | Scattered, outdated | Single ecosystem reference |
| Terminology | Inconsistent across 10+ files | Single authoritative glossary |
| Institutional trust | Product story only | Protocol + governance + certification |

---

## References

- ADR-016 — Brand architecture (Banza/Banzami)
- ADR-015 — Markdown-first content architecture
- `docs/validation/VALIDATION_DOMAINS.md`
- `docs/validation/INVARIANT_TAXONOMY.md`
- BANZAMI-DOCUMENTATION-CONSOLIDATION-009
