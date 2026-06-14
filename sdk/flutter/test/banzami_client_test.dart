import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:banzami_flutter/banzami_flutter.dart';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const _baseUrl = 'https://api.banzami.org';
const _apiKey  = 'bz_test_key';

/// JWT response the mock returns when /v1/auth/token is called.
final _jwtBody = jsonEncode({
  'token':      'test.jwt.token',
  'expires_at': DateTime.now().add(const Duration(hours: 24)).toIso8601String(),
});

/// Builds a [BanzamiClient] whose HTTP transport is a [MockClient] that:
///   1. Returns a valid JWT for the first call to /v1/auth/token.
///   2. Returns [body] with [status] for every subsequent request.
BanzamiClient _makeClient(
  int status,
  Map<String, dynamic> body,
) {
  var callCount = 0;
  return BanzamiClient(
    apiKey:     _apiKey,
    baseUrl:    _baseUrl,
    httpClient: MockClient((request) async {
      callCount++;
      // First call is always the JWT exchange — return a valid token.
      if (callCount == 1 && request.url.path.endsWith('/v1/auth/token')) {
        return http.Response(_jwtBody, 200,
            headers: {'content-type': 'application/json'});
      }
      return http.Response(jsonEncode(body), status,
          headers: {'content-type': 'application/json'});
    }),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

void main() {
  group('BanzamiClient.getMerchant', () {
    test('happy path — returns correct merchant fields', () async {
      final now = DateTime.now().toUtc();
      final client = _makeClient(200, {
        'id':         'merch-001',
        'name':       'Loja ABC',
        'email':      'loja@abc.ao',
        'status':     'ACTIVE',
        'created_at': now.toIso8601String(),
        'updated_at': now.toIso8601String(),
      });

      final merchant = await client.getMerchant('merch-001');

      expect(merchant.id,    equals('merch-001'));
      expect(merchant.name,  equals('Loja ABC'));
      expect(merchant.email, equals('loja@abc.ao'));
      expect(merchant.status, equals('ACTIVE'));
      expect(merchant.isActive, isTrue);
    });

    test('401 — throws BanzamiApiException with statusCode 401', () async {
      // JWT exchange succeeds; the merchant GET returns 401.
      final client = _makeClient(
        401,
        {'code': 'UNAUTHORIZED', 'message': 'Invalid token'},
      );

      await expectLater(
        () => client.getMerchant('merch-001'),
        throwsA(
          isA<BanzamiApiException>().having((e) => e.statusCode, 'statusCode', 401),
        ),
      );
    });

    test('422 — throws BanzamiApiException with statusCode 422', () async {
      // JWT exchange succeeds; the merchant GET returns 422.
      final client = _makeClient(422, {
        'code':    'VALIDATION_ERROR',
        'message': 'id must be a UUID',
      });

      await expectLater(
        () => client.getMerchant('not-a-uuid'),
        throwsA(
          isA<BanzamiApiException>()
              .having((e) => e.statusCode, 'statusCode', 422)
              .having((e) => e.isUnprocessable, 'isUnprocessable', isTrue),
        ),
      );
    });
  });

  group('BanzamiClient.getMerchantBalance', () {
    test('happy path — returns correct balance fields', () async {
      final now    = DateTime.now().toUtc();
      final client = _makeClient(200, {
        'wallet_id':       'wal-001',
        'currency':        'AOA',
        'available_minor': 1000000,
        'reserved_minor':  50000,
        'total_minor':     1050000,
        'computed_at':     now.toIso8601String(),
      });

      final balance = await client.getMerchantBalance('wal-001');

      expect(balance.walletId,        equals('wal-001'));
      expect(balance.currency,        equals('AOA'));
      expect(balance.availableMinor,  equals(1000000));
      expect(balance.reservedMinor,   equals(50000));
      expect(balance.totalMinor,      equals(1050000));
    });
  });

  group('BanzamiClient.listMerchantTransactions', () {
    test('happy path — returns list with pagination', () async {
      final now    = DateTime.now().toUtc();
      final client = _makeClient(200, {
        'data': [
          {
            'id':           'tx-001',
            'status':       'COMPLETED',
            'amount_minor': 50000,
            'currency':     'AOA',
            'merchant_id':  'merch-001',
            'description':  'Pagamento de teste',
            'created_at':   now.toIso8601String(),
          },
          {
            'id':           'tx-002',
            'status':       'PAID',
            'amount_minor': 25000,
            'currency':     'AOA',
            'merchant_id':  'merch-001',
            'description':  null,
            'created_at':   now.toIso8601String(),
          },
        ],
        'next_cursor': 'cursor-abc',
        'has_more':    true,
      });

      final page = await client.listMerchantTransactions(limit: 2);

      expect(page.data.length,       equals(2));
      expect(page.hasMore,           isTrue);
      expect(page.nextCursor,        equals('cursor-abc'));
      expect(page.data[0].id,        equals('tx-001'));
      expect(page.data[0].isCompleted, isTrue);
      expect(page.data[1].id,        equals('tx-002'));
      expect(page.data[1].description, isNull);
    });

    test('empty list — returns page with no items', () async {
      final client = _makeClient(200, {
        'data':        [],
        'next_cursor': null,
        'has_more':    false,
      });

      final page = await client.listMerchantTransactions();

      expect(page.data,    isEmpty);
      expect(page.hasMore, isFalse);
    });
  });

  group('BanzamiClient.createPaymentLink', () {
    test('happy path — returns PaymentLink with correct fields', () async {
      final now    = DateTime.now().toUtc();
      final client = _makeClient(200, {
        'id':          'link-001',
        'slug':        'abc123def456',
        'merchant_id': 'merch-001',
        'wallet_id':   'wal-001',
        'amount_minor': 50000,
        'currency':    'AOA',
        'description': 'Jantar',
        'status':      'ACTIVE',
        'expires_at':  null,
        'paid_at':     null,
        'created_at':  now.toIso8601String(),
        'updated_at':  now.toIso8601String(),
      });

      final link = await client.createPaymentLink(
        merchantId:  'merch-001',
        walletId:    'wal-001',
        amountMinor: 50000,
        description: 'Jantar',
      );

      expect(link.id,          equals('link-001'));
      expect(link.slug,        equals('abc123def456'));
      expect(link.amountMinor, equals(50000));
      expect(link.status,      equals(PaymentLinkStatus.active));
      expect(link.description, equals('Jantar'));
    });

    test('401 — throws BanzamiApiException', () async {
      // JWT exchange succeeds; the payment link POST returns 401.
      final client = _makeClient(
        401,
        {'code': 'UNAUTHORIZED', 'message': 'Invalid token'},
      );

      await expectLater(
        () => client.createPaymentLink(
          merchantId: 'merch-001',
          walletId:   'wal-001',
        ),
        throwsA(isA<BanzamiApiException>()),
      );
    });

    test('422 — throws BanzamiApiException with correct code', () async {
      final client = _makeClient(422, {
        'code':    'WALLET_NOT_FOUND',
        'message': 'Wallet does not exist',
      });

      await expectLater(
        () => client.createPaymentLink(
          merchantId: 'merch-001',
          walletId:   'wal-does-not-exist',
        ),
        throwsA(
          isA<BanzamiApiException>()
              .having((e) => e.statusCode, 'statusCode', 422)
              .having((e) => e.isWalletNotFound, 'isWalletNotFound', isTrue),
        ),
      );
    });
  });
}
