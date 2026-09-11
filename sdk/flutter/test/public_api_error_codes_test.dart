import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import 'package:banzami_flutter/banzami_flutter.dart';

/// A7-11: every error code public-api sends reads in Portuguese in the app —
/// never the server's English `message`. The codes are the ones the server
/// really emits (test/fixtures/public_api_error_codes.txt, re-derived from
/// the Go handlers below so it cannot drift silently).

/// Generic codes whose HTTP status class already says the right thing in
/// Portuguese ("A sua sessão terminou", "Não encontrado", "Pedido inválido",
/// "Serviço temporariamente indisponível"…). Any other code needs its own copy.
const statusClassCodes = {
  'BAD_REQUEST',
  'FCM_ERROR', // Sandbox debug push only
  'FORBIDDEN',
  'INTERNAL_ERROR',
  'INVALID_BODY',
  'INVALID_FIELD',
  'INVALID_INPUT',
  'INVALID_LIFECYCLE_STATE',
  'INVALID_PARAM',
  'INVALID_STATE',
  'METHOD_NOT_ALLOWED',
  'MISSING_FIELD',
  'NOT_FOUND',
  'UNAUTHORIZED',
  'VALIDATION_ERROR',
};

class _Emitted {
  const _Emitted(this.code, this.status, {this.passthrough = false});
  final String code;
  final int status;
  final bool passthrough;
  @override
  String toString() => '$code $status';
}

List<_Emitted> _fixture() => File('test/fixtures/public_api_error_codes.txt')
    .readAsLinesSync()
    .map((l) => l.trim())
    .where((l) => l.isNotEmpty && !l.startsWith('#'))
    .map((l) {
      final parts = l.split(RegExp(r'\s+'));
      return _Emitted(parts[0], int.parse(parts[1]),
          passthrough: parts.length > 2 && parts[2] == 'passthrough');
    })
    .toList();

const _httpStatus = {
  'BadRequest': 400,
  'Unauthorized': 401,
  'Forbidden': 403,
  'NotFound': 404,
  'MethodNotAllowed': 405,
  'Conflict': 409,
  'UnprocessableEntity': 422,
  'TooManyRequests': 429,
  'InternalServerError': 500,
  'BadGateway': 502,
  'ServiceUnavailable': 503,
};

/// The (code, status) pairs of every apierror.Respond call in public-api.
Set<String> _emittedByGo(Directory root) {
  final out = <String>{};
  final respond = RegExp(r'apierror\.Respond\w*\(');
  final literal = RegExp(r'"([A-Z][A-Z0-9_]+)"');
  final status = RegExp(r'http\.Status(\w+)');
  for (final f in root.listSync(recursive: true).whereType<File>()) {
    if (!f.path.endsWith('.go') || f.path.endsWith('_test.go')) continue;
    final src = f.readAsStringSync();
    for (final m in respond.allMatches(src)) {
      var depth = 1;
      var i = m.end;
      while (depth > 0) {
        final c = src[i++];
        if (c == '(') depth++;
        if (c == ')') depth--;
      }
      final call = src.substring(m.end, i - 1);
      final code = literal.firstMatch(call)?.group(1);
      if (code == null) continue; // a passed-through code: listed by hand
      final name = status.firstMatch(call)?.group(1);
      final st = _httpStatus[name];
      expect(st, isNotNull, reason: '${f.path}: unknown status "$name" for $code — add it to _httpStatus');
      out.add('$code $st');
    }
  }
  return out;
}

BanzamiApiException _api(int status, String code) => BanzamiApiException(
      statusCode: status,
      code: code,
      message: 'english diagnostic text from the server',
    );

void main() {
  final fixture = _fixture();

  test('the fixture is what public-api really sends', () {
    final root = Directory('../../services/public-api/internal');
    if (!root.existsSync()) {
      markTestSkipped('public-api sources not present (SDK outside the monorepo)');
      return;
    }
    final fromGo = _emittedByGo(root);
    final listed = fixture.where((e) => !e.passthrough).map((e) => e.toString()).toSet();
    expect(listed.difference(fromGo), isEmpty,
        reason: 'listed in the fixture but no longer sent — remove them');
    expect(fromGo.difference(listed), isEmpty,
        reason: 'sent by public-api but missing from '
            'test/fixtures/public_api_error_codes.txt — add them, with copy');
  });

  test('every code public-api sends has Portuguese copy', () {
    expect(fixture, isNotEmpty);
    final missing = <String>[];
    for (final e in fixture) {
      final text = banzamiErrorMessage(_api(e.status, e.code));
      expect(text, isNotEmpty, reason: '$e');
      expect(text, isNot(contains('english diagnostic')), reason: '$e');
      if (!banzamiErrorCodeHasCopy(e.code) && !statusClassCodes.contains(e.code)) {
        missing.add(e.code);
      }
    }
    expect(missing, isEmpty,
        reason: 'these codes fall back to generic status copy; give them their '
            'own Portuguese copy in lib/utils/error_messages.dart');
  });

  test('the generic codes are generic: none of them has been given copy', () {
    for (final code in statusClassCodes) {
      expect(banzamiErrorCodeHasCopy(code), isFalse,
          reason: '$code has its own copy — remove it from statusClassCodes');
    }
  });

  test('the codes the audit found drifted read in Portuguese', () {
    for (final code in [
      'SELF_TRANSFER_NOT_ALLOWED', 'RECIPIENT_UNAVAILABLE', 'WALLET_LOCKED',
      'INVALID_RECIPIENT', 'TRANSFER_FAILED', 'RATE_LIMITED',
    ]) {
      expect(banzamiErrorCodeHasCopy(code), isTrue, reason: code);
    }
    expect(banzamiErrorMessage(_api(400, 'SELF_TRANSFER_NOT_ALLOWED')),
        'Não pode enviar dinheiro para si mesmo.');
  });
}
