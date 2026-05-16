import 'dart:io';

import 'package:flutter/services.dart';
import 'package:http/io_client.dart';

/// Creates an [IOClient] whose TLS trust store contains ONLY the
/// Cloudflare Origin RSA Root CA.
///
/// Effect: any certificate NOT signed by this CA is rejected, even if the
/// device's system trust store would otherwise accept it.  This blocks
/// rogue-CA attacks (a CA not in our pinned set cannot mint a valid cert
/// for *.banzami.org that the app will accept).
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

  /// Asset path relative to the host app's root.
  static const _caCertAsset = 'assets/certs/cloudflare_origin_ca.pem';

  /// Returns a pinned [IOClient].
  ///
  /// Loads the Cloudflare Origin CA PEM from the app's bundled assets and
  /// creates a [SecurityContext] that trusts only that CA.  Standard system
  /// roots are excluded (`withTrustedRoots: false`).
  static Future<IOClient> create() async {
    final pemBytes = await rootBundle.load(_caCertAsset);
    final pem      = pemBytes.buffer.asUint8List();

    final context = SecurityContext(withTrustedRoots: false)
      ..setTrustedCertificatesBytes(pem);

    final httpClient = HttpClient(context: context)
      ..connectionTimeout = const Duration(seconds: 15)
      ..idleTimeout       = const Duration(seconds: 60);

    return IOClient(httpClient);
  }
}
