import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import 'package:banzami_flutter/banzami_flutter.dart';

/// Words a Banzami user must not read: English environment jargon, screens
/// that do not exist, and "Endereço Banzami" for what is an @banza.
void main() {
  final sources = Directory('lib')
      .listSync(recursive: true)
      .whereType<File>()
      .where((f) => f.path.endsWith('.dart'))
      .toList();

  for (final phrase in const [
    'ambiente live',
    'ecrã Pagar',
    'Endereço Banzami',
  ]) {
    test('no "$phrase" in the SDK screens', () {
      final found = [
        for (final f in sources)
          if (f.readAsStringSync().contains(phrase)) f.path,
      ];
      expect(found, isEmpty);
    });
  }

  test('an environment mismatch is explained in Portuguese', () {
    expect(environmentMismatchMessage(fromSandbox: true), contains('Sandbox'));
    expect(environmentMismatchMessage(fromSandbox: false), contains('dinheiro real'));
    for (final b in [true, false]) {
      expect(environmentMismatchMessage(fromSandbox: b).toLowerCase(), isNot(contains('live')));
    }
  });
}
