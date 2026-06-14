# Banzami Validation Studio — Operator Readiness Redesign (Phase 1 Audit)

**Audit:** BANZAMI-VALIDATION-STUDIO-PURIFICATION-002
**Date:** 2026-06-14
**Goal:** Turn the studio into an **Operator Readiness Center** answering one
question: *Can Banzami safely operate real-world payments today?*
**Status:** Read-only audit + redesign plan. No matrix change applied. §16 gated.

---

## Starting point

The legacy-protocol purge was already completed in
[PURIFICATION-001](BANZAMI-VALIDATION-PURIFICATION-REPORT.md). The current matrix
is **63 operator items / 21 categories**, with **zero** protocol, BanzAI, website,
documentation, architecture, or roadmap items. **Phases 2–3 of this redesign are
therefore already done.** This pass is a **restructure**, not a purge.

| Current | Value |
|---|---|
| Items | 63 |
| Status | 11 VALIDATED · 2 IMPLEMENTED · 46 PLANNED · 4 BLOCKED |
| Priority | 39 CRITICAL · 18 HIGH · 6 MEDIUM — **over-weighted; CRITICAL no longer means "blocks launch"** |
| Categories | 21 (operator) |

**Classification:** all 63 items are **KEEP** (real operator capabilities). No
further DELETE/MERGE needed — the changes below are domain, priority, and category
**restructuring**, plus a readiness dashboard.

---

## What this redesign changes

1. **Readiness pillars** (domain model) — replace engineering-concern domains with
   pillars that map 1:1 to the dashboard's "Can Banzami…?" questions.
2. **Priority recalibration** — `CRITICAL` = *blocks production launch*. Today 39
   items are CRITICAL; the real launch-blockers are ~24.
3. **Category alignment** — English operator terms, fold `@banza` handles into
   Identity, add `Funding` / `Settlement` / `Operations` pillars.
4. **Operator Readiness Dashboard** — the studio homepage answers launch questions.

> **Score model (Phase 7):** the studio already derives confidence from evidence +
> validation methods (`computeConfidence` in `lib/types.ts`), not from documentation.
> Scores are already code/evidence-based — no mass rewrite required.

---

## Readiness pillars (proposed domain model)

Each pillar answers one dashboard question. Items map to exactly one pillar.

| Pillar | Dashboard question | Items |
|--------|--------------------|-------|
| **IDENTITY** | Who is the user / merchant? | IDT-002/003, HDL-001/002/003 |
| **MONEY MOVEMENT** | Can consumers move money? | WAL-001/002/003, P2P-001/002/003, APP-001, QR-001…005, PL-001/002/003, PR-001/002 |
| **MONEY IN** | Can real Kwanza enter? | WAL-004, EMS-001 |
| **MONEY OUT** | Can money leave to a bank? | PAY-001/002, EMS-002, REF-001/002 |
| **MERCHANT** | Can merchants accept & manage? | BM-001/002/003, BW-001/002/003/004 |
| **DEVELOPER** | Can developers integrate safely? | SDK-001…005, API-001/002/003, WH-001/002/003, SBX-001 |
| **LEDGER** | Is the money provably correct? | LED-001/002/003/004 |
| **TRUST** | Is it safe & auditable? (regulators) | KYC-001/002, RSK-001/002, SEC-001/002/003/004 |
| **OPERATIONS** | Can incidents be seen & handled? Can it scale? | OBS-001/002/003 |

(`OPERATIONS` and `SUPPORT` runbook/incident items do not exist yet — flagged as
genuine readiness gaps, not invented.)

---

## Priority recalibration (CRITICAL = blocks production launch)

**CRITICAL — cannot launch without it (~24):** WAL-001, WAL-002, HDL-001, HDL-002,
LED-001, LED-002, LED-003, P2P-001, P2P-003, QR-001, QR-002, QR-003, API-001,
SEC-001, SEC-003, SEC-004, WH-002, KYC-001, KYC-002, EMS-001, EMS-002, PAY-001,
SBX-001, APP-001.

**HIGH — launch possible but risky:** WAL-003, WAL-004, QR-004, QR-005, PL-001,
PL-002, PL-003, PR-001, PR-002, BM-001, BM-002, BM-003, BW-001, BW-003, SDK-001,
SDK-003, API-002, WH-001, WH-003, RSK-001, RSK-002, OBS-001, OBS-003, SEC-002,
REF-001, REF-002, PAY-002, LED-004.

**MEDIUM — important, not blocking:** IDT-002, IDT-003, HDL-003, P2P-002, BW-002,
BW-004, SDK-002, SDK-004, SDK-005, API-003, OBS-002.

**LOW:** (none today)

Result: **CRITICAL 39 → ~24**, a meaningful launch-blocker set.

---

## Operator Readiness — current coverage matrix

"Ready" = VALIDATED or IMPLEMENTED. (Based on current statuses.)

| Pillar | Ready | Total | Readiness | Launch-blocking gap |
|--------|------:|------:|-----------|---------------------|
| IDENTITY | 4 | 5 | 🟢 80% | handle search (low) |
| MONEY MOVEMENT | 5 | 17 | 🟠 29% | QR core all PLANNED |
| MONEY IN | 1 | 2 | 🔴 funding implemented, **EMIS BLOCKED** |
| MONEY OUT | 0 | 5 | 🔴 0% | withdrawals + EMIS settlement BLOCKED |
| MERCHANT | 0 | 7 | 🔴 0% | all PLANNED |
| DEVELOPER | 0 | 12 | 🔴 0% | SDK/API/webhooks PLANNED |
| LEDGER | 2 | 4 | 🟠 50% | immutability + reconciliation PLANNED |
| TRUST | 0 | 8 | 🔴 0% | KYC BLOCKED, security PLANNED |
| OPERATIONS | 0 | 3 | 🔴 0% | observability PLANNED |

**Honest verdict (what the CEO sees):** the **core money engine is real**
(wallets, P2P, ledger, atomic postings — VALIDATED), but Banzami **cannot launch
real payments today**: real Kwanza cannot enter or leave (EMIS/funding/withdrawals
BLOCKED), QR (the product) is unbuilt, KYC is blocked, and security/observability
are unimplemented. **The single gate is the EMIS rail + KYC.**

---

## Deliverables

1. **Matrix (§16):** remap `validationDomain` to the 9 pillars; recalibrate
   priorities; align categories.
2. **Studio code (normal commit):** new domain enum in `lib/types.ts` +
   `VALIDATION_DOMAINS.md`; **Operator Readiness Dashboard** on the homepage.
3. **Final report:** `BANZAMI-VALIDATION-STUDIO-REDESIGN-REPORT.md`.

---

*Phase 1 audit only. Matrix changes require the §16 approval phrase. Studio code
changes (types, dashboard) are normal commits.*
