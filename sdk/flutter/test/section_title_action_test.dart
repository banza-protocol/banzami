import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:banzami_flutter/banzami_flutter.dart';

/// A section action styled as a tappable link must never be a dead CTA: the
/// affordance appears exactly when a handler is wired, and invokes it.
void main() {
  Widget host(Widget child) => MaterialApp(home: Scaffold(body: child));

  testWidgets('the action is hidden when no handler is wired (no dead CTA)', (t) async {
    await t.pumpWidget(host(const BanzamiSectionTitle(title: 'Actividade recente', action: 'Ver tudo')));
    expect(find.text('Actividade recente'), findsOneWidget);
    expect(find.text('Ver tudo'), findsNothing);
  });

  testWidgets('the action renders and invokes its handler when wired', (t) async {
    var tapped = false;
    await t.pumpWidget(host(BanzamiSectionTitle(
      title: 'Actividade recente',
      action: 'Ver tudo',
      onAction: () => tapped = true,
    )));
    expect(find.text('Ver tudo'), findsOneWidget);
    await t.tap(find.text('Ver tudo'));
    expect(tapped, isTrue);
  });
}
