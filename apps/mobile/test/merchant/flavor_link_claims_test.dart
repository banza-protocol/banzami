import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

// The Business App must not claim the consumer's payment links: two apps
// registering banzami://pay and pay.banzami.com means an Android chooser / an
// iOS coin toss, and the Business App has no payment-link handler.
void main() {
  test('Android: only the consumer flavor declares the payment deep links', () {
    final main = File('android/app/src/main/AndroidManifest.xml').readAsStringSync();
    final consumer = File('android/app/src/consumer/AndroidManifest.xml').readAsStringSync();
    expect(main.contains('android:scheme="banzami"'), isFalse);
    expect(main.contains('android:host="pay.banzami.com"'), isFalse);
    expect(consumer.contains('android:scheme="banzami"'), isTrue);
    expect(consumer.contains('android:host="pay.banzami.com"'), isTrue);
    expect(File('android/app/src/merchant/AndroidManifest.xml').existsSync(), isFalse);
  });

  test('iOS: merchant configurations use their own Info.plist and entitlements', () {
    final pbx = File('ios/Runner.xcodeproj/project.pbxproj').readAsStringSync();
    final blocks = RegExp(r'/\* (\w+-merchant) \*/ = \{\n\t\t\tisa = XCBuildConfiguration;(.*?)\n\t\t\};',
            dotAll: true)
        .allMatches(pbx)
        .where((m) => m.group(2)!.contains('Runner/Info'))
        .toList();
    expect(blocks.map((m) => m.group(1)).toSet(),
        {'Debug-merchant', 'Release-merchant', 'Profile-merchant'});
    for (final m in blocks) {
      expect(m.group(2), contains('CODE_SIGN_ENTITLEMENTS = Runner/Merchant.entitlements;'));
      expect(m.group(2), contains('INFOPLIST_FILE = "Runner/Info-Merchant.plist";'));
    }
    expect(File('ios/Runner/Merchant.entitlements').readAsStringSync(),
        isNot(contains('applinks:')));
    expect(File('ios/Runner/Info-Merchant.plist').readAsStringSync(),
        isNot(contains('CFBundleURLTypes')));
    // The consumer keeps its claims.
    expect(File('ios/Runner/Runner.entitlements').readAsStringSync(),
        contains('applinks:pay.banzami.com'));
    expect(File('ios/Runner/Info.plist').readAsStringSync(), contains('CFBundleURLTypes'));
  });

  test('Info-Merchant.plist is Info.plist minus the URL scheme claim (no drift)', () {
    final consumer = File('ios/Runner/Info.plist').readAsStringSync();
    final merchant = File('ios/Runner/Info-Merchant.plist').readAsStringSync();
    final withoutClaim = consumer.replaceFirst(
        RegExp(r'\t\t<key>CFBundleURLTypes</key>\n\t\t<array>.*?\n\t\t</array>\n', dotAll: true), '');
    expect(merchant, withoutClaim,
        reason: 'edit both plists together; only CFBundleURLTypes may differ');
  });
}
