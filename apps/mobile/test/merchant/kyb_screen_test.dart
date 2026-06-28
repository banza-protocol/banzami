import 'dart:convert';

import 'package:banzami_flutter/banzami_flutter.dart';
import 'package:banzami_mobile/merchant/screens/kyb_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';

final _jwt = jsonEncode({
  'token': 't',
  'expires_at': DateTime.now().add(const Duration(hours: 1)).toIso8601String(),
});

final _status = {
  'kyb_status': 'UNDER_REVIEW',
  'verified': false,
  'documents': [
    {'document_type': 'COMMERCIAL_REGISTRATION', 'status': 'VALID', 'valid_until': '2027-01-01T00:00:00Z'},
    {'document_type': 'COMPANY_TAX_ID', 'status': 'MISSING'},
    {'document_type': 'REPRESENTATIVE_ID', 'status': 'REJECTED', 'rejection_reason': 'DOC_UNREADABLE'},
  ],
};

Widget _app() => Provider<BanzamiClient>(
      create: (_) => BanzamiClient(
        apiKey: 'bz_test_key',
        baseUrl: 'https://api.test',
        httpClient: MockClient((req) async {
          if (req.url.path.endsWith('/auth/token')) {
            return http.Response(_jwt, 200, headers: {'content-type': 'application/json'});
          }
          return http.Response(jsonEncode(_status), 200, headers: {'content-type': 'application/json'});
        }),
      ),
      child: const MaterialApp(home: KybScreen()),
    );

void main() {
  testWidgets('renders real document states; no application form', (tester) async {
    await tester.pumpWidget(_app());
    await tester.pumpAndSettle();

    // Title + the 3 document slots.
    expect(find.text('Verificação do negócio'), findsOneWidget);
    expect(find.text('Registo Comercial'), findsOneWidget);
    expect(find.text('NIF da empresa'), findsOneWidget);
    expect(find.text('Documento do representante'), findsOneWidget);

    // Real per-document states.
    expect(find.text('Válido'), findsOneWidget);
    expect(find.text('Em falta'), findsOneWidget);
    expect(find.text('Rejeitado'), findsOneWidget);
    expect(find.textContaining('DOC_UNREADABLE'), findsOneWidget);

    // Update action present, never the old application form.
    expect(find.text('Atualizar documento'), findsWidgets);
    expect(find.text('Nome legal do negócio'), findsNothing);
    expect(find.text('Representante legal'), findsNothing);
    expect(find.byType(TextFormField), findsNothing);
  });
}
