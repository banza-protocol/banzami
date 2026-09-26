# Apps Sandbox Product-Truth Audit

> Make both apps communicate their real Sandbox capabilities: no fake errors, no
> fake availability, no ambiguous "—", no active CTA for unavailable features, no
> real failure dressed as an empty state. No real-money capability is enabled by
> this work — it only makes current availability truthful.

**Status: `CONSUMER_AUDIT = COMPLETE` · `BUSINESS_AUDIT = COMPLETE` ·
`OPEN_PRODUCT_TRUTH_ITEMS = 0` · `REAL_MONEY_OPERATIONS = DISABLED` (2026-09-26).**
Every current user-facing surface of both apps was reviewed in source. The
[feature matrix](SANDBOX-FEATURE-MATRIX.md) holds the per-screen state tables, the
metric contract, cash-in/out classification, and external dependencies. This report
records what was changed and why.

Consumer source: `apps/mobile/lib/screens|widgets` (top-level + onboarding) plus the
shared SDK `sdk/flutter/lib/screens|widgets|models`. Business source:
`apps/mobile/lib/merchant/**` plus shared SDK widgets.

## Screens reviewed

**Consumer:** Home (balance, quick actions, @banza, activity feed, add-money card,
"Ver tudo", notification bell), History (list, empty, loading, error, paged,
receipt-open), Receber hub, Send, Scan, QR-pay, Confirm, Payment-received, Receipt,
Payment-request, Payment-link, Receive-point, Perfil, Notificações, Ajuda,
Segurança, KYC, plus `utils/error_messages.dart`.

**Business:** Dashboard (balance, Fundos retidos, KPIs, volume chart, withdrawals
card, quick actions, recent payments), History (Transacções / Cobranças / Recebidos
tabs — empty, loading, error, pagination, comprovativo), Charge, QR, Campaign
accounts, Split track, Project link, KYB, Payout, Perfil, Welcome, Login, plus the
KPI/stats/volume widgets.

## Defects fixed (this pass)

| # | Surface | OLD state | Real state | NEW state |
|---|---|---|---|---|
| 1 | Business · Perfil "Pedir levantamento" | Active tile → PayoutScreen (dead CTA) | UNAVAILABLE_SANDBOX (real-money cash-out) | Shortcut gated on `AppConfig.withdrawalsEnabled`; omitted in Sandbox — the dashboard card is the one authority |
| 2 | Business · KYB "Aprovado" | "…verificado. Levantamentos disponíveis." / AML-withdrawal timing — contradicts the dashboard's unavailable state | Withdrawals are policy-unavailable regardless of KYB | Withdrawal-availability copy gated on `withdrawalsEnabled`; Sandbox approval reads "Aprovado / O seu negócio está verificado." |
| 3 | Consumer · activity feed funding row | Fallback title "Multicaixa" (a real cash-in rail) when a funding row had no name | Sandbox funding is a test grant ("Carregamento de teste") | Fallback is the neutral category ("Carregamento"/"Estorno") — never a fabricated rail (latent; server already labels it) |
| 4 | Consumer · onboarding welcome | Bullet "Multicaixa Express integrado" on the first screen | No Multicaixa cash-in in the Sandbox (test money only) | Sandbox shows "Dinheiro de teste para experimentar"; the real-rail bullet returns in Live (`AppConfig.isSandbox`) |
| 5 | Consumer · Notificações | "Multicaixa Express" notification toggle | No Multicaixa rail in the Sandbox | Toggle hidden in the Sandbox (`!AppConfig.isSandbox`); returns with real-money operations |
| 6 | Consumer · Home "Ver tudo" | Primary-coloured link with no handler (dead CTA) | Full history is reachable | Wired to the Histórico tab; the SDK section-title hides the action entirely when no handler is wired |
| 7 | Consumer · Home notification bell | Button-styled bell with a null handler (dead CTA) | No Home notification action wired | Bell rendered only when `onNotifications` is wired; hidden (not inert) otherwise |
| 8 | Business · History "Recebidos" initial error | Backend failure drawn as a neutral empty state ("…aparecerão aqui") with no retry | ERROR (real fetch failure) | Red error treatment + "Tentar novamente", matching the sibling tabs |
| 9 | Business · History pagination (Cobranças + Recebidos) | A failed follow-on page re-requested every frame → endless spinner + unbounded retry (error masked as loading) | ERROR on that page | Failed page waits for a tap ("Tentar novamente"); next page auto-loads only via a post-frame callback when there is no error and no load in flight (the Transacções pattern) |
| 10 | Consumer · Notificações | Interactive per-type toggles (incl. "Multicaixa Express") that reset on reopen and control nothing — implied a persistent setting that does not exist | No per-type preference store; push follows the device permission + server topic | Informational screen (no switches): what Banzami notifies about + "gerir no dispositivo". Nothing to reset; no false persistence |

## Principles applied

- **ERROR ≠ UNAVAILABLE ≠ NO_DATA ≠ ZERO ≠ LOADING.** Each state is visibly
  distinct: policy-unavailable is neutral/info (never red, never a probe), a real
  failure is a red error with retry (never an empty state), no-data is muted "Sem
  dados", and zero is shown only when the authoritative value is zero.
- **No dead CTAs.** An action that cannot succeed is omitted or disabled — never a
  live-looking control (the SDK section-title now refuses to render an action with
  no handler at all).
- **No fabricated cash-in rail.** A Sandbox test grant is never presented as a
  Multicaixa/bank/card deposit, in a row title, an onboarding promise, or a
  notification channel.
- **Single availability authority.** Withdrawals read `AppConfig.withdrawalsEnabled`
  everywhere (dashboard, quick action, profile, KYB copy, payout guard); consumer
  real-rail/KYC copy reads `AppConfig.isSandbox` — no scattered per-widget checks.
- **Real-money stays disabled.** No cash-in / cash-out / settlement capability was
  enabled; the fail-safe defaults are preserved.

## Verification

- `flutter analyze` clean on all changed files (both packages).
- SDK: full suite **217 passed** (incl. new `section_title_action_test.dart` and the
  updated `activity_item_label_test.dart`).
- App: product-truth suites pass — `merchant/product_truth_test.dart` (withdrawal
  single-authority + history error/pagination), `consumer/product_truth_consumer_test.dart`
  (Multicaixa cash-in truth + Home CTA wiring + notification-preference truth),
  `merchant/dashboard_widgets_test.dart`, and `merchant/payout_screen_test.dart`
  (rewritten to the `UNAVAILABLE_SANDBOX` contract — renders the unavailable state,
  no submit CTA, no payout API probe, deep-link safe).
- **Closure pass (2026-09-26):** the two previously-open items are now closed —
  `payout_screen_test.dart` asserts the current unavailable contract (green because
  the contract changed, not by weakening assertions), and the Consumer Notifications
  screen no longer presents fake persistent toggles.
- **Pre-existing, unrelated NON-product-truth failures** (confirmed identical on the
  clean committed HEAD; not caused by this work, not product-truth items):
  `merchant/header_golden_test.dart` (env-mismatched macOS goldens),
  `receipt_canonical_test.dart` and `receive_auto_dismiss_test.dart` (macOS
  golden/timing). Tracked separately (BETA-SANDBOX rebuild test fails).

## Open product-truth items

**None.** `OPEN_PRODUCT_TRUTH_ITEMS = 0`. Real-money operations remain disabled.
