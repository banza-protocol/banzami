# Sandbox Operational Limits — Classification and Regulatory Note

Version: 1.0
Status: internal note
Decision date: 2026-10-09 (owner)
Source of the values: `core/compliance/src/pilot.rs` (enforced by Core; generated
into the services that state them — `make gen-pilot-limits`)
Decision record: `docs/adr/ADR-048-pilot-limit-policy-overlay.md` (amendment of 2026-10-09)

## 1. The policy

Internal Banzami Sandbox — owner decision of 2026-10-09.

| Parameter | Value | Enforced by |
|---|---|---|
| Pagamento máximo por operação | Kz 50 000 | `CONSUMER_PER_PAYMENT_MINOR` = `MERCHANT_PER_RECEIVE_MINOR` |
| Carregamento máximo por operação | Kz 50 000 | `TOP_UP_PER_OPERATION_MINOR` |
| Pagamentos Consumer por dia | Kz 250 000 | `CONSUMER_DAILY_MINOR` |
| Saldo máximo Consumer | Sem limite máximo definido pela política interna do Sandbox | `CONSUMER_MAX_BALANCE_MINOR = None` |
| Recebimentos Business em 24 h | Kz 1 000 000 | `MERCHANT_ROLLING_24H_MINOR` |
| Recebimentos Business em 30 dias | Kz 30 000 000 | `MERCHANT_ROLLING_30D_MINOR` |
| Recebimentos de todos os Business em 24 h / 30 dias | Kz 2 000 000 / Kz 60 000 000 | `GLOBAL_ROLLING_24H_MINOR` / `GLOBAL_ROLLING_30D_MINOR` |
| Saldo máximo Business | Sem limite máximo definido pela política interna do Sandbox | `MERCHANT_MAX_BALANCE_MINOR = None` |
| Limite global de segurança para fundos sintéticos em circulação no Sandbox interno da Banzami | Kz 250 000 000 | `AGGREGATE_FUNDS_MINOR` |
| Meta e total acumulado de uma campanha | not constrained by these operational limits | — |

Wallet balance ≠ payment limit ≠ daily or 24 h volume ≠ lifetime receipts ≠
campaign goal. Transactional controls are enforced independently of what a
wallet holds: a wallet may hold more than any of them, and may never spend more
than its actual available balance.

> No Sandbox interno da Banzami não é aplicado um limite máximo de saldo da
> carteira. Os limites operacionais são aplicados às transações e aos volumes
> definidos para o ambiente de testes.
>
> Esta política é interna ao ambiente Sandbox da Banzami e não representa uma
> afirmação sobre os limites regulamentares aplicáveis a operações com dinheiro
> real.

The synthetic-funds ceiling is a voluntary internal Sandbox safety control —
a fuse against accidental unlimited minting, runaway fixtures, bugs and abuse of
test top-ups. It does not represent a regulatory or LIVE monetary limit, and it
is not a wallet balance limit, a campaign goal limit or a campaign lifetime
limit.

### 1.1 Wallet balance cap versus synthetic supply cap

| | Value | What it limits |
|---|---|---|
| Wallet balance cap (Consumer, Business) | **none** | nothing: a wallet may hold any amount it legitimately received |
| Synthetic supply cap | **Kz 250 000 000, globally** | the total fictitious value issued into the environment and not yet destroyed |

> O Sandbox interno não aplica um teto de saldo por carteira. Existe, contudo,
> um fusível global de 250 000 000 Kz sobre a quantidade total de fundos
> sintéticos emitidos/em circulação no ambiente, destinado exclusivamente à
> segurança operacional do Sandbox.

The synthetic supply cap is **not a wallet limit**. It is Banzami internal
Sandbox policy, it concerns fictitious money only, it is not a BNA regulatory
limit and it is not a LIVE limit.

**How "in circulation" is measured.** At the system boundary, not by adding up
wallets: the net debit position of the `EXTERNAL_TRANSIT` and `EXTERNAL_BACKING`
ledger accounts (ADR-063) — value issued minus value destroyed
(`pilot_enforce::synthetic_supply_minor`). By double entry this equals what
Banzami owes Consumers and Businesses (available, reserved, wallet accounts,
withdrawals in flight) plus the fees it has earned, less what acquirers kept.

| Operation | Effect on the synthetic supply | Subject to the fuse |
|---|---|---|
| Test-payer top-up, Consumer test credit, registration grant | issues value | **yes** |
| Console Business top-up, operator manual credit | issues value | **yes** |
| Simulated external-rail (acquiring) confirmation | issues value | **yes** |
| Authorisation of a legacy acquiring transaction (Core internal route; no deployed service calls it) | issues value | **yes** |
| Payment, P2P transfer, donation, payment link, QR | none: both legs are inside the system | no |
| Refund, dispute resolution | none: returns existing value | no |
| Reservation, settlement between accounts, fee | none | no |
| Retirement of synthetic value, executed withdrawal | lowers it | no |

An internal movement cannot change the measure, so nothing is counted twice. A
payment, a transfer or a refund while the supply stands at exactly
Kz 250 000 000 is permitted, subject to its own transaction limits.

**Where it is enforced.** `pilot_enforce::check_synthetic_issuance`, called by
every route that issues value, inside the transaction that posts it and under
one transaction-scoped lock. Two concurrent issuances that together would cross
the cap cannot both post: the second measures only after the first has
committed. There is no exemption by caller — a test payer, a Console top-up and
an operator credit pass through the same check. With the supply at
Kz 249 980 000, an issuance of Kz 50 000 is refused
(`PILOT_LIMIT_AGGREGATE_FUNDS_EXCEEDED`) and nothing is written.

**No fixture exemption exists.** No route, flag or caller identity bypasses the
fuse in the deployed Sandbox. Where the overlay is disabled (it is never
enabled on LIVE/production) no Sandbox limit applies at all; LIVE has no
synthetic issuance route to begin with — each is refused outside the Sandbox.

## 2. Classification

**Voluntary Banzami Sandbox operational limits** — product and test policy for
an internal test environment that uses fictitious money. This applies to every
value in §1.

They are **not**:

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

## 3. What the limits do not limit

The per-operation and per-period limits apply to **each** payment or donation
and to the volume **within a window**. They do not apply to a campaign goal, to
the cumulative amount a campaign raises, to a Business's lifetime receipts, or
to a wallet balance. A campaign with a goal of Kz 100 000 000 is valid and may
accumulate many donations of up to Kz 50 000 each, across many payers and days.
Settlement is its own financial flow and is not needed to free wallet capacity.

Canonical public wording:

> Um Consumer pode realizar até 250 000 Kz em pagamentos dentro do período
> diário aplicável. Um Business pode receber até 1 000 000 Kz no período de 24
> horas aplicável. O Sandbox interno não aplica um limite máximo de saldo às
> carteiras Consumer ou Business. Os limites por operação e por período não
> constituem um limite para a meta ou para o total histórico acumulado de uma
> campanha. Estes valores são parâmetros operacionais de teste definidos pela
> Banzami e não representam limites regulamentares aplicáveis às operações com
> dinheiro real.

Nothing here says what a regulator allows. In particular this note does not
claim that balances are unlimited under any regulation, or that no regulatory
balance limit exists: that would have to be established separately and
authoritatively for the applicable future product and profile.

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

## 6. Developer test-payer quotas (per Project, ADR-060)

Separate from §1 and enforced by the consumer API: up to 10 active test payers,
a Kz 10 000 initial grant, up to Kz 50 000 per top-up, 20 top-ups and Kz 100 000
of top-ups per Project per 24 hours. No balance cap per payer.

## 7. LIVE and future regulated operation

The Sandbox overlay is inert outside the Sandbox. Limits for LIVE, for regulated
account classes, or for participation in the BNA Regulatory Sandbox must come
from the applicable regulatory and account profile and the approved operating
conditions. They are not to be copied from, defaulted to, or derived from the
values in this note. The policy engine keeps the ability to enforce a wallet
balance ceiling (an optional value, absent in the internal Sandbox); "no cap" is
a property of this environment's policy, not of the architecture.

## 8. Follow-up

Expose the current operational limits through the API and SDK
(`payment_max_per_operation`, `consumer_daily_payment_limit`,
`business_received_24h_limit`, `consumer_wallet_max_balance = null`,
`business_wallet_max_balance = null`) so integrators such as DOA can validate
early without duplicating constants.
