import 'dart:io';
import 'package:flutter_test/flutter_test.dart';

// BUSINESS-QR-UNIFICATION-001 §2/§41 — one Banzami QR universe.
//
// There is exactly one QR encoder (the SDK's BanzamiQr, the only file allowed to
// touch qr_flutter), one scheme (BanzamiQrScheme) and one parser (BanzamiQrParser),
// shared by Consumer and Business. This guard fails if any screen re-introduces a
// second QR encoder or a parallel parser/scheme — the exact drift the milestone
// forbids. It is behaviour-agnostic: it never asserts a payload's meaning.

const _appLib = 'lib';
const _sdkLib = '../../sdk/flutter/lib';

Iterable<File> _dartFiles(String root) sync* {
  final dir = Directory(root);
  if (!dir.existsSync()) return;
  for (final e in dir.listSync(recursive: true)) {
    if (e is File && e.path.endsWith('.dart')) yield e;
  }
}

void main() {
  group('one QR encoder/parser universe', () {
    test('qr_flutter (the raw encoder) is imported only by the SDK BanzamiQr widget', () {
      final offenders = <String>[];
      for (final root in [_appLib, _sdkLib]) {
        for (final f in _dartFiles(root)) {
          if (!f.readAsStringSync().contains("package:qr_flutter/")) continue;
          // The one canonical home of the raw encoder.
          if (f.path.endsWith('sdk/flutter/lib/widgets/banzami_qr.dart')) continue;
          offenders.add(f.path);
        }
      }
      expect(offenders, isEmpty,
          reason: 'raw QR encoder used outside BanzamiQr: ${offenders.join(", ")}');
    });

    test('the mobile app never imports the raw encoder directly (goes through the SDK)', () {
      final offenders = [
        for (final f in _dartFiles(_appLib))
          if (f.readAsStringSync().contains("package:qr_flutter/")) f.path,
      ];
      expect(offenders, isEmpty, reason: offenders.join(', '));
    });

    test('exactly one QR scheme and one QR parser class exist', () {
      final schemes = <String>[];
      final parsers = <String>[];
      for (final root in [_appLib, _sdkLib]) {
        for (final f in _dartFiles(root)) {
          final src = f.readAsStringSync();
          for (final m in RegExp(r'class\s+(\w*QrScheme)\b').allMatches(src)) schemes.add(m.group(1)!);
          for (final m in RegExp(r'class\s+(\w*QrParser)\b').allMatches(src)) parsers.add(m.group(1)!);
        }
      }
      expect(schemes.toSet(), {'BanzamiQrScheme'}, reason: 'schemes: $schemes');
      expect(parsers.toSet(), {'BanzamiQrParser'}, reason: 'parsers: $parsers');
    });

    test('merchant QR screens render the canonical widget, not an ad-hoc painter', () {
      for (final f in ['lib/merchant/screens/charge_screen.dart', 'lib/merchant/screens/split_track_screen.dart']) {
        final src = File(f).readAsStringSync();
        expect(RegExp(r'\bBanzamiQr(Display)?\b').hasMatch(src), isTrue, reason: '$f must use BanzamiQr/BanzamiQrDisplay');
        expect(src.contains('CustomPaint('), isFalse, reason: '$f must not hand-paint a QR');
      }
    });
  });
}
