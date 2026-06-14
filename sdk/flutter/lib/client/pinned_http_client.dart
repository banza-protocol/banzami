import 'dart:io';

import 'package:http/io_client.dart';

/// Creates an [IOClient] with sensible timeouts for production use.
///
/// The server uses a Let's Encrypt certificate trusted by the system root
/// store, so no custom [SecurityContext] is needed.
///
/// Usage — pass the result as [httpClient] to [BanzamiClient] /
/// [ConsumerPublicClient]:
///
/// ```dart
/// final client = await PinnedHttpClient.create();
/// final api = BanzamiClient(baseUrl: '...', apiKey: '...', httpClient: client);
/// ```
///
/// Call [PinnedHttpClient.create] once at app startup and reuse the client.
/// Constructing a new [HttpClient] per request is expensive.
class PinnedHttpClient {
  PinnedHttpClient._();

  static Future<IOClient> create() async {
    final httpClient = HttpClient()
      ..connectionTimeout = const Duration(seconds: 15)
      ..idleTimeout       = const Duration(seconds: 60);

    return IOClient(httpClient);
  }
}
