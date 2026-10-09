import 'package:flutter/services.dart';
import 'package:local_auth/error_codes.dart' as auth_error;

/// A human (PT) message for a `local_auth` failure.
///
/// Both apps used to swallow a Face ID failure silently (`catch (_) { return
/// false; }`), so when enabling Face ID failed the user saw nothing happen and
/// had no way to know why — the exact symptom reported on the Business app. This
/// maps the common failures to an actionable message, the most frequent being
/// `NotAvailable`: on iOS a per-app Face ID permission that was declined once
/// ("Don't Allow") stays declined until re-enabled in Settings, per bundle id —
/// so the Business app can be blocked while the Consumer app is allowed.
String biometricErrorMessage(Object e) {
  if (e is PlatformException) {
    switch (e.code) {
      case auth_error.notAvailable:
        return 'O Face ID não está disponível ou não foi permitido para esta app. '
            'Ative-o em Definições › Face ID e Código › Outras Apps.';
      case auth_error.notEnrolled:
        return 'Nenhum rosto registado neste dispositivo. '
            'Configure o Face ID em Definições › Face ID e Código.';
      case auth_error.passcodeNotSet:
        return 'Defina um código de desbloqueio no dispositivo para poder usar o Face ID.';
      case auth_error.lockedOut:
      case auth_error.permanentlyLockedOut:
        return 'O Face ID está temporariamente bloqueado. '
            'Desbloqueie o dispositivo com o código e tente novamente.';
    }
  }
  return 'Não foi possível ativar o Face ID. Tente novamente.';
}
