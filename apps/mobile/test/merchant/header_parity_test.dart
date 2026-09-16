import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:banzami_flutter/banzami_flutter.dart';

// BUSINESS-HEADER-CONSISTENCY-001: the Consumer and Business apps render the
// SAME AppScreenHeader with the SAME BanzamiTextStyles.pageTitle token — one
// header system, one title geometry. This locks that canonical geometry so
// neither app can drift (CONSUMER_BUSINESS_HEADER_VISUAL_PARITY).
void main() {
  Widget host(Widget child) => MaterialApp(home: Scaffold(body: child));

  testWidgets('pushed header: canonical pageTitle (28/w700) + canonical back', (tester) async {
    await tester.pumpWidget(host(AppScreenHeader(title: 'Entrar', onBack: () {})));

    final title = tester.widget<Text>(find.text('Entrar'));
    expect(title.style, BanzamiTextStyles.pageTitle);
    expect(title.style!.fontSize, 28);
    expect(title.style!.fontWeight, FontWeight.w700);

    // The single canonical back affordance.
    final backIcon = tester.widget<Icon>(find.byIcon(Icons.arrow_back_ios_new_rounded));
    expect(backIcon.size, 20);
    expect(find.byType(IconButton), findsOneWidget);
  });

  testWidgets('root header: pageTitle + subtitle, no back', (tester) async {
    await tester.pumpWidget(host(
      const AppScreenHeader(title: 'Receber', subtitle: 'Cobranças por link e QR'),
    ));

    expect(tester.widget<Text>(find.text('Receber')).style, BanzamiTextStyles.pageTitle);
    expect(find.text('Cobranças por link e QR'), findsOneWidget);
    expect(find.byIcon(Icons.arrow_back_ios_new_rounded), findsNothing);
  });

  testWidgets('title uses the shared token, never an inline size/weight', (tester) async {
    // The exact style object identity — a screen inlining its own TextStyle
    // would fail this even if the numbers happened to match.
    await tester.pumpWidget(host(AppScreenHeader(title: 'Cobrança dividida', onBack: () {})));
    expect(identical(tester.widget<Text>(find.text('Cobrança dividida')).style, BanzamiTextStyles.pageTitle), isTrue);
  });
}
