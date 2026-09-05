import 'dart:io';

import 'package:test/test.dart';

/// This package is CLIENT software. Assume the source is read, the binary is
/// inspected and every string is extracted — because all three are true of an
/// app anyone can download.
///
/// The guards read the package's own sources: the hazard is what the package
/// SHIPS and TEACHES, and no runtime assertion can catch a bad example.
void main() {
  final files = [
    ...Directory('lib')
        .listSync(recursive: true)
        .whereType<File>()
        .where((f) => f.path.endsWith('.dart')),
    ...Directory('example')
        .listSync(recursive: true)
        .whereType<File>()
        .where((f) => f.path.endsWith('.dart')),
    File('README.md'),
  ].where((f) => f.existsSync()).toList();

  test('no secret key appears as a value anywhere in the package', () {
    // Naming a secret key in order to FORBID it is the opposite of teaching it,
    // so lines carrying a prohibition are skipped.
    final forbidding =
        RegExp(r'never|must not|do not|forbidden|refuse', caseSensitive: false);
    final teaching = [
      RegExp(r"""publishableKey:\s*['"]bz_(test|live)_sk_"""),
      RegExp(r'bz_(test|live)_sk_[A-Za-z0-9]{4}'),
    ];
    final offenders = <String>[];
    for (final f in files) {
      final lines = f.readAsStringSync().split('\n');
      for (var i = 0; i < lines.length; i++) {
        if (forbidding.hasMatch(lines[i])) {
          continue;
        }
        for (final p in teaching) {
          if (p.hasMatch(lines[i])) {
            offenders.add('${f.path}:${i + 1} → ${lines[i].trim()}');
          }
        }
      }
    }
    expect(offenders, isEmpty);
  });

  test('no credential is ever logged or printed', () {
    for (final f in files.where((f) => f.path.startsWith('lib'))) {
      final src = f.readAsStringSync();
      expect(RegExp(r'print\(').hasMatch(src), isFalse,
          reason:
              '${f.path} prints — a client SDK must not write to the app log');
      // An exception that echoed the request back would put the key in a crash
      // report, which is the log an SDK author never sees.
      expect(RegExp(r'(headers|Authorization)[^\n]*\$\{?e\b').hasMatch(src),
          isFalse,
          reason: '${f.path} may interpolate headers into an error');
    }
  });

  test('the credential boundary is stated where a reader will meet it', () {
    for (final path in [
      'lib/banzami_client.dart',
      'lib/src/client.dart',
      'README.md'
    ]) {
      final text = File(path).readAsStringSync();
      expect(text.contains('bz_test_pk_'), isTrue,
          reason: '$path should name the client credential');
      expect(text.toLowerCase().contains('never'), isTrue,
          reason:
              '$path should say plainly that a secret key never ships in client software');
    }
  });

  test('the package declares no path or git dependency', () {
    final pubspec = File('pubspec.yaml').readAsStringSync();
    for (final bad in ['path:', 'git:']) {
      expect(RegExp('^\\s+$bad', multiLine: true).hasMatch(pubspec), isFalse,
          reason: 'a published package cannot depend on the monorepo');
    }
  });
}
