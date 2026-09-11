import 'dart:io';

import 'package:banzami_mobile/merchant/screens/campaign_accounts_screen.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('each segregated account is named by the purpose the API gives', () {
    expect(walletAccountPurposeLabel('CAMPAIGN'), 'Campanha');
    expect(walletAccountPurposeLabel('PROJECT'), 'Projecto');
    expect(walletAccountPurposeLabel('ESCROW'), 'Garantia');
    expect(walletAccountPurposeLabel('SOMETHING_NEW'), 'Conta segregada');
  });

  test('statuses read in Portuguese, never the raw value', () {
    expect(walletAccountStatusLabel('INACTIVE'), 'Inactiva');
    expect(walletAccountStatusLabel('ACTIVE'), 'Activa');
    expect(walletAccountStatusLabel('WEIRD'), isNot('WEIRD'));
  });

  test('no promise the backend does not make', () {
    final src = File('lib/merchant/screens/campaign_accounts_screen.dart').readAsStringSync();
    expect(src.contains('liquida ao beneficiário'), isFalse);
    expect(src.contains(": 'Campanha';"), isFalse, reason: 'not every account is a campaign');
  });
}
