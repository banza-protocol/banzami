import 'dart:io';

import 'package:banzami_flutter/banzami_flutter.dart';
import 'package:banzami_mobile/merchant/services/merchant_reauth.dart';
import 'package:banzami_mobile/merchant/services/merchant_session_service.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

// APP-BANZAMI-WEB-DUAL-APP-PARITY-001 — permanent Web regressions.
//
//  1. Web icon tree-shaking: feature icons in the Business Welcome must be const
//     Icon() at their call sites, never a dynamic record→Icon(item.$1) — the
//     latter is invisible to the Web icon tree-shaker (const_finder) and the glyph
//     silently vanishes from the subset font (the missing bar-chart + bell bug).
//  2. Web logout: signOutBusiness must revoke the server-side business_authority
//     even when the browser holds NO client refresh token (the Web sign-out gap
//     that left the opaque session still authorizing Business requests).

void _mockSecureStorage() {
  final store = <String, String>{};
  TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
      .setMockMethodCallHandler(
    const MethodChannel('plugins.it_nomads.com/flutter_secure_storage'),
    (call) async {
      final args = (call.arguments as Map?)?.cast<String, dynamic>() ?? {};
      switch (call.method) {
        case 'write': store[args['key'] as String] = args['value'] as String; return null;
        case 'read': return store[args['key'] as String];
        case 'delete': store.remove(args['key']); return null;
        case 'readAll': return Map<String, String>.from(store);
        case 'containsKey': return store.containsKey(args['key']);
        default: return null;
      }
    },
  );
}

final _future = DateTime.now().add(const Duration(hours: 1));

/// A session WITHOUT a client refresh token (the Web shape: the refresh lives in
/// the BFF, not the browser).
Future<MerchantSessionService> _noRefreshSession() async {
  final svc = MerchantSessionService();
  await svc.createHandleSession(
    merchantId: 'm1', merchantName: 'Loja', merchantEmail: 'e@x',
    walletId: 'w1', jwt: 't', handle: 'loja', environment: 'SANDBOX',
    pin: '123456', jwtExpiresAt: _future, // no refreshToken → null
  );
  return svc;
}

({BanzamiClient client, List<String> logoutBodies}) _recordingClient() {
  final bodies = <String>[];
  final client = BanzamiClient(
    jwt: 't', jwtExpiresAt: _future, baseUrl: 'https://api.test', maxRetries: 0,
    httpClient: MockClient((req) async {
      if (req.url.path.endsWith('/v1/merchant/auth/logout')) {
        bodies.add(req.body);
        return http.Response('{}', 200);
      }
      if (req.url.path.endsWith('/auth/token')) return http.Response('{"token":"t"}', 200);
      return http.Response('{}', 200);
    }),
  );
  return (client: client, logoutBodies: bodies);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('Web icon tree-shaking guard (Business Welcome)', () {
    final src = File('lib/merchant/screens/onboarding/welcome_screen.dart').readAsStringSync();
    test('the three feature icons are const Icon() at the call site', () {
      expect(src.contains('const Icon(Icons.qr_code_rounded'), isTrue);
      expect(src.contains('const Icon(Icons.bar_chart_rounded'), isTrue);
      expect(src.contains('const Icon(Icons.notifications_rounded'), isTrue);
    });
    test('no dynamic record→Icon(item.\$1) pattern (tree-shaking hazard)', () {
      expect(src.contains(r'Icon(item.$1'), isFalse);
    });
  });

  group('Web Business logout revokes BFF authority with no client refresh token', () {
    setUp(_mockSecureStorage);

    test('isWeb=true + null refresh → the BFF logout IS called', () async {
      final r = _recordingClient();
      final svc = await _noRefreshSession();
      expect(svc.session?.refreshToken, isNull, reason: 'Web shape holds no client refresh');
      await signOutBusiness(client: r.client, session: svc, isWeb: true);
      expect(r.logoutBodies.length, 1,
          reason: 'Web logout must clear server-side business_authority via the BFF');
    });

    test('isWeb=false + null refresh → NO BFF logout (native behaviour unchanged)', () async {
      final r = _recordingClient();
      final svc = await _noRefreshSession();
      await signOutBusiness(client: r.client, session: svc, isWeb: false);
      expect(r.logoutBodies, isEmpty,
          reason: 'native with no refresh token has nothing to revoke');
    });
  });
}
