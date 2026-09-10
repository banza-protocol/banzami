# Banzami Mobile

Flutter application for the Banzami payment platform, supporting two flavours: **Comerciante** (merchant) and **Consumidor** (consumer).

## Flavours

| Flavour | Entry point | Description |
|---|---|---|
| `merchant` | `lib/main_merchant.dart` | Merchant POS — balance, QR, payment links, payouts, history |
| `consumer` | `lib/main_consumer.dart` | Consumer wallet — transfers, QR scan, transaction history |

## Running

```bash
cd apps/mobile
```

### Consumer

```bash
# Local
flutter run --flavor consumer -t lib/main_consumer.dart \
  --dart-define=PUBLIC_API_URL=http://192.168.1.10:8083 --debug

# Produção
flutter run --flavor consumer -t lib/main_consumer.dart \
  --dart-define=PUBLIC_API_URL=https://api.banzami.com/consumer --debug

# Staging (sandbox)
flutter run --flavor consumer -t lib/main_consumer.dart \
  --dart-define=PUBLIC_API_URL=https://sandbox-api.banzami.com/consumer \
  --dart-define=ENVIRONMENT=sandbox --debug
```

### Merchant

```bash
# Local
flutter run --flavor merchant -t lib/main_merchant.dart \
  --dart-define=GATEWAY_URL=http://192.168.1.10:8080 --debug

# Produção
flutter run --flavor merchant -t lib/main_merchant.dart \
  --dart-define=GATEWAY_URL=https://api.banzami.com --debug
```

## Build para App Store

```bash
flutter clean && flutter pub get
cd ios && pod install && cd ..

# Consumer app
flutter build ipa --flavor consumer -t lib/main_consumer.dart \
  --dart-define=PUBLIC_API_URL=https://api.banzami.com/consumer \
  --dart-define=PAY_BASE_URL=https://pay.banzami.com \
  --export-options-plist=ios/ExportOptions.plist

# Merchant app
flutter build ipa --flavor merchant -t lib/main_merchant.dart \
  --dart-define=GATEWAY_URL=https://api.banzami.com \
  --dart-define=PAY_BASE_URL=https://pay.banzami.com \
  --export-options-plist=ios/ExportOptions.plist
```

## Build para TestFlight (Sandbox)

Verifica o ambiente de staging antes de cada build:

```bash
./tools/testflight-readiness.sh
```

Constrói o IPA sandbox (sem mutação de ícones — flavor `consumer_sandbox` selecciona `AppIconSandbox` automaticamente):

```bash
flutter build ipa --flavor consumer_sandbox -t lib/main_consumer.dart \
  --dart-define=PUBLIC_API_URL=https://sandbox-api.banzami.com/consumer \
  --dart-define=ENVIRONMENT=sandbox \
  --export-options-plist=ios/ExportOptions.plist
```

O ícone sandbox (`AppIconSandbox.appiconset`) é um asset permanente em `ios/Runner/Assets.xcassets/`. Nenhuma geração dinâmica ou restauração é necessária.

## Merchant features

| Screen | Description |
|---|---|
| Dashboard | Live balance, daily/monthly revenue stats, recent payment links, quick charge button |
| Histórico | Two-tab view: real transactions + payment links with infinite scroll |
| Receber | Static merchant QR code with share + fixed-amount charge shortcut |
| Perfil | @banza address, "Empresa verificada" (only when Banzami approved the KYB), biometrics toggle, payout request, sign out, remove account |
| Payout | Bank withdrawal form — amount, Angolan bank (BNA codes), IBAN, holder name |
| Cobrança | Create fixed-amount payment links with description and expiry |

## Session management

The merchant session is stored in `flutter_secure_storage` (encrypted). A
Business (@handle + PIN) sign-in is a **renewable session** (gateway migration
0120): a ~15-minute access token and a single-use, rotating refresh token
(≤ 30 days), both kept in secure storage with the session.

| Situation | Behaviour |
|---|---|
| Access token expired / 401 | `BanzamiClient` renews it with the refresh token (`/v1/merchant/auth/refresh`) — one renewal shared by concurrent requests, each request retried once. The PIN is **not** sent. The rotated refresh token is written **before** the new access token is used. |
| Device lock (PIN / biometrics) | The PIN is checked on the device only. Unlocking renews an expired access token with the refresh token before the home screen is shown. |
| Renewal refused (401 `SESSION_ENDED`) | The session **ends** once: tokens, identity, wallet and verification flag are cleared (only the @handle, PIN hash and device preferences stay), every pushed screen is closed, and the PIN screen becomes sign-in for `@handle` — handle + PIN against `/v1/merchant/auth/token`, which opens a new session. |
| Renewal outage (503 / no network) | Nothing ends. Balance and data show the temporary "try again" messages; the next call renews. |
| Session stored before refresh tokens | Kept while its access token is valid; once it expires it requires sign-in. |
| **Terminar sessão** | Ends the session on this device (as above) and revokes the refresh token on Banzami (`/v1/merchant/auth/logout`, best effort — local state is cleared regardless). Signing in again asks only for the PIN. |
| **Remover conta** / **Usar outra conta** | Revokes the refresh token (best effort) and deletes everything stored. |
| Any of the endings above | The device is unsubscribed from the Business's payment push topics first (see [Notifications](#notifications)). |

Legacy API-key sessions (Merchant ID + API Key) are unchanged: the key is
re-exchanged for a JWT by the client, **Terminar sessão** locks the device.

Implementation: `lib/merchant/services/merchant_session_service.dart` (state,
storage, `MerchantRoute`), `lib/merchant/services/merchant_reauth.dart`
(`buildBusinessClient`, `renewBusinessSession`, `resumeBusinessSession`,
`reauthenticateBusiness`, `signOutBusiness`). Tests:
`test/merchant/session_lifecycle_test.dart`.

## Notifications

The Business App receives payment pushes through an **FCM topic** per
Business, named as the gateway publishes them (`notify/fcm.go`
`topicForMerchant`): `sandbox_merchant_<merchant_id>` on the Sandbox stack,
`merchant_<merchant_id>` on Live. The main screen subscribes after the
notification permission is granted. No device token is registered with
Banzami — the topic is the only registration. In the foreground a 30-second
polling loop (`PaymentNotificationService`) is the fallback; it stops when the
main screen is left (lock, sign-out, background).

**A signed-out device stops receiving the Business's notifications.** Every
way a Business session ends — renewal refused, **Terminar sessão**, **Remover
conta** / **Usar outra conta**, a dead session found at start-up, or a sign-in
that replaces the Business with another — unsubscribes the device from both
topics of that Business (`MerchantSessionService._unregisterPush`). It starts
before the identity that names the topics is cleared and is best effort: it is
never awaited (an unreachable FCM cannot keep the device signed in; the
platform SDKs retry a topic operation they could not send). Locking the device
is not an ending and keeps the subscription. A subscription still waiting for
the APNs token when the session ends is skipped (`subscribeMerchant`'s
`stillWanted`), so it cannot re-subscribe a signed-out device.

The FCM calls go through `MerchantPushRegistration`
(`lib/merchant/services/merchant_push_registration.dart`), which tests replace
with a fake (`test/merchant/session_lifecycle_test.dart`, "payment
notifications follow the session").

### Android setup

The `FOREGROUND_SERVICE` and `RECEIVE_BOOT_COMPLETED` permissions are declared in `android/app/src/main/AndroidManifest.xml` by the `flutter_local_notifications` package automatically.

### iOS setup

Notification permission is requested on the first poll via `DarwinInitializationSettings`.

## Crash Reporting

Firebase Crashlytics is enabled in both flavours for production builds. Collection is disabled in debug mode (`kDebugMode`).

Setup in each `main_*.dart`:
```dart
FlutterError.onError = FirebaseCrashlytics.instance.recordFlutterFatalError;
PlatformDispatcher.instance.onError = (error, stack) {
  FirebaseCrashlytics.instance.recordError(error, stack, fatal: true);
  return true;
};
await FirebaseCrashlytics.instance.setCrashlyticsCollectionEnabled(!kDebugMode);
```

iOS requires the Crashlytics dSYM upload script in the Xcode Build Phase (Run Script after Compile Sources):
```
"${PODS_ROOT}/FirebaseCrashlytics/run"
```
Input files: `${DWARF_DSYM_FOLDER_PATH}/${DWARF_DSYM_FILE_NAME}/Contents/Resources/DWARF/${TARGET_NAME}` and `$(SRCROOT)/$(BUILT_PRODUCTS_DIR)/$(INFOPLIST_PATH)`.

## Handle Availability

The consumer **Criar conta** screen checks handle availability before navigating to PIN setup. If the `@banza` handle is already taken, an inline error is shown on the field and the user remains on the screen. The check uses `ConsumerPublicClient.handleExists()` against the public API. A network failure is treated as non-blocking (navigates to PIN; the server enforces uniqueness on registration).

## Dependencies

| Package | Purpose |
|---|---|
| `banzami_sdk` | HTTP client, models, theme |
| `provider` | State management |
| `flutter_secure_storage` | Encrypted PIN / API key storage |
| `local_auth` | Biometric authentication |
| `qr_flutter` | QR code rendering |
| `share_plus` | Native share sheet |
| `flutter_local_notifications` | Payment alert notifications |
| `app_links` | Deep link handling (`banzami://`) |
| `google_fonts` | Inter font |
| `firebase_core` | Firebase app initialisation |
| `firebase_crashlytics` | Production crash reporting |
| `firebase_messaging` | FCM push notifications |

## Design system

The design language is **Banzami Red + Warm White** — a high-contrast palette rooted in a official Banzami red primary (#B5101F) and warm neutral backgrounds, designed to feel premium, trustworthy and distinctly African.

### Colour palette

| Token | Hex | Usage |
|---|---|---|
| `BanzamiColors.wine` | `#B5101F` | Primary — buttons, icons, active states |
| `BanzamiColors.wineDark` | `#9A1B22` | Gradient deep end, pressed states |
| `BanzamiColors.wineLight` | `#E8434B` | Gradient light end, hover |
| `BanzamiColors.offWhite` | `#FCF6F5` | App scaffold background (Warm White) |
| `BanzamiColors.white` | `#FFFFFF` | Card / surface background |
| `BanzamiColors.gray100` | `#F5EEED` | Form fills, chips |
| `BanzamiColors.gray200` | `#EBE3E2` | Borders, dividers |
| `BanzamiColors.gray400` | `#9C8483` | Secondary / placeholder text |
| `BanzamiColors.gray600` | `#534040` | Tertiary text |
| `BanzamiColors.gray900` | `#1C0D0D` | Primary text (warm black) |
| `BanzamiColors.success` | `#166534` | Completed transactions |
| `BanzamiColors.error` | `#DC2626` | Errors, destructive actions |
| `BanzamiColors.warning` | `#92400E` | Pending / caution states |
| `BanzamiColors.info` | `#1E3A8A` | Informational states |

All grays are warm-tinted (slight red undertone) to pair harmoniously with the cherry primary.

### Gradients

| Token | Direction | Usage |
|---|---|---|
| `BanzamiGradients.wine` | `#B5101F → #9A1B22` | Balance card headers, key surfaces |
| `BanzamiGradients.wineLight` | `#B5101F → #E8434B` | Secondary gradient surfaces |

### Typography

Font family: **Inter** (applied via `google_fonts`). Monospace: **JetBrains Mono** (amounts, IDs).

| Style | Size / Weight | Usage |
|---|---|---|
| `displayXl` | 48 / 700 | Large hero numbers |
| `displayLg` | 36 / 700 | Section heroes |
| `headingLg` | 22 / 600 | Screen titles |
| `headingMd` | 18 / 600 | Section headings, app bar |
| `headingSm` | 16 / 600 | Card titles |
| `bodyMd` | 14 / 400 | Body copy |
| `bodySm` | 12 / 400 | Captions, helper text |
| `mono` | 14 / 400 | Transaction IDs, codes |
| `monoLg` | 28 / 600 | Balance amounts |

### ThemeData

`BanzamiTheme.light` is the single source of truth for `ThemeData`. Both merchant and consumer `app.dart` files use:

```dart
ThemeData _buildTheme() {
  final base = BanzamiTheme.light;
  return base.copyWith(textTheme: GoogleFonts.interTextTheme(base.textTheme));
}
```

The theme covers: `AppBarTheme`, `ElevatedButtonTheme`, `OutlinedButtonTheme`, `TextButtonTheme`, `InputDecorationTheme`, `CardTheme`, `ChipTheme`, `NavigationBarTheme`, `SnackBarTheme`, `ListTileTheme`, `ProgressIndicatorTheme`.

### Web apps

The same palette is applied to all three web apps via Tailwind CSS:

| App | Config |
|---|---|
| `apps/dashboard` | `tailwind.config.ts` → `wine`, `off-white`, warm grays |
| `apps/admin` | same palette + `info` colour token |
| `apps/pay` | same palette |

Background: `#FCF6F5` · Text: `#1C0D0D` · Primary: `#B5101F`

---

## SDK

The `banzami_sdk` package lives at `../../sdk/flutter` and is referenced via a local path dependency. It exposes:

- `BanzamiClient` — HTTP client with automatic JWT exchange (raw API key → 24 h JWT, renewed 5 min before expiry)
- All domain models: `MerchantBalance`, `MerchantTransaction`, `PaymentLink`, `QrResponse`, etc.
- Theme: `BanzamiColors`, `BanzamiGradients`, `BanzamiTextStyles`, `BanzamiSpacing`, `BanzamiRadius`, `BanzamiShadows`, `BanzamiTheme`
