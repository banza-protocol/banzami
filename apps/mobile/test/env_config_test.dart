import 'package:flutter_test/flutter_test.dart';
import 'package:banzami_mobile/config.dart';

/// Guards the environment-mismatch logic that blocks a misconfigured build at
/// launch ("Configuração inválida"). Classification is by EXACT API host —
/// never by the ".com" suffix — so sandbox-api.banzami.com is sandbox and
/// api.banzami.com is production. This regressed once (the old check looked for
/// 'staging'), so these tests lock the rule.
void main() {
  group('apiHostIsSandbox — classify API host by environment', () {
    test('sandbox-api.banzami.com → sandbox (true)', () {
      expect(AppConfig.apiHostIsSandbox('https://sandbox-api.banzami.com'), isTrue);
    });

    test('api.banzami.com → production (false)', () {
      expect(AppConfig.apiHostIsSandbox('https://api.banzami.com'), isFalse);
    });

    test('pay.banzami.com does NOT classify (null) — .com alone is not production', () {
      expect(AppConfig.apiHostIsSandbox('https://pay.banzami.com'), isNull);
    });

    test('unknown / local host → null (does not block dev)', () {
      expect(AppConfig.apiHostIsSandbox('http://localhost:8083'), isNull);
      expect(AppConfig.apiHostIsSandbox(''), isNull);
    });

    test('path/query do not affect host classification', () {
      expect(AppConfig.apiHostIsSandbox('https://sandbox-api.banzami.com/v1/x?y=1'), isTrue);
      expect(AppConfig.apiHostIsSandbox('https://api.banzami.com/v1/x'), isFalse);
    });

    test('legacy .org host is NOT recognised (no longer a payment/runtime host)', () {
      expect(AppConfig.apiHostIsSandbox('https://sandbox-api.banzami.org'), isNull);
      expect(AppConfig.apiHostIsSandbox('https://staging.banzami.org'), isNull);
    });
  });

  group('isEnvMismatch — build env vs API host', () {
    test('sandbox build + sandbox-api.banzami.com → valid (no block)', () {
      expect(
        AppConfig.isEnvMismatch(buildIsSandbox: true, apiUrl: 'https://sandbox-api.banzami.com'),
        isFalse,
      );
    });

    test('sandbox build + api.banzami.com → BLOCKED', () {
      expect(
        AppConfig.isEnvMismatch(buildIsSandbox: true, apiUrl: 'https://api.banzami.com'),
        isTrue,
      );
    });

    test('live build + sandbox-api.banzami.com → BLOCKED', () {
      expect(
        AppConfig.isEnvMismatch(buildIsSandbox: false, apiUrl: 'https://sandbox-api.banzami.com'),
        isTrue,
      );
    });

    test('live build + api.banzami.com → valid (no block)', () {
      expect(
        AppConfig.isEnvMismatch(buildIsSandbox: false, apiUrl: 'https://api.banzami.com'),
        isFalse,
      );
    });

    test('unrecognised host never blocks (sandbox or live build)', () {
      expect(AppConfig.isEnvMismatch(buildIsSandbox: true,  apiUrl: 'http://localhost:8083'), isFalse);
      expect(AppConfig.isEnvMismatch(buildIsSandbox: false, apiUrl: 'http://localhost:8083'), isFalse);
    });
  });
}
