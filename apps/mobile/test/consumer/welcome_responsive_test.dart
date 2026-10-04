import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:banzami_mobile/screens/onboarding/welcome_screen.dart';

/// The Welcome screen is what appears right after logout. Its feature-bullet rows
/// previously overflowed on narrow devices (the stripe that flashed on logout).
/// These tests assert zero layout overflow across the support range. Overflow is
/// captured via FlutterError so it is isolated from unrelated asset-load noise in
/// the test environment (Image.asset has no real bundle under flutter_test).
void main() {
  Future<List<FlutterErrorDetails>> overflowErrors(
    WidgetTester t, {
    required double width,
    double textScale = 1.0,
  }) async {
    t.view.physicalSize = Size(width * 2, 900 * 2);
    t.view.devicePixelRatio = 2.0;
    addTearDown(t.view.resetPhysicalSize);
    addTearDown(t.view.resetDevicePixelRatio);

    final captured = <FlutterErrorDetails>[];
    final previous = FlutterError.onError;
    FlutterError.onError = captured.add;
    try {
      await t.pumpWidget(MediaQuery(
        data: MediaQueryData(textScaler: TextScaler.linear(textScale)),
        child: const MaterialApp(home: WelcomeScreen()),
      ));
      await t.pump(const Duration(milliseconds: 400));
    } finally {
      FlutterError.onError = previous;
    }
    return captured
        .where((e) => e.toString().toLowerCase().contains('overflow'))
        .toList();
  }

  for (final width in <double>[320, 360, 390, 430]) {
    testWidgets('Welcome feature bullets do not overflow at ${width.toInt()}px', (t) async {
      final overflows = await overflowErrors(t, width: width);
      expect(overflows, isEmpty, reason: 'layout overflow at ${width.toInt()}px');
      // The bullet copy is present (and now wraps instead of overflowing).
      expect(find.textContaining('Pague por QR'), findsOneWidget);
    });
  }

  testWidgets('Welcome bullets do not overflow at 320px with 1.3x text', (t) async {
    final overflows = await overflowErrors(t, width: 320, textScale: 1.3);
    expect(overflows, isEmpty);
  });
}
