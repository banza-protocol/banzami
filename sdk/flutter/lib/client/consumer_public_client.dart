import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:uuid/uuid.dart';

import '../models/activity_item.dart';
import '../models/consumer.dart';
import '../models/consumer_pay_link.dart';
import '../models/consumer_suggestion.dart';
import '../models/kyc.dart';
import '../models/payment_link.dart';
import '../models/receipt.dart';
import '../models/transfer.dart';
import '../models/wallet_balance.dart';
import 'api_exception.dart';
import 'banzami_environment.dart';

/// Result of a sandbox wallet top-up via [ConsumerPublicClient.sandboxFund].
class SandboxFundResult {
  final int creditedMinor;
  final int newBalance;
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
  final BanzamiEnvironment environment;
  String? _token;
  final http.Client _http;
  final Uuid _uuid;

  /// Called before every HTTP request (including retries).
  final void Function(String method, String path)? onRequest;

  /// Called after every successful HTTP response.
  final void Function(
      String method, String path, int statusCode, int durationMs)? onResponse;

  /// Called when a request fails (network error or API error).
  final void Function(String method, String path, Object error)? onError;

  /// Called whenever the server returns 401. Register this in the app layer
  /// to trigger logout and redirect to the welcome screen automatically.
  void Function()? onUnauthorized;

  /// Stable per-install device identifier, sent as the `X-Device-Id` header so
  /// the risk layer can recognise a known device vs a new one (RSK-001).
  final String? deviceId;

  ConsumerPublicClient({
    required this.baseUrl,
    this.environment = BanzamiEnvironment.production,
    http.Client? httpClient,
    this.onRequest,
    this.onResponse,
    this.onError,
    this.deviceId,
  })  : _http = httpClient ?? http.Client(),
        _uuid = const Uuid();

  /// Installs the session token. An empty token is no token.
  void setToken(String token) => _token = token.isEmpty ? null : token;

  /// Signed out: nothing authenticated may be sent with the old token.
  void clearToken() => _token = null;
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

    final consumer =
        Consumer.fromJson(resp['consumer'] as Map<String, dynamic>);
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
      await _call(method: 'GET', path: '/v1/consumers/${_seg(handle)}', auth: false);
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
    final json = await _call(
        method: 'GET', path: '/v1/me/wallet/balance?currency=$currency');
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
    String? idempotencyKey,
  }) async {
    final json = await _call(
      method: 'POST',
      path: '/v1/transfers',
      body: {
        'recipient': recipientHandle,
        'amount_minor': amountMinor,
        'currency': currency,
        if (note != null) 'note': note,
        'idempotency_key': idempotencyKey ?? _uuid.v4(),
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
    if (cursor != null) path += '&cursor=${Uri.encodeQueryComponent(cursor)}';
    if (typeFilter != null)
      path += '&type=${Uri.encodeQueryComponent(typeFilter)}';
    if (directionFilter != null)
      path += '&direction=${Uri.encodeQueryComponent(directionFilter)}';
    final json = await _call(method: 'GET', path: path);
    return ActivityPage.fromJson(json);
  }

  // ---------------------------------------------------------------------------
  // Payment links
  // ---------------------------------------------------------------------------

  Future<PaymentLink> getPaymentLinkBySlug(String slug) async {
    final json = await _call(
      method: 'GET',
      path: '/v1/payment-links/${_seg(slug)}',
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
    if (amountMinor != null && amountMinor > 0)
      body['amount_minor'] = amountMinor;
    final json = await _call(
      method: 'POST',
      path: '/v1/payment-links/${_seg(slug)}/pay',
      body: body,
    );
    return PaymentLink.fromJson(json);
  }

  // ---------------------------------------------------------------------------
  // Consumer pay links
  // ---------------------------------------------------------------------------

  /// Create a shareable consumer pay link (receiver = authenticated consumer).
  ///
  /// [amountMinor] null → open link (flexible, payer chooses amount).
  /// [locked] true (default) → payer cannot override the amount.
  Future<ConsumerPayLink> createConsumerPayLink({
    int? amountMinor,
    String? note,
    String currency = 'AOA',
    bool locked = true,
    int? expiresInHours,
  }) async {
    final body = <String, dynamic>{
      'currency': currency,
      'locked': locked,
      if (amountMinor != null) 'amount_minor': amountMinor,
      if (note != null) 'note': note,
      if (expiresInHours != null) 'expires_in_hours': expiresInHours,
    };
    final json =
        await _call(method: 'POST', path: '/v1/consumer-pay-links', body: body);
    return ConsumerPayLink.fromJson(json);
  }

  /// Fetch a consumer pay link by its public code. No authentication required.
  Future<ConsumerPayLink> getConsumerPayLinkByCode(String code) async {
    final json = await _call(
      method: 'GET',
      path: '/v1/consumer-pay-links/${_seg(code)}',
      auth: false,
    );
    return ConsumerPayLink.fromJson(json);
  }

  /// Pay a consumer pay link.
  ///
  /// [amountMinor] is required only when the link is not locked (open amount).
  /// [idempotencyKey] prevents double-charging on retry.
  Future<ConsumerPayLink> payConsumerPayLink(
    String code, {
    int? amountMinor,
    String? idempotencyKey,
  }) async {
    final body = <String, dynamic>{
      'idempotency_key': idempotencyKey ?? _uuid.v4(),
      if (amountMinor != null) 'amount_minor': amountMinor,
    };
    final json = await _call(
      method: 'POST',
      path: '/v1/consumer-pay-links/${_seg(code)}/pay',
      body: body,
    );
    return ConsumerPayLink.fromJson(json);
  }

  // ---------------------------------------------------------------------------
  // Structured QR (scan-to-pay) — WITHDRAWN
  //
  // decodeQr / getQrCode / payStructuredQr called /v1/qr/decode, /v1/qr/{id}
  // and /v1/qr/pay on the public-api, which mounts none of them (QR pay was
  // withdrawn with RA-053): every call could only fail. The consumer app
  // refuses a structured Banzami QR with an explicit message until a consumer
  // QR-pay route exists; @banza and payment-link QRs keep working.
  // ---------------------------------------------------------------------------

  // Pre-protocol P2P bill-division (P2P-002) was retired in favour of BANZA
  // Collections (ADR-036). Dividing a bill is a merchant feature now
  // (BanzamiClient.createEqualSplitCollection); a consumer simply pays a share
  // through the normal payment-link / QR surfaces — no bill-division client
  // methods or screens on the consumer side.

  // ---------------------------------------------------------------------------
  // KYC — consumer identity verification (Banzami ADR-020)
  //
  // The operator decides the granted level; the consumer NEVER sends a
  // `requested_level`. Document/selfie bytes go straight to R2 via the signed
  // PUT returned by [requestKycUploadUrl] — the SDK never carries the bytes and
  // never logs the signed URL or any `storage_key`.
  // ---------------------------------------------------------------------------

  /// Opens (or resumes) a verification case for [documentType]. Returns the case
  /// in `WAITING_DOCUMENTS`. An [idempotencyKey] makes repeat calls safe; if the
  /// consumer already has an active case it is resumed. No level is requested.
  Future<KycCase> createKycCase({
    required KycDocumentType documentType,
    String? country,
    String? idempotencyKey,
  }) async {
    final json = await _call(
      method: 'POST',
      path: '/v1/kyc/cases',
      body: {
        'document_type': documentType.wire,
        if (country != null && country.isNotEmpty) 'country': country,
      },
    );
    return KycCase.fromJson(json);
  }

  /// The caller's most recent case, or `null` when they have none yet (404).
  Future<KycCase?> getCurrentKycCase() async {
    try {
      final json = await _call(method: 'GET', path: '/v1/kyc/cases/current');
      return KycCase.fromJson(json);
    } on BanzamiApiException catch (e) {
      if (e.isNotFound) return null;
      rethrow;
    }
  }

  /// Loads a case by id. Throws [BanzamiApiException] (404) if it is not the
  /// caller's case — cross-subject access is indistinguishable from "not found".
  Future<KycCase> getKycCase(String caseId) async {
    final json = await _call(method: 'GET', path: '/v1/kyc/cases/${_seg(caseId)}');
    return KycCase.fromJson(json);
  }

  /// Requests a short-lived signed PUT URL for one piece of evidence. The app
  /// then PUTs the bytes directly to [KycUploadUrl.url] (do not log it) and calls
  /// [completeKycEvidenceUpload]. Throws [BanzamiApiException] 503
  /// (`STORAGE_NOT_CONFIGURED`) when storage is unavailable, 409 when the case is
  /// not accepting documents, 400 for an invalid evidence type/side.
  Future<KycUploadUrl> requestKycUploadUrl({
    required String caseId,
    required KycEvidenceType evidenceType,
    KycDocumentSide? side,
    String contentType = 'image/jpeg',
  }) async {
    final json = await _call(
      method: 'POST',
      path: '/v1/kyc/cases/${_seg(caseId)}/evidence/upload-url',
      body: {
        'evidence_type': evidenceType.wire,
        if (side != null) 'side': side.wire,
        'content_type': contentType,
      },
    );
    return KycUploadUrl.fromJson(json);
  }

  /// Confirms an upload (after the PUT to R2). The operator HEAD-verifies the
  /// object before marking the evidence UPLOADED, advancing the case to
  /// `DOCUMENTS_RECEIVED` once every required piece is present. Returns the
  /// updated case. [sha256] is optional integrity metadata.
  Future<KycCase> completeKycEvidenceUpload({
    required String caseId,
    required String evidenceId,
    String? sha256,
  }) async {
    final json = await _call(
      method: 'POST',
      path: '/v1/kyc/cases/${_seg(caseId)}/evidence/complete',
      body: {
        'evidence_id': evidenceId,
        if (sha256 != null && sha256.isNotEmpty) 'sha256': sha256,
      },
    );
    return KycCase.fromJson(json);
  }

  /// Submits the case for review (-> `UNDER_REVIEW`). Throws
  /// [BanzamiApiException] 409 (`EVIDENCE_INCOMPLETE`) when required evidence is
  /// still missing — the consumer cannot self-approve.
  Future<KycCase> submitKycCase(String caseId) async {
    final json =
        await _call(method: 'POST', path: '/v1/kyc/cases/${_seg(caseId)}/submit');
    return KycCase.fromJson(json);
  }

  /// The current [KycStatus] of a case.
  Future<KycStatus> getKycStatus(String caseId) async {
    final json =
        await _call(method: 'GET', path: '/v1/kyc/cases/${_seg(caseId)}/status');
    return KycStatus.fromWire(json['status'] as String?);
  }

  // ---------------------------------------------------------------------------
  // Sandbox utilities
  // ---------------------------------------------------------------------------

  /// Credits the authenticated consumer's sandbox wallet with virtual funds.
  ///
  /// Only works when [environment] is [BanzamiEnvironment.sandbox].
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
      newBalance: json['new_balance'] as int,
      currency: json['currency'] as String,
    );
  }

  /// Sends a test FCM push to the authenticated consumer's own devices (topic
  /// delivery — the full subscription path). Only works in sandbox — throws
  /// [BanzamiApiException] with code `FORBIDDEN` in production.
  ///
  /// There is no direct-token mode: the server cannot tell a caller's own
  /// device token from anyone else's, and a named token let any Sandbox
  /// consumer send Banzami's push to any device.
  ///
  /// Returns `{delivery_mode, target, firebase_message_id}`.
  Future<Map<String, dynamic>> sendDebugPush() => _call(
        method: 'POST',
        path: '/v1/debug/push-test',
      );

  /// The canonical receipt of [transactionId] — what the comprovativo screen,
  /// "Partilhar" and "Copiar detalhes" show. Establishes the operation's proof
  /// server-side if it does not exist yet.
  Future<Receipt> fetchReceipt(String transactionId) async {
    final json = await _call(
      method: 'GET',
      path: '/v1/consumer/transactions/${_seg(transactionId)}/receipt',
    );
    return Receipt.fromJson(json);
  }

  /// Fetches the official transfer receipt PDF for [transactionId], generated
  /// server-side by the Banzami Document Engine. Returns the raw PDF bytes.
  /// Throws [BanzamiApiException] on 401/403/404/etc. The app must never build
  /// PDFs locally — this is the single official document.
  Future<List<int>> fetchReceiptPdf(String transactionId) async {
    final path = '/v1/consumer/transactions/${_seg(transactionId)}/receipt.pdf';
    onRequest?.call('GET', path);
    final resp =
        await _http.get(Uri.parse('$baseUrl$path'), headers: _headers());
    if (resp.statusCode != 200) {
      Map<String, dynamic>? j;
      try {
        j = jsonDecode(resp.body) as Map<String, dynamic>;
      } catch (_) {}
      if (j != null) throw BanzamiApiException.fromJson(resp.statusCode, j);
      throw BanzamiApiException(
        statusCode: resp.statusCode,
        code: 'RECEIPT_ERROR',
        message: 'Não foi possível obter o comprovativo.',
      );
    }
    return resp.bodyBytes;
  }

  // ---------------------------------------------------------------------------
  // HTTP helpers
  // ---------------------------------------------------------------------------

  /// One path segment from untrusted input (a scanned slug, a deep-link code):
  /// percent-encoded, so "../x" or "a/b" can never reach another endpoint.
  /// "", "." and ".." cannot be a segment at all (URI normalisation resolves
  /// dot segments even when percent-encoded): they are refused before any
  /// request is sent, as a link that does not exist.
  static String _seg(String value) {
    if (value.isEmpty || value == '.' || value == '..') {
      throw const BanzamiApiException(
          statusCode: 404, code: 'NOT_FOUND', message: 'invalid path segment');
    }
    return Uri.encodeComponent(value);
  }

  Map<String, String> _headers({bool auth = true}) => {
        'Content-Type': 'application/json',
        'User-Agent': 'Banzami/1.0 (mobile)',
        if (auth && _token != null) 'Authorization': 'Bearer $_token',
        if (deviceId != null && deviceId!.isNotEmpty) 'X-Device-Id': deviceId!,
      };

  Future<Map<String, dynamic>> _call({
    required String method,
    required String path,
    Map<String, dynamic>? body,
    bool auth = true,
  }) async {
    final uri = Uri.parse('$baseUrl$path');
    final headers = _headers(auth: auth);
    final start = DateTime.now();

    onRequest?.call(method, path);

    late http.Response resp;
    try {
      resp = switch (method) {
        'GET' => await _http.get(uri, headers: headers),
        'POST' => await _http.post(uri,
            headers: headers, body: body != null ? jsonEncode(body) : null),
        'DELETE' => await _http.delete(uri, headers: headers),
        _ => throw ArgumentError('Unsupported method: $method'),
      };
    } catch (e) {
      final err = e is BanzamiNetworkException
          ? e
          : BanzamiNetworkException(e.toString());
      onError?.call(method, path, err);
      if (e is BanzamiNetworkException) rethrow;
      throw err;
    }

    final durationMs = DateTime.now().difference(start).inMilliseconds;

    Map<String, dynamic>? decoded;
    try {
      decoded = jsonDecode(resp.body) as Map<String, dynamic>;
    } catch (_) {
      // A non-JSON body — a proxy's 502/503/429 page, an nginx 404. An error
      // status is still an answer from the server side, not a missing network:
      // keep its status so the app can say "serviço indisponível" / "demasiadas
      // tentativas" instead of "sem ligação".
      final Exception err = resp.statusCode >= 400
          ? BanzamiApiException(
              statusCode: resp.statusCode,
              code: 'UNKNOWN',
              message: 'HTTP ${resp.statusCode} (non-JSON body)',
            )
          : BanzamiNetworkException(
              'HTTP ${resp.statusCode}: malformed response body');
      onError?.call(method, path, err);
      throw err;
    }

    if (resp.statusCode >= 200 && resp.statusCode < 300) {
      onResponse?.call(method, path, resp.statusCode, durationMs);
      return decoded;
    }

    final exception = BanzamiApiException.fromJson(resp.statusCode, decoded);
    onError?.call(method, path, exception);
    if (resp.statusCode == 401 && auth && _token != null)
      onUnauthorized?.call();
    throw exception;
  }
}
