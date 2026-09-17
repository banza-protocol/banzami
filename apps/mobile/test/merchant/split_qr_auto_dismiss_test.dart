import 'dart:convert';

import 'package:banzami_flutter/banzami_flutter.dart';
import 'package:banzami_mobile/merchant/screens/split_track_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';

// COLLECTIONS-PROTOCOL-AND-PRODUCT-001 §7/§8 — a share's QR bottom sheet must
// auto-dismiss once the poller sees THAT share paid, must not close another
// person's sheet, and a manual close must leave the tracker safe (no double pop).

const _now = '2026-09-17T09:00:00Z';

class _State {
  final Map<String, String> shares = {'s1': 'PENDING', 's2': 'PENDING'};
  String collStatus = 'PARTIALLY_COMPLETED';
}

Map<String, dynamic> _shareJson(String id, int amount, String status) => {
      'id': id, 'collection_id': 'c1', 'merchant_id': 'm1', 'amount_minor': amount,
      'currency': 'AOA', 'status': status, 'created_at': _now, 'updated_at': _now,
      if (status != 'PENDING') 'payment_intent_id': 'pi-$id',
    };

BanzamiClient _client(_State st) => BanzamiClient(
      jwt: 't', jwtExpiresAt: DateTime.now().add(const Duration(hours: 1)),
      baseUrl: 'https://api.test', maxRetries: 0,
      httpClient: MockClient((req) async {
        final p = req.url.path;
        if (p.endsWith('/auth/token')) return http.Response('{"token":"t"}', 200);
        // Surface a share as a payment link.
        final m = RegExp(r'/v1/collection-shares/(s\d)/surface').firstMatch(p);
        if (m != null) {
          final id = m.group(1)!;
          return http.Response(jsonEncode({
            'payment_intent': {'id': 'pi-$id', 'surface': 'LINK', 'surface_ref': 'pl-$id'},
            'share': _shareJson(id, 226, 'LINK_CREATED'),
          }), 200);
        }
        if (p.startsWith('/v1/payment-links/')) {
          final id = p.split('/').last;
          return http.Response(jsonEncode({
            'id': id, 'slug': 'SLUG${id.toUpperCase()}', 'currency': 'AOA', 'status': 'ACTIVE',
            'created_at': _now, 'updated_at': _now,
          }), 200);
        }
        if (p.endsWith('/v1/collections/c1/shares')) {
          final data = st.shares.entries.map((e) => _shareJson(e.key, 226, e.value)).toList();
          return http.Response(jsonEncode({'data': data}), 200);
        }
        if (p.endsWith('/v1/collections/c1')) {
          final paid = st.shares.values.where((s) => s == 'PAID').length * 226;
          return http.Response(jsonEncode({
            'collection': {
              'id': 'c1', 'merchant_id': 'm1', 'wallet_id': 'w1', 'title': 'Jantar',
              'currency': 'AOA', 'total_amount_minor': 452, 'status': st.collStatus,
              'rule': {'type': 'FIXED_AMOUNTS'}, 'environment': 'SANDBOX',
              'created_at': _now, 'updated_at': _now,
            },
            'collected_amount_minor': paid,
            'remaining_amount_minor': 452 - paid,
          }), 200);
        }
        return http.Response('{}', 200);
      }),
    );

Future<void> _open(WidgetTester t, _State st) async {
  t.view.physicalSize = const Size(430, 1400);
  t.view.devicePixelRatio = 1.0;
  addTearDown(t.view.resetPhysicalSize);
  addTearDown(t.view.resetDevicePixelRatio);
  await t.pumpWidget(MaterialApp(
    theme: ThemeData(useMaterial3: true, fontFamily: 'Inter'),
    home: Provider<BanzamiClient>.value(
      value: _client(st),
      child: const SplitTrackScreen(collectionId: 'c1'),
    ),
  ));
  await t.pumpAndSettle();
}

Future<void> _openSheetFor(WidgetTester t, String pessoa) async {
  await t.tap(find.text(pessoa));
  await t.pumpAndSettle();
}

void main() {
  testWidgets('QR sheet auto-dismisses when that person pays (+ "pagou" toast)', (t) async {
    final st = _State();
    await _open(t, st);
    await _openSheetFor(t, 'Pessoa 1');
    // Sheet is open: the QR actions are visible.
    expect(find.text('Copiar'), findsOneWidget);

    // The poller now sees Pessoa 1 as PAID.
    st.shares['s1'] = 'PAID';
    await t.pump(const Duration(seconds: 4)); // fire the periodic poll
    for (var i = 0; i < 8; i++) { await t.pump(const Duration(milliseconds: 200)); }

    expect(find.text('Copiar'), findsNothing, reason: 'the QR sheet auto-closed');
    expect(find.textContaining('pagou'), findsWidgets, reason: 'confirmation toast shown');
    await t.pumpWidget(const SizedBox()); // dispose (cancel poll + overlays)
  });

  testWidgets('another person\'s sheet is NOT closed when a different share pays', (t) async {
    final st = _State();
    await _open(t, st);
    await _openSheetFor(t, 'Pessoa 1');
    expect(find.text('Copiar'), findsOneWidget);

    // A DIFFERENT person (s2) pays; Pessoa 1's sheet must stay open.
    st.shares['s2'] = 'PAID';
    await t.pump(const Duration(seconds: 4));
    for (var i = 0; i < 6; i++) { await t.pump(const Duration(milliseconds: 200)); }

    expect(find.text('Copiar'), findsOneWidget, reason: 'Pessoa 1 sheet stays open');
    await t.pumpWidget(const SizedBox());
  });

  testWidgets('manual close then a paid poll is race-safe (no double pop / exception)', (t) async {
    final st = _State();
    await _open(t, st);
    await _openSheetFor(t, 'Pessoa 1');
    expect(find.text('Copiar'), findsOneWidget);

    // Manually dismiss the sheet (tap the scrim above it).
    await t.tapAt(const Offset(10, 10));
    await t.pumpAndSettle();
    expect(find.text('Copiar'), findsNothing);

    // Now the poll observes that same share paid — must be a no-op, not a crash.
    st.shares['s1'] = 'PAID';
    await t.pump(const Duration(seconds: 4));
    for (var i = 0; i < 6; i++) { await t.pump(const Duration(milliseconds: 200)); }

    expect(t.takeException(), isNull, reason: 'no double Navigator.pop / stale-route exception');
    await t.pumpWidget(const SizedBox());
  });
}
