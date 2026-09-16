import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import 'consumer_home_refresh_controller.dart';

/// Native (iOS/Android) realtime transport for CONSUMER-HOME-REALTIME-001.
///
/// Opens ONE authenticated Server-Sent-Events connection to
/// `{baseUrl}/v1/me/realtime` with the consumer Bearer and streams the parsed
/// signals. It carries no financial truth — the controller reacts to a signal by
/// refetching canonical Home state. One connection per `connect()`; the
/// controller owns reconnect/backoff and closes us via the returned stream's
/// cancel.
class _IoRealtimeSource implements ConsumerRealtimeSource {
  _IoRealtimeSource({required this.baseUrl, this.bearer});

  final String baseUrl;
  final String? Function()? bearer;

  http.Client? _client;
  StreamController<ConsumerRealtimeSignal>? _out;

  @override
  Stream<ConsumerRealtimeSignal> connect() {
    final controller = StreamController<ConsumerRealtimeSignal>();
    _out = controller;
    final client = http.Client();
    _client = client;

    () async {
      try {
        final uri = Uri.parse('$baseUrl/v1/me/realtime');
        final req = http.Request('GET', uri);
        req.headers['Accept'] = 'text/event-stream';
        req.headers['Cache-Control'] = 'no-cache';
        final token = bearer?.call();
        if (token != null && token.isNotEmpty) {
          req.headers['Authorization'] = 'Bearer $token';
        }
        final resp = await client.send(req);
        if (resp.statusCode != 200) {
          await controller.close();
          return;
        }
        // Parse the SSE frames: `event:` + `data:` until a blank line.
        var currentEvent = '';
        await for (final line in resp.stream
            .transform(utf8.decoder)
            .transform(const LineSplitter())) {
          if (controller.isClosed) break;
          if (line.startsWith(':')) continue; // heartbeat comment
          if (line.isEmpty) {
            currentEvent = '';
            continue;
          }
          if (line.startsWith('event:')) {
            currentEvent = line.substring(6).trim();
            switch (currentEvent) {
              case 'snapshot':
                controller.add(ConsumerRealtimeSignal.snapshot);
                break;
              case 'wallet.changed':
                controller.add(ConsumerRealtimeSignal.changed);
                break;
              case 'expired':
                controller.add(ConsumerRealtimeSignal.expired);
                if (!controller.isClosed) await controller.close();
                return;
            }
          }
          // `data:` lines carry a minimal snapshot the client does not trust;
          // the controller refetches canonical state, so we ignore the payload.
        }
      } catch (_) {
        // Surface as a normal close; the controller reconnects with backoff.
      } finally {
        if (!controller.isClosed) await controller.close();
      }
    }();

    controller.onCancel = () {
      client.close();
    };
    return controller.stream;
  }

  @override
  void dispose() {
    _client?.close();
    _out?.close();
  }
}

ConsumerRealtimeSource createConsumerRealtimeSource({
  required String baseUrl,
  String? Function()? bearer,
}) =>
    _IoRealtimeSource(baseUrl: baseUrl, bearer: bearer);
