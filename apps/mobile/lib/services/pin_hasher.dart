import 'dart:convert';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart' show visibleForTesting;

/// The on-device PIN check (the app lock), stored as a slow, salted hash.
///
/// A 6-digit PIN has a million values: a fast hash with a salt baked into the
/// app (the old `sha256("banzami:<pin>:ao")`) is reversed from a copied
/// keychain in well under a second. Each hash now has its own random salt and
/// is PBKDF2-HMAC-SHA256 with [iterations] rounds, stored as
/// `pbkdf2-sha256$<iterations>$<salt b64>$<hash b64>`. Banzami still decides
/// every sign-in: this only lets the device lock work offline.
class PinHasher {
  PinHasher._();

  static const int iterations = 20000;
  static const String _scheme = 'pbkdf2-sha256';

  /// A fresh hash of [pin] with a new random salt.
  static String hash(String pin, {int rounds = iterations, Random? random}) {
    final rnd = random ?? Random.secure();
    final salt = List<int>.generate(16, (_) => rnd.nextInt(256));
    final key = _pbkdf2(utf8.encode(pin), salt, rounds);
    return '$_scheme\$$rounds\$${base64Url.encode(salt)}\$${base64Url.encode(key)}';
  }

  /// Whether [pin] matches [stored]. Accepts the legacy fast hash too (see
  /// [isLegacy]) so existing installs keep unlocking; callers re-hash then.
  static bool verify(String pin, String stored, {required String legacySalt}) {
    if (isLegacy(stored)) {
      return _constantTimeEquals(legacyHash(pin, legacySalt), stored);
    }
    final parts = stored.split('\$');
    if (parts.length != 4 || parts[0] != _scheme) return false;
    final rounds = int.tryParse(parts[1]);
    if (rounds == null || rounds < 1) return false;
    try {
      final salt = base64Url.decode(parts[2]);
      final expected = base64Url.decode(parts[3]);
      return _constantTimeEquals(
          base64Url.encode(_pbkdf2(utf8.encode(pin), salt, rounds)),
          base64Url.encode(expected));
    } catch (_) {
      return false;
    }
  }

  /// A hash stored by an older version: 64 hex chars of a fixed-salt SHA-256.
  static bool isLegacy(String stored) =>
      RegExp(r'^[0-9a-f]{64}$').hasMatch(stored);

  /// The old format, kept only to verify (then replace) existing hashes.
  /// [legacySalt] is the app-specific template, `<prefix>:{pin}:ao`.
  static String legacyHash(String pin, String legacySalt) =>
      sha256.convert(utf8.encode(legacySalt.replaceFirst('{pin}', pin))).toString();

  @visibleForTesting
  static List<int> derive(List<int> password, List<int> salt, int rounds) =>
      _pbkdf2(password, salt, rounds);

  /// PBKDF2 (RFC 8018) with HMAC-SHA256, one 32-byte block.
  static List<int> _pbkdf2(List<int> password, List<int> salt, int rounds) {
    final hmac = Hmac(sha256, password);
    var u = hmac.convert([...salt, 0, 0, 0, 1]).bytes;
    final out = List<int>.from(u);
    for (var i = 1; i < rounds; i++) {
      u = hmac.convert(u).bytes;
      for (var j = 0; j < out.length; j++) {
        out[j] ^= u[j];
      }
    }
    return out;
  }

  static bool _constantTimeEquals(String a, String b) {
    if (a.length != b.length) return false;
    var diff = 0;
    for (var i = 0; i < a.length; i++) {
      diff |= a.codeUnitAt(i) ^ b.codeUnitAt(i);
    }
    return diff == 0;
  }
}
