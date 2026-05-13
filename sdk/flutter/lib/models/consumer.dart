class Consumer {
  final String id;
  final String handle;
  final String? displayName;
  final String status;
  final DateTime createdAt;
  final DateTime updatedAt;

  const Consumer({
    required this.id,
    required this.handle,
    this.displayName,
    required this.status,
    required this.createdAt,
    required this.updatedAt,
  });

  String get displayLabel => displayName?.isNotEmpty == true ? displayName! : '@$handle';
  bool get isActive    => status == 'ACTIVE';
  bool get isSuspended => status == 'SUSPENDED';
  bool get isClosed    => status == 'CLOSED';

  factory Consumer.fromJson(Map<String, dynamic> json) {
    return Consumer(
      id:          json['id'] as String,
      handle:      json['handle'] as String,
      displayName: json['display_name'] as String?,
      status:      json['status'] as String,
      createdAt:   DateTime.parse(json['created_at'] as String),
      updatedAt:   DateTime.parse(json['updated_at'] as String),
    );
  }

  Map<String, dynamic> toJson() => {
    'id':           id,
    'handle':       handle,
    'display_name': displayName,
    'status':       status,
    'created_at':   createdAt.toIso8601String(),
    'updated_at':   updatedAt.toIso8601String(),
  };
}
