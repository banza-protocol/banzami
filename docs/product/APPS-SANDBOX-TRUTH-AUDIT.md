# Apps Sandbox Product-Truth Audit

> Make both apps communicate their real Sandbox capabilities: no fake errors, no
> fake availability, no ambiguous "—", no active CTA for unavailable features. No
> real-money capability is enabled by this work — it only makes current
> availability truthful.

**Scope of this pass (2026-09-26).** This first pass fixed the concrete, observed
money-truth defects on the **Business dashboard** (the withdrawals card and the
two ambiguous KPI dashes) and hardened the withdrawal deep-link. The remaining
screen-by-screen sweep of Consumer + Business is tracked as a follow-up (see the
matrix's "not yet audited" rows) — nothing outside the rows below was changed.

## Business

| Surface | OLD state | Real product state | NEW state | Change |
|---|---|---|---|---|
| Dashboard · Levantamentos (card) | ERROR — "Não foi possível carregar os levantamentos." + "Não foi possível confirmar agora se os levantamentos estão disponíveis." with an active **"Pedir levantamento"** CTA | UNAVAILABLE_SANDBOX — a withdrawal is cash-out over a real-money rail, unavailable in the Beta Sandbox | Neutral unavailable: "Os levantamentos ainda não estão disponíveis na Sandbox." + note "Ficam disponíveis com as operações com dinheiro real." + **disabled** CTA "Indisponível na Sandbox" | `WithdrawGate.unavailableSandbox`, driven by `AppConfig.withdrawalsEnabled=false`; the payouts probe is skipped (no needless call / false error) |
| Dashboard · quick action "Levantar" | Active tile → PayoutScreen | UNAVAILABLE_SANDBOX | Tile omitted while withdrawals are disabled (no dead action; the card explains why) | `_QuickActions(showPayout: AppConfig.withdrawalsEnabled)` |
| PayoutScreen (deep link / stale nav) | Full withdrawal form with an active submit | UNAVAILABLE_SANDBOX | Deterministic unavailable screen; no submit button | Guard at top of `build` when `!withdrawalsEnabled` |
| Dashboard · KPI "Ticket médio" | `—` when not computable (ambiguous) | NO_DATA when the Business has no completed payments | "Sem dados" in a muted style + SR label "Ticket médio — sem dados ainda" | KPI card `muted` NO_DATA state; real value still bold; a real 0 is still shown |
| Dashboard · KPI "Taxa de sucesso" | `—` when not computable | NO_DATA (no qualifying attempts) | "Sem dados" muted + SR label; a real `0%` is shown, never fabricated | same |

## Consumer

Not audited in this pass — no Consumer changes were made. A screen-by-screen
Consumer review (cash-in/cash-out, home actions, history/receipts, empty vs error
states) is the tracked follow-up.

## Principles applied

- **ERROR ≠ UNAVAILABLE_SANDBOX.** An intentionally-unavailable feature is a
  neutral/info state, never a red error, and does not log an application error.
- **No dash as a universal fallback.** A metric is a value, NO_DATA, or (where
  applicable) unavailable — each visibly distinct. Zero is only shown when the
  authoritative value is zero.
- **No dead CTA.** An unavailable action is disabled or omitted, never a button
  that navigates into a flow that cannot succeed.
- **Deterministic policy over network accidents.** Withdrawal availability comes
  from `AppConfig.withdrawalsEnabled`, not a probe that can fail and mislead.
- **Real-money stays disabled.** No cash-in / cash-out / settlement capability was
  enabled; `withdrawalsEnabled` defaults false and flips only via a build define
  when real-money operations ship.
