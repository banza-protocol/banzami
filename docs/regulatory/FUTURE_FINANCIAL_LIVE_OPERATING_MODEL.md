# Future Financial Live operating model

Version: 1.0

**Internal. Not legal advice. Not a declaration of regulatory status.**

Banzami holds no authorisation from the Banco Nacional de Angola, no EMIS
certification, and no licence of any category. Financial Live is **NOT READY /
FAIL-CLOSED** and remains unavailable until the applicable regulatory, contractual
and operational requirements are met. Nothing in this document changes that, and
nothing in it may be quoted publicly as a status.

This document keeps three things apart so that none is mistaken for another:
what Banzami intends to be, how the technology is built, and the questions only a
regulator or legal counsel can answer.

## 1. Product intent

Banzami intends to become capable of operating as a regulated payment service
platform appropriate to a wallet-native model (ADR-061): real wallet balances,
P2P, merchant payments, cash-in, cash-out, real settlements and interoperability
with external rails — **subject to applicable authorisation**.

**Target regulatory operating model:** a payment service provider / non-bank
payment service provider, **subject to formal confirmation with the BNA**. The
exact legal category is a regulatory question, not an engineering decision.

A pure payment-gateway / PST-SP model in which Banzami never represents
participant value would materially change the product strategy (wallet, internal
network, P2P, merchant payments, programmable financial infrastructure). Such a
change requires explicit founder approval; this document does not assume it.

## 2. Technical model (what exists, in the Sandbox, with fictitious value)

| Concern | How the platform is built | Where |
|---|---|---|
| Participant value | Wallets and wallet accounts whose balance is derived from double-entry postings; no balance column | ADR-061 §3, `core/ledger` |
| Financial writer | Banzami Core only: PostgreSQL privilege on every financial-state table is granted to Core's role alone, with a connection-name guard as detection | `db/authority/`, migration 0144 |
| Internal movement | P2P, wallet payments, refunds, application settlements: balanced postings, no external rail | ADR-061 §4 |
| Cash-in | Funding sessions credited only after provider confirmation (SETTLED) | `core/consumer-wallets/src/funding.rs` |
| Cash-out | Payouts: PENDING → PROCESSING (obligation reserved in flight) → SENT (rail) → CONFIRMED only on the rail's confirmation, when the backing asset decreases; FAILED from SENT and RETURNED only on the provider's evidence | `core/payouts`, ADR-063 |
| External acquiring | Hosted acquiring payments through a provider adapter; confirmation via signed, idempotent callbacks | `core/acquiring` |
| Reconciliation | Boundary operations (cash-in, cash-out, acquirer settlement) compared with external evidence by reference; idempotent report; never edits the ledger; corrections are new postings | `core/reconciliation`, ADR-063, ANEXO G |
| Obligations and backing | Every balance is a LIABILITY; backing and transit are ASSET accounts with an explicit role; a read-only position reports obligations, backing, coverage and integrity findings | ADR-063, [MONEY_MODEL.md](../architecture/MONEY_MODEL.md) |
| Environment separation | Sandbox keys `bz_test_`; `bz_live_` refused; no Sandbox wallet becomes a Live account; no Sandbox receipt proves Live settlement | ADR-046, ADR-060 |
| Pilot limits | Funds-in-circulation cap and per-participant limits | ADR-048 |

The architecture is designed so that, later, the total of eligible customer
liabilities recorded in the ledger can be reconciled against corresponding
safeguarded or backing assets held outside the network — without assuming what
form those assets, accounts or institutions must take.

## 3. Rail decoupling is not regulatory bypass

That Banzami can move value between participants without an external rail for
every movement is never an argument that regulation is unnecessary. The opposite
holds: the more economically meaningful value is represented inside Banzami, the
more important its safeguarding, redemption, reconciliation and supervision
become. Internal movement changes where a transaction executes; it does not
change who must be authorised, what must be safeguarded, or what must be reported.

## 4. Questions that require regulatory confirmation

None of these is answered here. Each is marked **REQUIRES REGULATORY
CONFIRMATION** until an authoritative answer is recorded with its source.

| # | Question | Status |
|---|---|---|
| 1 | What is the legal nature of a Banzami wallet balance (a payment-account balance, electronic money, a deposit-like claim, something else)? | REQUIRES REGULATORY CONFIRMATION |
| 2 | Do electronic money rules apply to wallet balances, and under which regime? | REQUIRES REGULATORY CONFIRMATION |
| 3 | Which payment-service category, or combination, does the wallet-native model require? | REQUIRES REGULATORY CONFIRMATION |
| 4 | What safeguarding is required for customer funds (segregated accounts, custodian institution, insurance, investment restrictions)? | REQUIRES REGULATORY CONFIRMATION |
| 5 | What redemption obligations apply (at par, timing, fees, dormant balances)? | REQUIRES REGULATORY CONFIRMATION |
| 6 | What requirements apply to cash-in and cash-out, including agent networks and partner banks? | REQUIRES REGULATORY CONFIRMATION |
| 7 | Is consumer-to-consumer P2P within the same authorisation, or does it need its own? | REQUIRES REGULATORY CONFIRMATION |
| 8 | Do merchant payments make Banzami an acquirer, a payment facilitator, or neither, and what follows? | REQUIRES REGULATORY CONFIRMATION |
| 9 | What settlement requirements apply to settling Businesses and applications (timing, finality, accounts)? | REQUIRES REGULATORY CONFIRMATION |
| 10 | What interoperability obligations apply (with EMIS, other providers, the national payment system)? | REQUIRES REGULATORY CONFIRMATION |
| 11 | What EMIS certification or participation is required, and for which flows? | REQUIRES REGULATORY CONFIRMATION |
| 12 | What minimum and ongoing capital requirements apply? | REQUIRES REGULATORY CONFIRMATION |
| 13 | What KYC/KYB and AML/CFT tiers and limits apply to wallets, merchants and applications? | REQUIRES REGULATORY CONFIRMATION |
| 14 | What reporting, audit and supervisory access is required (including for the ledger and reconciliation)? | REQUIRES REGULATORY CONFIRMATION |
| 15 | Which outsourcing and data-location rules apply to the infrastructure? | REQUIRES REGULATORY CONFIRMATION |

### 4.1 Safeguarding and backing (MONEY-MODEL-001)

The architecture can represent customer obligations separately from external
backing positions, Banzami's own revenue and costs, and reconcile them
([ADR-063](../adr/ADR-063-customer-liabilities-backing-assets-and-reconciliation.md)).
It holds, as **architectural safety invariants**, that backing plus transit covers
obligations, that no value is credited before external confirmation, that a
submitted withdrawal is restored only on the rail's evidence, and that
reconciliation never edits history. Which of these the law requires, and in what
form, is unknown:

| # | Question | Status |
|---|---|---|
| 16 | What is the legal nature of Banzami stored value, and of the obligation it represents? | REQUIRES REGULATORY CONFIRMATION |
| 17 | Must customer funds be safeguarded in segregated accounts, and segregated from what (operating funds, fees, other operators)? | REQUIRES REGULATORY CONFIRMATION |
| 18 | Which institutions may hold backing funds, and may they be spread across several banks or providers? | REQUIRES REGULATORY CONFIRMATION |
| 19 | What reconciliation frequency is required (intraday, daily), and against which evidence? | REQUIRES REGULATORY CONFIRMATION |
| 20 | Is 1:1 coverage required at all times, or at defined points, and how is value in transit at an acquirer treated? | REQUIRES REGULATORY CONFIRMATION |
| 21 | What capital buffer applies in addition to safeguarded funds? | REQUIRES REGULATORY CONFIRMATION |
| 22 | How are pending withdrawals treated — still customer funds until the rail confirms? | REQUIRES REGULATORY CONFIRMATION |
| 23 | How must fees be separated from safeguarded customer funds, and when may they be withdrawn? | REQUIRES REGULATORY CONFIRMATION |
| 24 | What happens to customer funds on Banzami's insolvency? | REQUIRES REGULATORY CONFIRMATION |
| 25 | What reporting of obligations, backing and reconciliation differences does the BNA require? | REQUIRES REGULATORY CONFIRMATION |
| 26 | What audit evidence (external auditor, safeguarding attestation) is required, and how often? | REQUIRES REGULATORY CONFIRMATION |

None of these answers is encoded in code. Where the architecture already chooses the
stricter model (coverage, evidence before restoration), that choice is engineering
prudence, not a statement of what the law requires.

## 5. What this document must never become

- A basis for any public statement that Banzami is a PSP, an electronic money
  institution, a PST-SP, authorised by the BNA, or certified by EMIS.
- A substitute for legal advice.
- A reason to enable Financial Live, issue live credentials, or simulate
  authorisation, bank partnership, safeguarding or settlement.

Related: [ADR-061](../adr/ADR-061-wallet-native-rail-decoupled-financial-network.md) ·
[Wallet-native terminology](../architecture/WALLET_NATIVE_TERMINOLOGY.md) ·
[Live activation gate](../operations/LIVE_ACTIVATION_GATE.md) ·
[BNA Phase 1 annexes](../bna/phase1-annexes/)
