class ConsumerSuggestion {
  final String handle;
  final String? displayName;

  const ConsumerSuggestion({required this.handle, this.displayName});

  factory ConsumerSuggestion.fromJson(Map<String, dynamic> json) =>
      ConsumerSuggestion(
        handle:      json['handle'] as String,
        displayName: json['display_name'] as String?,
      );
}
