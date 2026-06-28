import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// App-wide guard: the flat, legacy `BanzamiButton` (small radius, no gradient)
/// must not appear ANYWHERE in the app. Every CTA uses the canonical
/// BanzamiPrimaryButton / BanzamiSecondaryButton / BanzamiGhostButton instead.
/// Source-level scan — no widgets, no mocks. (Merchant has its own broader guard
/// in test/merchant/button_design_system_test.dart.)
void main() {
  // The left lookbehind keeps `BanzamiButton` from matching inside
  // `BanzamiPrimaryButton` / `BanzamiSecondaryButton`.
  final flat = RegExp(r'(?<![A-Za-z])BanzamiButton\b');

  test('the flat BanzamiButton is used nowhere in lib/', () {
    final dir = Directory('lib');
    expect(dir.existsSync(), isTrue, reason: 'lib/ not found');

    final offenders = <String>[];
    for (final entity in dir.listSync(recursive: true)) {
      if (entity is! File || !entity.path.endsWith('.dart')) continue;
      final lines = entity.readAsLinesSync();
      for (var i = 0; i < lines.length; i++) {
        if (flat.hasMatch(lines[i])) {
          offenders.add('${entity.path}:${i + 1}: ${lines[i].trim()}');
        }
      }
    }

    expect(
      offenders,
      isEmpty,
      reason: 'Use BanzamiPrimaryButton/BanzamiSecondaryButton instead of the '
          'flat BanzamiButton:\n${offenders.join('\n')}',
    );
  });
}
