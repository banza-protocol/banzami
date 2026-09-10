/// A Business's consent for a Developer Project to connect to it — issued by
/// `POST /v1/merchant/project-link-codes` to the signed-in Business.
///
/// The Business reads [code] to the developer, who enters it in the Developers
/// Console. It is single-use, lives 10 minutes, and issuing a new one retires
/// the previous one on Banzami. Only the signed-in Business sees it: it is not
/// stored, logged or sent anywhere by the SDK.
class ProjectLinkCode {
  /// The code as it is read out: 12 characters grouped by dashes
  /// (`ABCD-EFGH-JKMN`). Banzami accepts it with or without the dashes.
  final String code;

  /// When the code stops being accepted (UTC).
  final DateTime expiresAt;

  const ProjectLinkCode({required this.code, required this.expiresAt});

  /// Parses the issue response. Throws [FormatException] when the body carries
  /// no code or no readable expiry — such a body is not a code, and nothing may
  /// be shown in its place.
  factory ProjectLinkCode.fromJson(Map<String, dynamic> json) {
    final code = json['code'];
    final expires = json['expires_at'];
    if (code is! String || code.trim().isEmpty) {
      throw const FormatException('project link code response carries no code');
    }
    final expiresAt = expires is String ? DateTime.tryParse(expires) : null;
    if (expiresAt == null) {
      throw const FormatException(
          'project link code response carries no expiry');
    }
    return ProjectLinkCode(code: code.trim(), expiresAt: expiresAt.toUtc());
  }

  /// Time left at [now]; [Duration.zero] once expired.
  Duration remainingAt(DateTime now) {
    final left = expiresAt.difference(now);
    return left.isNegative ? Duration.zero : left;
  }

  @override
  String toString() =>
      'ProjectLinkCode(expiresAt: $expiresAt)'; // never the code itself
}
