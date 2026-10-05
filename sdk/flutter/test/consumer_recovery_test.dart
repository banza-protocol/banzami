import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:banzami_flutter/banzami_flutter.dart';

// The consumer verified-email + PIN-recovery SDK methods: right path + body, the
// opaque tokens read back, and the re-minted session installed on change-PIN.

ConsumerPublicClient _client(
  void Function(http.Request) capture,
  Map<String, dynamic> response, {
  int status = 200,
  String? token,
}) {
  final c = ConsumerPublicClient(
    baseUrl: 'https://api.banzami.com',
    httpClient: MockClient((req) async {
      capture(req);
      return http.Response(jsonEncode(response), status,
          headers: {'content-type': 'application/json'});
    }),
  );
  if (token != null) c.setToken(token);
  return c;
}

void main() {
  test('requestEmailOtp POSTs the email to /v1/auth/email/otp', () async {
    http.Request? req;
    final c = _client((r) => req = r, {'status': 'sent'});
    await c.requestEmailOtp(email: 'a@b.co');
    expect(req!.url.path, '/v1/auth/email/otp');
    expect(jsonDecode(req!.body), {'email': 'a@b.co'});
  });

  test('verifyEmailOtp returns the opaque verification token', () async {
    http.Request? req;
    final c = _client((r) => req = r, {
      'status': 'verified',
      'email_verification_token': 'grant_abc',
    });
    final tok = await c.verifyEmailOtp(email: 'a@b.co', code: '123456');
    expect(req!.url.path, '/v1/auth/email/verify');
    expect(jsonDecode(req!.body), {'email': 'a@b.co', 'code': '123456'});
    expect(tok, 'grant_abc');
  });

  test('changePin POSTs current+new with an Idempotency-Key and installs the new token', () async {
    http.Request? req;
    final c = _client((r) => req = r, {'status': 'changed', 'token': 'new.jwt'},
        token: 'old.jwt');
    await c.changePin(currentPin: '1234', newPin: '5678');
    expect(req!.url.path, '/v1/me/pin');
    expect(jsonDecode(req!.body), {'current_pin': '1234', 'new_pin': '5678'});
    expect(req!.headers['Idempotency-Key'], isNotNull);
    expect(req!.headers['Authorization'], 'Bearer old.jwt');
    // The re-minted session replaces the old token locally.
    expect(c.token, 'new.jwt');
  });

  test('changePin surfaces a wrong current PIN as 403', () async {
    final c = _client((_) {}, {
      'error': {'code': 'REAUTH_REQUIRED', 'message': 'current PIN is incorrect'}
    }, status: 403, token: 'old.jwt');
    expect(
      () => c.changePin(currentPin: '0000', newPin: '5678'),
      throwsA(isA<BanzamiApiException>().having((e) => e.statusCode, 'statusCode', 403)),
    );
  });

  test('requestPinReset POSTs the handle (no throw on unknown handle)', () async {
    http.Request? req;
    final c = _client((r) => req = r, {'status': 'ok', 'message': 'generic'});
    await c.requestPinReset(handle: 'someone');
    expect(req!.url.path, '/v1/auth/pin-reset/request');
    expect(jsonDecode(req!.body), {'handle': 'someone'});
  });

  test('verifyPinReset returns the opaque reset token', () async {
    http.Request? req;
    final c = _client((r) => req = r, {'status': 'verified', 'reset_token': 'reset_xyz'});
    final tok = await c.verifyPinReset(handle: 'someone', code: '123456');
    expect(req!.url.path, '/v1/auth/pin-reset/verify');
    expect(tok, 'reset_xyz');
  });

  test('confirmPinReset POSTs the reset token + new PIN', () async {
    http.Request? req;
    final c = _client((r) => req = r, {'status': 'reset'});
    await c.confirmPinReset(resetToken: 'reset_xyz', newPin: '5678');
    expect(req!.url.path, '/v1/auth/pin-reset/confirm');
    expect(jsonDecode(req!.body), {'reset_token': 'reset_xyz', 'new_pin': '5678'});
  });

  test('recoveryEmailStatus parses has_email + masked (authenticated)', () async {
    http.Request? req;
    final c = _client((r) => req = r, {'has_email': true, 'email_masked': 'f***@x.co'},
        token: 'jwt');
    final s = await c.recoveryEmailStatus();
    expect(req!.url.path, '/v1/me/recovery-email');
    expect(req!.headers['Authorization'], 'Bearer jwt');
    expect(s.hasEmail, isTrue);
    expect(s.emailMasked, 'f***@x.co');
  });

  test('requestRecoveryEmailOtp POSTs the email (authenticated)', () async {
    http.Request? req;
    final c = _client((r) => req = r, {'status': 'sent'}, token: 'jwt');
    await c.requestRecoveryEmailOtp(email: 'ana@b.co');
    expect(req!.url.path, '/v1/me/recovery-email/otp');
    expect(req!.headers['Authorization'], 'Bearer jwt');
    expect(jsonDecode(req!.body), {'email': 'ana@b.co'});
  });

  test('verifyRecoveryEmailOtp returns the masked email', () async {
    http.Request? req;
    final c = _client((r) => req = r, {'status': 'verified', 'email_masked': 'a***@b.co'},
        token: 'jwt');
    final masked = await c.verifyRecoveryEmailOtp(email: 'ana@b.co', code: '123456');
    expect(req!.url.path, '/v1/me/recovery-email/verify');
    expect(jsonDecode(req!.body), {'email': 'ana@b.co', 'code': '123456'});
    expect(masked, 'a***@b.co');
  });

  test('register forwards the email + verification token when given', () async {
    http.Request? firstBody;
    var n = 0;
    final c = ConsumerPublicClient(
      baseUrl: 'https://api.banzami.com',
      httpClient: MockClient((req) async {
        n++;
        if (n == 1) {
          firstBody = req;
          return http.Response(
              jsonEncode({
                'consumer': {
                  'id': 'c1',
                  'handle': 'ana',
                  'display_name': 'Ana',
                  'status': 'ACTIVE',
                  'created_at': DateTime.now().toUtc().toIso8601String(),
                  'updated_at': DateTime.now().toUtc().toIso8601String(),
                },
                'token': 'jwt',
              }),
              201,
              headers: {'content-type': 'application/json'});
        }
        return http.Response(jsonEncode({'id': 'w1'}), 200,
            headers: {'content-type': 'application/json'});
      }),
    );
    await c.register(
      handle: 'ana',
      displayName: 'Ana',
      pin: '1234',
      email: 'ana@b.co',
      emailVerificationToken: 'grant_abc',
    );
    final body = jsonDecode(firstBody!.body) as Map<String, dynamic>;
    expect(body['email'], 'ana@b.co');
    expect(body['email_verification_token'], 'grant_abc');
  });
}
