/// Public client SDK for the Banzami payment network.
///
/// Present a hosted checkout your server created, watch whether it has been
/// paid, and handle Banzami links and QR codes. Uses a **publishable** key
/// (`bz_test_pk_…`), which is safe to ship inside an application.
///
/// Anything that moves money — creating a payment, refunding one, transferring
/// funds, opening an account, managing webhooks — needs a SECRET key and
/// belongs on your server. Never compile a secret key into client software:
/// anyone who downloads the app can read it. The operator refuses a publishable
/// key on those routes, so the boundary does not depend on this SDK.
///
/// ```
///   your app ──publishable key──▶ Banzami        present · status · links
///        │
///        └───▶ your backend ──secret key──▶ Banzami    create · refund · transfer
/// ```
///
/// For the server side, use `@banzami/sdk` (TypeScript).
library banzami_client;

export 'src/client.dart';
export 'src/environment.dart';
export 'src/errors.dart';
export 'src/links.dart';
export 'src/models.dart';
