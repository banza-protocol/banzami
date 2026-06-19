# Banzami — Outreach Verification Checklist & Contact-Prep Workflow

**Version:** 1.0
**Date:** 2026-06-19
**Inputs:** [TARGET_PARTNERS_RESEARCH](BANZAMI_TARGET_PARTNERS_RESEARCH.md) · [PARTNER_OUTREACH](BANZAMI_PARTNER_OUTREACH.md) · [PARTNER_INTEGRATION_PACK](BANZAMI_PARTNER_INTEGRATION_PACK.md) · [LAUNCH_BLOCKERS_DOSSIER](BANZAMI_LAUNCH_BLOCKERS_DOSSIER.md)
**Purpose:** Prepare and run the first real outreach wave — verify before contact, then contact.

> **Honesty rules (apply to every contact):** never claim a partnership exists,
> never claim Angola/AOA support unless verified, never claim API/sandbox exists
> unless verified, never claim Banzami is production-ready. Stay provider-agnostic
> (EMIS is one option among several). All contact sources below are **leads to
> confirm from the official website**, not verified addresses.

---

## 0. Universal Workflow & Checklist

### Outreach workflow (per target)
1. **Verify** (below) → record findings.
2. **Decide Go / Deprioritize** per the go/no-go gate.
3. **Find the right contact** via the official website (Partnerships / Contact / Developer pages) and LinkedIn (BD/Partnerships).
4. **Send the tailored email** (from PARTNER_OUTREACH §1–3), filling `[brackets]`.
5. **Attach/reference** the one-page brief; offer the integration pack on request.
6. **Log** outcome + next step + owner.

### Pre-contact verification checklist (all targets)
- [ ] **Angola / AOA coverage** confirmed from an authoritative source?
- [ ] **Capability fit** (KYC, KYB, funding, withdrawal, settlement, reconciliation) matches the need?
- [ ] **API + sandbox** exist and are documented?
- [ ] **Regulatory standing** (BNA-relevant for the activity) plausible?
- [ ] **Official contact path** identified (department + channel)?
- [ ] **Current legal name / domain** confirmed (avoid stale/rebranded entities)?

### What Banzami must NOT claim (every email)
- ❌ "We have partners / we are integrated" — we do not, we are not.
- ❌ "We support Angola/AOA via X" — only after the provider confirms.
- ❌ "Our sandbox/production with you exists" — not until built.
- ❌ "Banzami is production-ready" — it is not (state: internally code-complete for
  non-provider capabilities; launch needs external integration + clearance).

### Default document to attach
- **Attach:** the one-page partner brief (PARTNER_INTEGRATION_PACK §4).
- **Offer on request:** full integration pack + technical questionnaire (§6).
- **Internal only (never send):** launch blockers dossier (it is an internal doc).

### Go / No-Go gate (any target)
- **GO** if: Angola/AOA coverage **verified** + capability fit + API/sandbox exists + regulatory standing plausible.
- **DEPRIORITIZE** if: Angola coverage cannot be confirmed, or no API/sandbox, or capability mismatch.
- **HOLD** if: promising but Angola coverage "verify pending" — park until confirmed.

---

## 1. KYC / KYB Vendors

| Partner | Verify before contact | Where to find contact | Likely department | Outreach angle | What to ask | Don't claim | Attach | Priority | Go/No-Go |
|---|---|---|---|---|---|---|---|---|---|
| **Smile ID** | Angolan B.I./Passport/Carta + NIF coverage; KYB; liveness | Official site → Contact/Sales; LinkedIn BD | Sales / Partnerships | "Africa-native identity for an Angolan wallet network" | Angola doc coverage, KYB/registry, levels, sandbox | that we're live or integrated | one-pager | **HIGH** | GO if Angola docs confirmed |
| **Youverify** | Angola KYC + business-registry/NIF lookups | Official site → Contact; LinkedIn | Sales / Compliance partnerships | "Pan-African KYC/KYB + registry for Angola" | Angola registry access, beneficial-owner, sandbox | Angola support unless confirmed | one-pager | **HIGH** | GO if Angola registry confirmed |
| **Sumsub** | Angolan document + liveness coverage; tiered KYC/AML | Official site → Sales/Demo | Sales / Solutions | "Tiered KYC + KYB + AML depth" | Angola coverage, KYB depth, levels, sandbox | that integration exists | one-pager | **MEDIUM-HIGH** | GO if Angola docs confirmed |
| **Prembly / Dojah** | Angola data sources; developer API fit | Official site → Developers/Contact | Developer relations / Sales | "Developer-first API fit for our adapter" | Angola coverage, API maturity, sandbox | Angola support unless confirmed | one-pager | **MEDIUM** | HOLD until Angola confirmed |
| **Onfido (Entrust)** | Angola/Lusophone doc coverage; KYB depth | Official site → Contact/Sales | Sales | "Document + biometric maturity" | Angola coverage, KYB, sandbox | production-readiness on our side | one-pager | **MEDIUM** | HOLD until Angola confirmed |
| **Veriff** | Angola coverage; KYB scope | Official site → Sales | Sales | "Liveness + document breadth" | Angola coverage, KYB, sandbox | Angola support unless confirmed | one-pager | **MEDIUM** | HOLD until Angola confirmed |
| **Trulioo** | Angola business-registry coverage | Official site → Contact | Sales / KYB | "Business verification breadth" | Angola registry, API, sandbox | that we have a KYB provider | one-pager | **LOW-MEDIUM** | DEPRIORITIZE if no Angola registry |

---

## 2. Angolan Partner Banks

| Partner | Verify before contact | Where to find contact | Likely department | Outreach angle | What to ask | Don't claim | Attach | Priority | Go/No-Go |
|---|---|---|---|---|---|---|---|---|---|
| **EMIS (Multicaixa Express)** | Operator onboarding/certification path; integration model | Official site → Institutional/Contact; via a sponsor bank | Operations / Operator onboarding | "Operator certification path to the national rail" | Certification scope, timeline, technical model | that we're certified or integrated | one-pager | **HIGH (long lead)** | GO to *explore* now; rail = later |
| **BAI** | API/digital-partnership program; sandbox | Official site → Corporate/Contact; LinkedIn | Digital / Corporate Banking / Innovation | "Largest-bank reach for instant Kwanza payments" | API access, funding/withdrawal, settlement feed | that a partnership exists | one-pager | **HIGH** | GO; gate on API availability |
| **BFA** | Digital-channel API; partnership appetite | Official site → Empresas/Contact; LinkedIn | Digital Banking / Corporate | "Retail reach + digital channels" | API/sandbox, payout + reconciliation | Angola-readiness claims on our end | one-pager | **HIGH** | GO; gate on API availability |
| **Standard Bank Angola** | Angola-entity API access (vs group); sandbox | Official site → Business/Contact; group fintech | Transaction Banking / Fintech partnerships | "Group fintech/API experience applied in Angola" | Angola-entity APIs, funding/withdrawal, settlement | that we're integrated | one-pager | **HIGH** | GO; confirm Angola-entity API |
| **Banco BIC** | API maturity; SME/merchant programs | Official site → Empresas/Contact | Corporate / SME Banking | "SME/merchant alignment" | API/sandbox, capabilities | partnership exists | one-pager | **MEDIUM-HIGH** | HOLD on API maturity |
| **Millennium Atlântico** | Fintech/innovation API readiness | Official site → Contact; LinkedIn | Innovation / Digital | "Innovation-oriented bank partnership" | API/sandbox, capabilities, terms | production-readiness | one-pager | **MEDIUM-HIGH** | HOLD on API readiness |
| **BPC** | Digital/API maturity; speed | Official site → Contact | Digital / Operations | "Wide footprint for cash-in/out reach" | API/sandbox, funding/withdrawal | partnership exists | one-pager | **MEDIUM** | DEPRIORITIZE if no API |
| **Access Bank Angola** | Angola-entity capability; group programs | Official site → Contact; group partnerships | Partnerships / Digital | "Group partnership history in Angola" | Angola-entity API, capabilities | Angola capability unless confirmed | one-pager | **MEDIUM** | HOLD until Angola-entity confirmed |

---

## 3. Payment / Funding / Withdrawal Providers

| Partner | Verify before contact | Where to find contact | Likely department | Outreach angle | What to ask | Don't claim | Attach | Priority | Go/No-Go |
|---|---|---|---|---|---|---|---|---|---|
| **Multicaixa Express / EMIS** | Domestic rail integration + certification | via EMIS / a sponsor bank | Operations / Operator onboarding | "Domestic ubiquity via the national rail" | Integration + certification path | integrated/certified | one-pager | **HIGH (long lead)** | GO to explore; cert-heavy |
| **Unitel Money (e-Kwanza)** | Partner/API program; cash-in/out model in AOA | Official site → Business/Contact; telco BD | Mobile Money / BD | "Mobile-money cash-in/out reach in Kwanza" | API/sandbox, funding/withdrawal, limits | that we're integrated | one-pager | **HIGH** | GO if partner API exists |
| **Africell Angola (mobile money)** | Mobile-money product maturity/coverage | Official site → Business/Contact | Mobile Money / BD | "Emerging mobile-money reach" | product status, API, coverage | coverage unless confirmed | one-pager | **MEDIUM** | HOLD on maturity |
| **Local Angolan PSPs (Multicaixa-linked)** | Capability set + API; Multicaixa linkage | Official sites → Contact | Sales / Integrations | "Local Multicaixa integration" | capabilities, API/sandbox | partnership exists | one-pager | **MEDIUM** | HOLD on capability/API |
| **Onafriq (ex-MFS Africa)** | **Angola/AOA coverage** (key) ; settlement | Official site → Partnerships | Partnerships / BD | "Pan-African rail aggregation" | **Angola coverage**, funding/withdrawal, settlement | Angola support unless confirmed | one-pager | **MEDIUM** | DEPRIORITIZE if no Angola |
| **Cellulant** | **Angola coverage**; collections/payouts | Official site → Contact | Partnerships / BD | "Multi-country collections + payouts" | **Angola coverage**, capabilities, sandbox | Angola support unless confirmed | one-pager | **MEDIUM** | DEPRIORITIZE if no Angola |
| **DPO Group (Network Intl.)** | **Angola coverage**; payout support | Official site → Contact | Sales / Partnerships | "Online acceptance across Africa" | **Angola/AOA support**, payout, sandbox | Angola support unless confirmed | one-pager | **LOW-MEDIUM** | DEPRIORITIZE if no Angola |
| **Flutterwave / Paystack** | **Angola/AOA coverage** (uncertain) | Official site → Sales/Contact | Sales / Partnerships | "Strong APIs/sandbox" | **Angola/AOA coverage first**, capabilities | Angola support (uncertain) | one-pager | **LOW-MEDIUM** | DEPRIORITIZE if no Angola |

---

## Priority Order for Wave 1

1. **Identity:** Smile ID, Youverify (then Sumsub) — blocks 3 critical items; needed under every path.
2. **Bank rail:** BAI, BFA, Standard Bank Angola (parallel) — fastest real Money In/Out path.
3. **Domestic rail (explore, long lead):** EMIS/Multicaixa, Unitel Money.
4. **Pan-African providers:** only after **Angola/AOA coverage is verified** — otherwise deprioritize.

**Owner & cadence:** assign each lead an owner; verify → contact → log within the
same week; weekly review of go/no-go status. Mirrors the dossier's recommended
**Path C (Hybrid):** identity vendor + one bank rail first; EMIS later.

---

## Honesty Statement

This workflow is preparation for outreach, not evidence of any relationship.
Contact paths are leads to confirm from official sources, not verified addresses.
No Angola coverage, API/sandbox, or capability is asserted as fact — each is gated
on direct verification. Banzami is not production-ready and has no provider
integrated; that changes only after sandbox integration, the go-live gate
(INTEGRATION_PACK §9), and regulatory clearance.
