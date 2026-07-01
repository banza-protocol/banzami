import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:banzami_flutter/banzami_flutter.dart';

Future<void> _pump(WidgetTester t, Widget w) =>
    t.pumpWidget(MaterialApp(home: Scaffold(body: w)));

Text _text(WidgetTester t) => t.widget<Text>(find.byType(Text));

void main() {
  group('MoneyAmount', () {
    testWidgets('renders space-grouped minor amount with currency', (t) async {
      await _pump(t, const MoneyAmount(5000000)); // 5 000 000 minor = 50 000 Kz
      expect(find.text('50 000 Kz'), findsOneWidget);
    });

    testWidgets('kwanza factory takes whole kwanzas', (t) async {
      await _pump(t, MoneyAmount.kwanza(16667));
      expect(find.text('16 667 Kz'), findsOneWidget);
    });

    testWidgets('showCurrency:false hides the Kz suffix', (t) async {
      await _pump(t, const MoneyAmount(5000000, showCurrency: false));
      expect(find.text('50 000'), findsOneWidget);
    });

    testWidgets('is always bold; size scales the font', (t) async {
      await _pump(t, const MoneyAmount(100000, size: MoneySize.sm));
      final sm = _text(t).style!;
      expect(sm.fontWeight, FontWeight.w700);
      expect(sm.fontSize, 15);

      await _pump(t, const MoneyAmount(100000, size: MoneySize.hero));
      final hero = _text(t).style!;
      expect(hero.fontWeight, FontWeight.w800);
      expect(hero.fontSize, 48);
      expect(hero.fontSize! > sm.fontSize!, isTrue);
    });

    testWidgets('tones map to distinct colours', (t) async {
      await _pump(t, const MoneyAmount(100000, tone: MoneyTone.success));
      final success = _text(t).style!.color;
      await _pump(t, const MoneyAmount(100000, tone: MoneyTone.danger));
      final danger = _text(t).style!.color;
      expect(success, isNot(danger));
    });
  });
}
