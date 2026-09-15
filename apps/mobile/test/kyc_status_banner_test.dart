import 'dart:convert';
import 'dart:io';

import 'package:banzami_flutter/banzami_flutter.dart';
import 'package:banzami_mobile/config.dart';
import 'package:banzami_mobile/widgets/kyc_status_banner.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:provider/provider.dart';

/// Answers GET /v1/kyc/cases/current the way public-api does.
class _CurrentCase extends http.BaseClient {
  _CurrentCase(this.status, [this.caseStatus]);
  final int status;
  final String? caseStatus;
  final List<String> paths = [];

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    paths.add(request.url.path);
    if (status < 0) throw const SocketException('offline');
    final body = status == 404
        ? {'code': 'NOT_FOUND', 'message': 'kyc case not found'}
        : {
            'id': 'case-1',
            'status': caseStatus,
            'environment': 'SANDBOX',
            'created_at': '2026-09-10T10:00:00Z',
            'required_evidence': const [],
            'evidence': const [],
          };
    return http.StreamedResponse(
      Stream.value(utf8.encode(jsonEncode(body))),
      status,
      headers: {'content-type': 'application/json'},
    );
  }
}

/// The consumer app's own wiring: a ConsumerPublicClient and nothing else.
Widget _app(http.Client client) => Provider<ConsumerPublicClient>(
      create: (_) => ConsumerPublicClient(baseUrl: 'http://test', httpClient: client)..setToken('tok'),
      child: const MaterialApp(home: Scaffold(body: KycStatusBanner())),
    );

void main() {
  testWidgets('a consumer with no case sees "Conta limitada", read through the consumer client', (tester) async {
    final http = _CurrentCase(404);
    await tester.pumpWidget(_app(http));
    await tester.pumpAndSettle();
    expect(find.text('Conta limitada'), findsOneWidget);
    expect(http.paths, contains('/v1/kyc/cases/current'));
  });

  testWidgets('an approved case shows nothing', (tester) async {
    await tester.pumpWidget(_app(_CurrentCase(200, 'APPROVED')));
    await tester.pumpAndSettle();
    expect(find.byType(InkWell), findsNothing);
    expect(find.text('Conta limitada'), findsNothing);
  });

  testWidgets('a case under review says so and is not a button', (tester) async {
    await tester.pumpWidget(_app(_CurrentCase(200, 'UNDER_REVIEW')));
    await tester.pumpAndSettle();
    expect(find.text('Identidade em análise'), findsOneWidget);
    expect(find.byIcon(Icons.chevron_right_rounded), findsNothing);
  });

  testWidgets('a rejected case invites another try', (tester) async {
    await tester.pumpWidget(_app(_CurrentCase(200, 'REJECTED')));
    await tester.pumpAndSettle();
    expect(find.text('Verificação recusada'), findsOneWidget);
    expect(find.byIcon(Icons.chevron_right_rounded), findsOneWidget);
  });

  testWidgets('when the state cannot be read, nothing is claimed', (tester) async {
    await tester.pumpWidget(_app(_CurrentCase(-1)));
    await tester.pumpAndSettle();
    expect(find.text('Conta limitada'), findsNothing);
  });

  test('the banner reads the consumer client, not the merchant SDK client', () {
    final src = File('lib/widgets/kyc_status_banner.dart').readAsStringSync();
    expect(src, contains('context.read<ConsumerPublicClient>()'));
    expect(src, isNot(contains('context.read<BanzamiClient>()')));
  });

  // ── Sandbox requires no identity verification (WEB-APP-001 §19/§20) ──────────
  group('the banner is gated by the environment verification policy', () {
    KycCase caseWith(String wire) => KycCase.fromJson({'id': 't', 'status': wire});

    test('Public Sandbox (requiresVerification=false): hidden for every non-approved state', () {
      expect(KycBannerContent.forCase(null, requiresVerification: false), isNull); // NOT_STARTED
      for (final wire in const [
        'WAITING_DOCUMENTS', 'DRAFT', 'UNDER_REVIEW', 'DOCUMENTS_RECEIVED',
        'NEEDS_MORE_INFO', 'REJECTED', 'UNKNOWN',
      ]) {
        expect(KycBannerContent.forCase(caseWith(wire), requiresVerification: false), isNull,
            reason: '\$wire must be hidden when verification is not required');
      }
    });

    test('future Live (requiresVerification=true): shows for non-approved, hidden when approved', () {
      expect(KycBannerContent.forCase(null, requiresVerification: true), isNotNull);
      expect(KycBannerContent.forCase(caseWith('WAITING_DOCUMENTS'), requiresVerification: true), isNotNull);
      expect(KycBannerContent.forCase(caseWith('APPROVED'), requiresVerification: true), isNull);
    });

    test('mutation guard: the policy is the only thing hiding it in Sandbox', () {
      final c = caseWith('WAITING_DOCUMENTS');
      expect(KycBannerContent.forCase(c, requiresVerification: false), isNull);
      expect(KycBannerContent.forCase(c, requiresVerification: true), isNotNull);
    });

    test('AppConfig is the one policy source: Sandbox never requires verification', () {
      expect(AppConfig.requiresIdentityVerification, !AppConfig.isSandbox);
    });
  });
}
