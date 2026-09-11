/// The FCM topic in a push-topic answer (public-api `GET /v1/me/push-topic`,
/// gateway `GET /v1/merchant/push-topic`): `{"topic": "<name>"}`, or
/// `{"topic": null}` when push topics are not configured on that stack.
///
/// Returns null for anything that is not a valid FCM topic name, so a
/// malformed answer subscribes the device to nothing rather than to
/// something the server did not name.
String? banzamiPushTopicFrom(Map<String, dynamic> json) {
  final topic = json['topic'];
  if (topic is! String || !_fcmTopic.hasMatch(topic)) return null;
  return topic;
}

/// The characters FCM accepts in a topic name.
final RegExp _fcmTopic = RegExp(r'^[a-zA-Z0-9\-_.~%]{1,900}$');
