import 'dart:convert';

import 'package:banzami_flutter/banzami_flutter.dart';
import 'package:banzami_mobile/merchant/screens/split_track_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';

const _now = '2026-09-11T09:00:00Z';

Map<String, dynamic> _collection(String status) => {
      'id': 'c1', 'merchant_id': 'm1', 'wallet_id': 'w1', 'title': 'Jantar',
      'currency': 'AOA', 'total_amount_minor': 200000, 'status': status,
      'rule': {'type': 'FIXED_AMOUNTS'}, 'environment': 'SANDBOX',
      'created_at': _now, 'updated_at': _now,
    };

Map<String, dynamic> _share(String id, String status) => {
      'id': id, 'collection_id': 'c1', 'amount_minor': 100000, 'currency': 'AOA',
      'status': status, 'created_at': _now, 'updated_at': _now,
      if (status != 'PENDING') 'payment_intent_id': 'pi-$id',
    };

CollectionShare _s(String status) => CollectionShare.fromJson(_share('s', status));

void main() {
  group('CollectionShare status (core ShareStatus)', () {
    test('LINK_CREATED and unknown statuses still await payment', () {
      expect(_s('PENDING').isAwaitingPayment, isTrue);
      expect(_s('LINK_CREATED').isAwaitingPayment, isTrue);
      expect(_s('SOMETHING_NEW').isAwaitingPayment, isTrue);
      for (final ended in ['PAID', 'EXPIRED', 'CANCELLED', 'FAILED']) {
        expect(_s(ended).isAwaitingPayment, isFalse, reason: ended);
      }
      expect(_s('LINK_CREATED').isPending, isFalse, reason: 'cannot be surfaced twice');
    });

    test('row labels', () {
      expect(ShareRow.stateLabel(_s('LINK_CREATED')), 'A aguardar pagamento');
      expect(ShareRow.stateLabel(_s('PAID')), 'Pago');
      expect(ShareRow.stateLabel(_s('EXPIRED')), 'Expirada');
    });
  });

  testWidgets('a share stays tappable after the poll reports LINK_CREATED', (t) async {
    var surfaced = false;
    final client = BanzamiClient(
      apiKey: 'bz_test_key',
      baseUrl: 'https://api.test',
      httpClient: MockClient((req) async {
        final p = req.url.path;
        Object body;
        if (p.endsWith('/auth/token')) {
          body = {'token': 't', 'expires_at': DateTime.now().add(const Duration(hours: 1)).toIso8601String()};
        } else if (p == '/v1/collections/c1') {
          body = {'collection': _collection('OPEN'), 'collected_amount_minor': 0, 'remaining_amount_minor': 200000};
        } else if (p == '/v1/collections/c1/shares') {
          body = {'data': [_share('s1', surfaced ? 'LINK_CREATED' : 'PENDING')]};
        } else if (p == '/v1/collection-shares/s1/surface') {
          surfaced = true;
          body = {
            'payment_intent': {'id': 'pi-s1', 'surface': 'LINK', 'surface_ref': 'pl-1'},
            'share': _share('s1', 'LINK_CREATED'),
          };
        } else if (p == '/v1/payment-links/pl-1') {
          body = {
            'id': 'pl-1', 'slug': 'abc123', 'merchant_id': 'm1', 'wallet_id': 'w1',
            'amount_minor': 100000, 'currency': 'AOA', 'status': 'ACTIVE',
            'created_at': _now, 'updated_at': _now,
          };
        } else {
          return http.Response('{"code":"NOT_FOUND"}', 404);
        }
        return http.Response(jsonEncode(body), 200);
      }),
    );

    await t.binding.setSurfaceSize(const Size(430, 1400));
    addTearDown(() => t.binding.setSurfaceSize(null));
    await t.pumpWidget(Provider<BanzamiClient>.value(
      value: client,
      child: const MaterialApp(home: SplitTrackScreen(collectionId: 'c1')),
    ));
    await t.pumpAndSettle();
    await t.pump(const Duration(seconds: 5)); // one poll: the share is now LINK_CREATED
    await t.pumpAndSettle();
    expect(surfaced, isTrue);

    await t.tap(find.text('Pessoa 1'));
    await t.pumpAndSettle();
    expect(find.text('Copiar'), findsOneWidget, reason: 'the share sheet opens');

    // Leave: stop the poll timer.
    await t.pumpWidget(const SizedBox());
  });
}
