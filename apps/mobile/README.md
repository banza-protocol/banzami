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
| Perfil | Merchant ID copy, API session expiry, biometrics toggle, payout request, logout |
| Payout | Bank withdrawal form — amount, Angolan bank (BNA codes), IBAN, holder name |
| Cobrança | Create fixed-amount payment links with description and expiry |

## Notifications

Payment alerts are delivered via local notifications backed by a 30-second polling loop (`PaymentNotificationService`). Polling starts when the session is active and pauses automatically when the app goes to background or the session locks.

No FCM/APNs token registration is required — notifications are local only.

### Android setup

The `FOREGROUND_SERVICE` and `RECEIVE_BOOT_COMPLETED` permissions are declared in `android/app/src/main/AndroidManifest.xml` by the `flutter_local_notifications` package automatically.

### iOS setup

Notification permission is requested on the first poll via `DarwinInitializationSettings`.

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

## SDK

The `banzami_sdk` package lives at `../../sdk/flutter` and is referenced via a local path dependency. It exposes:

- `BanzamiClient` — HTTP client with automatic JWT exchange (raw API key → 24 h JWT, renewed 5 min before expiry)
- All domain models: `MerchantBalance`, `MerchantTransaction`, `PaymentLink`, `QrResponse`, etc.
- Theme: `BanzamiColors`, `BanzamiTextStyles`, `BanzamiSpacing`
