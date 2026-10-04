import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:banzami_mobile/widgets/pin_pad.dart';

/// The PIN keypad must never overflow. These tests reproduce the real PIN
/// screen's horizontal padding (32px each side) so the keypad is exercised under
/// the exact constraint that produced "RIGHT OVERFLOWED BY 4.0 PIXELS" on the
/// Redmi A5 (~360 logical px → ~296px available). A RenderFlex overflow reports a
/// FlutterError during paint, which surfaces via tester.takeException().
void main() {
  Widget host(double textScale, {VoidCallback? onBackspace, ValueChanged<String>? onChanged}) =>
      MediaQuery(
        data: MediaQueryData(textScaler: TextScaler.linear(textScale)),
        child: MaterialApp(
          home: Scaffold(
            body: SafeArea(
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(horizontal: 32),
                child: PinPad(onChanged: onChanged ?? (_) {}),
              ),
            ),
          ),
        ),
      );

  for (final width in <double>[320, 360, 390, 430]) {
    for (final scale in <double>[1.0, 1.3, 1.5]) {
      testWidgets('keypad has no overflow at ${width.toInt()}px, textScale $scale', (t) async {
        t.view.physicalSize = Size(width * 2, 900 * 2);
        t.view.devicePixelRatio = 2.0;
        addTearDown(t.view.resetPhysicalSize);
        addTearDown(t.view.resetDevicePixelRatio);

        await t.pumpWidget(host(scale));
        await t.pumpAndSettle();

        expect(t.takeException(), isNull,
            reason: 'RenderFlex overflow at ${width.toInt()}px / textScale $scale');

        // All ten digits + the backspace are present and tappable.
        for (final k in ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']) {
          expect(find.text(k), findsOneWidget);
        }
        expect(find.bySemanticsLabel('Apagar'), findsOneWidget);
      });
    }
  }

  testWidgets('digits build the PIN and backspace deletes the last one', (t) async {
    final values = <String>[];
    await t.pumpWidget(host(1.0, onChanged: values.add));
    await t.pumpAndSettle();

    await t.tap(find.text('1'));
    await t.tap(find.text('2'));
    await t.tap(find.text('3'));
    expect(values.last, '123');

    await t.tap(find.bySemanticsLabel('Apagar'));
    expect(values.last, '12');
  });
}
