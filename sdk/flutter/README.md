# Banza Flutter SDK

Flutter SDK for integrating Banza payments into mobile applications. Provides an API client, pre-built screens, reusable widgets, and a design system — everything needed to add instant P2P transfers and QR payments to a Flutter app.

---

## Requirements

- Flutter >= 3.19.0
- Dart >= 3.3.0

---

## Installation

```yaml
dependencies:
  banzami_sdk:
    path: ../  # local path during development
    # git:
    #   url: https://github.com/banza-protocol/flutter-sdk.git
    #   ref: v0.1.0
```

Then import the single barrel file:

```dart
import 'package:banza_flutter/banza_flutter.dart';
```

---

## Quick start — merchant app

```dart
final client = BanzaClient(
  apiKey:  'bz_live_...',
  baseUrl: 'https://api.banzami.com',
);

// Fetch merchant details
final merchant = await client.getMerchant(merchantId);

// Get wallet balance
final balance = await client.getMerchantBalance(walletId);
print(balance.availableMinor); // integer minor units

// List recent transactions
final page = await client.listMerchantTransactions(limit: 20);
for (final tx in page.data) {
  print('${tx.id} — ${tx.status}');
}

// Create a payment link
final link = await client.createPaymentLink(
  merchantId:  merchantId,
  walletId:    walletId,
  amountMinor: 50000,     // 500 Kz
  description: 'Order #1234',
);
print(link.slug); // share this slug with the customer
```

The client transparently exchanges your API key for a short-lived JWT on the first call and silently renews it 5 minutes before expiry. No session management is required from calling code.

---

## Quick start — consumer app

### Registration and login

```dart
// Production
final client = ConsumerPublicClient(
  baseUrl:     'https://api.banzami.com',
  environment: BanzamiEnvironment.production,
);

// Sandbox (test environment)
final client = ConsumerPublicClient(
  baseUrl:     'https://sandbox-api.banzami.com',
  environment: BanzamiEnvironment.sandbox,
);

// New user
final reg = await client.register(handle: 'joao', pin: '123456');
// reg.consumer, reg.walletId, reg.token are all available

// Returning user
final session = await client.login(handle: 'joao', pin: '123456');
// session.consumer, session.walletId, session.token
```

### Payment link checkout

```dart
final link = await client.getPaymentLinkBySlug('abc123');
await client.payPaymentLink(link.slug, amountMinor: link.amountMinor);
```

### P2P transfer by @banza

```dart
final transfer = await client.sendByHandle(
  recipientHandle: 'ana',
  amountMinor:     10000, // 100 Kz
  description:     'café',
);
```

### Balance

```dart
final balance = await client.getBalance();
print(balance.availableFormatted); // "10.000 Kz"
```

### Sandbox fund (test environments only)

```dart
final result = await client.sandboxFund(amountMinor: 5000000); // 50 000 Kz
print(result.creditedMinor); // 5000000
print(result.newBalance);    // 5000000
```

Throws `BanzamiApiException` with code `SANDBOX_ONLY` if called against a production public-api instance.

---

## Pre-built screens

Import the SDK and push any screen directly into your navigator. Each screen is self-contained and handles its own loading/error states.

### `CheckoutScreen`

Full-screen payment page for a Banza payment link. Displays a QR code and a deep-link button to open the Banza consumer app. Polls every 3 seconds and calls `onSuccess` when payment is confirmed.

```dart
Navigator.push(
  context,
  MaterialPageRoute(
    builder: (_) => CheckoutScreen(
      client:    merchantClient,  // BanzaClient
      slug:      'abc123def456',
      onSuccess: (link) => Navigator.pop(context),
      onCancel:  () => Navigator.pop(context),
    ),
  ),
);
```

| Parameter   | Type                            | Required | Description                                       |
|-------------|---------------------------------|----------|---------------------------------------------------|
| `client`    | `BanzaClient`                 | yes      | Authenticated merchant client                     |
| `slug`      | `String`                        | yes      | Payment link slug                                 |
| `onSuccess` | `void Function(PaymentLink)`    | no       | Called after payment is confirmed                 |
| `onCancel`  | `VoidCallback`                  | no       | Called when the user dismisses the screen         |

---

### `BanzamiHomeScreen`

Main payment hub for a logged-in consumer. Shows available balance, Scan / Send / Receive quick-action buttons, and a scrollable list of recent transfers. Supports pull-to-refresh. In sandbox mode, renders an amber fund panel below the balance card.

```dart
Navigator.pushReplacement(
  context,
  MaterialPageRoute(
    builder: (_) => BanzamiHomeScreen(
      client:      consumerClient,
      consumerId:  session.consumer.id,
      handle:      session.consumer.handle,
      environment: BanzamiEnvironment.sandbox, // omit for production
    ),
  ),
);
```

| Parameter     | Type                    | Required | Description                                              |
|---------------|-------------------------|----------|----------------------------------------------------------|
| `client`      | `ConsumerPublicClient`  | yes      | Authenticated consumer client                            |
| `consumerId`  | `String`                | yes      | Used to determine debit/credit direction in transfer list|
| `handle`      | `String`                | yes      | Consumer's own @banza — excluded from send autocomplete  |
| `logoAssetPath` | `String?`             | no       | Asset path for the QR code logo on the receive screen    |
| `environment` | `BanzamiEnvironment`    | no       | Default: `production`. Set `sandbox` to show fund panel  |

---

### `BanzamiSendScreen`

P2P transfer flow. The user enters a recipient `@banza`, an amount, and an optional description. Suggestions appear after 2 characters and are fetched from `GET /v1/consumers/search`. @banza existence is validated on blur and blocked at send time if unregistered.

```dart
Navigator.push(
  context,
  MaterialPageRoute(
    builder: (_) => BanzamiSendScreen(
      client:    consumerClient,  // ConsumerPublicClient
      ownHandle: 'joao',          // excluded from autocomplete results
      onSuccess: (transfer) {
        // transfer.id, transfer.amountFormatted, etc.
        Navigator.pop(context);
      },
    ),
  ),
);
```

| Parameter   | Type                         | Required | Description                                            |
|-------------|------------------------------|----------|--------------------------------------------------------|
| `client`    | `ConsumerPublicClient`       | yes      | Authenticated consumer client                          |
| `onSuccess` | `void Function(Transfer)`    | yes      | Called with the completed transfer                     |
| `ownHandle` | `String?`                    | no       | Logged-in consumer's @banza — filtered from suggestions|

---

### `BanzamiReceiveScreen`

Displays the consumer's `@banza` as a scannable QR code. The user can optionally set a fixed amount; the QR payload updates in real time to include it.

```dart
Navigator.push(
  context,
  MaterialPageRoute(
    builder: (_) => BanzamiReceiveScreen(handle: 'joao'),
  ),
);
```

| Parameter | Type     | Required | Description                             |
|-----------|----------|----------|-----------------------------------------|
| `handle`  | `String` | yes      | The logged-in consumer's @banza         |

---

### `BanzamiScanScreen`

Camera-based QR scan-to-pay flow. Supports two QR formats:

- `banzami:@{banza}[?amount={minor}&currency=AOA]` — resolves to a P2P transfer
- Any URL — extracts the slug from the last path segment and pays the payment link

```dart
Navigator.push(
  context,
  MaterialPageRoute(
    builder: (_) => BanzamiScanScreen(
      client:    consumerClient,
      onSuccess: (result) {
        // result is Transfer or PaymentLink
        Navigator.pop(context);
      },
    ),
  ),
);
```

| Parameter   | Type                          | Required | Description                                |
|-------------|-------------------------------|----------|--------------------------------------------|
| `client`    | `ConsumerPublicClient`        | yes      | Authenticated consumer client              |
| `onSuccess` | `void Function(dynamic)`      | yes      | Called with a `Transfer` or `PaymentLink`  |

The screen handles camera permission errors and shows a retry path if the QR cannot be resolved.

---

## Reusable widgets

### `BanzamiButton`

The canonical Banza branded button. Always 48 dp tall. Four variants available.

```dart
// Primary (default)
BanzamiButton(
  label:     'Confirmar pagamento',
  isLoading: _loading,
  onPressed: _pay,
)

// Secondary (outlined)
BanzamiButton.secondary(
  label:     'Cancelar',
  onPressed: () => Navigator.pop(context),
)

// Ghost (text only)
BanzamiButton.ghost(
  label:     'Ver detalhes',
  onPressed: _showDetails,
)

// Destructive
BanzamiButton.destructive(
  label:     'Eliminar conta',
  onPressed: _deleteAccount,
)
```

| Parameter   | Type                         | Default     | Description                              |
|-------------|------------------------------|-------------|------------------------------------------|
| `label`     | `String`                     | required    | Button text                              |
| `onPressed` | `VoidCallback?`              | `null`      | Null disables the button                 |
| `isLoading` | `bool`                       | `false`     | Shows a spinner and disables the button  |
| `fullWidth` | `bool`                       | `true`      | Stretches to fill available width        |
| `icon`      | `Widget?`                    | `null`      | Leading icon                             |

---

### `BanzamiAmountInput`

Large-format monetary amount input. The user types whole units (e.g. "500"); the widget exposes minor units (50 000) via `onChanged`. Supports a thousands separator as the user types.

```dart
BanzamiAmountInput(
  currency:           'AOA',
  initialAmountMinor: 50000,
  onChanged: (amountMinor) => setState(() => _amount = amountMinor),
  errorText: _amountError,
)
```

| Parameter            | Type                          | Default  | Description                                |
|----------------------|-------------------------------|----------|--------------------------------------------|
| `currency`           | `String`                      | `'AOA'`  | Determines the symbol shown at the right   |
| `initialAmountMinor` | `int?`                        | `null`   | Pre-fills the field                        |
| `onChanged`          | `void Function(int)`          | required | Called with minor units on every keystroke |
| `errorText`          | `String?`                     | `null`   | Inline error shown below the field         |
| `enabled`            | `bool`                        | `true`   | Disables interaction when false            |

---

### `BanzamiQrDisplay`

Renders a scannable QR code in the Banza visual style (wine-coloured finder patterns). Optionally shows an amount label and a subtitle beneath the code.

```dart
// Static QR
BanzamiQrDisplay(
  payload:  qrPayload,
  subtitle: '@joao',
)

// Dynamic QR with amount (convenience constructor)
BanzamiQrDisplay.dynamic(
  payload:     qrPayload,
  amountMinor: 50000,
  currency:    'AOA',
  reference:   'order-001',
)
```

| Parameter     | Type      | Default | Description                              |
|---------------|-----------|---------|------------------------------------------|
| `payload`     | `String`  | required| QR data string                           |
| `amountLabel` | `String?` | `null`  | Pre-formatted amount shown below the QR  |
| `subtitle`    | `String?` | `null`  | Secondary label (e.g. `@banza`)          |
| `size`        | `double`  | `240`   | QR code size in logical pixels           |

---

### `BanzamiQrScanner`

Full-screen camera scanner widget. Fires `onDetected` once per scan with the raw string value. The host screen is responsible for parsing and acting on the payload.

Requires camera permission in the host app:
- **iOS**: `NSCameraUsageDescription` in `Info.plist`
- **Android**: `android.permission.CAMERA` in `AndroidManifest.xml`

```dart
BanzamiQrScanner(
  onDetected: (payload) async {
    final parsed = await client.decodeQrPayload(payload);
    // parsed.isStatic, parsed.isDynamic, parsed.ownerId, etc.
  },
  onCancel: () => Navigator.pop(context),
)
```

| Parameter    | Type                        | Required | Description                             |
|--------------|-----------------------------|----------|-----------------------------------------|
| `onDetected` | `void Function(String)`     | yes      | Called once with the raw QR value       |
| `onCancel`   | `VoidCallback?`             | no       | Called when the user taps the close btn |

---

### `BanzamiTransferItem`

A single row in a transfer list. Determines debit/credit direction relative to `currentConsumerId` and colours the amount accordingly.

```dart
BanzamiTransferItem(
  transfer:          transfer,
  currentConsumerId: session.consumer.id,
  onTap:             () => _showDetail(transfer),
)
```

| Parameter           | Type           | Required | Description                                      |
|---------------------|----------------|----------|--------------------------------------------------|
| `transfer`          | `Transfer`     | yes      | The transfer to display                          |
| `currentConsumerId` | `String`       | yes      | Logged-in consumer — used to resolve direction   |
| `onTap`             | `VoidCallback?`| no       | Optional tap handler                             |

---

## Design system

The SDK ships a complete design token set. Use it directly in host apps to stay consistent with Banza branding.

```dart
import 'package:banza_flutter/banza_flutter.dart';

// Colors
BanzaColors.wine       // #990011 — primary brand
BanzaColors.gold       // #C89B3C — accent
BanzaColors.gray900    // #1A1A1A — primary text
BanzaColors.success    // #166534
BanzaColors.error      // #DC2626

// Gradients
BanzaGradients.wine    // cherry gradient for balance cards

// Typography
BanzaTextStyles.displayXl   // 48px bold
BanzaTextStyles.headingMd   // 18px semibold
BanzaTextStyles.bodyMd      // 14px regular
BanzaTextStyles.mono        // tabular figures for amounts

// Spacing
BanzaSpacing.sm    // 8
BanzaSpacing.lg    // 16
BanzaSpacing.xl    // 24

// Border radius
BanzaRadius.mdAll   // BorderRadius.all(8)
BanzaRadius.lgAll   // BorderRadius.all(12)
BanzaRadius.fullAll // BorderRadius.all(999) — pill shape

// Shadows
BanzaShadows.card         // subtle card shadow
BanzaShadows.cardElevated // stronger elevation

// Full ThemeData — apply to MaterialApp
MaterialApp(
  theme: BanzamiTheme.light,
  ...
)
```

---

## Money formatting

All amounts are stored and transmitted as integer minor units. Use `formatMinor` to display them.

```dart
import 'package:banza_flutter/banza_flutter.dart';

formatMinor(50000,    'AOA'); // "500 Kz"
formatMinor(1000000,  'AOA'); // "10.000 Kz"  (pt_PT thousands separator)
formatMinor(1050,     'USD'); // "USD 10.50"
formatMinor(0,        'AOA'); // "0 Kz"
```

AOA (Kwanza) uses the Portuguese locale `pt_PT` and omits decimal places — cêntimos are not used in practice. All other currencies use two decimal places.

---

## Error handling

All client methods throw `BanzamiApiException` for HTTP 4xx/5xx responses and `BanzamiNetworkException` when no HTTP response is received (e.g. no network).

```dart
try {
  final merchant = await client.getMerchant(merchantId);
} on BanzamiApiException catch (e) {
  switch (e.statusCode) {
    case 401:
      // Re-authenticate or redirect to login
    case 404:
      // Resource not found
    case 409:
      // Conflict (e.g. duplicate idempotency key)
    case 422:
      // Validation error — check e.code for machine-readable reason
  }

  // Convenience flags
  if (e.isInsufficientFunds) { /* ... */ }
  if (e.isHandleTaken)       { /* ... */ }
  if (e.isQrExpired)         { /* ... */ }
} on BanzamiNetworkException catch (e) {
  // No connectivity — show offline message
}
```

> **Localisation rule**: `e.message` is the raw English string returned by the API. Never display it to end users. Always derive user-facing text from `e.code`:
>
> ```dart
> } on BanzamiApiException catch (e) {
>   final msg = switch (e.code) {
>     'INSUFFICIENT_FUNDS'  => 'Saldo insuficiente',
>     'RECIPIENT_NOT_FOUND' => '@banza não encontrado',
>     _                     => 'Erro. Tente novamente.',
>   };
> }
> ```

---

## Running tests

```bash
cd sdk/flutter
flutter test
```

---

## Models reference

| Model                    | Source                             | Description                              |
|--------------------------|------------------------------------|------------------------------------------|
| `Consumer`               | `models/consumer.dart`             | Banza consumer account                 |
| `ConsumerSuggestion`     | `models/consumer_suggestion.dart`  | Lightweight @banza autocomplete result   |
| `Merchant`               | `models/merchant.dart`             | Merchant account                         |
| `MerchantBalance`        | `models/merchant.dart`             | Wallet balance for a merchant            |
| `MerchantTransaction`    | `models/merchant.dart`             | Single merchant transaction              |
| `MerchantTransactionPage`| `models/merchant.dart`             | Paginated transaction list               |
| `WalletBalance`          | `models/wallet_balance.dart`       | Consumer wallet balance                  |
| `Transfer`               | `models/transfer.dart`             | P2P transfer                             |
| `TransferPage`           | `models/transfer.dart`             | Paginated transfer list                  |
| `PaymentLink`            | `models/payment_link.dart`         | Merchant payment link                    |
| `PaymentLinkPage`        | `models/payment_link.dart`         | Paginated payment link list              |
| `QrCode`                 | `models/qr_code.dart`              | QR code record                           |
| `QrResponse`             | `models/qr_code.dart`              | QR code + encoded payload                |
| `ParsedQr`               | `models/qr_code.dart`              | Decoded QR payload fields                |
| `SandboxFundResult`      | `client/consumer_public_client.dart`| Result of `sandboxFund()` — credited and new balance |
