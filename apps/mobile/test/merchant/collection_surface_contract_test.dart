import 'dart:io';
import 'package:flutter_test/flutter_test.dart';

// COLLECTIONS-PROTOCOL-AND-PRODUCT-001 §15 — surface contract regression.
//
// Canonical (ADR-015/016): a Collection share's `surface_ref` is the Payment Link
// **ID** (the internal settlement identity the settlement hook resolves by). The
// payer-visible **slug** is obtained in a SECOND step via GET /v1/payment-links/{id}.
// The two are deliberately separate; nobody may treat surface_ref as the slug.
String _read(String p) => File(p).readAsStringSync();

void main() {
  final track = _read('lib/merchant/screens/split_track_screen.dart');

  group('Collection surface → public payment link (surface_ref = ID, not slug)', () {
    test('resolves the slug via a second GET on the payment-link id', () {
      // Surface the share, take its surface_ref (the link id)…
      expect(track.contains('surfaceCollectionShare'), isTrue);
      expect(track.contains('.surfaceRef'), isTrue);
      // …then resolve the payment link BY THAT ID to get the payer-safe slug.
      expect(track.contains('getPaymentLink(ref)'), isTrue,
          reason: 'the slug must come from GET /v1/payment-links/{id}, not surface_ref');
      expect(track.contains('link.slug'), isTrue,
          reason: 'the payer URL is built from the resolved slug');
    });

    test('surface_ref is NEVER used directly as the public slug/URL', () {
      // The pay URL must be built from link.slug, never from the raw surface_ref.
      expect(track.contains(r'payBaseUrl}/${ref}'), isFalse);
      expect(track.contains(r'payBaseUrl}/$ref'), isFalse);
      expect(track.contains(r'payBaseUrl}/${surfaced.surfaceRef}'), isFalse);
      expect(track.contains(r'/${surfaceRef}'), isFalse);
    });
  });
}
