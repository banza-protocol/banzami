import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:banzami_flutter/banzami_flutter.dart';

BanzamiApiException _api(int status, String code) => BanzamiApiException(
      statusCode: status,
      code: code,
      message: 'english diagnostic text from the server',
    );

void main() {
  group('banzamiErrorMessage — by the codes the server really sends', () {
    test('transfer refusals read in Portuguese', () {
      expect(banzamiErrorMessage(_api(400, 'SELF_TRANSFER_NOT_ALLOWED')),
          'Não pode enviar dinheiro para si mesmo.');
      expect(banzamiErrorMessage(_api(422, 'RECIPIENT_UNAVAILABLE')),
          'Este destinatário não pode receber dinheiro neste momento.');
      expect(banzamiErrorMessage(_api(403, 'WALLET_LOCKED')),
          'A sua carteira está bloqueada. Contacte o suporte.');
      expect(banzamiErrorMessage(_api(400, 'INVALID_RECIPIENT')),
          'Este @banza não é válido.');
      expect(banzamiErrorMessage(_api(500, 'TRANSFER_FAILED')),
          'A transferência não foi concluída. Tente novamente.');
      expect(banzamiErrorMessage(_api(429, 'RATE_LIMITED')),
          'Demasiadas tentativas. Aguarde um momento e tente novamente.');
      expect(banzamiErrorMessage(_api(422, 'PILOT_LIMIT_AGGREGATE_FUNDS_EXCEEDED')),
          contains('limite total de fundos'));
    });

    test('a screen can say something more precise for its own context', () {
      expect(
        banzamiErrorMessage(_api(401, 'INVALID_CREDENTIALS'),
            codes: const {'INVALID_CREDENTIALS': 'PIN incorrecto.'}),
        'PIN incorrecto.',
      );
    });

    test('unknown codes fall back to the HTTP status class', () {
      expect(banzamiErrorMessage(_api(401, 'X')),
          'A sua sessão terminou. Entre novamente.');
      expect(banzamiErrorMessage(_api(403, 'X')),
          'Não tem permissão para esta operação.');
      expect(banzamiErrorMessage(_api(404, 'X')), 'Não encontrado.');
      expect(banzamiErrorMessage(_api(409, 'X')), contains('já foi registada'));
      expect(banzamiErrorMessage(_api(422, 'X')),
          'O pedido não pôde ser concluído.');
      expect(banzamiErrorMessage(_api(429, 'X')),
          startsWith('Demasiadas tentativas'));
      for (final s in [500, 502, 503, 504]) {
        expect(banzamiErrorMessage(_api(s, 'INTERNAL_ERROR')),
            startsWith('Serviço temporariamente indisponível'));
      }
    });

    test('transport failures', () {
      expect(banzamiErrorMessage(const BanzamiNetworkException('socket')),
          kBanzamiOfflineMessage);
      expect(banzamiErrorMessage(TimeoutException('slow')),
          kBanzamiTimeoutMessage);
    });

    test('the server message is never shown', () {
      for (final s in [400, 401, 403, 404, 409, 422, 429, 500, 503]) {
        for (final c in ['UNKNOWN', 'INTERNAL_ERROR', 'SOMETHING_NEW']) {
          expect(banzamiErrorMessage(_api(s, c)),
              isNot(contains('english diagnostic')));
        }
      }
    });

    test('an outage leaves a money outcome unknown; a refusal does not', () {
      expect(isOutcomeUnknown(const BanzamiNetworkException('x')), isTrue);
      expect(isOutcomeUnknown(TimeoutException('x')), isTrue);
      expect(isOutcomeUnknown(_api(503, 'UNKNOWN')), isTrue);
      expect(isOutcomeUnknown(_api(422, 'INSUFFICIENT_FUNDS')), isFalse);
    });
  });

  group('ConsumerPublicClient — a non-JSON error page keeps its status', () {
    test('a proxy 503 page is a 503, not "sem ligação"', () async {
      final client = ConsumerPublicClient(
        baseUrl: 'https://api.test',
        httpClient: MockClient(
            (_) async => http.Response('<html>502 Bad Gateway</html>', 503)),
      );
      try {
        await client.getBalance();
        fail('expected an error');
      } on BanzamiApiException catch (e) {
        expect(e.statusCode, 503);
        expect(banzamiErrorMessage(e),
            startsWith('Serviço temporariamente indisponível'));
      }
    });

    test('a proxy 429 page reads as too many attempts', () async {
      final client = ConsumerPublicClient(
        baseUrl: 'https://api.test',
        httpClient:
            MockClient((_) async => http.Response('Too Many Requests', 429)),
      );
      await expectLater(
        client.getBalance(),
        throwsA(isA<BanzamiApiException>()
            .having((e) => e.statusCode, 'status', 429)),
      );
    });
  });
}
