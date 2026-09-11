import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:banzami_flutter/banzami_flutter.dart';

void main() {
  group('PayoutBreakdown', () {
    test('estimate: fee floors like core/payouts, gross = net + fee', () {
      final b = PayoutBreakdown.estimate(1333300); // 13 333 Kz
      expect(b.feeMinor, 9999); // 1333300 * 75 / 10000 = 9999.75 → 9999
      expect(b.netMinor, 1333300 - 9999);
      expect(b.fromServer, isFalse);
      expect(walletWithdrawalFeeRateLabel, '0,75%');
    });

    test("Core's numbers win when the payout carries them", () {
      final p = Payout.fromJson({
        'id': 'p1',
        'status': 'PROCESSING',
        'amount_minor': 100000,
        'currency': 'AOA',
        'created_at': '2026-09-11T09:00:00Z',
        'fee_minor': 500,
        'net_minor': 99500,
      });
      final b = PayoutBreakdown.of(p);
      expect(b.fromServer, isTrue);
      expect(b.feeMinor, 500);
    });
  });

  test('listPayouts reads GET /v1/payouts, newest first, Portuguese states',
      () async {
    final client = BanzamiClient(
      apiKey: 'bz_test_key',
      baseUrl: 'https://api.test',
      httpClient: MockClient((req) async {
        if (req.url.path.endsWith('/auth/token')) {
          return http.Response(
              jsonEncode({
                'token': 't',
                'expires_at': DateTime.now()
                    .add(const Duration(hours: 1))
                    .toIso8601String(),
              }),
              200);
        }
        expect(req.url.path, '/v1/payouts');
        return http.Response(
            jsonEncode({
              'data': [
                {
                  'id': 'a',
                  'status': 'CONFIRMED',
                  'amount_minor': 1,
                  'currency': 'AOA',
                  'created_at': '2026-09-01T09:00:00Z',
                  'destination': {'bank_code': 'BAI'},
                },
                {
                  'id': 'b',
                  'status': 'PENDING',
                  'amount_minor': 2,
                  'currency': 'AOA',
                  'created_at': '2026-09-10T09:00:00Z',
                },
              ]
            }),
            200);
      }),
    );
    final list = await client.listPayouts(limit: 3);
    expect(list.map((p) => p.id), ['b', 'a']);
    expect(list.first.statusLabel, 'Pedido');
    expect(list.last.statusLabel, 'Concluído');
    expect(list.last.bankCode, 'BAI');
  });
}
