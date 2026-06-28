import 'dart:convert';

import 'package:banzami_flutter/banzami_flutter.dart';
import 'package:banzami_mobile/screens/kyc_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:provider/provider.dart';

/// Routes the KYC endpoints used by the redesigned screen and records the
/// requests so the test can assert there is no `requested_level`.
class _KycHttpClient extends http.BaseClient {
  final List<http.Request> requests = [];

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    if (request is http.Request) requests.add(request);
    final path = request.url.path;

    int status = 200;
    Map<String, dynamic> body = const {};

    if (request.method == 'GET' && path.endsWith('/v1/kyc/cases/current')) {
      status = 404; // no active case -> intro
      body = {'code': 'NOT_FOUND', 'message': 'kyc case not found'};
    } else if (request.method == 'POST' && path.endsWith('/v1/kyc/cases')) {
      status = 201;
      body = {
        'id': 'case-1',
        'status': 'WAITING_DOCUMENTS',
        'document_type': 'IDENTITY_CARD',
        'environment': 'SANDBOX',
        'created_at': '2026-06-28T10:00:00Z',
        'required_evidence': [
          {'evidence_type': 'DOCUMENT_IMAGE', 'side': 'FRONT', 'slot': 'document-front', 'uploaded': false},
          {'evidence_type': 'DOCUMENT_IMAGE', 'side': 'BACK', 'slot': 'document-back', 'uploaded': false},
          {'evidence_type': 'SELFIE', 'side': 'SELFIE', 'slot': 'selfie', 'uploaded': false},
        ],
        'evidence': const [],
      };
    }

    return http.StreamedResponse(
      Stream.value(utf8.encode(jsonEncode(body))),
      status,
      headers: {'content-type': 'application/json'},
    );
  }
}

Widget _app(_KycHttpClient client) => Provider<ConsumerPublicClient>(
      create: (_) => ConsumerPublicClient(baseUrl: 'http://test', httpClient: client)..setToken('tok'),
      child: const MaterialApp(home: KycScreen()),
    );

void main() {
  testWidgets('intro -> choose document -> capture, document-first, no level dropdown', (tester) async {
    final httpClient = _KycHttpClient();
    await tester.pumpWidget(_app(httpClient));
    await tester.pumpAndSettle();

    // 1. Bootstrap (404) lands on the intro.
    expect(find.text('Confirme quem é'), findsOneWidget);
    expect(find.text('Começar'), findsOneWidget);
    // Old form removed: no "Nível pretendido" anywhere.
    expect(find.text('Nível pretendido'), findsNothing);

    // 2. Intro -> choose document.
    await tester.tap(find.text('Começar'));
    await tester.pumpAndSettle();
    expect(find.text('Escolha o documento'), findsOneWidget);
    expect(find.text('Bilhete de Identidade'), findsOneWidget);
    expect(find.text('Passaporte'), findsOneWidget);

    // 3. Pick BI -> creates the case -> capture checklist (front+back+selfie).
    await tester.tap(find.text('Bilhete de Identidade'));
    await tester.pumpAndSettle();
    expect(find.text('Capture os documentos'), findsOneWidget);
    expect(find.text('Frente do documento'), findsOneWidget);
    expect(find.text('Verso do documento'), findsOneWidget);
    expect(find.text('Selfie'), findsOneWidget);

    // The create-case request never carries a user-chosen level.
    final create = httpClient.requests.firstWhere((r) => r.url.path.endsWith('/v1/kyc/cases'));
    final sent = jsonDecode(create.body) as Map<String, dynamic>;
    expect(sent['document_type'], 'IDENTITY_CARD');
    expect(sent.containsKey('requested_level'), isFalse);
  });
}
