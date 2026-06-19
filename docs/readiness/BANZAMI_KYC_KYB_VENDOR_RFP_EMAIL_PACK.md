# Banzami — KYC/KYB Vendor RFP Email Pack

**Version:** 1.0
**Date:** 2026-06-19
**Inputs:** [RFP_SCORECARD](BANZAMI_KYC_KYB_VENDOR_RFP_SCORECARD.md) · [WAVE1_OUTREACH_EMAILS](BANZAMI_WAVE1_OUTREACH_EMAILS.md) · [OUTREACH_TRACKER](BANZAMI_PARTNER_OUTREACH_TRACKER.md) · [PREP_STATUS](BANZAMI_KYC_KYB_PREP_STATUS.md)
**Purpose:** Send the KYC/KYB RFP questionnaire to the shortlisted vendors and score responses.

> **Honest framing for every email.** Banzami is **preparing a vendor selection
> process**; it is **internally prepared but not production-ready**, and launch
> depends on external provider integration and regulatory clearance. **No vendor is
> selected.** Do **not** claim Angola/AOA support for any vendor until they confirm
> it in writing. Fill every `[bracket]`; recipients and addresses are placeholders
> to confirm from official sources — none are invented here.

---

## 1. Cover Email Template (generic)

**To:** `[contact — confirm via official site: Sales / Partnerships]`
**Subject:** Banzami — KYC/KYB vendor RFP for an Angolan payment network

Dear `[Name / Team]`,

I'm `[Sender]`, `[role]` at **Banzami**, the reference operator of the open BANZA
payment protocol, building a wallet- and QR-native instant payment network in
Kwanza, focused on Angola.

We are running a **structured KYC/KYB vendor selection** and would like to include
you. To be transparent: our platform is **internally prepared but not yet in
production** — our compliance flow, progressive KYC levels, gating, audit trail,
and a provider-agnostic integration seam are built and tested, but **no identity
vendor is integrated**. Launch depends on selecting a vendor and obtaining the
relevant regulatory clearance.

The goal of this RFP is to **verify your coverage** for: **Angola / AOA**, Angolan
documents (B.I., Passport, Carta de Condução), OCR/liveness, consumer KYC, merchant
representative KYC, **KYB and beneficial-owner**, NIF / business-registry
verification, AML/sanctions/PEP, and your **API / sandbox / webhooks**.

Could you complete the short questionnaire below (or attached)? A 30-minute call to
walk through it would also work. I'll happily share a one-page brief in advance.

Best regards,
`[Sender] · [title] · Banzami · [email] · [phone]`

---

## 2. Vendor-Specific Short Variants

*(Use in place of the generic opening; the questionnaire stays the same.)*

### Smile ID
**Subject:** Banzami — KYC/KYB RFP: Angola document + KYB coverage
> Your Africa-native focus puts you at the top of our shortlist. We'd specifically
> like to confirm **Angolan B.I./Passport/Carta** coverage, document authenticity,
> and **KYB + beneficial-owner** support before we score vendors.

### Youverify
**Subject:** Banzami — KYC/KYB RFP: Angola KYC + business registry
> Your pan-African KYC/KYB and **business-registry** capability is a strong fit. We'd
> like to confirm **Angola NIF / company-registry** verification and beneficial-owner
> coverage.

### Sumsub
**Subject:** Banzami — KYC/KYB RFP: tiered KYC + KYB + AML
> We're interested in your **tiered KYC, KYB, and AML/PEP** depth. The key
> verification for us is **Angolan document coverage** and KYB/UBO support.

### Prembly / Dojah
**Subject:** Banzami — KYC/KYB RFP: developer-first identity for Angola
> Your developer-first African identity APIs map well to our provider-agnostic
> adapter. We'd like to confirm **Angola data sources**, document coverage, and
> sandbox/webhooks.

### Trulioo
**Subject:** Banzami — KYC/KYB RFP: business verification coverage
> We're evaluating **KYB / business-verification** breadth. The decisive question is
> **Angola business-registry coverage** and supporting identity documents.

### Veriff / Onfido
**Subject:** Banzami — KYC/KYB RFP: Angola document coverage check
> We're evaluating document/biometric vendors. Before scoring, we need to confirm
> **Angola / Lusophone document coverage** (B.I./Passport) and KYB scope — if Angola
> is not currently supported, please let us know so we can prioritise accordingly.

---

## 3. Questionnaire (paste into email or attach)

*Please answer each item. Mark "not supported" where applicable — honest gaps help
us score fairly. Scope sections to your capability.*

**A. Coverage & documents**
1. Do you operate in / cover **Angola** and **AOA**-related identity verification?
2. Do you verify the Angolan **Bilhete de Identidade (B.I.)**? (Y/N)
3. Do you verify **Passport**? (Y/N)
4. Do you verify the Angolan **Carta de Condução** (driver's licence)? (Y/N)
5. Document **authenticity / forgery** checks? Data sources?

**B. Verification methods**
6. **OCR** extraction? (Y/N)
7. **Selfie / liveness**? Method (active/passive)?
8. **Manual-review** fallback — process and turnaround?

**C. Scope**
9. **Consumer KYC**? (Y/N)
10. **Merchant representative KYC** (an individual acting for a business)? (Y/N)
11. **KYB** (business verification)? (Y/N)
12. **Beneficial-owner (UBO)** identification? (Y/N)
13. **NIF / business-registry** verification or integration path for Angola? (Y/N — describe)
14. Tiered / **progressive** verification levels? (Y/N)

**D. Risk screening**
15. **AML**, **sanctions**, and **PEP** screening? Sources and refresh cadence?

**E. Integration**
16. **REST API** + documentation? Authentication model?
17. **Sandbox** environment isolated from production? (Y/N)
18. **Webhooks / callbacks** — signed (HMAC)? Idempotency support? (Y/N)
19. Result model: statuses (APPROVED / REJECTED / PENDING) + reasons / error codes?

**F. Operations & compliance**
20. **Audit logs** and exportable evidence? (Y/N)
21. **Data retention / privacy** policy and **data residency** (where is data stored)?
22. **Production SLA**, uptime, and support hours?
23. **Pricing model** (per-check / tiered / minimums)?
24. Typical **implementation timeline** to sandbox and to production?
25. Your **regulatory standing** and any expectations regarding **BNA**?

---

## 4. Response Scoring Instructions

Score each response with the existing weighted scorecard in
[BANZAMI_KYC_KYB_VENDOR_RFP_SCORECARD.md](BANZAMI_KYC_KYB_VENDOR_RFP_SCORECARD.md) §4
(criteria 0–5, weighted to 100):

- **Angola document coverage 20%** (Q1–5) · **API/sandbox/webhook 15%** (Q16–19) ·
  **KYB + UBO 15%** (Q11–13) · **AML/PEP 10%** (Q15) · **Regulatory fit 15%** (Q20, 25) ·
  **Integration effort 10%** (Q16, 24) · **Pricing 10%** (Q23) · **Support/SLA 5%** (Q22).
- Apply the **Go / Hold / Reject gate** (§5): **REJECT** on no Angola coverage (Q1),
  no API/sandbox (Q16–17), no production identity verification, no compliance
  evidence, or no KYB/UBO path where required. **GO** at ≥70/100 with Angola
  verified. **HOLD** at 50–69 or while any answer is "verify pending".
- Record each vendor's filled answers and score in the **decision matrix** (§7 of the
  scorecard).

## 5. Tracker Update Instructions

Update [BANZAMI_PARTNER_OUTREACH_TRACKER.md](BANZAMI_PARTNER_OUTREACH_TRACKER.md)
(Table 1 — KYC/KYB) for each vendor:

- **On send:** set `Email sent? = Yes`, `Date = YYYY-MM-DD`, `Verif. status = In progress`, `Owner = [name]`, `Next action = await response`.
- **On response:** fill `Angola? / API+SB? / Reg.fit?` with `Yes`/`No` (cite source); set `Response = Replied`; add the score in **Notes**.
- **On decision:** set `Decision = GO / HOLD / DEPRIORITIZE` per the gate; set `Verif. status = Confirmed` (or `Failed`); record `Next action` (demo, deprioritise, etc.).
- Keep cells `Pending` until verified — never mark Angola/API as confirmed without the vendor's written answer.

---

## Honesty Statement

This pack is outreach for a **selection process** — no vendor is selected, in
discussion as a partner, or integrated. No Angola/AOA coverage or capability is
asserted; each is gated on the vendor's own confirmation. Banzami is internally
prepared but **not production-ready**, and the simulated provider is
development-only.
