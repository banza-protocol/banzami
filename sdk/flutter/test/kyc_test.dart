import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:banzami_flutter/banzami_flutter.dart';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const _baseUrl = 'https://sandbox-api.banzami.com';

/// Builds a [ConsumerPublicClient] whose transport returns [body] with [status],
/// and records the last request so tests can assert method/path/body.
({ConsumerPublicClient client, List<http.Request> requests}) _client(
  int status,
  Object body,
) {
  final requests = <http.Request>[];
  final client = ConsumerPublicClient(
    baseUrl: _baseUrl,
    httpClient: MockClient((req) async {
      requests.add(req);
      return http.Response(jsonEncode(body), status,
          headers: {'content-type': 'application/json'});
    }),
  );
  client.setToken('test.jwt.token');
  return (client: client, requests: requests);
}

Map<String, dynamic> _caseJson({
  String status = 'WAITING_DOCUMENTS',
  List<Map<String, dynamic>>? evidence,
}) =>
    {
      'id': 'case-123',
      'status': status,
      'document_type': 'IDENTITY_CARD',
      'country': 'AO',
      'environment': 'SANDBOX',
      'created_at': '2026-06-28T10:00:00Z',
      'required_evidence': [
        {'evidence_type': 'DOCUMENT_IMAGE', 'side': 'FRONT', 'slot': 'document-front', 'uploaded': false},
        {'evidence_type': 'DOCUMENT_IMAGE', 'side': 'BACK', 'slot': 'document-back', 'uploaded': false},
        {'evidence_type': 'SELFIE', 'side': 'SELFIE', 'slot': 'selfie', 'uploaded': false},
      ],
      'evidence': evidence ?? const [],
    };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

void main() {
  group('createKycCase', () {
    test('parses the case and sends document_type WITHOUT requested_level', () async {
      final h = _client(201, _caseJson());
      final c = await h.client.createKycCase(documentType: KycDocumentType.identityCard, country: 'AO');

      expect(c.id, 'case-123');
      expect(c.status, KycStatus.waitingDocuments);
      expect(c.documentType, KycDocumentType.identityCard);
      expect(c.requiredEvidence, hasLength(3));
      expect(c.requiredEvidence.first.slot, 'document-front');
      expect(c.isReadyToSubmit, isFalse);

      final req = h.requests.single;
      expect(req.method, 'POST');
      expect(req.url.path, '/v1/kyc/cases');
      final sent = jsonDecode(req.body) as Map<String, dynamic>;
      expect(sent['document_type'], 'IDENTITY_CARD');
      expect(sent['country'], 'AO');
      // The consumer must never pick the level.
      expect(sent.containsKey('requested_level'), isFalse);
    });
  });

  group('getCurrentKycCase', () {
    test('returns null when none exists (404)', () async {
      final h = _client(404, {'code': 'NOT_FOUND', 'message': 'kyc case not found'});
      expect(await h.client.getCurrentKycCase(), isNull);
    });

    test('returns the case on 200', () async {
      final h = _client(200, _caseJson(status: 'UNDER_REVIEW'));
      final c = await h.client.getCurrentKycCase();
      expect(c, isNotNull);
      expect(c!.status, KycStatus.underReview);
      expect(c.status.isUnderReview, isTrue);
    });
  });

  group('getKycCase', () {
    test('throws isNotFound (404) for another subject\'s case', () async {
      final h = _client(404, {'code': 'NOT_FOUND', 'message': 'kyc case not found'});
      expect(
        () => h.client.getKycCase('case-x'),
        throwsA(isA<BanzamiApiException>().having((e) => e.isNotFound, 'isNotFound', isTrue)),
      );
    });
  });

  group('requestKycUploadUrl', () {
    test('sends evidence_type/side/content_type and parses the signed PUT', () async {
      final h = _client(200, {
        'evidence_id': 'ev-1',
        'upload_url': 'https://r2.example.com/kyc/consumer/abc?X-Amz-Signature=secret',
        'method': 'PUT',
        'headers': {'content-type': 'image/jpeg'},
        'expires_at': '2026-06-28T10:05:00Z',
      });

      final up = await h.client.requestKycUploadUrl(
        caseId: 'case-123',
        evidenceType: KycEvidenceType.documentImage,
        side: KycDocumentSide.front,
        contentType: 'image/jpeg',
      );

      expect(up.evidenceId, 'ev-1');
      expect(up.method, 'PUT');
      expect(up.headers['content-type'], 'image/jpeg');
      expect(up.expiresAt, isNotNull);

      final sent = jsonDecode(h.requests.single.body) as Map<String, dynamic>;
      expect(h.requests.single.url.path, '/v1/kyc/cases/case-123/evidence/upload-url');
      expect(sent['evidence_type'], 'DOCUMENT_IMAGE');
      expect(sent['side'], 'FRONT');
      expect(sent['content_type'], 'image/jpeg');
      expect(sent.containsKey('storage_key'), isFalse);
    });

    test('toString() redacts the signed URL (never leaked to logs)', () async {
      final h = _client(200, {
        'evidence_id': 'ev-1',
        'upload_url': 'https://r2.example.com/kyc/consumer/abc?X-Amz-Signature=secret',
        'method': 'PUT',
        'headers': const {},
        'expires_at': '2026-06-28T10:05:00Z',
      });
      final up = await h.client.requestKycUploadUrl(
        caseId: 'case-123',
        evidenceType: KycEvidenceType.selfie,
        side: KycDocumentSide.selfie,
      );
      expect(up.toString(), isNot(contains('X-Amz-Signature')));
      expect(up.toString(), contains('<redacted signed URL>'));
    });

    test('throws 503 STORAGE_NOT_CONFIGURED when storage is unavailable', () async {
      final h = _client(503, {'code': 'STORAGE_NOT_CONFIGURED', 'message': 'unavailable'});
      expect(
        () => h.client.requestKycUploadUrl(
          caseId: 'case-123',
          evidenceType: KycEvidenceType.documentImage,
          side: KycDocumentSide.front,
        ),
        throwsA(isA<BanzamiApiException>()
            .having((e) => e.statusCode, 'statusCode', 503)
            .having((e) => e.code, 'code', 'STORAGE_NOT_CONFIGURED')),
      );
    });
  });

  group('completeKycEvidenceUpload', () {
    test('parses the case after HEAD verify and reaches DOCUMENTS_RECEIVED', () async {
      final h = _client(200, _caseJson(status: 'DOCUMENTS_RECEIVED', evidence: [
        {'id': 'ev-1', 'evidence_type': 'SELFIE', 'side': 'SELFIE', 'slot': 'selfie', 'status': 'UPLOADED', 'uploaded_at': '2026-06-28T10:04:00Z'},
      ]));
      final c = await h.client.completeKycEvidenceUpload(caseId: 'case-123', evidenceId: 'ev-1');
      expect(c.status, KycStatus.documentsReceived);
      expect(c.evidence.single.isUploaded, isTrue);
      expect(c.evidence.single.uploadedAt, isNotNull);
    });
  });

  group('submitKycCase', () {
    test('happy path -> UNDER_REVIEW', () async {
      final h = _client(200, _caseJson(status: 'UNDER_REVIEW'));
      final c = await h.client.submitKycCase('case-123');
      expect(c.status, KycStatus.underReview);
    });

    test('incomplete submit -> 409 EVIDENCE_INCOMPLETE', () async {
      final h = _client(409, {'code': 'EVIDENCE_INCOMPLETE', 'message': 'required evidence is missing'});
      expect(
        () => h.client.submitKycCase('case-123'),
        throwsA(isA<BanzamiApiException>()
            .having((e) => e.isConflict, 'isConflict', isTrue)
            .having((e) => e.code, 'code', 'EVIDENCE_INCOMPLETE')),
      );
    });
  });

  group('getKycStatus', () {
    test('extracts the KycStatus enum', () async {
      final h = _client(200, _caseJson(status: 'APPROVED'));
      final s = await h.client.getKycStatus('case-123');
      expect(s, KycStatus.approved);
      expect(s.isApproved, isTrue);
      expect(s.isTerminal, isTrue);
      expect(h.requests.single.url.path, '/v1/kyc/cases/case-123/status');
    });

    test('unknown wire status degrades to KycStatus.unknown', () async {
      final h = _client(200, _caseJson(status: 'SOMETHING_NEW'));
      expect(await h.client.getKycStatus('case-123'), KycStatus.unknown);
    });
  });

  group('enums', () {
    test('wire round-trips for all KYC enums', () {
      expect(KycDocumentType.fromWire('PASSPORT'), KycDocumentType.passport);
      expect(KycDocumentType.fromWire('NOPE'), isNull);
      expect(KycDocumentSide.fromWire('MAIN_PAGE'), KycDocumentSide.mainPage);
      expect(KycDocumentSide.fromWire(''), isNull);
      expect(KycEvidenceType.fromWire('PROOF_OF_ADDRESS'), KycEvidenceType.proofOfAddress);
      expect(KycStatus.fromWire('NEEDS_MORE_INFO'), KycStatus.needsMoreInfo);
      expect(KycStatus.fromWire(null), KycStatus.unknown);
    });
  });
}
