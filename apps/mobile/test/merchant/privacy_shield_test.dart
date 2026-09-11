import 'package:banzami_mobile/merchant/widgets/merchant_privacy_shield.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

final _cover = find.byWidgetPredicate(
    (w) => w is ColoredBox && w.color == const Color(0xFF3D0008));

void main() {
  testWidgets('the app-switcher snapshot never shows the Business data', (t) async {
    await t.pumpWidget(const MaterialApp(
      home: MerchantPrivacyShield(child: Scaffold(body: Text('Saldo 50 000 Kz'))),
    ));
    expect(_cover, findsNothing);

    t.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    await t.pump();
    expect(_cover, findsOneWidget);

    t.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await t.pump();
    expect(_cover, findsNothing);
  });
}
