import 'dart:io';
import 'package:flutter_test/flutter_test.dart';

/// A mobile binary is not a secret store.
///
/// This package's headline documentation used to open with
/// `apiKey: 'bz_live_...'` — telling a developer to compile a Developer
/// Platform secret key into an application anyone can download and read. That
/// key can move money. The examples are the most-copied part of an SDK, so they
/// are the part most worth guarding.
///
/// Reads sources rather than asserting on behaviour on purpose: the hazard is
/// what the package TEACHES, and no runtime check can catch a bad example.
void main() {
  final sources = <File>[
    ...Directory('lib')
        .listSync(recursive: true)
        .whereType<File>()
        .where((f) => f.path.endsWith('.dart')),
    File('README.md'),
  ].where((f) => f.existsSync()).toList();

  test('no source or doc shows a secret Developer key in a mobile example', () {
    // Naming a secret key in order to FORBID it is the opposite of teaching it,
    // so the check is line-scoped and skips lines that carry a prohibition.
    final forbidding =
        RegExp(r'never|must not|do not|forbidden|nunca', caseSensitive: false);
    final teaching = [
      RegExp(r"apiKey:\s*'bz_(test|live)_"), // an example assigning one
      RegExp(r"bz_(test|live)_sk_[A-Za-z0-9]"), // a real-looking secret value
    ];
    final offenders = <String>[];
    for (final f in sources) {
      final lines = f.readAsStringSync().split('\n');
      for (var i = 0; i < lines.length; i++) {
        if (forbidding.hasMatch(lines[i])) continue;
        for (final p in teaching) {
          if (p.hasMatch(lines[i])) {
            offenders.add('${f.path}:${i + 1} → ${lines[i].trim()}');
          }
        }
      }
    }
    expect(offenders, isEmpty,
        reason: 'a secret key must never appear in a mobile example — use the '
            'app session JWT, or a publishable bz_test_pk_ key for read-only use');
  });

  test('the credential boundary is stated where a reader will meet it', () {
    for (final path in [
      'lib/banzami_flutter.dart',
      'lib/client/banzami_client.dart',
      'README.md'
    ]) {
      final text = File(path).readAsStringSync();
      expect(text.contains('bz_test_pk_'), isTrue,
          reason:
              '$path should name the publishable key as the client-safe credential');
      expect(text.toLowerCase().contains('never'), isTrue,
          reason:
              '$path should state plainly that a secret key must never ship in a mobile binary');
    }
  });

  test('the package does not present itself as a published third-party SDK',
      () {
    // It is a path dependency of Banzami's own apps. Saying otherwise would
    // invite an integrator to `flutter pub add` something that is not there.
    final readme = File('README.md').readAsStringSync();
    expect(readme.contains('not published to pub.dev'), isTrue);
    expect(RegExp(r'pub add banzami_flutter').hasMatch(readme), isFalse);
  });

  test('the internal framework cannot be published by accident', () {
    // `publish_to: none` makes pub refuse this package outright. Banzami ADR-053
    // keeps app internals — onboarding, KYB, merchant screens, theme — off
    // pub.dev; the public client SDK is `banzami_client`. A comment saying so
    // would not stop a `dart pub publish` typed in the wrong directory.
    final pubspec = File('pubspec.yaml').readAsStringSync();
    expect(
        RegExp(r'^publish_to:\s*none\s*$', multiLine: true).hasMatch(pubspec),
        isTrue,
        reason: 'sdk/flutter must declare publish_to: none');
  });
}
