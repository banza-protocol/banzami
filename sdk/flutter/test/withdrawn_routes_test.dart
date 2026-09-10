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

  final sources = Directory('lib')
      .listSync(recursive: true)
      .whereType<File>()
      .where((f) => f.path.endsWith('.dart'))
      .toList();

  for (final entry in withdrawn.entries) {
    test('no client call to ${entry.key} — ${entry.value}', () {
      final quoted = RegExp('[\'"]${RegExp.escape(entry.key)}');
      final offenders = <String>[];
      for (final f in sources) {
        final lines = f.readAsStringSync().split('\n');
        for (var i = 0; i < lines.length; i++) {
          if (lines[i].trimLeft().startsWith('//')) continue;
          if (quoted.hasMatch(lines[i])) {
            offenders.add('${f.path}:${i + 1} → ${lines[i].trim()}');
          }
        }
      }
      expect(offenders, isEmpty);
    });
  }
}
