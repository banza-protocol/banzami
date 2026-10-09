# Sandbox Operational Limits — Classification and Regulatory Note

Version: 1.0
Status: internal note
Decision date: 2026-10-09 (owner)
Source of the values: `core/compliance/src/pilot.rs` (enforced by Core; generated
into the services that state them — `make gen-pilot-limits`)
Decision record: `docs/adr/ADR-048-pilot-limit-policy-overlay.md` (amendment of 2026-10-09)

## 1. What the limit is

In the Banzami Sandbox, **each payment may be up to Kz 50 000**. The same number
bounds, per operation:

| Operation | Maximum per operation | Enforced by |
|---|---|---|
| Payment sent by a consumer (P2P, QR, payment link, pay link) | Kz 50 000 | `CONSUMER_PER_PAYMENT_MINOR` |
| Payment received by a Business (including a donation through an integrator such as DOA) | Kz 50 000 | `MERCHANT_PER_RECEIVE_MINOR` (held equal to the above at compile time) |
| Top-up of a Sandbox wallet | Kz 50 000 | no limit of its own: bounded by the wallet balance cap, `CONSUMER_MAX_BALANCE_MINOR` |

## 2. Classification

**A voluntary Banzami Sandbox operational limit** — product and test policy for
an internal test environment that uses fictitious money.

It is **not**:

- a limit mandated by the Banco Nacional de Angola;
- "the limit of the BNA Regulatory Sandbox";
- a LIVE limit;
- a limit of any electronic-money account class.

Canonical public wording:

> Cada pagamento no Sandbox da Banzami pode ser de até 50 000 Kz. Este é um
> limite operacional do ambiente de testes da Banzami e não representa um limite
> regulamentar aplicável às operações com dinheiro real.

For an integrator's donation flow (DOA):

> Cada doação no Sandbox pode ser de até 50 000 Kz. A meta e o total acumulado
> da campanha podem ultrapassar esse valor.

## 3. What it does not limit

The limit applies to **each** payment or donation. It does not apply to a
campaign goal, to the cumulative amount a campaign raises, or to a Business's
total receipts. A campaign with a goal of Kz 100 000 000 is valid and may
accumulate many donations of up to Kz 50 000 each.

Other Sandbox limits exist and are separate from this one (see §6). They bound
balances and volumes, not the size of one payment.

## 4. Regulatory context (owner's clarification, 2026-10-09)

Recorded as stated by the owner; this repository does not hold the text of the
instrument, and nothing here is legal advice.

- The BNA Regulatory Sandbox is governed by **Aviso n.º 19/22** and the
  **Regulamento da Sandbox Regulatória**.
- That regime does not prescribe one universal per-transaction limit. Test
  transaction and customer limits for an actual Regulatory Sandbox participation
  are defined by the BNA together with the participant, according to the product
  or service and the test parameters.
- **The current Banzami Sandbox is not that regulatory environment.** It is an
  internal product and testing environment, and all value in it is fictitious.
- Therefore neither "BNA Sandbox limit = 25 000 Kz" nor "BNA Sandbox limit =
  50 000 Kz" is an accurate statement, and neither may appear in Banzami copy.

## 5. Where the earlier Kz 25 000 came from

What this repository documents: the V1.0 pilot limits, including Kz 25 000 per
payment, were taken from the internal test plan *Plano de Teste Detalhado
Banzami V1.0* (ADR-048, Context).

The owner's understanding is that the Kz 25 000 figure appears to have been
aligned with a regulatory per-transaction limit associated with an
electronic-money account profile, rather than being a universal Sandbox limit.
**This repository contains no source that confirms that alignment**; it is
recorded here as an unverified rationale, not as a fact.

## 6. Other Sandbox limits (unchanged by this decision)

| Limit | Value | Kind |
|---|---|---|
| Consumer: cumulative payments per day | Kz 50 000 | daily aggregate |
| Consumer: wallet balance | Kz 50 000 | balance cap |
| Business: wallet balance | Kz 100 000 | balance cap |
| Business: received volume, rolling 24 h / 30 d | Kz 250 000 / Kz 1 000 000 | rolling volume |
| All Businesses: received volume, rolling 24 h / 30 d | Kz 500 000 / Kz 4 000 000 | rolling volume |
| Synthetic funds in circulation | Kz 500 000 | aggregate stock |

These are operational test limits of the same classification as §2.

## 7. LIVE and future regulated operation

The Sandbox overlay is inert outside the Sandbox. Limits for LIVE, for regulated
account classes, or for participation in the BNA Regulatory Sandbox must come
from the applicable regulatory and account profile and the approved operating
conditions. They are not to be copied from, defaulted to, or derived from the
values in this note.
