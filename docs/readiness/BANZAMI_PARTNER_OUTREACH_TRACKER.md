# Banzami — Partner Outreach Tracker (Wave 1)

**Version:** 1.0
**Date:** 2026-06-19
**Inputs:** [VERIFICATION_WORKFLOW](BANZAMI_OUTREACH_VERIFICATION_WORKFLOW.md) · [TARGET_PARTNERS_RESEARCH](BANZAMI_TARGET_PARTNERS_RESEARCH.md) · [PARTNER_OUTREACH](BANZAMI_PARTNER_OUTREACH.md) · [PARTNER_INTEGRATION_PACK](BANZAMI_PARTNER_INTEGRATION_PACK.md)
**Purpose:** Live tracking sheet for Wave 1 outreach. Fill placeholders as work progresses.

> **No invented data.** Contacts, emails, persons, and dates are **placeholders**
> until confirmed from official sources. "Contact source" is *where to look*, not a
> verified address. No Angola/AOA coverage, API/sandbox, or regulatory fit is
> asserted — all start **Pending** and are gated on direct verification. Banzami is
> not production-ready and has no provider integrated.

### Legend
- **Verif. status:** `Not started` · `In progress` · `Confirmed` · `Failed`
- **Angola? / API+SB? / Reg.fit?:** `Pending` · `Yes` · `No` (record source when Yes/No)
- **Email sent?:** `No` · `Yes`  · **Date:** `YYYY-MM-DD`
- **Response:** `—` · `Sent` · `Replied` · `Meeting set` · `Declined` · `No response`
- **Decision:** `GO` (verified, proceed) · `HOLD` (verify pending) · `DEPRIORITIZE`
- **Owner:** `[assign]`  · **Person/Dept:** role known; person `[tbd]`
- Default attachment for every send: **one-page brief** (INTEGRATION_PACK §4). Never send the internal dossier.

---

## 1. KYC / KYB Vendors

| Target | Type | Prio | Verif. status | Angola? | API+SB? | Reg.fit? | Contact source | Person / Dept | Email sent? | Date | Response | Next action | Owner | Notes | Decision |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Smile ID | KYC/KYB | HIGH | Not started | Pending | Pending | Pending | Official site → Contact/Sales; LinkedIn BD | Sales/Partnerships · `[tbd]` | No | — | — | Verify Angola docs + KYB | `[assign]` | Africa-native; strongest doc fit | HOLD |
| Youverify | KYC/KYB | HIGH | Not started | Pending | Pending | Pending | Official site → Contact; LinkedIn | Sales/Compliance · `[tbd]` | No | — | — | Verify Angola registry/NIF | `[assign]` | Pan-African KYB + registry | HOLD |
| Sumsub | KYC/KYB/AML | MED-HIGH | Not started | Pending | Pending (docs exist) | Pending | Official site → Sales/Demo | Sales/Solutions · `[tbd]` | No | — | — | Verify Angola coverage | `[assign]` | Tiered KYC + AML depth | HOLD |
| Prembly / Dojah | Identity infra | MEDIUM | Not started | Pending | Pending | Pending | Official site → Developers/Contact | Dev relations/Sales · `[tbd]` | No | — | — | Verify Angola data sources | `[assign]` | Developer-first API | HOLD |
| Onfido (Entrust) | KYC | MEDIUM | Not started | Pending | Pending (docs exist) | Pending | Official site → Sales | Sales · `[tbd]` | No | — | — | Verify Angola/Lusophone docs | `[assign]` | KYB depth unclear | HOLD |
| Veriff | KYC | MEDIUM | Not started | Pending | Pending (docs exist) | Pending | Official site → Sales | Sales · `[tbd]` | No | — | — | Verify Angola coverage | `[assign]` | KYB not core | HOLD |
| Trulioo | KYB | LOW-MED | Not started | Pending | Pending | Pending | Official site → Contact | Sales/KYB · `[tbd]` | No | — | — | Verify Angola registry | `[assign]` | Backup KYB | DEPRIORITIZE if no Angola |

---

## 2. Angolan Partner Banks

| Target | Type | Prio | Verif. status | Angola? | API+SB? | Reg.fit? | Contact source | Person / Dept | Email sent? | Date | Response | Next action | Owner | Notes | Decision |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| EMIS (Multicaixa Express) | Interbank rail | HIGH (long lead) | Not started | Yes (domestic) | Pending | Pending (BNA cert) | Official site → Institutional; via sponsor bank | Operator onboarding · `[tbd]` | No | — | — | Explore certification path | `[assign]` | National rail; slow | GO (explore) |
| BAI | Commercial bank | HIGH | Not started | Yes (domestic) | Pending | Pending | Official site → Corporate/Contact; LinkedIn | Digital/Corporate · `[tbd]` | No | — | — | Confirm API/sandbox | `[assign]` | Largest-bank reach | GO (explore) |
| BFA | Commercial bank | HIGH | Not started | Yes (domestic) | Pending | Pending | Official site → Empresas/Contact; LinkedIn | Digital Banking · `[tbd]` | No | — | — | Confirm API + payout/recon | `[assign]` | Retail reach | GO (explore) |
| Standard Bank Angola | Commercial bank | HIGH | Not started | Yes (domestic) | Pending (group APIs?) | Pending | Official site → Business/Contact | Transaction Banking/Fintech · `[tbd]` | No | — | — | Confirm Angola-entity API | `[assign]` | Group fintech experience | GO (explore) |
| Banco BIC | Commercial bank | MED-HIGH | Not started | Yes (domestic) | Pending | Pending | Official site → Empresas/Contact | Corporate/SME · `[tbd]` | No | — | — | Assess API maturity | `[assign]` | SME alignment | HOLD |
| Millennium Atlântico | Commercial bank | MED-HIGH | Not started | Yes (domestic) | Pending | Pending | Official site → Contact; LinkedIn | Innovation/Digital · `[tbd]` | No | — | — | Assess API readiness | `[assign]` | Innovation posture | HOLD |
| BPC | State bank | MEDIUM | Not started | Yes (domestic) | Pending | Pending | Official site → Contact | Digital/Operations · `[tbd]` | No | — | — | Assess API/speed | `[assign]` | Wide footprint | HOLD |
| Access Bank Angola | Commercial bank | MEDIUM | Not started | Pending (Angola entity) | Pending | Pending | Official site → Contact; group | Partnerships/Digital · `[tbd]` | No | — | — | Confirm Angola-entity capability | `[assign]` | Group history | HOLD |

---

## 3. Payment / Funding / Withdrawal Providers

| Target | Type | Prio | Verif. status | Angola? | API+SB? | Reg.fit? | Contact source | Person / Dept | Email sent? | Date | Response | Next action | Owner | Notes | Decision |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Multicaixa Express / EMIS | Domestic rail | HIGH (long lead) | Not started | Yes (domestic) | Pending | Pending (BNA cert) | via EMIS / sponsor bank | Operator onboarding · `[tbd]` | No | — | — | Explore integration + cert | `[assign]` | = EMIS path | GO (explore) |
| Unitel Money (e-Kwanza) | Mobile money | HIGH | Not started | Yes (domestic) | Pending | Pending | Official site → Business/Contact | Mobile Money/BD · `[tbd]` | No | — | — | Confirm partner API + cash-in/out | `[assign]` | Telco reach | GO (explore) |
| Africell Angola (mobile money) | Mobile money | MEDIUM | Not started | Yes (domestic) | Pending | Pending | Official site → Business/Contact | Mobile Money/BD · `[tbd]` | No | — | — | Assess product maturity | `[assign]` | Emerging | HOLD |
| Local Angolan PSPs (Multicaixa-linked) | PSP/gateway | MEDIUM | Not started | Yes (domestic) | Pending | Pending | Official sites → Contact | Sales/Integrations · `[tbd]` | No | — | — | Identify + assess capability | `[assign]` | Local Multicaixa link | HOLD |
| Onafriq (ex-MFS Africa) | Pan-African hub | MEDIUM | Not started | Pending (key risk) | Pending (docs exist) | Pending | Official site → Partnerships | Partnerships/BD · `[tbd]` | No | — | — | **Verify Angola/AOA coverage first** | `[assign]` | Strong elsewhere | DEPRIORITIZE if no Angola |
| Cellulant | Pan-African payments | MEDIUM | Not started | Pending (key risk) | Pending | Pending | Official site → Contact | Partnerships/BD · `[tbd]` | No | — | — | **Verify Angola coverage first** | `[assign]` | Multi-country | DEPRIORITIZE if no Angola |
| DPO Group (Network Intl.) | Pan-African PSP | LOW-MED | Not started | Pending (key risk) | Pending | Pending | Official site → Contact | Sales/Partnerships · `[tbd]` | No | — | — | **Verify Angola/AOA support** | `[assign]` | Online acceptance | DEPRIORITIZE if no Angola |
| Flutterwave / Paystack | Pan-African PSP | LOW-MED | Not started | Pending (uncertain) | Yes (docs) | Pending | Official site → Sales/Contact | Sales/Partnerships · `[tbd]` | No | — | — | **Verify Angola/AOA coverage first** | `[assign]` | Strong APIs; Angola uncertain | DEPRIORITIZE if no Angola |

---

## Wave 1 Priority Order (start here)

1. **Identity:** Smile ID, Youverify → then Sumsub. *(Blocks 3 critical items; needed under every path.)*
2. **Bank rail (parallel):** BAI, BFA, Standard Bank Angola.
3. **Domestic rail (explore, long lead):** EMIS/Multicaixa, Unitel Money.
4. **Pan-African providers:** only after Angola/AOA coverage is **verified**.

**Cadence:** verify → contact → log in the same week; weekly review of decisions.
Aligns with dossier **Path C (Hybrid)**: identity vendor + one bank rail first;
EMIS later.

---

## Honesty Note

This tracker contains **no confirmed partnerships and no real contacts** — only
targets and placeholders. Every "Yes (domestic)" for Angolan banks/rails reflects
that the entity operates in Angola, **not** that capability/API/regulatory fit is
confirmed (those remain Pending). Fill cells only with verified facts as outreach
progresses.
