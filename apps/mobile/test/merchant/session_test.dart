import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:banzami_mobile/merchant/services/merchant_session_service.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final store = <String, String>{};

  setUp(() {
    store.clear();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(
      const MethodChannel('plugins.it_nomads.com/flutter_secure_storage'),
      (call) async {
        final args = (call.arguments as Map?)?.cast<String, dynamic>() ?? {};
        switch (call.method) {
          case 'write':
            store[args['key'] as String] = args['value'] as String;
            return null;
          case 'read':
            return store[args['key'] as String];
          case 'delete':
            store.remove(args['key']);
            return null;
          case 'deleteAll':
            store.clear();
            return null;
          case 'readAll':
            return Map<String, String>.from(store);
          case 'containsKey':
            return store.containsKey(args['key']);
          default:
            return null;
        }
      },
    );
  });

  group('MerchantSession model', () {
    test('apiKey session: authIdentity = apiKey, sandbox from environment', () {
      const s = MerchantSession(
        merchantId: 'm', merchantName: 'n', merchantEmail: 'e', walletId: 'w',
        loginMethod: MerchantLoginMethod.apiKey, environment: 'SANDBOX', apiKey: 'bz_test_x',
      );
      expect(s.isSandbox, isTrue);
      expect(s.isHandleLogin, isFalse);
      expect(s.authIdentity, 'bz_test_x');
    });

    test('handle session: authIdentity = jwt', () {
      final s = MerchantSession(
        merchantId: 'm', merchantName: 'n', merchantEmail: 'e', walletId: 'w',
        loginMethod: MerchantLoginMethod.handlePin, environment: 'SANDBOX',
        jwt: 'jwt.x', jwtExpiresAt: DateTime(2026), handle: 'doa_sandbox',
      );
      expect(s.isHandleLogin, isTrue);
      expect(s.authIdentity, 'jwt.x');
      expect(s.handle, 'doa_sandbox');
    });
  });

  group('MerchantSessionService — unified persistence', () {
    test('API-key login persists and restores as an apiKey session', () async {
      final a = MerchantSessionService();
      await a.createSession(
        merchantId: 'm1', merchantName: 'Doa', merchantEmail: 'e', walletId: 'w1',
        apiKey: 'bz_test_abc', pin: '1234', verified: true,
      );
      expect(a.session!.loginMethod, MerchantLoginMethod.apiKey);
      expect(a.isLocked, isFalse);

      final b = MerchantSessionService();
      await b.initialize();
      expect(b.hasSession, isTrue);
      expect(b.session!.loginMethod, MerchantLoginMethod.apiKey);
      expect(b.session!.apiKey, 'bz_test_abc');
      expect(b.session!.isSandbox, isTrue);
      expect(b.session!.jwt, isNull);
    });

    test('handle login persists and restores as a handle session', () async {
      final a = MerchantSessionService();
      await a.createHandleSession(
        merchantId: 'm1', merchantName: 'Doa', merchantEmail: 'e', walletId: 'w1',
        jwt: 'jwt.abc', jwtExpiresAt: DateTime(2026, 6, 26), handle: 'doa_sandbox',
        environment: 'SANDBOX', pin: '1234',
        refreshToken: 'rt.abc', refreshExpiresAt: DateTime.now().add(const Duration(days: 30)),
      );
      final b = MerchantSessionService();
      await b.initialize();
      expect(b.session!.loginMethod, MerchantLoginMethod.handlePin);
      expect(b.session!.jwt, 'jwt.abc');
      expect(b.session!.refreshToken, 'rt.abc');
      expect(b.session!.canRenew, isTrue,
          reason: 'an expired access token with a live refresh token renews');
      expect(b.session!.handle, 'doa_sandbox');
      expect(b.session!.apiKey, isNull);
      expect(b.session!.authIdentity, 'jwt.abc');
    });

    test('the client key survives an access-token renewal', () {
      final s = MerchantSession(
        merchantId: 'm', merchantName: 'n', merchantEmail: 'e', walletId: 'w',
        loginMethod: MerchantLoginMethod.handlePin, environment: 'SANDBOX',
        jwt: 'jwt.1', jwtExpiresAt: DateTime(2026), refreshToken: 'r1', handle: 'h',
      );
      final renewed = s.copyWith(jwt: 'jwt.2', refreshToken: 'r2');
      expect(renewed.clientKey, s.clientKey);
      expect(renewed.refreshToken, 'r2');
    });

    test('switching modes clears the previous credential', () async {
      final a = MerchantSessionService();
      await a.createSession(
        merchantId: 'm1', merchantName: 'D', merchantEmail: 'e', walletId: 'w',
        apiKey: 'bz_live_k', pin: '1234',
      );
      await a.createHandleSession(
        merchantId: 'm1', merchantName: 'D', merchantEmail: 'e', walletId: 'w',
        jwt: 'jwt.z', jwtExpiresAt: DateTime(2026), handle: 'cantina', environment: 'LIVE', pin: '1234',
        refreshToken: 'rt.z', refreshExpiresAt: DateTime.now().add(const Duration(days: 30)),
      );
      final b = MerchantSessionService();
      await b.initialize();
      expect(b.session!.loginMethod, MerchantLoginMethod.handlePin);
      expect(b.session!.apiKey, isNull); // api key cleared
      expect(b.session!.jwt, 'jwt.z');
    });

    test('verifyPin + biometrics toggle + clearAccount wipes storage', () async {
      final a = MerchantSessionService();
      await a.createSession(
        merchantId: 'm1', merchantName: 'D', merchantEmail: 'e', walletId: 'w',
        apiKey: 'bz_test_k', pin: '4321',
      );
      expect(await a.verifyPin('4321'), isTrue);
      expect(await a.verifyPin('0000'), isFalse);
      await a.enableBiometrics();
      expect(a.session!.biometricsEnabled, isTrue);

      await a.clearAccount();
      expect(a.hasSession, isFalse);
      final b = MerchantSessionService();
      await b.initialize();
      expect(b.hasSession, isFalse);
    });

    test('backward compat: legacy api-key session (no login_method) restores fine', () async {
      store['merchant_id'] = 'm1';
      store['merchant_name'] = 'D';
      store['merchant_email'] = 'e';
      store['merchant_wallet_id'] = 'w';
      store['merchant_api_key'] = 'bz_test_legacy';
      store['merchant_pin_hash'] = 'x';
      store['merchant_verified'] = 'true';

      final b = MerchantSessionService();
      await b.initialize();
      expect(b.hasSession, isTrue);
      expect(b.session!.loginMethod, MerchantLoginMethod.apiKey);
      expect(b.session!.isSandbox, isTrue); // derived from bz_test prefix
    });
  });
}
