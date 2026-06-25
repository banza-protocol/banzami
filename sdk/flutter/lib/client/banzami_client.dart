import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:uuid/uuid.dart';

import '../models/consumer.dart';
import '../models/merchant.dart';
import '../models/payment_link.dart';
import '../models/payment_request.dart';
import '../models/qr_code.dart';
import '../models/wallet_balance.dart';
import 'api_exception.dart';
import 'banzami_environment.dart';

/// HTTP client for the Banzami Go api-gateway.
///
/// All financial operations are delegated to the gateway, which in turn
/// calls the Rust core-api. This client mirrors the gateway's REST surface.
///
/// Usage — production:
/// ```dart
/// final client = BanzamiClient(
///   apiKey:      'bz_live_...',
///   environment: BanzamiEnvironment.production,
/// );
/// ```
///
/// Usage — sandbox / integration testing:
/// ```dart
/// final client = BanzamiClient(
///   apiKey:      'bz_test_...',
///   environment: BanzamiEnvironment.sandbox,
/// );
/// ```
typedef OnRequestHook  = void Function(String method, String path, int attempt);
typedef OnResponseHook = void Function(String method, String path, int status, int durationMs);
typedef OnErrorHook    = void Function(String method, String path, Object error, int attempts);

class BanzamiClient {
  final String apiKey;
  final BanzamiEnvironment environment;
  final String baseUrl;
  final http.Client _http;
  final Uuid _uuid;
  final int maxRetries;
  final Duration retryDelay;

  final OnRequestHook?  onRequest;
  final OnResponseHook? onResponse;
  final OnErrorHook?    onError;

  String?   _jwt;
  DateTime? _jwtExpiry;

  /// When the current session token expires. Null until the first API call.
  DateTime? get sessionExpiresAt => _jwtExpiry;

  /// Identity used to decide whether a cached client can be reused — the API key
  /// (legacy mode) or the JWT (handle login). Not for display.
  String get authIdentity => apiKey.isNotEmpty ? apiKey : (_jwt ?? '');

  bool get isSandbox    => environment.isSandbox;
  bool get isProduction => environment.isLive;

  /// Construct with an API key (legacy: exchanged for a JWT on demand) and/or a
  /// pre-issued [jwt] (e.g. from @handle + PIN login). When a fresh JWT is
  /// present it is used directly; otherwise the API key is exchanged. A
  /// JWT-only client cannot self-refresh — on expiry it surfaces a 401 so the
  /// app re-authenticates.
  BanzamiClient({
    this.apiKey = '',
    this.environment = BanzamiEnvironment.production,
    String? baseUrl,
    http.Client? httpClient,
    this.maxRetries = 3,
    this.retryDelay = const Duration(milliseconds: 500),
    this.onRequest,
    this.onResponse,
    this.onError,
    String? jwt,
    DateTime? jwtExpiresAt,
  })  : baseUrl = (baseUrl ?? environment.defaultBaseUrl).replaceAll(RegExp(r'/$'), ''),
        _http = httpClient ?? http.Client(),
        _uuid = const Uuid(),
        _jwt = jwt,
        _jwtExpiry = jwtExpiresAt;

  /// Install a pre-issued merchant JWT (handle + PIN login). When set and fresh
  /// it is used directly, without exchanging an API key.
  void setJwt(String token, {DateTime? expiresAt}) {
    _jwt = token;
    _jwtExpiry = expiresAt;
  }

  /// Log a merchant in by @handle + PIN (unauthenticated endpoint). Returns the
  /// issued JWT, its expiry and the environment. Does NOT mutate this client —
  /// the caller decides how to build the session.
  Future<({String token, DateTime expiresAt, String environment})> loginMerchantHandlePin({
    required String handle,
    required String pin,
  }) async {
    late http.Response resp;
    try {
      resp = await _http.post(
        Uri.parse('$baseUrl/v1/merchant/auth/token'),
        headers: {'Content-Type': 'application/json'},
        body:    jsonEncode({'handle': handle, 'pin': pin}),
      );
    } catch (e) {
      if (e is BanzamiApiException) rethrow;
      throw BanzamiNetworkException(e.toString());
    }
    final body = jsonDecode(resp.body) as Map<String, dynamic>;
    if (resp.statusCode >= 400) throw BanzamiApiException.fromJson(resp.statusCode, body);
    final exp = body['expires_at'] as String?;
    return (
      token:       body['token'] as String,
      expiresAt:   exp != null ? DateTime.parse(exp) : DateTime.now().add(const Duration(hours: 24)),
      environment: (body['environment'] as String?) ?? 'LIVE',
    );
  }

  // ---------------------------------------------------------------------------
  // Consumers
  // ---------------------------------------------------------------------------

  Future<Consumer> createConsumer({
    required String handle,
    String? displayName,
  }) async {
    final json = await _post('/v1/consumers', {
      'handle':       handle,
      if (displayName != null) 'display_name': displayName,
    });
    return Consumer.fromJson(json);
  }

  Future<Consumer> getConsumer(String id) async {
    final json = await _get('/v1/consumers/$id');
    return Consumer.fromJson(json);
  }

  Future<Consumer> getConsumerByHandle(String handle) async {
    final json = await _get('/v1/consumers/handle/$handle');
    return Consumer.fromJson(json);
  }

  // ---------------------------------------------------------------------------
  // Consumer Wallets
  // ---------------------------------------------------------------------------

  Future<Map<String, dynamic>> getOrCreateWallet({
    required String consumerId,
    String currency = 'AOA',
  }) async {
    return _postWithRetry('/v1/consumer-wallets', {
      'consumer_id': consumerId,
      'currency':    currency,
    });
  }

  Future<WalletBalance> getBalance(String walletId) async {
    final json = await _get('/v1/consumer-wallets/$walletId/balance');
    return WalletBalance.fromJson(json);
  }

  Future<Map<String, dynamic>> getWalletForConsumer({
    required String consumerId,
    String currency = 'AOA',
  }) async {
    return _get('/v1/consumer-wallets?consumer_id=$consumerId&currency=$currency');
  }

  // ---------------------------------------------------------------------------
  // Transfers
  // ---------------------------------------------------------------------------

  Future<Map<String, dynamic>> sendTransfer({
    required String senderId,
    required String recipientId,
    required int amountMinor,
    String currency = 'AOA',
    String? description,
    String? idempotencyKey,
  }) async {
    return _postWithRetry('/v1/transfers', {
      'idempotency_key': idempotencyKey ?? _uuid.v4(),
      'sender_id':       senderId,
      'recipient_id':    recipientId,
      'amount_minor':    amountMinor,
      'currency':        currency,
      if (description != null) 'description': description,
    }, idempotencyKey: idempotencyKey);
  }

  Future<Map<String, dynamic>> getTransfer(String id) async {
    return _get('/v1/transfers/$id');
  }

  Future<Map<String, dynamic>> listTransfers({
    required String consumerId,
    int limit = 20,
    String? cursor,
  }) async {
    var path = '/v1/transfers?consumer_id=$consumerId&limit=$limit';
    if (cursor != null) path += '&cursor=$cursor';
    return _get(path);
  }

  // ---------------------------------------------------------------------------
  // QR Codes
  // ---------------------------------------------------------------------------

  Future<QrResponse> createStaticQr({
    required String ownerId,
    String ownerType = 'CONSUMER',
    String currency  = 'AOA',
  }) async {
    final json = await _post('/v1/qr/static', {
      'owner_id':   ownerId,
      'owner_type': ownerType,
      'currency':   currency,
    });
    return QrResponse.fromJson(json);
  }

  Future<QrResponse> createDynamicQr({
    required String ownerId,
    required int amountMinor,
    required DateTime expiresAt,
    String ownerType = 'CONSUMER',
    String currency  = 'AOA',
    String? reference,
  }) async {
    final json = await _post('/v1/qr/dynamic', {
      'owner_id':     ownerId,
      'owner_type':   ownerType,
      'currency':     currency,
      'amount_minor': amountMinor,
      'expires_at':   expiresAt.toUtc().toIso8601String(),
      if (reference != null) 'reference': reference,
    });
    return QrResponse.fromJson(json);
  }

  Future<QrResponse> getQrCode(String id) async {
    final json = await _get('/v1/qr/$id');
    return QrResponse.fromJson(json);
  }

  Future<ParsedQr> decodeQrPayload(String payload) async {
    final json = await _post('/v1/qr/decode', {'payload': payload});
    return ParsedQr.fromJson(json);
  }

  Future<QrCode> markQrUsed(String id) async {
    final json = await _post('/v1/qr/$id/use', null);
    return QrCode.fromJson(json);
  }

  /// Scan-to-pay: settle a scanned structured QR (static or dynamic).
  ///
  /// [payer] is the payer's @banza handle. [amountMinor] is required for a
  /// static QR (the payer enters it) and ignored for a dynamic QR (the amount
  /// is fixed and verified server-side). Throws [BanzamiApiException] carrying
  /// the outcome code on refusal (`KYC_REQUIRED`, `INSUFFICIENT_FUNDS`,
  /// `QR_ALREADY_USED`, `QR_EXPIRED`, `QR_INVALID_SIGNATURE`, ...).
  Future<Map<String, dynamic>> payQr({
    required String payer,
    required String payload,
    int? amountMinor,
    String? note,
    String? idempotencyKey,
  }) async {
    return _postWithRetry('/v1/qr/pay', {
      'idempotency_key': idempotencyKey ?? _uuid.v4(),
      'payer':           payer,
      'payload':         payload,
      if (amountMinor != null) 'amount_minor': amountMinor,
      if (note != null) 'note': note,
    }, idempotencyKey: idempotencyKey);
  }

  // ---------------------------------------------------------------------------
  // Merchants
  // ---------------------------------------------------------------------------

  Future<Merchant> getMerchant(String id) async {
    final json = await _get('/v1/merchants/$id');
    return Merchant.fromJson(json);
  }

  Future<MerchantWallet> getMerchantWallet({String currency = 'AOA'}) async {
    final json = await _get('/v1/wallets?currency=$currency');
    return MerchantWallet.fromJson(json);
  }

  Future<MerchantBalance> getMerchantBalance(String walletId) async {
    final json = await _get('/v1/wallets/$walletId/balance');
    return MerchantBalance.fromJson(json);
  }

  Future<PaymentLink> createPaymentLink({
    required String merchantId,
    required String walletId,
    int? amountMinor,
    String currency = 'AOA',
    String? description,
    DateTime? expiresAt,
  }) async {
    final json = await _postWithRetry('/v1/payment-links', {
      'merchant_id': merchantId,
      'wallet_id':   walletId,
      'currency':    currency,
      if (amountMinor != null) 'amount_minor': amountMinor,
      if (description != null) 'description':  description,
      if (expiresAt   != null) 'expires_at':   expiresAt.toUtc().toIso8601String(),
    });
    return PaymentLink.fromJson(json);
  }

  Future<PaymentLinkPage> listPaymentLinks({
    required String merchantId,
    int limit = 20,
    String? cursor,
  }) async {
    var path = '/v1/payment-links?merchant_id=$merchantId&limit=$limit';
    if (cursor != null) path += '&cursor=$cursor';
    final json = await _get(path);
    return PaymentLinkPage.fromJson(json);
  }

  Future<PaymentLink> cancelPaymentLink(String id) async {
    final json = await _delete('/v1/payment-links/$id');
    return PaymentLink.fromJson(json);
  }

  // ---------------------------------------------------------------------------
  // Payment requests — a merchant asks a specific @banza payer for a fixed amount
  // ---------------------------------------------------------------------------

  Future<PaymentRequest> createPaymentRequest({
    required String requesterId,
    required int amountMinor,
    String? payerHandle,
    String currency = 'AOA',
    String? description,
    DateTime? expiresAt,
    String? idempotencyKey,
  }) async {
    final json = await _postWithRetry('/v1/payment-requests', {
      'requester_id':    requesterId,
      'amount_minor':    amountMinor,
      'currency':        currency,
      if (payerHandle != null) 'payer_handle': payerHandle,
      if (description != null) 'description':  description,
      if (expiresAt   != null) 'expires_at':   expiresAt.toUtc().toIso8601String(),
      'idempotency_key': idempotencyKey ?? _uuid.v4(),
    }, idempotencyKey: idempotencyKey);
    return PaymentRequest.fromJson(json);
  }

  Future<PaymentRequestPage> listPaymentRequests({String? status, int limit = 20}) async {
    var path = '/v1/payment-requests?limit=$limit';
    if (status != null) path += '&status=$status';
    final json = await _get(path);
    return PaymentRequestPage.fromJson(json);
  }

  Future<PaymentRequest> getPaymentRequest(String id) async {
    final json = await _get('/v1/payment-requests/$id');
    return PaymentRequest.fromJson(json);
  }

  Future<PaymentRequest> cancelPaymentRequest(String id) async {
    final json = await _postWithRetry('/v1/payment-requests/$id/cancel', const {});
    return PaymentRequest.fromJson(json);
  }

  // ---------------------------------------------------------------------------
  // Identity verification (KYC / KYB) — verifies the authenticated principal
  // ---------------------------------------------------------------------------

  /// Submit a consumer identity document for KYC verification. Returns the
  /// updated compliance record (status + kyc_level). `documentType` is
  /// 'BILHETE_DE_IDENTIDADE' (default) or 'PASSPORT'; `requestedLevel` is
  /// 'BASIC' (default), 'ENHANCED', or 'FULL'.
  Future<Map<String, dynamic>> verifyCustomerKyc({
    required String fullName,
    required String documentNumber,
    required DateTime dateOfBirth,
    String documentType  = 'BILHETE_DE_IDENTIDADE',
    String requestedLevel = 'BASIC',
  }) async {
    return _postWithRetry('/v1/compliance/customers/verify', {
      'full_name':       fullName,
      'document_type':   documentType,
      'document_number': documentNumber,
      'date_of_birth':   _ymd(dateOfBirth),
      'requested_level': requestedLevel,
    });
  }

  /// Progressive-KYC status for the authenticated consumer: current level,
  /// status, the limits it grants, and whether financial operations are
  /// unlocked (`kyc_level`, `api_level`, `level_number`, `kyc_status`,
  /// `limits`, `can_transact`).
  Future<Map<String, dynamic>> getKycStatus() async {
    return _get('/v1/compliance/customers/status');
  }

  /// Submit a merchant business identity for KYB verification. Returns the
  /// updated compliance record (kyb_status + aml_status).
  Future<Map<String, dynamic>> verifyMerchantKyb({
    required String legalName,
    required String taxId,
    required String representativeName,
  }) async {
    return _postWithRetry('/v1/compliance/merchants/verify', {
      'legal_name':          legalName,
      'tax_id':              taxId,
      'representative_name': representativeName,
    });
  }

  static String _ymd(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-'
      '${d.month.toString().padLeft(2, '0')}-'
      '${d.day.toString().padLeft(2, '0')}';

  // ---------------------------------------------------------------------------
  // Transactions (merchant)
  // ---------------------------------------------------------------------------

  Future<MerchantTransactionPage> listMerchantTransactions({
    int       limit  = 20,
    String?   cursor,
    DateTime? since,
  }) async {
    var path = '/v1/transactions?limit=$limit';
    if (since  != null) path += '&since=${Uri.encodeComponent(since.toUtc().toIso8601String())}';
    if (cursor != null) path += '&cursor=${Uri.encodeComponent(cursor)}';
    final json = await _get(path);
    return MerchantTransactionPage.fromJson(json);
  }

  // ---------------------------------------------------------------------------
  // Payouts
  // ---------------------------------------------------------------------------

  Future<Map<String, dynamic>> createPayout({
    required String walletId,
    required int    amountMinor,
    required String bankAccountNumber,
    required String bankCode,
    required String accountHolderName,
    String?         idempotencyKey,
    String          currency = 'AOA',
  }) async {
    return _postWithRetry('/v1/payouts', {
      'idempotency_key':     idempotencyKey ?? _uuid.v4(),
      'wallet_id':           walletId,
      'amount_minor':        amountMinor,
      'currency':            currency,
      'bank_account_number': bankAccountNumber,
      'bank_code':           bankCode,
      'account_holder_name': accountHolderName,
    }, idempotencyKey: idempotencyKey);
  }

  // ---------------------------------------------------------------------------
  // Payment links — public endpoints (no auth required)
  // ---------------------------------------------------------------------------

  /// Fetch a payment link by its public slug.
  /// Calls the unauthenticated /public/pay/{slug} endpoint.
  Future<PaymentLink> getPaymentLinkBySlug(String slug) async {
    late http.Response resp;
    try {
      resp = await _http.get(Uri.parse('$baseUrl/public/pay/$slug'));
    } catch (e) {
      if (e is BanzamiApiException) rethrow;
      throw BanzamiNetworkException(e.toString());
    }
    final body = jsonDecode(resp.body) as Map<String, dynamic>;
    if (resp.statusCode >= 400) throw BanzamiApiException.fromJson(resp.statusCode, body);
    return PaymentLink.fromJson(body);
  }

  /// Poll whether a payment link has been paid.
  /// Returns true when the link status is USED.
  Future<bool> getPaymentLinkStatus(String slug) async {
    late http.Response resp;
    try {
      resp = await _http.get(Uri.parse('$baseUrl/public/pay/$slug/status'));
    } catch (e) {
      return false;
    }
    if (resp.statusCode >= 400) return false;
    final body = jsonDecode(resp.body) as Map<String, dynamic>;
    return body['paid'] as bool? ?? false;
  }

  // ---------------------------------------------------------------------------
  // HTTP helpers
  // ---------------------------------------------------------------------------

  // Exchanges the raw API key for a short-lived JWT (TTL: 24 h).
  // Cached until 5 minutes before expiry, then transparently renewed.
  Future<void> _ensureJwt() async {
    const buffer = Duration(minutes: 5);
    if (_jwt != null &&
        _jwtExpiry != null &&
        DateTime.now().isBefore(_jwtExpiry!.subtract(buffer))) {
      return;
    }
    if (apiKey.isEmpty) {
      // JWT-only client (handle login) with a missing/expired token — it cannot
      // self-refresh, so surface a 401 and let the app re-authenticate (PIN).
      throw BanzamiApiException.fromJson(401, const {
        'code':    'TOKEN_EXPIRED',
        'message': 'session expired, please sign in again',
      });
    }
    late http.Response resp;
    try {
      resp = await _http.post(
        Uri.parse('$baseUrl/v1/auth/token'),
        headers: {'Content-Type': 'application/json'},
        body:    jsonEncode({'api_key': apiKey}),
      );
    } catch (e) {
      if (e is BanzamiApiException) rethrow;
      throw BanzamiNetworkException(e.toString());
    }
    final body = jsonDecode(resp.body) as Map<String, dynamic>;
    if (resp.statusCode >= 400) throw BanzamiApiException.fromJson(resp.statusCode, body);
    _jwt = body['token'] as String;
    final expiresAtStr = body['expires_at'] as String?;
    _jwtExpiry = expiresAtStr != null
        ? DateTime.parse(expiresAtStr)
        : DateTime.now().add(const Duration(hours: 24));
  }

  Future<Map<String, String>> get _headers async {
    await _ensureJwt();
    return {
      'Content-Type':  'application/json',
      'User-Agent':    'Banzami/1.0 (mobile)',
      'Authorization': 'Bearer $_jwt',
    };
  }

  Future<Map<String, dynamic>> _get(String path) async {
    onRequest?.call('GET', path, 0);
    final t0 = DateTime.now().millisecondsSinceEpoch;
    late http.Response resp;
    try {
      resp = await _http.get(
        Uri.parse('$baseUrl$path'),
        headers: await _headers,
      );
    } catch (e) {
      onError?.call('GET', path, e, 1);
      if (e is BanzamiApiException) rethrow;
      throw BanzamiNetworkException(e.toString());
    }
    final result = _decode(resp);
    onResponse?.call('GET', path, resp.statusCode, DateTime.now().millisecondsSinceEpoch - t0);
    return result;
  }

  Future<Map<String, dynamic>> _delete(String path) async {
    onRequest?.call('DELETE', path, 0);
    final t0 = DateTime.now().millisecondsSinceEpoch;
    late http.Response resp;
    try {
      resp = await _http.delete(
        Uri.parse('$baseUrl$path'),
        headers: await _headers,
      );
    } catch (e) {
      onError?.call('DELETE', path, e, 1);
      if (e is BanzamiApiException) rethrow;
      throw BanzamiNetworkException(e.toString());
    }
    final result = _decode(resp);
    onResponse?.call('DELETE', path, resp.statusCode, DateTime.now().millisecondsSinceEpoch - t0);
    return result;
  }

  Future<Map<String, dynamic>> _post(
    String path,
    Map<String, dynamic>? body, {
    String? idempotencyKey,
  }) async {
    onRequest?.call('POST', path, 0);
    final t0 = DateTime.now().millisecondsSinceEpoch;
    late http.Response resp;
    try {
      final headers = await _headers;
      if (idempotencyKey != null) {
        headers['Idempotency-Key'] = idempotencyKey;
      }
      resp = await _http.post(
        Uri.parse('$baseUrl$path'),
        headers: headers,
        body:    body != null ? jsonEncode(body) : null,
      );
    } catch (e) {
      onError?.call('POST', path, e, 1);
      if (e is BanzamiApiException) rethrow;
      throw BanzamiNetworkException(e.toString());
    }
    final result = _decode(resp);
    onResponse?.call('POST', path, resp.statusCode, DateTime.now().millisecondsSinceEpoch - t0);
    return result;
  }

  Future<Map<String, dynamic>> _postWithRetry(
    String path,
    Map<String, dynamic>? body, {
    String? idempotencyKey,
  }) {
    final key = idempotencyKey ?? _uuid.v4();
    return _withRetry(() => _post(path, body, idempotencyKey: key), 'POST', path);
  }

  Future<T> _withRetry<T>(Future<T> Function() operation, String method, String path) async {
    Object? lastError;
    for (var attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) {
        await Future<void>.delayed(retryDelay * (1 << (attempt - 1)));
      }
      try {
        return await operation();
      } catch (e) {
        if (_shouldRetry(e, attempt)) {
          lastError = e;
          continue;
        }
        onError?.call(method, path, e, attempt + 1);
        rethrow;
      }
    }
    onError?.call(method, path, lastError!, maxRetries + 1);
    throw lastError!;
  }

  bool _shouldRetry(Object error, int attempt) {
    if (attempt >= maxRetries) return false;
    if (error is BanzamiApiException) {
      return error.statusCode == 429 ||
             error.statusCode == 502 ||
             error.statusCode == 503 ||
             error.statusCode == 504;
    }
    return error is Exception;
  }

  Map<String, dynamic> _decode(http.Response resp) {
    final body = jsonDecode(resp.body) as Map<String, dynamic>;
    if (resp.statusCode >= 200 && resp.statusCode < 300) return body;
    throw BanzamiApiException.fromJson(resp.statusCode, body);
  }
}
