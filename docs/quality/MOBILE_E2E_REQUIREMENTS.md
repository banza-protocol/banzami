# Mobile iOS Simulator E2E Requirements

Programme: BANZAMI-SANDBOX-RELEASE-ASSURANCE-001

Static review is **not** launch evidence for mobile. Each Banzami mobile app
must pass a deployed-Sandbox iOS Simulator E2E matrix, registered in the
assurance manifest, before it may be `released-sandbox`. Until then it is
`quarantined` (not distributed, not linked publicly, not claimed available).

## Apps

| App | Manifest ID | Flavor / entry | Sandbox config | Bundle id |
|---|---|---|---|---|
| Consumer | CAP-APP-001 | `consumer` / `lib/main_consumer.dart` | `--dart-define=PUBLIC_API_URL=https://sandbox-api.banzami.com/consumer --dart-define=ENVIRONMENT=sandbox` | com.banzami.consumer(.sandbox) |
| Merchant | CAP-APP-005 | `merchant` / `lib/main_merchant.dart` | `--dart-define=GATEWAY_URL=<sandbox gateway>` + `bz_test_` key at login | com.banzami.merchant |

Both apps must use the **deployed Banzami Sandbox only**. Never production
hosts, `bz_live_*` keys, production DB/wallets/merchants, real money/PII,
browser mocks, or a local fake API as a substitute for deployed Sandbox E2E.

## Environment-isolation proofs (on the built simulator artifact)

Static pre-check (necessary, not sufficient): `make check-mobile-config`
(`tools/check-mobile-sandbox-config.mjs`) — proves the config points only at
public/sandbox hosts, no live-key/secret literals, tokens via secure storage.

On the simulator artifact the E2E must additionally prove: sandbox host only;
no production host / private IP / docker / core route in the build; no
`bz_live_`/secret in bundle/plist/strings/logs/simulator storage; no silent
Sandbox↔Live fallback; no one-flag Live enable; controlled API errors (no SQL/
core routes/stack traces/tenant data); tokens only in Keychain
(flutter_secure_storage); logout invalidates session; fresh install has no auth
state; reinstall/reset is deterministic.

## Consumer matrix (deployed Sandbox, isolated fixtures)

Fresh install/first launch · onboarding/auth · session persistence across
restart · logout+invalidation · wallet/balance load · tenant-scoped identity ·
**inbound payment via deep link** (the app has NO camera QR scan — payments
arrive via `banzami://pay` / universal links, so "scan a QR" is realised as
opening a valid Sandbox payment deep link) · reject malformed/expired/
wrong-environment/unauthorized deep-link content safely · confirm payment with
the approved confirmation step · duplicate-tap/retry cannot double-move money ·
idempotency/replay through the mobile action · success + receipt/proof state ·
history updates · refund visibility (partial stays confirmed; full cumulative
shows reversed) if exposed · network-interruption retry without phantom success
· foreground/background during a pending flow · no secret/`TRANSACTION` token/
internal id/raw backend error in UI.

## Merchant matrix (deployed Sandbox, isolated fixtures)

Fresh install/first launch · auth (API key + @handle/PIN) · session persistence
+ logout · account/wallet load · create Sandbox payment request/QR/payment link
in-app · QR renders correctly and resolves to a valid Sandbox pay link · correct
pending state · consumer completes via deployed Sandbox · merchant shows
confirmed state · history/receipt/balance update · duplicate confirm/replay no
double effect · cross-tenant access rejected (another merchant's payment/refund/
wallet/history) · unauthorized/malformed actions fail without mutation · expiry/
invalid state shown safely · no internal `TRANSACTION`/core id/credential/raw
SQL/gateway error exposed · **refunds** (if exposed in-app): eligible discovery,
full, partial, cumulative cap, idempotent retry, over-cap rejection, status/
history, partial-stays-confirmed, full-cumulative-becomes-reversed, cross-tenant
rejection, no duplicate effect.

## Cross-app financial E2E

At least one E2E bridges both apps + deployed Sandbox:

```
Merchant app → create payment link/QR
→ Consumer app opens the Sandbox pay deep link (not camera scan — unimplemented)
→ Consumer confirms → deployed Sandbox Gateway/Core settles
→ Consumer shows proof/receipt → Merchant shows confirmation/history/balance
→ Gateway/Core ledger + audit verified
```

Proving: exact balance movement · one financial operation · idempotency/replay
safety · tenant isolation · receipt/proof/history consistency · balanced ledger
· audit record · cleanup of removable fixtures · retention/tagging of
append-only evidence. Where a mobile refund flow exists, a second cross-surface
refund E2E is required.

> **Known gap:** neither app implements camera QR *scanning* (`mobile_scanner`/
> MLKit are absent — confirmed in the audit). Inbound payment is deep-link
> based. The "Consumer scans Merchant QR" scenario is therefore realised as a
> deep-link open, or the scanning feature must be built before that literal
> scenario can be claimed. This is recorded so the matrix is not silently
> under-scoped.

## Evidence (per app, registered in the manifest)

exact app commit/build id · simulator device model + iOS version · deployed
Sandbox hostname · fixture namespace · authenticated test identity · sanitised
artifact (screenshot/video/log — never screenshots alone) · API/ledger
verification for money movement · negative/security tests · cleanup result ·
evidence artifact path under `evidence/assurance/mobile/`.

## Automation

```
make assure-mobile-consumer-ios     # consumer matrix on a booted simulator
make assure-mobile-merchant-ios     # merchant matrix
make assure-mobile-cross-app-ios    # cross-app financial E2E
make assure-mobile-ios              # all of the above + config check
```

`make assure-sandbox-launch` FAILS if: either released iOS app lacks current
deployed-Sandbox E2E evidence; a public mobile feature lacks E2E coverage; a
Sandbox build contains a production endpoint or live key; secure-storage/
session/logout tests fail; the cross-app flow is unverified; a build has
unclassified visible functionality; or evidence does not match the deployed app
revision.

If the iOS Simulator E2E cannot run in the automated deploy environment, it
runs on a controlled **macOS release runner** before the Sandbox mobile build
is released. Local manual execution alone is not sufficient.

## Current disposition (2026-07-04)

Both apps are **`quarantined`**: the deployed-Sandbox iOS Simulator E2E matrix
is not yet authored/registered, so neither may be claimed as available,
partner-ready, or downloadable. The config-isolation static guard passes and a
simulator build is feasible (no MLKit/arm64 blocker), which are prerequisites —
not the launch evidence. Building the `integration_test/` matrices + a macOS
release runner is the tracked path to `released-sandbox`.
