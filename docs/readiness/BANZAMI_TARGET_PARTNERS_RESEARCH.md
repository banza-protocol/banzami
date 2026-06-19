# Banzami — Target Partner Research & Prioritization

**Version:** 1.0
**Date:** 2026-06-19
**Context:** [BANZAMI_LAUNCH_BLOCKERS_DOSSIER.md](BANZAMI_LAUNCH_BLOCKERS_DOSSIER.md) · [BANZAMI_PARTNER_OUTREACH.md](BANZAMI_PARTNER_OUTREACH.md)

> **Research only — not partnerships.** This is a target shortlist for outreach and
> prioritization. **No partnership is confirmed and nothing here is integrated.**
> Entries are drawn from general market knowledge (as of early 2026); every
> capability, **API/sandbox availability, Angola coverage, and regulatory standing
> must be verified directly with the provider** before relying on it. Cells marked
> **"verify"** are explicitly unconfirmed. Banzami remains provider-agnostic and
> needs only one approved path per capability to launch.

---

## 1. KYC / KYB Vendors

| Name | Type | Region | Why relevant | Capabilities | API / Sandbox | Regulatory relevance | Priority | First-contact angle | Risks / questions |
|------|------|--------|--------------|--------------|---------------|----------------------|----------|---------------------|-------------------|
| **Smile ID** | Identity verification | Africa-focused | Built for African ID documents + faces; strongest fit for African coverage | KYC, KYB, liveness | Yes (verify Angola docs) | Africa-centric; verify BNA alignment | **HIGH** | Africa-native identity; ask Angola B.I./Passport coverage | Confirm Angolan document + NIF coverage; manual-review fallback |
| **Youverify** | KYC/KYB / compliance | Africa (Nigeria-led) | Pan-African KYC/KYB + business registry checks | KYC, KYB | Yes (verify) | Africa compliance focus | **HIGH** | KYB/business registry + AML; ask Angola registry access | Verify Angolan company-registry + NIF lookups |
| **Prembly / Dojah** | Identity infra | Africa | Developer-first African identity APIs | KYC, KYB | Yes (verify) | Verify Angola | **MEDIUM** | Developer-first API fit for our adapter | Verify Angola data sources |
| **Sumsub** | KYC/KYB/AML | Global | Mature tiered KYC + KYB + AML, strong API | KYC, KYB | Yes, documented | Global compliance; verify BNA fit | **MEDIUM-HIGH** | Tiered/progressive KYC + KYB depth | Confirm Angolan document + liveness coverage |
| **Onfido (Entrust)** | Identity verification | Global | Established document + biometric verification | KYC | Yes, documented | Global; verify Angola | **MEDIUM** | Document + biometric maturity | Lusophone/Angola doc coverage; KYB depth |
| **Veriff** | Identity verification | Global | Strong document/liveness coverage | KYC | Yes, documented | Global; verify Angola | **MEDIUM** | Liveness + document breadth | Angola coverage; KYB not core |
| **Trulioo** | KYB / business verification | Global | Business verification + global registries | KYB | Yes (verify) | Global registries; verify Angola | **LOW-MEDIUM** | KYB/registry breadth | Angola registry coverage uncertain |

*Recommendation:* lead with **Africa-focused** vendors (Smile ID, Youverify) for
Angolan document + registry fit; keep a **global tier-1** (Sumsub) as a parallel
option for tiered KYC/AML depth.

---

## 2. Angolan Partner Banks

| Name | Type | Region | Why relevant | Capabilities | API / Sandbox | Regulatory relevance | Priority | First-contact angle | Risks / questions |
|------|------|--------|--------------|--------------|---------------|----------------------|----------|---------------------|-------------------|
| **EMIS (Multicaixa Express)** | Interbank network / rail | Angola | The national interbank switch; broadest reach | funding, withdrawal, settlement | Verify (operator onboarding) | **Central** — BNA operator certification required | **HIGH (long lead)** | National rail reach; ask operator-certification path | Certification + integration are the long pole (Path A) |
| **BAI — Banco Angolano de Investimentos** | Commercial bank | Angola | One of the largest Angolan banks; digital reach | funding, withdrawal, settlement | Verify | BNA-regulated | **HIGH** | Largest-bank reach + digital roadmap | API maturity / sandbox availability |
| **BFA — Banco de Fomento Angola** | Commercial bank | Angola | Large retail base; strong digital channels | funding, withdrawal, settlement | Verify | BNA-regulated | **HIGH** | Retail reach + digital channels | Partnership appetite; API access |
| **Banco BIC** | Commercial bank | Angola | Large network; SME focus | funding, withdrawal, settlement | Verify | BNA-regulated | **MEDIUM-HIGH** | SME/merchant alignment | API/sandbox maturity |
| **Standard Bank Angola** | Commercial bank | Angola (pan-African group) | Pan-African group with API/fintech experience | funding, withdrawal, settlement | Verify (group APIs) | BNA-regulated | **HIGH** | Group fintech/API experience | Confirm Angola-entity API access |
| **Millennium Atlântico** | Commercial bank | Angola | Innovation-oriented; digital initiatives | funding, withdrawal, settlement | Verify | BNA-regulated | **MEDIUM-HIGH** | Innovation/fintech posture | API readiness; partnership terms |
| **BPC — Banco de Poupança e Crédito** | State commercial bank | Angola | Very wide branch footprint | funding, withdrawal | Verify | BNA-regulated (state) | **MEDIUM** | Footprint/reach | Digital/API maturity; speed |
| **Access Bank Angola** | Commercial bank | Angola (pan-African group) | Pan-African group with digital partnerships history | funding, withdrawal | Verify | BNA-regulated | **MEDIUM** | Group partnership history | Angola-entity capability |

*Recommendation:* run **2–3 commercial banks in parallel** (BAI, BFA, Standard Bank
Angola) for a partner-bank rail (Path B/C), while opening the **EMIS** operator-
certification conversation early in the background (Path A is slower).

---

## 3. Payment / Funding / Withdrawal Providers

| Name | Type | Region | Why relevant | Capabilities | API / Sandbox | Regulatory relevance | Priority | First-contact angle | Risks / questions |
|------|------|--------|--------------|--------------|---------------|----------------------|----------|---------------------|-------------------|
| **Multicaixa Express / EMIS** | Domestic payment rail | Angola | Dominant domestic payment instrument | funding, withdrawal, settlement | Verify | BNA certification | **HIGH (long lead)** | Domestic ubiquity | = EMIS path; certification-heavy |
| **Unitel Money (e-Kwanza)** | Mobile money | Angola | Large telco mobile-money reach in AOA | funding, withdrawal | Verify | BNA / telco-fin rules | **HIGH** | Mobile-money cash-in/out reach | API/partner program availability |
| **Africell Angola (mobile money)** | Mobile money / telco | Angola | Telco mobile-money entrant | funding, withdrawal | Verify | BNA / telco-fin rules | **MEDIUM** | Emerging mobile-money reach | Maturity / coverage |
| **paySuite / local Angolan PSPs** | PSP / gateway | Angola | Local gateways tied to Multicaixa | funding, settlement | Verify | BNA-aligned | **MEDIUM** | Local Multicaixa integration | Confirm capability set + API |
| **Onafriq (formerly MFS Africa)** | Pan-African payments hub | Africa | Cross-border + mobile-money hub across Africa | funding, withdrawal, settlement | Yes (verify Angola) | Multi-jurisdiction | **MEDIUM** | Pan-African rail aggregation | **Verify Angola/AOA coverage** |
| **Cellulant** | Pan-African payments | Africa | Multi-country payments + collections | funding, withdrawal | Yes (verify Angola) | Multi-jurisdiction | **MEDIUM** | Multi-country collections | Verify Angola coverage |
| **DPO Group (Network Intl.)** | Pan-African PSP | Africa | Online payments across Africa | funding | Yes (verify Angola) | Multi-jurisdiction | **LOW-MEDIUM** | Online acceptance | Verify Angola/AOA support |
| **Flutterwave / Paystack** | Pan-African PSP | Africa | Large pan-African PSPs | funding, withdrawal | Yes | Multi-jurisdiction | **LOW-MEDIUM** | Strong APIs/sandbox | **Angola/AOA coverage uncertain — verify first** |

*Recommendation:* prioritize **Angola-domestic** rails (Multicaixa/EMIS, Unitel
Money) for real AOA in/out; treat **pan-African PSPs** as secondary and **verify
Angola/AOA coverage before investing** — many are strong elsewhere but may not
cover Angola.

---

## Prioritization Summary

| Decision area | Lead targets (HIGH) | Parallel / backup |
|---------------|---------------------|-------------------|
| **Identity (KYC/KYB)** | Smile ID, Youverify | Sumsub (tiered/AML depth) |
| **Money In / Out (bank rail)** | BAI, BFA, Standard Bank Angola | BIC, Millennium Atlântico |
| **Money In / Out (domestic rail)** | EMIS/Multicaixa (long lead), Unitel Money | local PSPs |
| **Settlement / reconciliation** | chosen bank or EMIS | pan-African hub (if Angola-covered) |
| **Regulatory** | BNA engagement (certification scope per rail) | — |

**Suggested sequence (aligns with dossier Path C — Hybrid):**
1. Open **identity vendor** conversations now (blocks 3 critical items; needed under every path).
2. Open **2–3 commercial bank** conversations in parallel (fastest real rail).
3. Start the **EMIS operator-certification** conversation in the background (slow; additive later).
4. Verify **Angola/AOA coverage** for any pan-African provider before deep engagement.

---

## Honesty & Sourcing Notes

- This table is **target research and prioritization only** — no partnership is
  confirmed, in discussion, or integrated.
- Provider names reflect general market presence; **all specifics (capabilities,
  API/sandbox, Angola coverage, regulatory standing) require direct verification.**
- Cells say **"verify"** wherever availability/coverage is not confirmed from
  authoritative sources. Do not treat any entry as a commitment.
- Banzami stays provider-agnostic: this list informs outreach, not architecture;
  one approved path per capability is sufficient to launch.
