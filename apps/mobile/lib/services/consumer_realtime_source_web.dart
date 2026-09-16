import 'dart:async';
// EventSource is the browser-native SSE client and needs a web-only library.
// This file is only ever compiled for the web target (selected by the conditional
// export in consumer_realtime_source.dart), so the web-library lints are expected.
// ignore: avoid_web_libraries_in_flutter, deprecated_member_use
import 'dart:html' as html;

import 'consumer_home_refresh_controller.dart';

/// Web realtime transport for CONSUMER-HOME-REALTIME-001.
///
/// Uses the browser's native EventSource against the SAME-ORIGIN App Web BFF
/// (`/consumer/v1/me/realtime`). The opaque session cookie authenticates the
/// request; the BFF attaches the upstream Consumer Bearer server-side, so no
/// Bearer, key, or token is ever visible to browser JavaScript or placed in a
/// URL. It carries no financial truth — the controller refetches canonical Home
/// state on each signal. One EventSource per `connect()`; on error we close and
/// let the controller reconnect with its own bounded backoff.
class _WebRealtimeSource implements ConsumerRealtimeSource {
  _WebRealtimeSource({required this.baseUrl});

  /// Same-origin base, e.g. '/consumer' (relative → app.banzami.com).
  final String baseUrl;

  html.EventSource? _es;

  @override
  Stream<ConsumerRealtimeSignal> connect() {
    final controller = StreamController<ConsumerRealtimeSignal>();
    // withCredentials sends the same-origin session cookie; no Authorization
    // header is set here and none is readable from JS.
    final es = html.EventSource('$baseUrl/v1/me/realtime', withCredentials: true);
    _es = es;

    void emit(ConsumerRealtimeSignal s) {
      if (!controller.isClosed) controller.add(s);
    }

    es.addEventListener('snapshot', (_) => emit(ConsumerRealtimeSignal.snapshot));
    es.addEventListener('wallet.changed', (_) => emit(ConsumerRealtimeSignal.changed));
    es.addEventListener('expired', (_) {
      emit(ConsumerRealtimeSignal.expired);
      es.close();
      if (!controller.isClosed) controller.close();
    });
    // Any transport error: close and surface as done so the controller
    // reconnects (we do NOT rely on EventSource's own auto-reconnect, so backoff
    // and the reconnect-refresh stay under the controller's control).
    es.onError.listen((_) {
      es.close();
      if (!controller.isClosed) controller.close();
    });

    controller.onCancel = () => es.close();
    return controller.stream;
  }

  @override
  void dispose() {
    _es?.close();
  }
}

ConsumerRealtimeSource createConsumerRealtimeSource({
  required String baseUrl,
  String? Function()? bearer, // unused on web — the BFF holds the Bearer
}) =>
    _WebRealtimeSource(baseUrl: baseUrl);
