// Merchant KYB document models (Banzami operator policy — KYB).
//
// The merchant maintains its business documents post-approval; the application
// form is never repeated. Files go to the KYB R2 buckets via signed PUT — the
// SDK never exposes a storage_key and never logs the signed URL.

/// The three canonical business document slots.
enum MerchantKybDocumentType {
  commercialRegistration('COMMERCIAL_REGISTRATION'),
  companyTaxId('COMPANY_TAX_ID'),
  representativeId('REPRESENTATIVE_ID');

  const MerchantKybDocumentType(this.wire);
  final String wire;

  static MerchantKybDocumentType? fromWire(String? v) {
    for (final t in values) {
      if (t.wire == v) return t;
    }
    return null;
  }
}

/// Document lifecycle state.
enum MerchantKybDocumentStatus {
  missing('MISSING'),
  pendingUpload('PENDING_UPLOAD'),
  pendingReview('PENDING_REVIEW'),
  valid('VALID'),
  rejected('REJECTED'),
  expired('EXPIRED'),
  replaced('REPLACED'),
  unknown('UNKNOWN');

  const MerchantKybDocumentStatus(this.wire);
  final String wire;

  static MerchantKybDocumentStatus fromWire(String? v) {
    for (final s in values) {
      if (s.wire == v) return s;
    }
    return MerchantKybDocumentStatus.unknown;
  }
}

/// One business document (a slot). `MISSING` means nothing uploaded yet.
class MerchantKybDocument {
  final String id;
  final MerchantKybDocumentType? type;
  final MerchantKybDocumentStatus status;
  final String mimeType;
  final int sizeBytes;
  final DateTime? submittedAt;
  final DateTime? reviewedAt;
  final DateTime? validUntil;
  final String? rejectionReason;

  const MerchantKybDocument({
    required this.id,
    required this.type,
    required this.status,
    required this.mimeType,
    required this.sizeBytes,
    required this.submittedAt,
    required this.reviewedAt,
    required this.validUntil,
    required this.rejectionReason,
  });

  factory MerchantKybDocument.fromJson(Map<String, dynamic> json) => MerchantKybDocument(
        id: (json['id'] ?? '') as String,
        type: MerchantKybDocumentType.fromWire(json['document_type'] as String?),
        status: MerchantKybDocumentStatus.fromWire(json['status'] as String?),
        mimeType: (json['mime_type'] as String?) ?? '',
        sizeBytes: (json['size_bytes'] as int?) ?? 0,
        submittedAt: _t(json['submitted_at']),
        reviewedAt: _t(json['reviewed_at']),
        validUntil: _t(json['valid_until']),
        rejectionReason: _nz(json['rejection_reason'] as String?),
      );
}

/// Global merchant KYB status + the document slots.
class MerchantKybStatus {
  final String kybStatus; // PENDING | UNDER_REVIEW | APPROVED | REJECTED | SUSPENDED
  final bool verified;
  final String? reasonCode;
  final DateTime? updatedAt;
  final List<MerchantKybDocument> documents;

  const MerchantKybStatus({
    required this.kybStatus,
    required this.verified,
    required this.reasonCode,
    required this.updatedAt,
    required this.documents,
  });

  factory MerchantKybStatus.fromJson(Map<String, dynamic> json) => MerchantKybStatus(
        kybStatus: (json['kyb_status'] as String?) ?? 'PENDING',
        verified: (json['verified'] as bool?) ?? false,
        reasonCode: _nz(json['reason_code'] as String?),
        updatedAt: _t(json['updated_at']),
        documents: ((json['documents'] as List?) ?? const [])
            .map((e) => MerchantKybDocument.fromJson(e as Map<String, dynamic>))
            .toList(growable: false),
      );
}

/// A short-lived signed upload target. The [url] must never be logged;
/// [toString] redacts it.
class MerchantKybUploadUrl {
  final String documentId;
  final String url;
  final String method;
  final Map<String, String> headers;
  final DateTime? expiresAt;

  const MerchantKybUploadUrl({
    required this.documentId,
    required this.url,
    required this.method,
    required this.headers,
    required this.expiresAt,
  });

  factory MerchantKybUploadUrl.fromJson(Map<String, dynamic> json) => MerchantKybUploadUrl(
        documentId: (json['document_id'] ?? '') as String,
        url: (json['upload_url'] ?? '') as String,
        method: (json['method'] as String?) ?? 'PUT',
        headers: ((json['headers'] as Map?) ?? const {})
            .map((k, v) => MapEntry(k.toString(), v.toString())),
        expiresAt: _t(json['expires_at']),
      );

  @override
  String toString() =>
      'MerchantKybUploadUrl(documentId: $documentId, method: $method, url: <redacted signed URL>, expiresAt: $expiresAt)';
}

DateTime? _t(Object? v) =>
    (v is String && v.isNotEmpty) ? DateTime.parse(v).toUtc() : null;
String? _nz(String? v) => (v == null || v.isEmpty) ? null : v;
