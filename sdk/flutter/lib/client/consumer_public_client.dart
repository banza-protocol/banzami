import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:uuid/uuid.dart';

import '../models/activity_item.dart';
import '../models/consumer.dart';
import '../models/consumer_suggestion.dart';
import '../models/payment_link.dart';
import '../models/transfer.dart';
import '../models/wallet_balance.dart';
import 'api_exception.dart';
import 'banza_environment.dart';

/// Result of a sandbox wallet top-up via [ConsumerPublicClient.sandboxFund].
class SandboxFundResult {
  final int    creditedMinor;
  final int    newBalance;
  final String currency;

  const SandboxFundResult({
    required this.creditedMinor,
    required this.newBalance,
    required this.currency,
  });
}

/// Lightweight registration bundle returned by [ConsumerPublicClient.register].
class ConsumerRegistration {
  final Consumer consumer;
  final String walletId;
  final String token;

  const ConsumerRegistration({
    required this.consumer,
    required this.walletId,
    required this.token,
  });
}

/// HTTP client for the Banzami public-api (port 8083).
///
/// This is the correct service for consumer-facing operations.
/// All routes are JWT-scoped — the token is obtained via [register] or
/// [login] and automatically injected into every subsequent request.
///
/// Usage:
/// ```dart
/// final client = ConsumerPublicClient(
///   baseUrl:   'http://localhost:8083',
///   onRequest: (method, path, attempt) => logger.info('$method $path (#$attempt)'),
///   onError:   (method, path, err, attempts) => logger.error('$method $path failed after $attempts'),
/// );
/// final reg = await client.register(handle: 'joao', pin: '123456');
/// final balance = await client.getBalance();
/// ```
class ConsumerPublicClient {
  final String baseUrl;
  final BanzaEnvironment environment;
  String? _token;
  final http.Client _http;
  final Uuid _uuid;

  /// Called before every HTTP request (including retries).
  final void Function(String method, String path)? onRequest;

  /// Called after every successful HTTP response.
  final void Function(String method, String path, int statusCode, int durationMs)? onResponse;

  /// Called when a request fails (network error or API error).
  final void Function(String method, String path, Object error)? onError;

  /// Called whenever the server returns 401. Register this in the app layer
  /// to trigger logout and redirect to the welcome screen automatically.
  void Function()? onUnauthorized;

  ConsumerPublicClient({
    required this.baseUrl,
    this.environment = BanzaEnvironment.production,
    http.Client? httpClient,
    this.onRequest,
    this.onResponse,
    this.onError,
  })  : _http = httpClient ?? http.Client(),
        _uuid = const Uuid();

  void setToken(String token) => _token = token;
  String? get token => _token;

  // ---------------------------------------------------------------------------
  // Auth (no token required)
  // ---------------------------------------------------------------------------

  /// Register a new consumer account.
  ///
  /// Creates the consumer on the server, saves the bcrypt-hashed PIN to
  /// [public_api_credentials], provisions an AOA wallet, and returns a JWT.
  /// Sets [token] internally so subsequent calls are authenticated.
  Future<ConsumerRegistration> register({
    required String handle,
    String? displayName,
    required String pin,
  }) async {
    final resp = await _call(
      method: 'POST',
      path: '/v1/auth/register',
      body: {
        'handle': handle,
        if (displayName != null) 'display_name': displayName,
        'pin': pin,
      },
      auth: false,
    );

    final consumer = Consumer.fromJson(resp['consumer'] as Map<String, dynamic>);
    final tok = resp['token'] as String;
    _token = tok;

    final wallet = await _call(method: 'GET', path: '/v1/me/wallet');
    return ConsumerRegistration(
      consumer: consumer,
      walletId: wallet['id'] as String,
      token: tok,
    );
  }

  /// Exchange handle + PIN for a fresh JWT.
  ///
  /// Used both for initial login and for re-authentication after logout.
  /// Sets [token] internally on success.
  Future<({Consumer consumer, String walletId, String token})> login({
    required String handle,
    required String pin,
  }) async {
    final resp = await _call(
      method: 'POST',
      path: '/v1/auth/token',
      body: {'handle': handle, 'pin': pin},
      auth: false,
    );
    final tok = resp['token'] as String;
    _token = tok;

    final profile = await _call(method: 'GET', path: '/v1/me');
    final consumer = Consumer.fromJson(profile);

    final wallet = await _call(method: 'GET', path: '/v1/me/wallet');
    return (consumer: consumer, walletId: wallet['id'] as String, token: tok);
  }

  /// Returns up to 5 active consumers whose handle contains [prefix].
  /// Returns an empty list on network error or if [prefix] is shorter than 2 chars.
  Future<List<ConsumerSuggestion>> searchHandles(String prefix) async {
    final q = prefix.trim().toLowerCase().replaceAll('@', '');
    if (q.length < 2) return [];
    try {
      final json = await _call(
        method: 'GET',
        path: '/v1/consumers/search?q=${Uri.encodeQueryComponent(q)}',
        auth: false,
      );
      final data = json['data'] as List<dynamic>? ?? [];
      return data
          .map((e) => ConsumerSuggestion.fromJson(e as Map<String, dynamic>))
          .toList();
    } catch (_) {
      return [];
    }
  }

  /// Check if a handle is registered. Returns true if found, false if not.
  /// Throws [BanzamiNetworkException] on network failure.
  Future<bool> handleExists(String handle) async {
    try {
      await _call(method: 'GET', path: '/v1/consumers/$handle', auth: false);
      return true;
    } on BanzamiApiException catch (e) {
      if (e.isNotFound) return false;
      rethrow;
    }
  }

  // ---------------------------------------------------------------------------
  // Balance
  // ---------------------------------------------------------------------------

  /// Lightweight authenticated ping — used to verify the stored JWT is still
  /// accepted by the server before allowing biometric unlock.
  Future<void> checkAuth() => _call(method: 'GET', path: '/v1/me');

  /// Fetch the authenticated consumer's current profile from the server.
  Future<Consumer> getProfile() async {
    final json = await _call(method: 'GET', path: '/v1/me');
    return Consumer.fromJson(json);
  }

  Future<WalletBalance> getBalance({String currency = 'AOA'}) async {
    final json = await _call(method: 'GET', path: '/v1/me/wallet/balance?currency=$currency');
    return WalletBalance.fromJson(json);
  }

  // ---------------------------------------------------------------------------
  // Transfers
  // ---------------------------------------------------------------------------

  Future<Transfer> sendByHandle({
    required String recipientHandle,
    required int amountMinor,
    String currency = 'AOA',
    String? note,
  }) async {
    final json = await _call(
      method: 'POST',
      path: '/v1/transfers',
      body: {
        'recipient': recipientHandle,
        'amount_minor': amountMinor,
        'currency': currency,
        if (note != null) 'note': note,
        'idempotency_key': _uuid.v4(),
      },
    );
    return Transfer.fromJson(json);
  }

  Future<ActivityPage> getActivity({
    int limit = 20,
    String? cursor,
    String? typeFilter,
    String? directionFilter,
  }) async {
    var path = '/v1/me/activity?limit=$limit';
    if (cursor          != null) path += '&cursor=${Uri.encodeQueryComponent(cursor)}';
    if (typeFilter      != null) path += '&type=${Uri.encodeQueryComponent(typeFilter)}';
    if (directionFilter != null) path += '&direction=${Uri.encodeQueryComponent(directionFilter)}';
    final json = await _call(method: 'GET', path: path);
    return ActivityPage.fromJson(json);
  }

  // ---------------------------------------------------------------------------
  // Payment links
  // ---------------------------------------------------------------------------

  Future<PaymentLink> getPaymentLinkBySlug(String slug) async {
    final json = await _call(
      method: 'GET',
      path: '/v1/payment-links/$slug',
      auth: false,
    );
    return PaymentLink.fromJson(json);
  }

  /// Pay a payment link.
  ///
  /// [amountMinor] is required for open links (no fixed amount).
  /// For fixed-amount links the server uses its own amount; pass null or 0.
  /// [idempotencyKey] prevents duplicate charges if the request is retried.
  Future<PaymentLink> payPaymentLink(
    String slug, {
    int? amountMinor,
    String? idempotencyKey,
  }) async {
    final body = <String, dynamic>{
      'idempotency_key': idempotencyKey ?? _uuid.v4(),
    };
    if (amountMinor != null && amountMinor > 0) body['amount_minor'] = amountMinor;
    final json = await _call(
      method: 'POST',
      path: '/v1/payment-links/$slug/pay',
      body: body,
    );
    return PaymentLink.fromJson(json);
  }

  // ---------------------------------------------------------------------------
  // Sandbox utilities
  // ---------------------------------------------------------------------------

  /// Credits the authenticated consumer's sandbox wallet with virtual funds.
  ///
  /// Only works when [environment] is [BanzaEnvironment.sandbox].
  /// Throws [BanzamiApiException] with code `SANDBOX_ONLY` if called in production.
  Future<SandboxFundResult> sandboxFund({
    required int amountMinor,
    String currency = 'AOA',
  }) async {
    final json = await _call(
      method: 'POST',
      path: '/v1/sandbox/fund',
      body: {'amount_minor': amountMinor, 'currency': currency},
    );
    return SandboxFundResult(
      creditedMinor: json['credited_minor'] as int,
      newBalance:    json['new_balance']    as int,
      currency:      json['currency']       as String,
    );
  }

  // ---------------------------------------------------------------------------
  // HTTP helpers
  // ---------------------------------------------------------------------------

  Map<String, String> _headers({bool auth = true}) => {
    'Content-Type': 'application/json',
    'User-Agent': 'Banzami/1.0 (mobile)',
    if (auth && _token != null) 'Authorization': 'Bearer $_token',
  };

  Future<Map<String, dynamic>> _call({
    required String method,
    required String path,
    Map<String, dynamic>? body,
    bool auth = true,
  }) async {
    final uri     = Uri.parse('$baseUrl$path');
    final headers = _headers(auth: auth);
    final start   = DateTime.now();

    onRequest?.call(method, path);

    late http.Response resp;
    try {
      resp = switch (method) {
        'GET'    => await _http.get(uri, headers: headers),
        'POST'   => await _http.post(uri, headers: headers,
                      body: body != null ? jsonEncode(body) : null),
        'DELETE' => await _http.delete(uri, headers: headers),
        _        => throw ArgumentError('Unsupported method: $method'),
      };
    } catch (e) {
      final err = e is BanzamiNetworkException ? e : BanzamiNetworkException(e.toString());
      onError?.call(method, path, err);
      if (e is BanzamiNetworkException) rethrow;
      throw err;
    }

    final durationMs = DateTime.now().difference(start).inMilliseconds;
    final decoded    = jsonDecode(resp.body) as Map<String, dynamic>;

    if (resp.statusCode >= 200 && resp.statusCode < 300) {
      onResponse?.call(method, path, resp.statusCode, durationMs);
      return decoded;
    }

    final exception = BanzamiApiException.fromJson(resp.statusCode, decoded);
    onError?.call(method, path, exception);
    if (resp.statusCode == 401) onUnauthorized?.call();
    throw exception;
  }
}
