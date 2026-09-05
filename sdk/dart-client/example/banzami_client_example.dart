// A payment, end to end, from the client's side.
//
// Note what is NOT here: no secret key, and no call that creates or moves
// money. The payment is created by a backend, which is where the secret key
// lives. This example accepts the resulting slug as input, the same way a real
// app receives it from its own server.
import 'package:banzami_client/banzami_client.dart';

Future<void> main(List<String> args) async {
  // Publishable — safe to ship inside an application.
  final banzami = BanzamiClient(
    publishableKey: const String.fromEnvironment(
      'BANZAMI_PUBLISHABLE_KEY',
      defaultValue: 'bz_test_pk_XXXXXXXX_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
    ),
    environment: BanzamiEnvironment.sandbox,
  );

  // Your backend created the payment and handed you the slug. Here it comes in
  // as an argument, so the example never needs a server credential.
  final slug = args.isNotEmpty ? args.first : null;
  if (slug == null) {
    print('usage: dart run example/banzami_client_example.dart <payment-slug>');
    print('the slug comes from YOUR backend, which creates the payment with a');
    print('secret key. This example holds no server credential.');
    return;
  }

  try {
    final me = await banzami.identity();
    print('key: ${me.project} · ${me.environment} · ${me.keyStatus}');

    final checkout = await banzami.checkout(slug);
    print('paying ${checkout.merchantName}: '
        '${checkout.amountMinor ?? "(payer chooses)"} ${checkout.currency}');
    print('status: ${checkout.status}');

    // Open this in a browser. The payer authorises the payment in their own
    // Banzami app; this program never sees their credentials.
    print('open: ${banzami.checkoutUrl(slug)}');

    print('waiting for settlement…');
    final paid = await banzami.waitUntilPaid(
      slug,
      interval: const Duration(seconds: 3),
      timeout: const Duration(minutes: 2),
    );
    print(paid ? 'paid' : 'not paid within the timeout');
  } on BanzamiNotFoundException {
    print('no such payment — check the slug your backend returned');
  } on BanzamiAuthException catch (e) {
    print('the key was refused: ${e.message}');
  } on BanzamiException catch (e) {
    print('failed: $e');
  } finally {
    banzami.close();
  }
}
