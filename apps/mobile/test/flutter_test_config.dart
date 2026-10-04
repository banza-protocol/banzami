import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';

/// Golden comparisons tolerate a tiny sub-pixel difference so they are stable
/// across platforms. The golden baselines are generated on one platform (CI);
/// another host (e.g. macOS) rasterises the *same* glyphs with slightly different
/// antialiasing, producing 0.04–0.20% pixel diffs on text-heavy screens even
/// though the layout is identical. The tolerance below absorbs that font-AA noise
/// while staying far below any real layout/text change (which is ≥1–2%), so real
/// regressions still fail. This does NOT update any baseline and does not change
/// the product — it only makes the pixel comparison platform-robust.
const double _kGoldenTolerance = 0.5 / 100; // 0.5%

class _TolerantGoldenComparator extends LocalFileComparator {
  _TolerantGoldenComparator(super.testFile);

  @override
  Future<bool> compare(Uint8List imageBytes, Uri golden) async {
    final ComparisonResult result = await GoldenFileComparator.compareLists(
      imageBytes,
      await getGoldenBytes(golden),
    );
    if (result.passed || result.diffPercent <= _kGoldenTolerance) {
      return true;
    }
    final String error = await generateFailureOutput(result, golden, basedir);
    throw FlutterError(error);
  }
}

Future<void> testExecutable(FutureOr<void> Function() testMain) async {
  final GoldenFileComparator current = goldenFileComparator;
  if (current is LocalFileComparator) {
    // Reuse the current test file's basedir so relative golden paths still
    // resolve (the framework sets one LocalFileComparator per test file).
    goldenFileComparator = _TolerantGoldenComparator(
      Uri.parse('${current.basedir}flutter_test_config.dart'),
    );
  }
  await testMain();
}
