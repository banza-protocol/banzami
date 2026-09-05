class Consumer {
  final String id;
  final String handle;
  final String? displayName;
  final String status;
  final String? verificationBadge;
  final DateTime createdAt;
  final DateTime updatedAt;

  /// "PRODUCTION" or "SANDBOX". Populated by /v1/me; null when obtained
  /// via other endpoints (e.g. search) that don't carry environment context.
  final String? environment;

  const Consumer({
    required this.id,
    required this.handle,
    this.displayName,
    required this.status,
    this.verificationBadge,
    required this.createdAt,
    required this.updatedAt,
    this.environment,
  });

  String get displayLabel =>
      displayName?.isNotEmpty == true ? displayName! : '@$handle';
  bool get isActive => status == 'ACTIVE';
  bool get isSuspended => status == 'SUSPENDED';
  bool get isClosed => status == 'CLOSED';

  factory Consumer.fromJson(Map<String, dynamic> json) {
    return Consumer(
      id: json['id'] as String,
      handle: json['handle'] as String,
      displayName: json['display_name'] as String?,
      status: json['status'] as String,
      verificationBadge: json['verification_badge'] as String?,
      createdAt: DateTime.parse(json['created_at'] as String),
      updatedAt: DateTime.parse(json['updated_at'] as String),
      environment: json['environment'] as String?,
    );
  }

  bool get isSandbox => environment == 'SANDBOX';

  Map<String, dynamic> toJson() => {
        'id': id,
        'handle': handle,
        'display_name': displayName,
        'status': status,
        'created_at': createdAt.toIso8601String(),
        'updated_at': updatedAt.toIso8601String(),
      };
}
