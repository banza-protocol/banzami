// The Business privacy shield must obey the SAME single policy the consumer app
// uses (AppPrivacyPolicy.active.backgroundPrivacyShieldEnabled), so the Business
// behaves identically: in the Public Sandbox backgrounding the app shows NO
// protection cover, and the cover appears only when a future Live policy turns
// the shield on. This was the "ecrã de proteção" the Business kept showing while
// the consumer did not.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:banzami_mobile/merchant/widgets/merchant_privacy_shield.dart';
import 'package:banzami_flutter/banzami_flutter.dart' show AppPrivacyPolicy;

const _coverColor = Color(0xFF3D0008);
final _cover = find.byWidgetPredicate(
    (w) => w is ColoredBox && w.color == _coverColor);

Future<void> _pumpAndBackground(WidgetTester tester) async {
  await tester.pumpWidget(const MaterialApp(
    home: MerchantPrivacyShield(child: Text('conteudo')),
  ));
  tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
  await tester.pump();
}

void main() {
  tearDown(() => AppPrivacyPolicy.active = AppPrivacyPolicy.sandbox);

  testWidgets('Sandbox policy (shield off): no cover when backgrounded',
      (tester) async {
    AppPrivacyPolicy.active = AppPrivacyPolicy.sandbox;
    await _pumpAndBackground(tester);
    expect(_cover, findsNothing);
  });

  testWidgets('shield on: covers when backgrounded', (tester) async {
    AppPrivacyPolicy.active = const AppPrivacyPolicy(
      backgroundPrivacyShieldEnabled: true,
      screenCaptureProtectionEnabled: false,
      foregroundRelockEnabled: false,
    );
    await _pumpAndBackground(tester);
    expect(_cover, findsOneWidget);

    // Resuming clears the cover.
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pump();
    expect(_cover, findsNothing);
  });
}
