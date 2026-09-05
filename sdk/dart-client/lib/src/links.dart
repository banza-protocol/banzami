import 'environment.dart';
import 'errors.dart';

/// Banzami link and QR handling — pure functions, no network, no credential.
///
/// A slug arriving from a scanned QR or an incoming deep link is untrusted
/// input: it reaches the app from whatever the camera saw. Every entry point
/// here validates the shape before returning it, so a caller cannot accidentally
/// interpolate a scanned string into a URL.
class BanzamiLinks {
  const BanzamiLinks._();

  /// Slugs are hex identifiers issued by the operator. Anything else is not a
  /// slug, whatever it may be.
  static final RegExp _slug = RegExp(r'^[A-Za-z0-9]{6,64}$');

  static bool isValidSlug(String slug) => _slug.hasMatch(slug);

  /// The hosted checkout URL for a payment.
  ///
  /// Throws rather than returning a malformed URL: a caller that builds a link
  /// from a bad slug would otherwise send a payer somewhere that is not Banzami.
  static String checkoutUrl(
    String slug, {
    BanzamiEnvironment environment = BanzamiEnvironment.sandbox,
  }) {
    if (!isValidSlug(slug)) {
      throw BanzamiConfigException('not a Banzami payment slug: "$slug"');
    }
    return '${environment.checkoutBaseUrl}/pay/$slug';
  }

  /// Extract the payment slug from anything Banzami hands a client:
  ///
  ///   https://pay.banzami.com/pay/<slug>
  ///   banzami://pay/<slug>
  ///   banzami://pay/link/<slug>
  ///
  /// Returns null for anything else — including a well-formed URL on a host
  /// that is not Banzami's. A deep link is attacker-reachable on mobile: any
  /// app can send one, so a link that merely LOOKS like a payment must not be
  /// treated as one.
  static String? parseSlug(String input) {
    final uri = Uri.tryParse(input.trim());
    if (uri == null) return null;

    if (uri.scheme == 'banzami') {
      // banzami://pay/<slug> — host is "pay", or the first segment is.
      final parts = [
        if (uri.host.isNotEmpty) uri.host,
        ...uri.pathSegments,
      ].where((s) => s.isNotEmpty).toList();
      if (parts.isEmpty || parts.first != 'pay') return null;
      final rest = parts.sublist(1).where((s) => s != 'link').toList();
      if (rest.length != 1) return null;
      return isValidSlug(rest.first) ? rest.first : null;
    }

    if (uri.scheme == 'https') {
      // Host allow-list. Without it, https://evil.example/pay/<slug> would
      // parse as a Banzami payment.
      const hosts = {'pay.banzami.com', 'checkout.banzami.com'};
      if (!hosts.contains(uri.host)) return null;
      final segs = uri.pathSegments.where((s) => s.isNotEmpty).toList();
      if (segs.length != 2 || segs.first != 'pay') return null;
      return isValidSlug(segs[1]) ? segs[1] : null;
    }

    return null;
  }

  /// Whether a URL is a Banzami checkout the app should open.
  static bool isCheckoutUrl(String input) => parseSlug(input) != null;
}
