import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// Helpers that can only fail stay withdrawn.
///
/// The Business App used to open a "Pedidos de pagamento" screen whose every
/// call answered 404, because the SDK still carried helpers for routes the
/// gateway had stopped serving. The gateway's own notes (server.go, RA-057)
/// say the fix is to withdraw the helper, not to re-expose the route — so this
/// reads the sources for a request path to any of them.
///
/// Comments may still name a route (to explain why it is gone); only a quoted
/// path — something the client would actually send — counts.
void main() {
  // Route → why it is not a client call.
  const withdrawn = {
    '/v1/payment-requests':
        'not mounted (RA-057): a payment request has no merchant party',
    '/v1/compliance/merchants/verify':
        '403 KYB_DECIDED_BY_REVIEW: a Business cannot verify itself',
  };

  // Not mounted on the GATEWAY's merchant surface — checked in the gateway
  // client only.
  const withdrawnFromGateway = {
    '/v1/consumer-wallets':
        'not mounted (RA-058): a merchant has no authority over a consumer wallet',
    '/v1/qr/pay':
        'not mounted (RA-053): a merchant JWT cannot debit a consumer',
  };

  // The consumer surface (public-api) mounts exactly one QR route: /v1/qr/pay,
  // where the payer is the authenticated consumer (CAP-PAY-003). It does NOT
  // mount decode or get-by-id, and it must not: a consumer has no reason to
  // resolve a code separately from paying it, and a resolution that is not the
  // one the payment verifies against is a second answer to the same question.
  //
  // This used to withdraw every '/v1/qr/' path from the consumer side, when no
  // consumer QR route existed at all. Narrowed rather than deleted — the two
  // routes that are still absent are still guarded.
  const withdrawnFromConsumer = {
    '/v1/qr/decode': 'public-api mounts no consumer QR decode',
    '/v1/qr/{': 'public-api mounts no consumer get-QR-by-id',
  };

  final sources = Directory('lib')
      .listSync(recursive: true)
      .whereType<File>()
      .where((f) => f.path.endsWith('.dart'))
      .toList();
  final gatewayClient = [File('lib/client/banzami_client.dart')];
  // Everything that is not the gateway (merchant) client talks to the
  // public-api: the consumer client and the SDK screens.
  final consumerSide =
      sources.where((f) => !f.path.endsWith('banzami_client.dart')).toList();

  List<String> offenders(List<File> files, String route) {
    final quoted = RegExp('[\'"]${RegExp.escape(route)}');
    final found = <String>[];
    for (final f in files) {
      final lines = f.readAsStringSync().split('\n');
      for (var i = 0; i < lines.length; i++) {
        if (lines[i].trimLeft().startsWith('//')) continue;
        if (quoted.hasMatch(lines[i])) {
          found.add('${f.path}:${i + 1} → ${lines[i].trim()}');
        }
      }
    }
    return found;
  }

  for (final entry in withdrawn.entries) {
    test('no client call to ${entry.key} — ${entry.value}', () {
      expect(offenders(sources, entry.key), isEmpty);
    });
  }
  for (final entry in withdrawnFromConsumer.entries) {
    test('no consumer-side call to ${entry.key} — ${entry.value}', () {
      expect(File('lib/client/consumer_public_client.dart').existsSync(), isTrue);
      expect(offenders(consumerSide, entry.key), isEmpty);
    });
  }
  for (final entry in withdrawnFromGateway.entries) {
    test('BanzamiClient does not call ${entry.key} — ${entry.value}', () {
      expect(gatewayClient.single.existsSync(), isTrue);
      expect(offenders(gatewayClient, entry.key), isEmpty);
    });
  }
}
