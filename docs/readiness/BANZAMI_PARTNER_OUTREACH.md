# Banzami — Partner Outreach Package

**Version:** 1.0
**Date:** 2026-06-19
**Source:** [BANZAMI_LAUNCH_BLOCKERS_DOSSIER.md](BANZAMI_LAUNCH_BLOCKERS_DOSSIER.md) · [BANZAMI_PARTNER_INTEGRATION_PACK.md](BANZAMI_PARTNER_INTEGRATION_PACK.md)
**Contents:** (1) KYC/KYB email · (2) Partner-bank email · (3) Payment-provider email · (4) One-page brief · (5) Discovery-call agenda · (6) Technical questionnaire

> **Honesty rule for all outreach.** Banzami is **not production-ready** and has
> no provider integrated. State plainly: engineering is **internally
> code-complete for capabilities that do not require an external partner**;
> launch requires **external provider integration and regulatory clearance**.
> Never imply real funding, withdrawals, KYC/KYB, or EMIS/bank integration exists.
> Placeholders in **[brackets]** are filled per recipient before sending.

---

## 1. Email — KYC/KYB Vendors

**Subject:** Banzami — Angolan identity verification partner for a wallet-native payment network

Dear [Name / Team],

I'm [Sender], [role] at **Banzami**, the reference operator of the open BANZA
payment protocol, building a wallet- and QR-native instant payment network in
Kwanza, focused on Angola.

Our operator platform is **internally code-complete for every capability that does
not require an external partner** — ledger, wallets, instant money movement,
merchant tooling, developer platform, refunds, disputes and webhooks are built and
tested. We are **not yet in production**: launch is blocked by external provider
integration and regulatory clearance.

Identity verification is on our critical path. We are looking for an **Angolan
KYC/KYB partner** to cover:

- consumer identity (B.I. / Passport / Carta, OCR + manual review),
- merchant representative identity,
- business KYB (NIF / company registry) and sole-trader / beneficial-owner identity,
- tiered/progressive verification aligned with BNA expectations.

Our compliance flow is already implemented behind a provider interface
(`KYC_PROVIDER`), so integrating a real vendor is an adapter, not a rebuild. We
would integrate against your **sandbox** first and validate before any production
use.

Could we schedule a 30-minute discovery call? I can share a partner brief and a
technical integration pack in advance.

Best regards,
[Sender] · [title] · Banzami · [email] · [phone]

---

## 2. Email — Partner Banks

**Subject:** Banzami — banking rail partnership for instant Kwanza payments

Dear [Name / Team],

I'm [Sender], [role] at **Banzami**, the reference operator of the open BANZA
payment protocol. We are building Angola's wallet- and QR-native instant payment
network in Kwanza.

Our platform is **internally code-complete for capabilities that do not depend on
an external partner**, with a double-entry ledger and financial invariants tested
against a real database. We are **not in production**: launch requires at least
one approved banking/funding rail and the corresponding regulatory clearance.

We are **provider-agnostic** — EMIS/Multicaixa Express is one possible rail, and a
partner bank is an equally valid path. We are seeking a bank partner for one or
more of:

- **Money In (funding):** moving real AOA into a wallet (initiation + confirmation),
- **Money Out (withdrawal):** disbursing from a wallet to a bank account,
- **Settlement & reconciliation:** a statement feed we reconcile against our ledger.

Each capability sits behind an abstraction in our core, so a bank integration is an
adapter we build against your sandbox, validated against a strict go-live gate
before any real money moves.

Would your team be open to a 30-minute scoping call? I can send a one-page brief
and our technical integration pack beforehand.

Best regards,
[Sender] · [title] · Banzami · [email] · [phone]

---

## 3. Email — Payment / Funding / Withdrawal Providers

**Subject:** Banzami — funding & withdrawal rail integration (Kwanza, Angola)

Dear [Name / Team],

I'm [Sender], [role] at **Banzami**, the reference operator of the open BANZA
protocol, building a wallet- and QR-native instant payment network in Kwanza.

Our operator software is **internally code-complete for non-provider
capabilities** and tested with double-entry ledger invariants. We are **not yet
live**: launch requires integrating at least one real **funding** and one real
**withdrawal** provider, plus regulatory clearance.

We need a provider that can:

- **fund** a wallet with real AOA (initiation + signed, idempotent confirmation
  callback),
- **withdraw** from a wallet to a bank account / external rail (initiation + status),
- optionally provide a **settlement/reconciliation** feed.

We are provider-agnostic and integrate through a clean adapter (TLS, HMAC-signed
callbacks, idempotency, AOA minor units). We start in your **sandbox** and only go
to production after passing real-money smoke tests, invariant tests on the live
rail, and reconciliation.

Could we book a 30-minute discovery call? I'll share a partner brief and technical
pack in advance.

Best regards,
[Sender] · [title] · Banzami · [email] · [phone]

---

## 4. One-Page Partner Brief

**Banzami — at a glance**

- **What:** reference operator of the open **BANZA** protocol; wallet- and
  QR-native instant payment network in **Kwanza (AOA)**, focused on **Angola**.
- **Model:** consumers pay by QR or `@handle`; merchants accept instant wallet
  payments without terminals; apps integrate via official SDKs.
- **Protocol vs operator:** BANZA defines the rules; **Banzami is the operator**.
  Choosing rails/identity providers is an operator decision — where you fit.

**Engineering status (honest)**

- **Internally code-complete** for capabilities that need no external partner.
- **Launch-ready 56/66 · code-complete 58/66 · 0 internal engineering blockers.**
- **Not production-ready.** 10 items are externally blocked, awaiting partners and
  regulatory clearance.

**Already built & tested:** double-entry ledger + reconciliation, consumer/merchant
wallets, QR scan-to-pay, P2P + split payments, merchant suite, REST API + SDKs +
sandbox + webhooks, source-aware refunds, disputes lifecycle, signed webhook
delivery.

**What we need from a partner (one of each capability):** identity (KYC/KYB),
Money In (funding), Money Out (withdrawal), settlement/reconciliation.

**How we integrate:** each capability sits behind an abstraction; a partner is an
**adapter**, integrated against **sandbox first**, then promoted to production only
after a strict go-live gate (real-money smoke tests, live-rail invariant tests,
reconciliation, regulatory clearance).

**Provider-agnostic:** EMIS is one possible rail; partner banks and other licensed
providers are equally valid. **Launch needs one approved path per capability — not
all of them.**

**Contact:** [Sender] · [title] · [email] · [phone] · banzami.com

---

## 5. Discovery Call Agenda (30 minutes)

1. **Introductions (3 min)** — Banzami and partner teams.
2. **Banzami overview (5 min)** — positioning, honest engineering status, what is
   built vs externally blocked.
3. **Capability fit (7 min)** — which capability(ies) the partner covers (identity /
   funding / withdrawal / settlement) and how it maps to our adapters.
4. **Technical model (5 min)** — sandbox→production path, signed callbacks,
   idempotency, reconciliation, AOA minor units.
5. **Compliance & regulatory (5 min)** — BNA alignment, certification scope for the
   relevant activity, data protection.
6. **Next steps (5 min)** — NDA, sandbox credentials, technical questionnaire,
   timeline, owners.

**Pre-read sent in advance:** one-page brief + technical integration pack.
**Desired outcome:** agree to exchange the technical questionnaire and sandbox
access, with named owners and a follow-up date.

---

## 6. Technical Questionnaire for Providers

*To be completed by the partner. Scope the relevant sections to your capability.*

**A. Environments & access**
1. Do you provide isolated **sandbox** and **production** environments with
   separate credentials? Onboarding lead time?
2. Authentication model (API keys, OAuth, mTLS)? Credential rotation?

**B. Integration & reliability**
3. Are callbacks **HMAC-signed**? What signing scheme and headers?
4. Do you support **idempotency keys** on requests? Replay behavior?
5. Error taxonomy (codes, ret[ry]able vs terminal)?
6. SLA / uptime / support model and hours?

**C. Identity (KYC/KYB) — if applicable**
7. Supported Angolan documents and methods (OCR, liveness, NIF/registry lookups)?
8. Coverage for merchant representatives, sole traders, and beneficial owners?
9. Tiered/progressive verification levels? Turnaround time and manual-review fallback?
10. Result delivery: webhook and/or polling? Status values and reasons?

**D. Funding (Money In) — if applicable**
11. How is a wallet funded with real AOA (initiation + confirmation model, timing)?
12. Is the confirmation callback signed and idempotent? Unique `provider_event_id`?
13. Limits, fees, and currency/rounding policy (AOA minor units)?

**E. Withdrawal (Money Out) — if applicable**
14. Payout initiation to a bank account / rail: request and status model?
15. Bank-account validation, failure/return handling, settlement timing?
16. Limits and fees?

**F. Settlement & reconciliation — if applicable**
17. Statement/feed format, frequency, and fields (amount, reference, timestamp, currency)?
18. Dispute/adjustment handling and corrections?

**G. Compliance & regulatory**
19. Your regulatory standing with **BNA** for the relevant activity?
20. Certification / approval requirements you expect from Banzami as operator?
21. Data-protection and data-residency commitments?

---

## Honesty Statement

All outreach in this package presents Banzami truthfully: internally
code-complete for non-provider capabilities, **not production-ready**, with no
KYC/KYB vendor, bank, EMIS, or payment provider integrated. Production capability
becomes real only after a partner is selected, integrated against sandbox,
validated against the go-live gate, and cleared by the relevant regulator.
Simulated providers are development-only and must never be presented as production.
