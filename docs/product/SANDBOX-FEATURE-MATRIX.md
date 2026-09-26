# Sandbox Feature Matrix

Canonical statuses: `AVAILABLE` · `AVAILABLE_TEST_ONLY` · `UNAVAILABLE_SANDBOX` ·
`NO_DATA` · `LOADING` · `ERROR` · `UNKNOWN`. A UI must present each distinctly — an
intentionally-unavailable feature is never an ERROR or a bare `—`; a real failure
is never dressed as a reassuring empty state; a zero is shown only when the
authoritative value is genuinely zero.

> **Audit status: COMPLETE (2026-09-26).** Every current user-facing surface of
> the Consumer and Business apps has been reviewed in source (see
> [APPS-SANDBOX-TRUTH-AUDIT.md](APPS-SANDBOX-TRUTH-AUDIT.md)). No row remains
> `NOT_YET_AUDITED`. Real-money operations stay **disabled**; this pass only made
> current availability truthful.

Definitions: **AVAILABLE** works now · **AVAILABLE_TEST_ONLY** works with
fictitious/test money in the Sandbox · **UNAVAILABLE_SANDBOX** intentionally off in
the Sandbox · **NO_DATA** works but no qualifying records · **LOADING** resolving ·
**ERROR** should work but a real failure occurred · **UNKNOWN** truly
indeterminate.

---

## Consumer — audited (2026-09-26)

| Screen | Feature | Status | External dep | States (copy) |
|---|---|---|---|---|
| Home | Saldo (balance) | AVAILABLE | none | value · real `0,00 Kz` · LOADING shimmer · ERROR `— Kz` + failure subtitle |
| Home | Enviar / Receber / QR / @banza quick actions | AVAILABLE_TEST_ONLY | none | active |
| Home | Adicionar dinheiro de teste (cash-in) | AVAILABLE_TEST_ONLY | none | "Adicionar dinheiro de teste" / "Crédito instantâneo sandbox" (labelled test money) |
| Home | Actividade recente | AVAILABLE / NO_DATA | none | rows · empty "Nenhuma transacção ainda" · "Ver tudo" opens Histórico (wired) |
| Home | Notification bell | AVAILABLE | none | shown only when wired; hidden (not inert) when no handler |
| History | Movimentos list | AVAILABLE / NO_DATA / ERROR | none | rows · empty per filter · ERROR "Algo correu mal" + retry · failed page waits for tap |
| History | Comprovativo (receipt) | AVAILABLE / LOADING / ERROR | none | row tappable only when it has a transfer; "A obter…" · "Indisponível — toque para tentar" |
| Receber (hub) | QR de recebimento + received list | AVAILABLE_TEST_ONLY | none | "QR de teste · Sem valor financeiro real"; link-create ERROR "Não foi possível criar o link." |
| Send / Scan / QR pay / Confirm | Pay flows | AVAILABLE_TEST_ONLY | none | handle validation, env-mismatch, 404-vs-outage, unknown-outcome re-send same key |
| Payment received | Settlement confirmation | AVAILABLE_TEST_ONLY | none | "O valor já entrou na sua carteira." (only after settlement) |
| Receipt | Comprovativo detail | AVAILABLE / LOADING / ERROR | none | "SANDBOX • Dinheiro de teste" badge; distinct loading vs retriable error |
| Perfil | Profile / logout / remove | AVAILABLE | none | KYC row hidden in Sandbox (requiresIdentityVerification) |
| Notificações | Preferences | AVAILABLE | none | "Multicaixa Express" toggle hidden in Sandbox; other toggles local-only (see follow-up) |
| Ajuda / Segurança | Support / security | AVAILABLE | none | honest "… em breve" for not-yet-shipped items |
| KYC | Identity verification | UNAVAILABLE_SANDBOX (Live-only) | KYC provider | entry hidden in Sandbox; flow preserved for Live |

**Consumer cash-in** = `AVAILABLE_TEST_ONLY` (Sandbox test grant only; server labels
funding rows "Carregamento de teste"). No real Multicaixa/bank/card cash-in exists;
onboarding + notification copy no longer imply one.
**Consumer cash-out** = none — there is no consumer withdrawal/bank-out surface
(consumers spend via P2P/QR). Nothing to misrepresent.

## Business — audited (2026-09-26)

| Screen | Feature | Status | External dep | States (copy) |
|---|---|---|---|---|
| Dashboard | Saldo | AVAILABLE | none | value · real `0 Kz` · LOADING spinner · ERROR `— Kz` + message |
| Dashboard | Fundos retidos / Reservado | AVAILABLE | none | chip shown only when > 0 |
| Dashboard | Volume hoje/mês, contagens | AVAILABLE | none | value incl. real `0` |
| Dashboard | Ticket médio · Taxa de sucesso | AVAILABLE / NO_DATA | none | value (incl. real `0%`) or muted "Sem dados" |
| Dashboard | Volume chart | AVAILABLE / NO_DATA | none | bars or "Sem movimento nos últimos 7 dias" |
| Dashboard | Levantar / Levantamentos | **UNAVAILABLE_SANDBOX** | real-money cash-out rail | "Os levantamentos ainda não estão disponíveis na Sandbox." + disabled CTA; quick action omitted; payouts probe skipped |
| Dashboard | Cobrar / QR quick actions | AVAILABLE_TEST_ONLY | none | active |
| History · Transacções | list | AVAILABLE / NO_DATA / ERROR | none | rows · "Nenhuma transacção ainda" · ERROR+retry · failed page waits for tap |
| History · Cobranças | list | AVAILABLE / NO_DATA / ERROR | none | "Nenhuma cobrança ainda"; failed page now waits for tap (fixed) |
| History · Recebidos | list | AVAILABLE / NO_DATA / ERROR | none | "Sem pagamentos recebidos"; initial error now an ERROR+retry (fixed); failed page waits for tap (fixed) |
| Charge | Create charge / fixed-amount collection | AVAILABLE_TEST_ONLY | none | real errors via `banzamiErrorMessage`; split gated on `splitChargeEnabled` |
| QR | Static receive QR | AVAILABLE_TEST_ONLY / UNAVAILABLE / ERROR | none | not-provisioned "Crie uma cobrança"; real error shows the actual message |
| Campaign accounts | Segregated held funds | AVAILABLE / NO_DATA / ERROR | none | empty "Ainda não há fundos retidos." vs error (distinct icon+copy) |
| Split track | Collection tracking | AVAILABLE_TEST_ONLY / ERROR | none | "A aguardar pagamento"; ERROR+retry |
| Project link | Developer consent code | AVAILABLE | none | valid code / "Código expirado"; no placeholder codes |
| KYB | Business verification | AVAILABLE | R2 object storage | status mapping; withdrawal-availability copy gated on `withdrawalsEnabled` |
| Payout | Withdrawal form | **UNAVAILABLE_SANDBOX** | real-money cash-out rail | deep-link guard → neutral unavailable, no submit |
| Perfil | Profile | AVAILABLE | none | "Pedir levantamento" shortcut gated out of Sandbox (fixed) |
| Welcome / Login | Onboarding | AVAILABLE | none | "Criar conta Business" → real candidatura; honest login errors |

**Business cash-in** = `AVAILABLE_TEST_ONLY` — merchants receive via charges / QR /
payment links with fictitious money. There is no merchant balance top-up surface.
**Business cash-out / settlement** = `UNAVAILABLE_SANDBOX` — payouts/withdrawals need
a real-money rail; **all** entry points are gated on `AppConfig.withdrawalsEnabled`
(dashboard card + quick action, profile shortcut, payout screen self-guard). No copy
anywhere claims withdrawal/settlement availability that contradicts the flag.

---

## External dependencies (derived from source)

| Feature | App | Dependency | Sandbox availability | UI state | Network call required |
|---|---|---|---|---|---|
| Withdrawal / payout | Business | real-money cash-out rail | UNAVAILABLE_SANDBOX | neutral unavailable, disabled/omitted CTA | **No** (probe skipped when disabled) |
| Settlement | Business | settlement rail | UNAVAILABLE_SANDBOX | not surfaced | No |
| Multicaixa Express cash-in | Consumer | Multicaixa / EMIS rail | not in Sandbox (test grant only) | not offered (onboarding bullet + notification toggle hidden) | N/A |
| KYB document upload | Business | R2 object storage (`banzami-kyb-sandbox`) | AVAILABLE | real upload flow + real errors | Yes |
| Consumer test funding | Consumer | Core admin-test-credit | AVAILABLE_TEST_ONLY | "Adicionar dinheiro de teste" | Yes |

---

## Metric contract — Business dashboard KPIs

| Metric | Source | Type | Available when | NO_DATA when | Zero meaning | Error | Loading | Format |
|---|---|---|---|---|---|---|---|---|
| Volume hoje | sum of today's captured payments | money (minor) | always after load | n/a (0 is real) | genuinely no volume today | dashboard error card | full-screen spinner | `formatMinor` (e.g. `0 Kz`) |
| Pagamentos hoje | count of today's payments | int | always after load | n/a | genuinely zero today | dashboard error card | spinner | integer |
| Volume do mês / Pagamentos do mês | month aggregates | money / int | always after load | n/a | genuine zero | dashboard error card | spinner | `formatMinor` / int |
| Ticket médio | monthVolume ÷ monthCount | money (minor), nullable | monthCount > 0 | monthCount == 0 → `null` | never fabricated | inherits dashboard error | spinner | value or muted "Sem dados" |
| Taxa de sucesso | terminal-success ÷ terminal-attempts | percent, nullable | ≥1 terminal attempt | no terminal attempts → `null` | real `0%` shown when all failed | inherits dashboard error | spinner | `NN%` or muted "Sem dados" |

`avgTicketMinor`/`successRate` are `null` (not `0`) when there is no qualifying data
(`merchant_dashboard_stats.dart`), which drives the muted "Sem dados" tile with a
screen-reader label — never a dash, never a fabricated `0`/`0%`.

---

## Policy authority

Real-money availability is a deterministic build-time policy, read from one authority
per app — no scattered `if (sandbox)` probes:

- **Business withdrawals:** `AppConfig.withdrawalsEnabled` (merchant `config.dart`,
  default **false**; `--dart-define=WITHDRAWALS_ENABLED=true` when real-money ships).
  Governs the dashboard card, the "Levantar" quick action, the profile shortcut, the
  KYB withdrawal-availability copy, and the payout screen guard.
- **Consumer real-rail claims / KYC:** `AppConfig.isSandbox` /
  `AppConfig.requiresIdentityVerification` (consumer `config.dart`). Governs the
  onboarding Multicaixa bullet, the Multicaixa notification toggle, and the KYC entry.

## Known follow-up (documented, not a money-truth defect)

- **Consumer Notifications toggles are local-only** (`notifications_screen.dart`):
  the received/sent/promos/security switches hold `setState` state that is not
  persisted or sent to any service, so they reset on reopen. This is an
  unimplemented-preference gap, not a misrepresented Sandbox money capability. The
  actual payment push behaviour is driven by FCM topic subscription, not these
  toggles. Flagged for a follow-up that either persists them or presents them as
  read-only until wired.
