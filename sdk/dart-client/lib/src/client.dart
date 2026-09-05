import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import 'environment.dart';
import 'errors.dart';
import 'links.dart';
import 'models.dart';

/// The Banzami client for CLIENT-SIDE software.
///
/// ## What this is for
///
/// Presenting a payment your server already created, watching whether it has
/// been paid, and handling Banzami links and QR codes. That is the whole
/// surface, and it is bounded by what a credential embedded in an app may
/// safely do.
///
/// ## What it deliberately cannot do
///
/// Create a payment. Refund one. Move funds. Open an account. Manage webhooks.
/// Those need a SECRET key, which belongs on your server — anyone who downloads
/// your app can read what you compiled into it. The operator enforces this too:
/// a publishable key is refused on those routes, so this boundary does not rely
/// on the SDK being polite about it.
///
/// ```
///   your app ──publishable key──▶ Banzami        present · status · links
///        │
///        └───▶ your backend ──secret key──▶ Banzami    create · refund · transfer
/// ```
///
/// ## Usage
///
/// ```dart
/// final banzami = BanzamiClient(
///   publishableKey: 'bz_test_pk_...',       // safe to ship
///   environment: BanzamiEnvironment.sandbox,
/// );
///
/// // Your backend created the payment and returned its slug.
/// final checkout = await banzami.checkout(slug);
/// final url = banzami.checkoutUrl(slug);      // open this in a browser
/// final paid = await banzami.waitUntilPaid(slug);
/// ```
class BanzamiClient {
  /// [publishableKey] must be a publishable key (`bz_test_pk_…`). A secret key
  /// is refused here, before any request: shipping one in client software would
  /// hand every user of the app the ability to move money, and a runtime that
  /// accepted it would make that mistake silent.
  BanzamiClient({
    required String publishableKey,
    this.environment = BanzamiEnvironment.sandbox,
    String? apiBaseUrl,
    http.Client? httpClient,
    this.timeout = const Duration(seconds: 15),
  })  : _key = publishableKey.trim(),
        _baseUrl = (apiBaseUrl ?? environment.apiBaseUrl)
            .replaceAll(RegExp(r'/+$'), ''),
        _http = httpClient ?? http.Client() {
    if (_key.isEmpty) {
      throw const BanzamiConfigException('publishableKey is required');
    }
    if (_key.contains('_sk_')) {
      throw const BanzamiConfigException(
        'that is a SECRET key. A secret key must never be compiled into client '
        'software — anyone who has the app can read it, and it can move money. '
        'Use a publishable key (bz_test_pk_…) here, and keep the secret key on '
        'your server.',
      );
    }
    if (!_key.startsWith(environment.publishableKeyPrefix)) {
      throw BanzamiConfigException(
        'key/environment mismatch: a ${environment.name} client needs a key '
        'starting "${environment.publishableKeyPrefix}".',
      );
    }
    if (environment.isLive) {
      throw const BanzamiConfigException(
        'Banzami LIVE is not released. Use BanzamiEnvironment.sandbox. A client '
        'pointed at live would fail in a way that looks like a network problem, '
        'so it is refused here instead.',
      );
    }
  }

  final BanzamiEnvironment environment;
  final Duration timeout;
  final String _key;
  final String _baseUrl;
  final http.Client _http;

  bool get isSandbox => environment.isSandbox;

  /// Release the underlying HTTP client.
  void close() => _http.close();

  // ── Client-safe reads ─────────────────────────────────────────────────────

  /// What this key is, according to the operator. A cheap startup check: the
  /// wrong key or the wrong environment surfaces here rather than as a
  /// confusing failure later.
  Future<BanzamiKeyIdentity> identity() async =>
      BanzamiKeyIdentity.fromJson(await _get('/v1/me', authenticated: true));

  /// Confirm a `@banza` destination exists, and get its display name.
  ///
  /// Returns the handle and display name only — enough to show a payer who they
  /// are about to pay, and not a directory of strangers' accounts.
  Future<BanzamiHandle> resolveHandle(String handle) async {
    final h = handle.trim().replaceFirst(RegExp(r'^@'), '');
    if (h.isEmpty || !RegExp(r'^[A-Za-z0-9_.-]{1,64}$').hasMatch(h)) {
      throw BanzamiConfigException('not a @banza handle: "$handle"');
    }
    return BanzamiHandle.fromJson(
      await _get('/v1/consumers/handle/${Uri.encodeComponent(h)}',
          authenticated: true),
    );
  }

  // ── The payment your server created ───────────────────────────────────────

  /// The payer-safe view of a payment: what is being paid, to whom, and whether
  /// it is still payable. Needs no credential — it is what the hosted checkout
  /// itself reads.
  Future<BanzamiCheckout> checkout(String slug) async {
    _requireSlug(slug);
    return BanzamiCheckout.fromJson(
      await _get('/public/pay/${Uri.encodeComponent(slug)}'),
    );
  }

  /// Whether the payment has settled. The call to poll.
  Future<BanzamiCheckoutStatus> checkoutStatus(String slug) async {
    _requireSlug(slug);
    return BanzamiCheckoutStatus.fromJson(
      await _get('/public/pay/${Uri.encodeComponent(slug)}/status'),
    );
  }

  /// Poll until the payment settles, [timeout] elapses, or [cancel] completes.
  ///
  /// Returns true if it was paid. Network blips are tolerated — a payer on a
  /// phone will have them, and giving up on the first failed poll would report
  /// an unpaid payment that is actually paid.
  Future<bool> waitUntilPaid(
    String slug, {
    Duration interval = const Duration(seconds: 3),
    Duration timeout = const Duration(minutes: 10),
    Future<void>? cancel,
  }) async {
    _requireSlug(slug);
    final deadline = DateTime.now().add(timeout);
    var cancelled = false;
    unawaited(cancel?.then((_) => cancelled = true) ?? Future.value());

    while (!cancelled && DateTime.now().isBefore(deadline)) {
      try {
        if ((await checkoutStatus(slug)).paid) return true;
      } on BanzamiNetworkException {
        // Keep waiting: a dropped poll says nothing about the payment.
      } on BanzamiServerException {
        // Same.
      }
      await Future<void>.delayed(interval);
    }
    return false;
  }

  /// The hosted checkout URL to open for this payment.
  String checkoutUrl(String slug) =>
      BanzamiLinks.checkoutUrl(slug, environment: environment);

  // ── internals ─────────────────────────────────────────────────────────────

  void _requireSlug(String slug) {
    if (!BanzamiLinks.isValidSlug(slug)) {
      throw BanzamiConfigException('not a Banzami payment slug: "$slug"');
    }
  }

  Future<Map<String, dynamic>> _get(String path,
      {bool authenticated = false}) async {
    final uri = Uri.parse('$_baseUrl$path');
    http.Response res;
    try {
      res = await _http.get(uri, headers: {
        'Accept': 'application/json',
        if (authenticated) 'Authorization': 'Bearer $_key',
      }).timeout(timeout);
    } on TimeoutException {
      throw BanzamiNetworkException('timed out after ${timeout.inSeconds}s');
    } catch (e) {
      // The message is the transport's, never the request's: an exception that
      // echoed headers back would put the key in a log.
      throw BanzamiNetworkException('request failed: ${e.runtimeType}');
    }
    return _decode(res);
  }

  Map<String, dynamic> _decode(http.Response res) {
    Map<String, dynamic> body;
    try {
      body = jsonDecode(res.body) as Map<String, dynamic>;
    } catch (_) {
      body = const {};
    }
    final message = (body['message'] as String?) ?? 'request failed';

    if (res.statusCode >= 200 && res.statusCode < 300) return body;

    switch (res.statusCode) {
      case 401:
      case 403:
        throw BanzamiAuthException(message, status: res.statusCode);
      case 404:
        throw BanzamiNotFoundException(message);
      case 409:
      case 422:
        throw BanzamiPaymentStateException(message,
            status: body['code'] as String?);
      case 429:
        throw BanzamiRateLimitException(message);
      default:
        throw BanzamiServerException(message, status: res.statusCode);
    }
  }
}
