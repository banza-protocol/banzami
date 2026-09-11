import 'dart:io';

import 'package:banzami_flutter/banzami_flutter.dart';
import 'package:banzami_mobile/merchant/screens/dashboard_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

MerchantComplianceStatus _c(String kyb, String aml) =>
    MerchantComplianceStatus(kybStatus: kyb, amlStatus: aml);

void main() {
  group('withdrawGate — what the payout endpoint enforces (KYB AND AML)', () {
    test('KYB approved but AML pending is not "levantamentos disponíveis"', () {
      expect(withdrawGate(compliance: _c('APPROVED', 'PENDING'), kybVerified: true),
          WithdrawGate.amlPending);
    });

    test('both approved → ready', () {
      expect(withdrawGate(compliance: _c('APPROVED', 'APPROVED'), kybVerified: true),
          WithdrawGate.ready);
    });

    test('KYB not approved → verify the business first', () {
      expect(withdrawGate(compliance: _c('UNDER_REVIEW', 'APPROVED'), kybVerified: false),
          WithdrawGate.kybPending);
    });

    test('compliance unreadable: never claims availability', () {
      expect(withdrawGate(compliance: null, kybVerified: true), WithdrawGate.unknown);
      expect(withdrawGate(compliance: null, kybVerified: false), WithdrawGate.kybPending);
    });
  });

  test('Business surfaces say "levantamento", never the English "payout"', () {
    for (final f in [
      'lib/merchant/screens/dashboard_screen.dart',
      'lib/merchant/screens/payout_screen.dart',
    ]) {
      final src = File(f).readAsStringSync();
      for (final word in ["'Payout'", 'Solicitar payout', 'Liquidações e payouts', 'payouts aparecerão']) {
        expect(src.contains(word), isFalse, reason: '$f: $word');
      }
    }
  });

  testWidgets('the dashboard lists a real withdrawal: amount and state', (t) async {
    await t.pumpWidget(MaterialApp(
      home: Scaffold(
        body: PayoutRow(
          payout: Payout(
            id: 'p1', status: 'PROCESSING', amountMinor: 5000000,
            currency: 'AOA', createdAt: DateTime.now().toUtc(),
          ),
        ),
      ),
    ));
    expect(find.text('50 000 Kz'), findsOneWidget);
    expect(find.text('Em processamento'), findsOneWidget);
    expect(find.textContaining('Hoje'), findsOneWidget);
  });
}
