# BANZAMI — Repository Minimalization Report

**Audit:** BANZAMI-REPOSITORY-MINIMALIZATION-001
**Version:** 1.0
**Date:** 2026-06-13
**Goal:** Determine the smallest repository that still lets the Banzami operator function.
**Scope audited:** `apps/`, `docs/`, `assets/`, root files. (`core/`, `services/`, `sdk/`, `db/`, `infra/`, `tools/` are out of scope — unambiguously operational, all KEEP.)

---

## Method and the one honest caveat

The test applied to every entry: **"Would Banzami stop operating if this disappeared?"**

One caveat, stated up front because it governs the whole report: applied *literally*, that test deletes **all documentation and all tests** — none of them make the running system process a payment. But:

1. The project's own constitution (`CLAUDE.md §2.4`) declares **"Undocumented systems are considered incomplete systems"** and makes documentation mandatory. A pure "runtime-only" repo violates it.
2. The final question — *"what does a new engineer need to operate the business?"* — is a **maintenance** question, not a runtime one. A new engineer needs runbooks, deployment, security, and architecture docs to *operate*; they do not need historical audits, marketing, or protocol theory.

So this report distinguishes **operate the running system** (runtime) from **operate the business** (run + maintain + deploy + secure), and recommends the second — the minimal set a new engineer needs — not a runtime-only skeleton. Two delete tiers are given: **Safe** (no build/maintenance impact) and **Aggressive** (runtime-minimal, accepts maintainability loss).

---

## Dependency gotchas (verified — would break if deleted)

| Asset | Hidden dependency | Verdict |
|---|---|---|
| `assets/banza/` | `apps/docs/tailwind.config.ts` imports `banza/tokens/tailwind.banza.js` | **KEEP** (build dep) — or extract only the used tokens |
| `docs/validation/` | `apps/docs/Dockerfile` COPYs it; `deploy.sh` rsyncs it; `apps/docs/lib/validation.ts` + `validation.test.ts` read `BANZAMI_IMPLEMENTATION_MATRIX.json` | **KEEP** (build + deploy + test dep) |
| `docs/adr/` | `apps/docs/lib/banzai-client.ts` references ADR paths in its catalog | KEEP (also operator decisions) |

The literal heuristic would have deleted the first two and broken the **operating** docs site — proof that "delete impact" must be checked, not assumed.

---

## apps/ — classification

Deployed services (from `deploy.sh`): `dashboard-frontend`, `admin-frontend`, `pay-frontend`, `checkout-frontend`, `docs-frontend`. Flutter apps ship to stores (not in deploy.sh).

| App | Ownership | Purpose | Deployed? | Verdict | Deletion impact |
|---|---|---|---|---|---|
| `apps/dashboard` | Operator | Merchant dashboard (business.banzami.com) | ✅ | **KEEP** | Merchants lose self-service |
| `apps/admin` | Operator | Operator backoffice / operations | ✅ | **KEEP** | Operations blind |
| `apps/pay` | Operator | Public pay page (pay.banzami.com) | ✅ | **KEEP** | Payment links/QR break |
| `apps/checkout` | Operator | Hosted checkout | ✅ | **KEEP** | Hosted checkout gone |
| `apps/mobile` | Operator | Banzami wallet app (consumer + merchant) | ships to stores | **KEEP** | The consumer product |
| `apps/merchant` | Operator | Separate Flutter merchant app (banzami_merchant) | ships to stores | **REVIEW → KEEP** | If superseded by `mobile`'s merchant persona, DELETE; otherwise an active product. Confirm before removing. |
| `apps/docs` | Operator (site) | banzami.com — marketing + developer docs | ✅ | **KEEP (slim)** | Not required to *process* payments, but is the deployed public/developer surface and depends on `assets/banza` + `docs/validation`. Strict-runtime: removable; business-operate: keep. |
| `apps/validation-studio` | Operator (internal governance UI) | Validation matrix studio | ❌ (Makefile dev only) | **DELETE** | None to operation — only `make` dev targets reference it. Internal governance tool, not a payment surface. |

---

## docs/ — classification

Mandate: no historical, no protocol, no educational, no BanzAI. Keep only operational.

| Path | Verdict | Reason |
|---|---|---|
| `docs/adr/` (18) | **KEEP** | Operator architecture decisions; referenced by docs site |
| `docs/api/` (2) | **KEEP** | API reference (keep-list: APIs) |
| `docs/architecture/` (4) | **KEEP** | Operator architecture |
| `docs/runbooks/` (2) | **KEEP** | Operations |
| `docs/playbooks/` (2) | **KEEP** | Operations |
| `docs/incident-management/` (1) | **KEEP** | Operations |
| `docs/security/` (1) | **KEEP** | Security |
| `docs/compliance/` (1) | **KEEP** | Operational compliance |
| `docs/sandbox/` (2) | **KEEP** | Sandbox env (testing/integration) |
| `docs/domains/` (17) | **KEEP** | Domain reference per CLAUDE.md §5.2 (operational) |
| `docs/validation/` (4) | **KEEP** | **Build + deploy dependency** (see gotchas) |
| `docs/standards/` (2) | **KEEP** | webhook-signature (integration) + mobile-ux |
| `docs/developer/` (5) | **REWRITE** | Keep `15_MINUTE_QUICKSTART` (supports SDK integration); **DELETE** `FIRST_100_BUILDERS_ROADMAP`, `SDK_ADOPTION_PLAN` (strategy/educational) |
| `docs/integrations/` (12) | **REVIEW** | Keep operator integration guides (EMIS, webhooks); DELETE educational/reference-app walkthroughs |
| `docs/audit/` (23) | **DELETE** | Historical audit reports (ecosystem readiness, alignment, the strategic audit). Retrospective analysis — mandate: no historical. |
| `docs/governance/` (12) | **REVIEW → KEEP recent** | Purification/separation decision records. "Historical" by mandate, but they are the *current* decision log you just commissioned. Keep the latest (purification + this report); the rest are archivable. |
| `docs/brand/` (2) | **DELETE** | Brand guidelines — not operational |
| `docs/product/` (2) | **DELETE** | Positioning/marketing strategy |
| `docs/website/` (1) | **DELETE** | Website-rebuild report (historical) |
| `docs/certification.md` | **DELETE** | Protocol (now a pointer) |
| `docs/conformance.md` | **DELETE** | Protocol (now a pointer) |
| `docs/reference-operator.md` | **DELETE** | Protocol concept |
| `docs/glossary.md` | **DELETE** | Protocol/educational vocabulary |
| `docs/BANZAMI_INSTITUTIONAL_SEPARATION_REPORT.md` | **DELETE** | Historical report |
| `docs/APP_STORE_REVIEW_NOTES.md` | **KEEP** | Operational (store submission) |
| `docs/index.md`, `docs/README.md` | **REWRITE** | Slim to operator doc index after deletions |

---

## assets/ — classification

| Path | Verdict | Reason |
|---|---|---|
| `assets/banza/` (16 — icons, logo, splash, brand guidelines, tokens) | **KEEP (build dep) / trim** | Protocol-brand by ownership, **but `apps/docs/tailwind.config.ts` imports `banza/tokens/tailwind.banza.js`**. Deleting breaks the docs build. Minimal fix: keep only `tokens/`, delete the icon/splash/guideline PNGs (not imported). |
| `assets/branding/` (banzami_logo, social) | **KEEP** | Operator brand |
| `assets/icons/banzami_logo.png` | **KEEP** | Operator brand |
| `assets/Banzami.png`, `assets/banzami_logo.svg` | **KEEP** | Operator brand |

---

## Root files — classification

| File | Verdict | Reason |
|---|---|---|
| `CLAUDE.md` | **KEEP** | Engineering constitution — exactly what a new engineer needs |
| `README.md` | **KEEP** | Entry point |
| `Makefile`, `deploy.sh`, `dev.sh` | **KEEP** | Deployment/operations (remove `validation-studio` targets from Makefile if that app is deleted) |
| `.env.example`, `.gitignore` | **KEEP** | Operational config |
| `LICENSE` | **KEEP** | Legal |
| `BANZAMI_ARCHITECTURE.md` | **KEEP** | Operate: architecture |
| `BANZAMI_DEPLOYMENT.md` | **KEEP** | Operate: deployment |
| `BANZAMI_OPERATIONS.md` | **KEEP** | Operate: operations |
| `BANZAMI_SECURITY.md` | **KEEP** | Operate: security |
| `BANZAMI_GOVERNANCE.md` | **KEEP** | Operator governance (lean) |
| `BANZAMI_PRODUCTS.md` | **REWRITE/KEEP** | Product catalogue — useful for a new engineer; trim marketing |
| `BANZAMI_REFERENCE.md` | **REWRITE** | Operator reference — trim ecosystem theory |
| `BANZAMI_ROADMAP.md` | **DELETE** | Forward strategy — not needed to operate |
| `CONTRIBUTING.md` | **KEEP (lean)** | Onboarding |
| `CODE_OF_CONDUCT.md` | **KEEP** | Community standard (cheap to keep) |
| `.tmux.conf` | **DELETE** | Personal dev config — not operational |

---

## The minimal repository (answer to the final question)

> **"If a new engineer joined Banzami tomorrow, what is the minimum repository needed to operate the business?"**

```
core/        services/    sdk/      db/      infra/    tools/        ← run the system (out of scope, all KEEP)
apps/        dashboard admin pay checkout mobile (+merchant?)  docs  ← operator product surfaces
assets/      branding icons + banza/tokens (build dep)
docs/        adr api architecture domains runbooks playbooks
             incident-management security compliance sandbox
             validation standards developer(quickstart)
root         CLAUDE.md README.md Makefile deploy.sh dev.sh
             .env.example .gitignore LICENSE
             BANZAMI_{ARCHITECTURE,DEPLOYMENT,OPERATIONS,SECURITY,GOVERNANCE,PRODUCTS,REFERENCE}.md
```

Everything outside this set is removable without affecting the operator.

---

## Deletion impact summary & execution tiers

### Tier 1 — SAFE (no build/deploy/test impact; recommended)
- `apps/validation-studio/` (+ remove its Makefile targets)
- `docs/audit/`, `docs/brand/`, `docs/product/`, `docs/website/`
- `docs/certification.md`, `docs/conformance.md`, `docs/reference-operator.md`, `docs/glossary.md`
- `docs/BANZAMI_INSTITUTIONAL_SEPARATION_REPORT.md`
- `docs/developer/{FIRST_100_BUILDERS_ROADMAP,SDK_ADOPTION_PLAN}.md`
- `BANZAMI_ROADMAP.md`, `.tmux.conf`
- Trim `assets/banza/` to `tokens/` only (delete unused icon/splash/guideline PNGs)
- **Impact:** none on the running operator. Removes historical/protocol/educational/marketing material. Updates needed: `docs/index.md`, `docs/README.md` (drop dead links), `Makefile` (drop validation-studio).

### Tier 2 — AGGRESSIVE (runtime-minimal; accepts maintainability loss — NOT recommended)
- Additionally remove `apps/docs/` (marketing/dev site), `docs/governance/`, most narrative docs, all `*_test` files.
- **Impact:** violates `CLAUDE.md §2.4` (mandatory docs); removes the public/developer site (a deployed surface); loses the decision log. The system still *processes payments*, but the *business* is harder to operate and onboard into.

### Must NOT delete (would break the operating system)
`assets/banza/tokens/` · `docs/validation/` · anything under `core/ services/ sdk/ db/ infra/`.

---

## Recommendation

Execute **Tier 1** only. It achieves the spirit of minimalization — no historical, protocol, educational, BanzAI, or marketing-strategy material — without breaking a single build or violating the engineering constitution. Tier 2 trades real operability for a smaller file count and is not advised for a money-moving operator where "trust is the product."

---

## Executed (2026-06-13) — Public website only

The founder scoped the first execution to **the official public website only** (not Tier 1). Removed:

- `apps/docs/` — the banzami.com public website (Next.js `docs-frontend`). The operator does not need a public marketing/docs site to process payments; operator documentation remains as markdown under `docs/`.
- `assets/banza/` — protocol brand assets whose **only** consumer was `apps/docs/tailwind.config.ts` (orphaned by the website removal). *(Note: this discarded pre-existing uncommitted edits to the website, which were being deleted regardless.)*
- `docs/website/` — the website-rebuild report (historical).

Reference fixes (so build/deploy/checks stay green):
- `deploy.sh` — removed the `docs-frontend` service (ALL_SERVICES, deploy function + its docs sync, case dispatch, header).
- `tools/check-repository-layout.mjs` — removed `docs` from the apps lists.
- `README.md`, `CLAUDE.md` (§4, §14 marked obsolete, §19.4 services), `BANZAMI_OPERATIONS.md` — dropped website references.

Verification: layout check **PASS** (25/0); `bash -n deploy.sh` **OK**; no functional dangling `apps/docs`/`docs-frontend` references remain.

**Deferred (governance):** `docs/validation/BANZAMI_IMPLEMENTATION_MATRIX.json` still has 43 `apps/docs/**` references in VALIDATED items. The matrix is approval-gated (CLAUDE.md §16); those website items are now stale and should be retired via the validation-governance process, not edited here.

The remaining Tier-1 candidates (`apps/validation-studio`, `docs/{audit,brand,product}`, protocol pointers, etc.) were **not** removed — out of the website-only scope.
