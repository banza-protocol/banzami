// KYC — consumer identity verification models (Banzami ADR-020).
//
// These mirror the operator's /v1/kyc/* responses. The consumer never chooses a
// level (no requested_level); the granted level is an outcome of an operator
// review. The storage_key of an evidence object is never returned by the API and
// never modelled here. Signed upload URLs (KycUploadUrl.url) are short-lived and
// must never be logged.

/// The identity document a case verifies.
enum KycDocumentType {
  identityCard('IDENTITY_CARD'),
  passport('PASSPORT'),
  residencePermit('RESIDENCE_PERMIT'),
  drivingLicense('DRIVING_LICENSE');

  const KycDocumentType(this.wire);

  /// The on-the-wire value sent to / received from the API.
  final String wire;

  static KycDocumentType? fromWire(String? value) {
    if (value == null) return null;
    for (final t in values) {
      if (t.wire == value) return t;
    }
    return null;
  }
}

/// Which face/part of a document (or the selfie) a piece of evidence represents.
enum KycDocumentSide {
  front('FRONT'),
  back('BACK'),
  mainPage('MAIN_PAGE'),
  selfie('SELFIE');

  const KycDocumentSide(this.wire);

  final String wire;

  static KycDocumentSide? fromWire(String? value) {
    if (value == null || value.isEmpty) return null;
    for (final s in values) {
      if (s.wire == value) return s;
    }
    return null;
  }
}

/// The kind of evidence captured.
enum KycEvidenceType {
  documentImage('DOCUMENT_IMAGE'),
  selfie('SELFIE'),
  livenessVideo('LIVENESS_VIDEO'),
  proofOfAddress('PROOF_OF_ADDRESS');

  const KycEvidenceType(this.wire);

  final String wire;

  static KycEvidenceType? fromWire(String? value) {
    if (value == null) return null;
    for (final t in values) {
      if (t.wire == value) return t;
    }
    return null;
  }
}

/// The lifecycle state of a KYC case (operator state machine).
enum KycStatus {
  draft('DRAFT'),
  waitingDocuments('WAITING_DOCUMENTS'),
  documentsReceived('DOCUMENTS_RECEIVED'),
  underReview('UNDER_REVIEW'),
  approved('APPROVED'),
  rejected('REJECTED'),
  needsMoreInfo('NEEDS_MORE_INFO'),
  expired('EXPIRED'),
  cancelled('CANCELLED'),
  failed('FAILED'),

  /// A status the SDK does not recognise (forward-compatibility).
  unknown('UNKNOWN');

  const KycStatus(this.wire);

  final String wire;

  /// Maps a wire value to a status, defaulting to [KycStatus.unknown].
  static KycStatus fromWire(String? value) {
    for (final s in values) {
      if (s.wire == value) return s;
    }
    return KycStatus.unknown;
  }

  bool get isApproved => this == KycStatus.approved;
  bool get isUnderReview => this == KycStatus.underReview;

  /// Terminal states accept no further transitions.
  bool get isTerminal =>
      this == KycStatus.approved ||
      this == KycStatus.rejected ||
      this == KycStatus.expired ||
      this == KycStatus.cancelled ||
      this == KycStatus.failed;
}

/// A piece of evidence the case requires (a document side or the selfie), and
/// whether it has been uploaded yet. Drives the capture checklist in the UI.
class KycDocument {
  final KycEvidenceType? evidenceType;
  final KycDocumentSide? side;

  /// Server-side slot name, e.g. `document-front`, `passport-main`, `selfie`.
  final String slot;
  final bool uploaded;

  const KycDocument({
    required this.evidenceType,
    required this.side,
    required this.slot,
    required this.uploaded,
  });

  factory KycDocument.fromJson(Map<String, dynamic> json) => KycDocument(
        evidenceType: KycEvidenceType.fromWire(json['evidence_type'] as String?),
        side: KycDocumentSide.fromWire(json['side'] as String?),
        slot: json['slot'] as String? ?? '',
        uploaded: json['uploaded'] as bool? ?? false,
      );
}

/// An uploaded (or pending) evidence artifact. Never carries the storage key.
class KycEvidence {
  final String id;
  final KycEvidenceType? evidenceType;
  final KycDocumentSide? side;
  final String slot;

  /// `PENDING` | `UPLOADED` | `FAILED`.
  final String status;
  final DateTime? uploadedAt;

  const KycEvidence({
    required this.id,
    required this.evidenceType,
    required this.side,
    required this.slot,
    required this.status,
    required this.uploadedAt,
  });

  bool get isUploaded => status == 'UPLOADED';

  factory KycEvidence.fromJson(Map<String, dynamic> json) => KycEvidence(
        id: json['id'] as String,
        evidenceType: KycEvidenceType.fromWire(json['evidence_type'] as String?),
        side: KycDocumentSide.fromWire(json['side'] as String?),
        slot: json['slot'] as String? ?? '',
        status: json['status'] as String? ?? 'PENDING',
        uploadedAt: _parseTime(json['uploaded_at']),
      );
}

/// A consumer identity-verification case (aggregate root).
class KycCase {
  final String id;
  final KycStatus status;
  final KycDocumentType? documentType;
  final String? country;

  /// Set on REJECTED / NEEDS_MORE_INFO.
  final String? reasonCode;
  final String environment;
  final DateTime createdAt;
  final DateTime? submittedAt;
  final DateTime? reviewedAt;

  /// The evidence the case requires + whether each piece is uploaded.
  final List<KycDocument> requiredEvidence;

  /// The evidence already provided.
  final List<KycEvidence> evidence;

  const KycCase({
    required this.id,
    required this.status,
    required this.documentType,
    required this.country,
    required this.reasonCode,
    required this.environment,
    required this.createdAt,
    required this.submittedAt,
    required this.reviewedAt,
    required this.requiredEvidence,
    required this.evidence,
  });

  /// True when every required piece of evidence has been uploaded.
  bool get isReadyToSubmit =>
      requiredEvidence.isNotEmpty && requiredEvidence.every((d) => d.uploaded);

  factory KycCase.fromJson(Map<String, dynamic> json) => KycCase(
        id: json['id'] as String,
        status: KycStatus.fromWire(json['status'] as String?),
        documentType: KycDocumentType.fromWire(json['document_type'] as String?),
        country: _nullIfEmpty(json['country'] as String?),
        reasonCode: _nullIfEmpty(json['reason_code'] as String?),
        environment: json['environment'] as String? ?? '',
        createdAt: _parseTime(json['created_at']) ?? DateTime.fromMillisecondsSinceEpoch(0, isUtc: true),
        submittedAt: _parseTime(json['submitted_at']),
        reviewedAt: _parseTime(json['reviewed_at']),
        requiredEvidence: ((json['required_evidence'] as List?) ?? const [])
            .map((e) => KycDocument.fromJson(e as Map<String, dynamic>))
            .toList(growable: false),
        evidence: ((json['evidence'] as List?) ?? const [])
            .map((e) => KycEvidence.fromJson(e as Map<String, dynamic>))
            .toList(growable: false),
      );
}

/// A short-lived pre-signed upload target. The [url] is a signed PUT and must
/// **never be logged**; [toString] deliberately redacts it.
class KycUploadUrl {
  final String evidenceId;
  final String url;
  final String method;
  final Map<String, String> headers;
  final DateTime? expiresAt;

  const KycUploadUrl({
    required this.evidenceId,
    required this.url,
    required this.method,
    required this.headers,
    required this.expiresAt,
  });

  factory KycUploadUrl.fromJson(Map<String, dynamic> json) => KycUploadUrl(
        evidenceId: json['evidence_id'] as String,
        url: json['upload_url'] as String,
        method: json['method'] as String? ?? 'PUT',
        headers: ((json['headers'] as Map?) ?? const {})
            .map((k, v) => MapEntry(k.toString(), v.toString())),
        expiresAt: _parseTime(json['expires_at']),
      );

  /// Redacts the signed URL so it is never leaked via logs/`print`.
  @override
  String toString() =>
      'KycUploadUrl(evidenceId: $evidenceId, method: $method, url: <redacted signed URL>, expiresAt: $expiresAt)';
}

DateTime? _parseTime(Object? value) {
  if (value is String && value.isNotEmpty) {
    return DateTime.parse(value).toUtc();
  }
  return null;
}

String? _nullIfEmpty(String? value) =>
    (value == null || value.isEmpty) ? null : value;
