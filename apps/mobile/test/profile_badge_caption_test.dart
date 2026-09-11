import 'package:banzami_mobile/screens/profile_screen.dart';
import 'package:banzami_mobile/services/session_service.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('a Banzami badge says who vouched, never that an identity check passed', () {
    expect(verificationBadgeCaption(VerificationBadgeType.consumer), 'Verificado pelo Banzami');
    expect(verificationBadgeCaption(VerificationBadgeType.merchant),
        'Comerciante verificado pelo Banzami');
    for (final t in VerificationBadgeType.values) {
      expect(verificationBadgeCaption(t), isNot(contains('Identidade')));
    }
  });
}
