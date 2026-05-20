# Banzami Mobile

Flutter application for the Banzami payment platform, supporting two flavours: **Comerciante** (merchant) and **Consumidor** (consumer).

## Flavours

| Flavour | Entry point | Description |
|---|---|---|
| `merchant` | `lib/main_merchant.dart` | Merchant POS — balance, QR, payment links, payouts, history |
| `consumer` | `lib/main_consumer.dart` | Consumer wallet — transfers, QR scan, transaction history |

## Running

```bash
# Merchant app
flutter run -t lib/main_merchant.dart

# Consumer app
flutter run -t lib/main_consumer.dart
```

The gateway URL is configured in `lib/merchant/config.dart` and `lib/consumer/config.dart` via the `GATEWAY_URL` compile-time variable:

```bash
flutter run -t lib/main_merchant.dart --dart-define=GATEWAY_URL=http://192.168.1.10:8080
```

## Merchant features

| Screen | Description |
|---|---|
| Dashboard | Live balance, daily/monthly revenue stats, recent payment links, quick charge button |
| Histórico | Two-tab view: real transactions + payment links with infinite scroll |
| Receber | Static merchant QR code with share + fixed-amount charge shortcut |
| Perfil | Merchant ID copy, API session expiry, biometrics toggle, payout request, lock session, remove account |
| Payout | Bank withdrawal form — amount, Angolan bank (BNA codes), IBAN, holder name |
| Cobrança | Create fixed-amount payment links with description and expiry |

## Session management

The merchant session is stored in `flutter_secure_storage` (encrypted). Two levels of session control exist:

| Action | Behaviour |
|---|---|
| **Terminar sessão** (lock) | Locks the session in memory — credentials and PIN hash stay in storage. PIN screen is shown on next open (single entry). |
| **Remover conta** (clear) | Deletes all stored credentials. Forces full re-onboarding (Merchant ID + API Key + new PIN). |

This distinction avoids the poor UX of asking the merchant to re-enter their API Key every time they "log out". Logout = lock; remove account = full reset.

## Notifications

Payment alerts are delivered via local notifications backed by a 30-second polling loop (`PaymentNotificationService`). Polling starts when the session is active and pauses automatically when the app goes to background or the session locks.

No FCM/APNs token registration is required — notifications are local only.

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

The design language is **Space Cherry + Warm White** — a high-contrast palette rooted in a deep crimson primary and warm neutral backgrounds, designed to feel premium, trustworthy and distinctly African.

### Colour palette

| Token | Hex | Usage |
|---|---|---|
| `BanzaColors.wine` | `#990011` | Primary — buttons, icons, active states |
| `BanzaColors.wineDark` | `#6B000B` | Gradient deep end, pressed states |
| `BanzaColors.wineLight` | `#B5001A` | Gradient light end, hover |
| `BanzaColors.offWhite` | `#FCF6F5` | App scaffold background (Warm White) |
| `BanzaColors.white` | `#FFFFFF` | Card / surface background |
| `BanzaColors.gray100` | `#F5EEED` | Form fills, chips |
| `BanzaColors.gray200` | `#EBE3E2` | Borders, dividers |
| `BanzaColors.gray400` | `#9C8483` | Secondary / placeholder text |
| `BanzaColors.gray600` | `#534040` | Tertiary text |
| `BanzaColors.gray900` | `#1C0D0D` | Primary text (warm black) |
| `BanzaColors.success` | `#166534` | Completed transactions |
| `BanzaColors.error` | `#DC2626` | Errors, destructive actions |
| `BanzaColors.warning` | `#92400E` | Pending / caution states |
| `BanzaColors.info` | `#1E3A8A` | Informational states |

All grays are warm-tinted (slight red undertone) to pair harmoniously with the cherry primary.

### Gradients

| Token | Direction | Usage |
|---|---|---|
| `BanzaGradients.wine` | `#990011 → #6B000B` | Balance card headers, key surfaces |
| `BanzaGradients.wineLight` | `#990011 → #B5001A` | Secondary gradient surfaces |

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

`BanzaTheme.light` is the single source of truth for `ThemeData`. Both merchant and consumer `app.dart` files use:

```dart
ThemeData _buildTheme() {
  final base = BanzaTheme.light;
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

Background: `#FCF6F5` · Text: `#1C0D0D` · Primary: `#990011`

---

## SDK

The `banzami_sdk` package lives at `../../sdk/flutter` and is referenced via a local path dependency. It exposes:

- `BanzaClient` — HTTP client with automatic JWT exchange (raw API key → 24 h JWT, renewed 5 min before expiry)
- All domain models: `MerchantBalance`, `MerchantTransaction`, `PaymentLink`, `QrResponse`, etc.
- Theme: `BanzaColors`, `BanzaGradients`, `BanzaTextStyles`, `BanzaSpacing`, `BanzaRadius`, `BanzaShadows`, `BanzaTheme`
