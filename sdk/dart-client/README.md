# banzami_client

Public **client** SDK for the [Banzami](https://banzami.com) payment network —
Angola's QR-native instant payment network, built on the BANZA protocol.

Pure Dart: works in Flutter apps, Dart CLIs and Dart servers.

---

## What this package is for

Presenting a payment **your server already created**, watching whether it has
been paid, and handling Banzami links and QR codes.

It uses a **publishable key** (`bz_test_pk_…`), which is safe to ship inside an
application.

## What it deliberately cannot do

Create a payment. Refund one. Move funds. Open an account. Manage webhooks.

Those need a **secret** key, and a secret key belongs on your server. Anyone who
downloads your app can read what you compiled into it, and that key can move
money. The operator enforces this too — a publishable key is refused on those
routes — so the boundary does not depend on this SDK being careful.

```
  your app ──publishable key──▶ Banzami          present · status · links
       │
       └────▶ your backend ──secret key──▶ Banzami   create · refund · transfer
```

> **Never compile a Banzami secret key (`bz_test_sk_…`, `bz_live_sk_…`) into an
> application.** The client constructor refuses one.

For the server side, use [`@banzami/sdk`](https://www.npmjs.com/package/@banzami/sdk).

---

## Install

```bash
dart pub add banzami_client
```

## Use

```dart
import 'package:banzami_client/banzami_client.dart';

final banzami = BanzamiClient(
  publishableKey: 'bz_test_pk_...',           // safe to ship
  environment: BanzamiEnvironment.sandbox,
);

// 1. Your BACKEND creates the payment (with a secret key) and returns the slug.
final slug = await myBackend.createPayment(amountMinor: 25000);

// 2. Show the payer what they are paying.
final checkout = await banzami.checkout(slug);
print('${checkout.merchantName} · ${checkout.amountMinor} ${checkout.currency}');

// 3. Open the hosted checkout. The payer authorises the payment in their own
//    Banzami app — this SDK never handles their credentials.
final url = banzami.checkoutUrl(slug);        // https://pay.banzami.com/pay/...

// 4. Wait for settlement.
if (await banzami.waitUntilPaid(slug)) {
  // fulfil the order
}
```

### Handling an incoming link or a scanned QR

A deep link is attacker-reachable on mobile and a QR is whatever the camera saw,
so both are untrusted input. `parseSlug` returns `null` for anything that is not
a genuine Banzami payment, including a well-formed URL on a look-alike host.

```dart
final slug = BanzamiLinks.parseSlug(incoming);   // null if it is not ours
if (slug != null) {
  final checkout = await banzami.checkout(slug);
}
```

---

## API

| | |
|---|---|
| `identity()` | what this key is — a cheap startup check |
| `resolveHandle(handle)` | confirm a `@banza` destination exists (handle + display name only) |
| `checkout(slug)` | the payer-safe view of a payment |
| `checkoutStatus(slug)` | whether it has settled |
| `waitUntilPaid(slug)` | poll until it settles, with a timeout |
| `checkoutUrl(slug)` | the hosted checkout URL to open |
| `BanzamiLinks.parseSlug(input)` | validate and extract a slug from a link or QR |

Errors are typed: `BanzamiConfigException`, `BanzamiAuthException`,
`BanzamiNotFoundException`, `BanzamiPaymentStateException`,
`BanzamiRateLimitException`, `BanzamiNetworkException`,
`BanzamiServerException`.

Money is always an integer in **minor units** (AOA). Never a double.

---

## Environments

| | |
|---|---|
| `BanzamiEnvironment.sandbox` | Development and testing. Virtual funds; nothing reaches a banking rail. |
| `BanzamiEnvironment.live` | **Not released.** Constructing a live client throws, rather than failing later in a way that looks like a network problem. |

---

## Documentation

[developers.banzami.com](https://developers.banzami.com/docs)

## License

MIT
