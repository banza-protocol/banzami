// A Face ID failure used to be swallowed silently, so the Business toggle just
// did not turn on with no explanation. These lock that each common local_auth
// failure now maps to an actionable PT message — the NotAvailable case (a
// per-app iOS permission declined once) being the most likely Business symptom.
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:banzami_mobile/platform/biometric_error.dart';

void main() {
  test('NotAvailable points the user at iOS Settings', () {
    final msg = biometricErrorMessage(PlatformException(code: 'NotAvailable'));
    expect(msg, contains('Definições'));
    expect(msg, contains('Face ID'));
  });

  test('NotEnrolled asks the user to set up a face', () {
    expect(biometricErrorMessage(PlatformException(code: 'NotEnrolled')),
        contains('Nenhum rosto registado'));
  });

  test('PasscodeNotSet asks for a device passcode', () {
    expect(biometricErrorMessage(PlatformException(code: 'PasscodeNotSet')),
        contains('código de desbloqueio'));
  });

  test('lockout tells the user to unlock with the passcode', () {
    expect(biometricErrorMessage(PlatformException(code: 'LockedOut')),
        contains('bloqueado'));
  });

  test('an unknown error falls back to a generic retry message', () {
    expect(biometricErrorMessage(Exception('boom')),
        'Não foi possível ativar o Face ID. Tente novamente.');
  });
}
