import 'package:banzami_client/banzami_client.dart';
import 'package:test/test.dart';

void main() {
  group('parseSlug accepts only Banzami links', () {
    test('the hosted checkout URL', () {
      expect(BanzamiLinks.parseSlug('https://pay.banzami.com/pay/abc123def456'),
          'abc123def456');
    });

    test('the canonical alias', () {
      expect(
          BanzamiLinks.parseSlug(
              'https://checkout.banzami.com/pay/abc123def456'),
          'abc123def456');
    });

    test('both deep-link shapes the operator emits', () {
      expect(
          BanzamiLinks.parseSlug('banzami://pay/abc123def456'), 'abc123def456');
      expect(BanzamiLinks.parseSlug('banzami://pay/link/abc123def456'),
          'abc123def456');
    });

    // A deep link is attacker-reachable on mobile: any installed app can send
    // one, and a QR is whatever the camera saw. A link that merely LOOKS like a
    // payment must not be treated as one.
    test('a look-alike host is refused', () {
      for (final hostile in [
        'https://pay.banzami.com.evil.example/pay/abc123def456',
        'https://evil.example/pay/abc123def456',
        'https://banzami.com/pay/abc123def456',
        'https://pay.banzami.com.co/pay/abc123def456',
      ]) {
        expect(BanzamiLinks.parseSlug(hostile), isNull, reason: hostile);
      }
    });

    test('http is refused — only https and the app scheme', () {
      expect(BanzamiLinks.parseSlug('http://pay.banzami.com/pay/abc123def456'),
          isNull);
    });

    test('a wrong path or a malformed slug is refused', () {
      for (final bad in [
        'https://pay.banzami.com/abc123def456',
        'https://pay.banzami.com/pay/',
        'https://pay.banzami.com/pay/abc/def',
        'https://pay.banzami.com/pay/../../etc/passwd',
        'banzami://transfer/abc123def456',
        'banzami://pay/has space',
        'not a url at all',
        '',
      ]) {
        expect(BanzamiLinks.parseSlug(bad), isNull, reason: bad);
      }
    });
  });

  group('checkoutUrl', () {
    test('builds the canonical URL', () {
      expect(BanzamiLinks.checkoutUrl('abc123def456'),
          'https://pay.banzami.com/pay/abc123def456');
    });

    // Returning a malformed URL would send a payer somewhere that is not
    // Banzami, which is worse than failing.
    test('refuses to build a URL from a bad slug', () {
      for (final bad in ['', '../evil', 'a', 'x y']) {
        expect(() => BanzamiLinks.checkoutUrl(bad),
            throwsA(isA<BanzamiConfigException>()),
            reason: bad);
      }
    });

    test('round-trips with parseSlug', () {
      const slug = 'abc123def456';
      expect(BanzamiLinks.parseSlug(BanzamiLinks.checkoutUrl(slug)), slug);
    });
  });

  test('isCheckoutUrl agrees with parseSlug', () {
    expect(
        BanzamiLinks.isCheckoutUrl('https://pay.banzami.com/pay/abc123def456'),
        isTrue);
    expect(BanzamiLinks.isCheckoutUrl('https://evil.example/pay/abc123def456'),
        isFalse);
  });
}
