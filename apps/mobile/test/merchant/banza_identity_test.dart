import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:banzami_mobile/merchant/services/merchant_session_service.dart';

// Product rule: in the Business app the merchant's primary identifier is the
// @banza address. The internal merchant UUID is never the display identity —
// it lives only in an advanced/technical area for support.
MerchantSession _session({String? handle}) => MerchantSession(
      merchantId:   '40caf267-782f-4031-a95b-c44a7e8c0000',
      merchantName: 'Doa',
      merchantEmail:'contact@doadoa.app',
      walletId:     'w-1',
      loginMethod:  MerchantLoginMethod.handlePin,
      environment:  'SANDBOX',
      handle:       handle,
    );

void main() {
  group('MerchantSession.banzaAddress', () {
    test('prefixes the handle with @', () {
      expect(_session(handle: 'doa').banzaAddress, '@doa');
    });
    test('null when the handle is missing/empty', () {
      expect(_session(handle: null).banzaAddress, isNull);
      expect(_session(handle: '   ').banzaAddress, isNull);
    });
  });

  group('Profile screen — @banza is the primary identity (source guards)', () {
    final src = File('lib/merchant/screens/profile_screen.dart').readAsStringSync();

    test('shows the @banza address card, not a Merchant ID card', () {
      expect(src.contains('_PaymentAddressCard'), isTrue);
      expect(src.contains('Endereço @banza'), isTrue);
      expect(src.contains("Text('Merchant ID'"), isFalse);
      expect(src.contains('identificador único'), isFalse);
    });
    test('copies the @banza address (not the UUID) with a clear toast', () {
      expect(src.contains('Endereço @banza copiado.'), isTrue);
      expect(src.contains('session!.banzaAddress'), isTrue);
    });
    test('has a clear fallback when @banza is not set', () {
      expect(src.contains('@banza ainda não definido'), isTrue);
    });
    test('keeps the merchant UUID only in an advanced technical area', () {
      expect(src.contains('_TechnicalIdsCard'), isTrue);
      expect(src.contains('Identificadores técnicos'), isTrue);
      expect(src.contains('Uso interno para suporte.'), isTrue);
    });
  });

  group('Receber (QR) and KYB show @banza', () {
    test('QR screen shows "Receber em @banza"', () {
      final qr = File('lib/merchant/screens/qr_screen.dart').readAsStringSync();
      expect(qr.contains('Receber em '), isTrue);
      expect(qr.contains('session.banzaAddress'), isTrue);
    });
    test('KYB screen shows the negócio + @banza identity', () {
      final kyb = File('lib/merchant/screens/kyb_screen.dart').readAsStringSync();
      expect(kyb.contains('_BusinessIdentity'), isTrue);
      expect(kyb.contains('session.banzaAddress'), isTrue);
    });
  });
}
