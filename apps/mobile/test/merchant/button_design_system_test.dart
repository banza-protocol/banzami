import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// Guard: every button in the Banzami Business (merchant) app must use the
/// design-system components (BanzamiPrimaryButton / BanzamiSecondaryButton /
/// BanzamiGhostButton / BanzamiButton), never a bare Material button. This is a
/// source-level scan — no widgets, no mocks.
void main() {
  // Material button widgets that must not appear in merchant screens. Word
  // boundary on the left so e.g. `BanzamiTextButton` (none today) wouldn't match.
  final legacy = RegExp(r'(?<![A-Za-z])(ElevatedButton|OutlinedButton|TextButton|FilledButton)\b');

  test('no legacy Material buttons remain in lib/merchant', () {
    final dir = Directory('lib/merchant');
    expect(dir.existsSync(), isTrue, reason: 'merchant source dir not found');

    final offenders = <String>[];
    for (final entity in dir.listSync(recursive: true)) {
      if (entity is! File || !entity.path.endsWith('.dart')) continue;
      final lines = entity.readAsLinesSync();
      for (var i = 0; i < lines.length; i++) {
        if (legacy.hasMatch(lines[i])) {
          offenders.add('${entity.path}:${i + 1}: ${lines[i].trim()}');
        }
      }
    }

    expect(
      offenders,
      isEmpty,
      reason: 'Use BanzamiPrimaryButton/BanzamiSecondaryButton/BanzamiGhostButton '
          'instead of bare Material buttons:\n${offenders.join('\n')}',
    );
  });
}
