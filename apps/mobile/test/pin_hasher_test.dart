import 'package:banzami_mobile/services/pin_hasher.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const legacySalt = 'banzami:{pin}:ao';

  test('a PIN hash is salted per hash and slow (PBKDF2), not a fixed SHA-256', () {
    final a = PinHasher.hash('123456');
    final b = PinHasher.hash('123456');
    expect(a, isNot(b), reason: 'a random salt per hash');
    expect(a, startsWith('pbkdf2-sha256\$${PinHasher.iterations}\$'));
    expect(PinHasher.isLegacy(a), isFalse);
    expect(PinHasher.verify('123456', a, legacySalt: legacySalt), isTrue);
    expect(PinHasher.verify('654321', a, legacySalt: legacySalt), isFalse);
  });

  test('PBKDF2-HMAC-SHA256 matches the published test vectors', () {
    String hex(List<int> b) => b.map((x) => x.toRadixString(16).padLeft(2, '0')).join();
    expect(hex(PinHasher.derive('password'.codeUnits, 'salt'.codeUnits, 1)),
        '120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b');
    expect(hex(PinHasher.derive('password'.codeUnits, 'salt'.codeUnits, 2)),
        'ae4d0c95af6b46d32d0adff928f06dd02a303f8ef3c251dfd6e2d85a95474c43');
  });

  test('an existing install keeps unlocking with its legacy hash', () {
    final legacy = PinHasher.legacyHash('123456', legacySalt);
    expect(PinHasher.isLegacy(legacy), isTrue);
    expect(PinHasher.verify('123456', legacy, legacySalt: legacySalt), isTrue);
    expect(PinHasher.verify('000000', legacy, legacySalt: legacySalt), isFalse);
  });

  test('malformed stored values never verify', () {
    for (final bad in ['', 'x', 'pbkdf2-sha256\$0\$AA==\$AA==', 'pbkdf2-sha256\$10\$!!\$!!']) {
      expect(PinHasher.verify('123456', bad, legacySalt: legacySalt), isFalse, reason: bad);
    }
  });
}
