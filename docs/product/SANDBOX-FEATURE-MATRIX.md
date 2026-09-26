# Sandbox Feature Matrix

Canonical statuses: `AVAILABLE` · `AVAILABLE_TEST_ONLY` · `UNAVAILABLE_SANDBOX` ·
`NO_DATA` · `LOADING` · `ERROR` · `UNKNOWN`. A UI must present each distinctly — an
intentionally-unavailable feature is never an ERROR or a bare `—`.

> This matrix records what has been **audited and verified** in code/tests. Rows
> marked *not yet audited* are pending the follow-up pass and are NOT assertions of
> their real state. Anti-fabrication: we do not claim a status we have not checked.

## Business — audited (2026-09-26)

| Screen | Feature | Sandbox status | Backend support | External dependency | Public copy | CTA behavior |
|---|---|---|---|---|---|---|
| Dashboard | Cobrar (create charge) | AVAILABLE_TEST_ONLY | yes | none | — | active |
| Dashboard | QR | AVAILABLE_TEST_ONLY | yes | none | — | active |
| Dashboard | Levantar / Levantamentos (withdrawal) | **UNAVAILABLE_SANDBOX** | payouts exist but require a real-money rail | real-money cash-out rail (absent) | "Os levantamentos ainda não estão disponíveis na Sandbox." | disabled ("Indisponível na Sandbox"); quick action omitted |
| Dashboard | Ticket médio (KPI) | AVAILABLE (value) / **NO_DATA** | yes (derived from completed payments) | none | value, or "Sem dados" | n/a |
| Dashboard | Taxa de sucesso (KPI) | AVAILABLE (value) / **NO_DATA** | yes | none | value (incl. real 0%), or "Sem dados" | n/a |
| Dashboard | Volume hoje/mês, contagens (KPIs) | AVAILABLE | yes | none | value (real 0 allowed) | n/a |

## Business — not yet audited

Charges list/history, receipts, campaign accounts, revenue chart empty/error
states, settlement, notifications, settings/profile — pending the follow-up pass.

## Consumer — not yet audited

Home/balance, send, receive, QR, @banza, history, receipts, add money (cash-in),
withdraw/cash-out, cards/bank/Multicaixa UI, settings, notifications — pending the
follow-up pass. (Consumer was not changed in this pass.)

## Policy authority

Withdrawal availability is a deterministic build-time policy:
`AppConfig.withdrawalsEnabled` (default **false**; `--dart-define=WITHDRAWALS_ENABLED=true`
when real-money operations ship). The UI reads product availability from this
authority, not from a network probe.
