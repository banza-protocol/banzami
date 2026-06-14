# Banzami — Documentation Truth Cleanup Report

**Audit:** BANZAMI-DOCUMENTATION-TRUTH-CLEANUP-001
**Date:** 2026-06-14
**Goal:** A clean, trustworthy, operator-only documentation set — every kept
document true today and useful to build, operate, secure, deploy, integrate, or
maintain Banzami.

---

## Deleted

**Historical governance/audit reports (17)** — all session-era purification,
contamination, ownership, minimalization, separation, and validation-redesign
reports. Their decisions are applied; the record is not operationally useful.

**Redundant root docs (2)** — `BANZAMI_PRODUCTS.md`, `BANZAMI_ROADMAP.md` (products
and roadmap are covered by `README.md` and `BANZAMI_REFERENCE.md`).

**Redundant meta docs (2)** — `docs/index.md`, `docs/README.md` (replaced by the
single meta-document `docs/DOCUMENTATION_MAP.md`).

> `docs/audit/`, `docs/banzamia/`, `docs/images/architecture/`, the website, and
> protocol/BanzAI material were already removed in earlier passes.

## Rewritten / corrected (truth-audit)

| Document | Fix |
|----------|-----|
| `CLAUDE.md` §14 | Removed the obsolete "website source of truth" section (website removed) |
| `CLAUDE.md` §15.9 | Reframed content-update rule (no website/mirror) |
| `README.md` Status | Downgraded over-claims — honest: core validated, QR/merchant/SDK in progress, EMIS/KYC blocked, **not production-ready** |
| `BANZAMI_DEPLOYMENT.md` | Removed `docs-frontend` service + the `BANZA_REFERENCE.md` COPY block |
| `CONTRIBUTING.md` | Removed `docs/BANZA_REFERENCE.md` + `docs site` refs; `contracts/` → `docs/api/` |
| `BANZAMI_REFERENCE.md` | Removed the website-content-source line |
| `docs/validation/README.md` | `BANZA_REFERENCE.md` → `BANZAMI_REFERENCE.md`; removed `deploy.sh docs-frontend` step |
| `docs/standards/webhook-signature-spec.md` | Removed `sdk-certification/` refs → BANZA protocol repo |
| `docs/certification.md`, `docs/conformance.md` | Removed reference to a deleted report |
| `docs/adr/ADR-015` | Marked OBSOLETE (website architecture removed) |

## Kept

- **Root:** `README.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`,
  `LICENSE`, `BANZAMI_ARCHITECTURE.md`, `BANZAMI_OPERATIONS.md`,
  `BANZAMI_SECURITY.md`, `BANZAMI_DEPLOYMENT.md`, `BANZAMI_REFERENCE.md`,
  `BANZAMI_GOVERNANCE.md`.
- **docs/:** adr, api, architecture, compliance, developer, diagrams, domains,
  incident-management, integrations, playbooks, runbooks, sandbox, security,
  standards, validation, glossary, certification/conformance/reference-operator
  (pointers), `DOCUMENTATION_MAP.md`, governance (current-state + this report).

## New

- `docs/DOCUMENTATION_MAP.md` — the single meta-document.
- `docs/governance/BANZAMI_CURRENT_STATE.md` — concise current state.

## False claims corrected

- "Banzami website single source of truth" → website removed.
- README "QR/merchant/SDK/Dashboard implemented" → in progress.
- EMIS implied operational → blocked; provider simulated; **not production-ready**.
- No document claims Banzami owns/certifies BANZA, hosts the BANZA reference, or
  that BanzAI is a Banzami product.

## Remaining known gaps

- Historical ADRs (012, 015, 016) reference now-removed paths; retained as
  dated decision records and clearly marked where obsolete.
- `docs/validation/` matrix tracks operator readiness (already operator-clean).

## Final docs tree (top level)

```
root   README · CLAUDE · CONTRIBUTING · CODE_OF_CONDUCT · LICENSE
       BANZAMI_{ARCHITECTURE,OPERATIONS,SECURITY,DEPLOYMENT,REFERENCE,GOVERNANCE}
docs/  DOCUMENTATION_MAP.md · glossary · certification/conformance/reference-operator (pointers)
       adr · api · architecture · compliance · developer · diagrams · domains
       incident-management · integrations · playbooks · runbooks · sandbox
       security · standards · validation · governance (current-state + report)
```

## Verification

- `make check-repo-layout` — **PASS**
- Validation Studio tests — **PASS**
- No active document references deleted paths or banned terms (verified by grep).

**Banzami is documented as the first operator built on the BANZA protocol — a
wallet-native payment network for Kwanza. The repository is clean, not archival.**
