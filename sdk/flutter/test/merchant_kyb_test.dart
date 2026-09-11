import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:banzami_flutter/banzami_flutter.dart';

final _jwtBody = jsonEncode({
  'token': 'test.jwt.token',
  'expires_at': DateTime.now().add(const Duration(hours: 1)).toIso8601String(),
});

({BanzamiClient client, List<http.Request> requests}) _client(
    int status, Object body) {
  final reqs = <http.Request>[];
  final client = BanzamiClient(
    apiKey: 'bz_test_key',
    baseUrl: 'https://api.test',
    httpClient: MockClient((req) async {
      // First the apiKey→JWT exchange; then the actual KYB request.
      if (req.url.path.endsWith('/auth/token')) {
        return http.Response(_jwtBody, 200,
            headers: {'content-type': 'application/json'});
      }
      reqs.add(req);
      return http.Response(jsonEncode(body), status,
          headers: {'content-type': 'application/json'});
    }),
  );
  return (client: client, requests: reqs);
}

Map<String, dynamic> _statusJson() => {
      'kyb_status': 'UNDER_REVIEW',
      'verified': false,
      'documents': [
        {
          'document_type': 'COMMERCIAL_REGISTRATION',
          'status': 'PENDING_REVIEW',
          'submitted_at': '2026-06-29T10:00:00Z'
        },
        {'document_type': 'COMPANY_TAX_ID', 'status': 'MISSING'},
        {
          'document_type': 'REPRESENTATIVE_ID',
          'status': 'REJECTED',
          'rejection_reason': 'DOC_UNREADABLE'
        },
      ],
    };

void main() {
  group('getMerchantKybStatus', () {
    test('parses status + 3 typed document slots', () async {
      final h = _client(200, _statusJson());
      final st = await h.client.getMerchantKybStatus();
      expect(st.kybStatus, 'UNDER_REVIEW');
      expect(st.verified, isFalse);
      expect(st.documents, hasLength(3));
      expect(
          st.documents[0].type, MerchantKybDocumentType.commercialRegistration);
      expect(st.documents[0].status, MerchantKybDocumentStatus.pendingReview);
      expect(st.documents[1].status, MerchantKybDocumentStatus.missing);
      expect(st.documents[2].rejectionReason, 'DOC_UNREADABLE');
      expect(h.requests.single.url.path, '/v1/merchant/kyb/status');
    });
  });

  group('getMerchantKybDocuments', () {
    test('parses the slots list', () async {
      final h = _client(200, {'documents': _statusJson()['documents']});
      final docs = await h.client.getMerchantKybDocuments();
      expect(docs, hasLength(3));
      expect(docs.map((d) => d.status).toList(), [
        MerchantKybDocumentStatus.pendingReview,
        MerchantKybDocumentStatus.missing,
        MerchantKybDocumentStatus.rejected,
      ]);
    });
  });

  group('requestMerchantKybDocumentUploadUrl', () {
    test(
        'hits /documents/{type}/upload-url, sends content_type, parses + redacts URL',
        () async {
      final h = _client(200, {
        'document_id': 'doc-1',
        'upload_url':
            'https://r2.example/kyb/merchant/abc?X-Amz-Signature=secret',
        'method': 'PUT',
        'headers': {'content-type': 'image/jpeg'},
        'expires_at': '2026-06-29T10:05:00Z',
      });
      final up = await h.client.requestMerchantKybDocumentUploadUrl(
        MerchantKybDocumentType.companyTaxId,
        contentType: 'image/jpeg',
      );
      expect(up.documentId, 'doc-1');
      expect(up.method, 'PUT');
      expect(up.toString(), isNot(contains('X-Amz-Signature')));
      expect(up.toString(), contains('<redacted signed URL>'));

      final req = h.requests.single;
      expect(
          req.url.path, '/v1/merchant/kyb/documents/COMPANY_TAX_ID/upload-url');
      expect((jsonDecode(req.body) as Map)['content_type'], 'image/jpeg');
    });

    test('503 STORAGE_NOT_CONFIGURED', () async {
      final h = _client(
          503, {'code': 'STORAGE_NOT_CONFIGURED', 'message': 'no storage'});
      expect(
        () => h.client.requestMerchantKybDocumentUploadUrl(
            MerchantKybDocumentType.companyTaxId),
        throwsA(isA<BanzamiApiException>()
            .having((e) => e.statusCode, 'status', 503)),
      );
    });
  });

  group('completeMerchantKybDocumentUpload', () {
    test('returns the updated document (PENDING_REVIEW)', () async {
      final h = _client(200, {
        'id': 'doc-1',
        'document_type': 'COMPANY_TAX_ID',
        'status': 'PENDING_REVIEW'
      });
      final d = await h.client.completeMerchantKybDocumentUpload('doc-1');
      expect(d.status, MerchantKybDocumentStatus.pendingReview);
      expect(h.requests.single.url.path,
          '/v1/merchant/kyb/documents/doc-1/complete');
    });

    test('404 for another merchant\'s document', () async {
      final h =
          _client(404, {'code': 'NOT_FOUND', 'message': 'document not found'});
      expect(
        () => h.client.completeMerchantKybDocumentUpload('doc-x'),
        throwsA(isA<BanzamiApiException>()
            .having((e) => e.isNotFound, 'isNotFound', isTrue)),
      );
    });
  });

  group('enums', () {
    test('wire round-trips', () {
      expect(MerchantKybDocumentType.fromWire('REPRESENTATIVE_ID'),
          MerchantKybDocumentType.representativeId);
      expect(MerchantKybDocumentType.fromWire('NOPE'), isNull);
      expect(MerchantKybDocumentStatus.fromWire('EXPIRED'),
          MerchantKybDocumentStatus.expired);
      expect(MerchantKybDocumentStatus.fromWire('WAT'),
          MerchantKybDocumentStatus.unknown);
    });
  });

  group('MerchantComplianceStatus — withdrawals need KYB AND AML', () {
    test('KYB approved alone does not allow a withdrawal', () async {
      final c = _client(200, {'kyb_status': 'APPROVED', 'aml_status': 'PENDING'});
      final st = await c.client.getMerchantComplianceStatus();
      expect(c.requests.single.url.path, '/v1/compliance/merchants/status');
      expect(st.kybApproved, isTrue);
      expect(st.canWithdraw, isFalse);
    });

    test('both approved allows it', () {
      final st = MerchantComplianceStatus.fromJson(
          {'kyb_status': 'APPROVED', 'aml_status': 'APPROVED'});
      expect(st.canWithdraw, isTrue);
    });
  });
}
