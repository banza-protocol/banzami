import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:uuid/uuid.dart';

import '../models/consumer.dart';
import '../models/merchant.dart';
import '../models/merchant_kyb.dart';
import '../models/merchant_wallet_payment.dart';
import '../models/payment_link.dart';
import '../models/payout.dart';
import '../models/project_link_code.dart';
import '../models/collection.dart';
import '../models/qr_code.dart';
import 'api_exception.dart';
import 'banzami_environment.dart';
import 'merchant_session_tokens.dart';
import 'push_topic.dart';

/// HTTP client for the Banzami Go api-gateway.
///
/// All financial operations are delegated to the gateway, which in turn
/// calls the Rust core-api. This client mirrors the gateway's REST surface.
///
/// Usage — the app's own signed-in session:
/// ```dart
/// final client = BanzamiClient(
///   jwt:         session.jwt,
///   environment: BanzamiEnvironment.sandbox,
/// );
/// ```
///
/// ## Credentials — what may live in a mobile binary
///
/// This package is Banzami's **own** mobile application framework (the Consumer
/// and Business apps depend on it by path). Its `apiKey` is the credential the
/// signed-in merchant's app already holds for itself, exchanged for a session
/// JWT — not a Developer Platform key belonging to a third party.
///
/// A Developer Platform **secret** key (`bz_test_sk_…`, `bz_live_sk_…`) must
/// NEVER be compiled into a mobile application. Anyone who can download the app
/// can read the binary, and that key can move money. The examples here used to
/// show exactly that, which is why this note exists.
///
/// The correct shape for a third-party mobile integration is:
///
/// ```text
///   Flutter app ──publishable key──▶ Banzami   (read a payment, its status)
///        │
///        └──────▶ your backend ──secret key──▶ Banzami   (create, refund, transfer)
/// ```
///
/// A publishable key (`bz_test_pk_…`) is safe to ship in an app: the operator
/// restricts it to read scopes, so it cannot move money even if extracted.

typedef OnRequestHook = void Function(String method, String path, int attempt);
typedef OnResponseHook = void Function(
    String method, String path, int status, int durationMs);
typedef OnErrorHook = void Function(
    String method, String path, Object error, int attempts);

/// Renews a JWT (handle-login) session. Provided by the app, which owns the
/// refresh token and its storage (see [BanzamiClient.refreshMerchantSession]).
///
/// * returns a [RenewedSession] — the client installs it and carries on;
/// * returns `null` — the session has ENDED (Banzami refused the renewal): the
///   client calls `onUnauthorized` once and every waiting request fails 401;
/// * throws — the renewal could not be attempted (outage, no network): the
///   waiting requests fail with that error and `onUnauthorized` is NOT called.
///   An outage is not a sign-out.
typedef SessionRefresher = Future<RenewedSession?> Function();

class BanzamiClient {
  final String apiKey;
  final BanzamiEnvironment environment;
  final String baseUrl;
  final http.Client _http;
  final Uuid _uuid;
  final int maxRetries;
  final Duration retryDelay;

  /// How long one request may take before it is given up on.
  ///
  /// Without a deadline a connection that is accepted and then goes silent
  /// leaves the Business waiting for ever on a screen that cannot say what
  /// happened to the money. On expiry a [BanzamiTimeoutException] is thrown —
  /// a network failure, so [isOutcomeUnknown] is true and the screen offers a
  /// retry that repeats the SAME idempotency key.
  final Duration requestTimeout;

  final OnRequestHook? onRequest;
  final OnResponseHook? onResponse;
  final OnErrorHook? onError;

  /// Called when the session is over: a request fails with 401 and the client
  /// cannot renew (no [refreshSession], the renewal was refused, or the renewed
  /// token was refused too). The app should sign the user out and route them to
  /// sign-in. Invoked before the [BanzamiApiException] is thrown, so callers
  /// still receive the error too.
  ///
  /// For a JWT (handle-login) client it fires ONCE per ended session, however
  /// many requests fail together; afterwards the client refuses to send until a
  /// new token is installed ([setJwt]). It is never called for an outage.
  final void Function()? onUnauthorized;

  /// Renews a JWT (handle-login) session — see [SessionRefresher]. Called when
  /// the access token is expired or about to be (before sending), or when a
  /// request returns 401. Concurrent requests share ONE renewal; after it the
  /// failed request is retried once with the new token.
  final SessionRefresher? refreshSession;

  String? _jwt;
  DateTime? _jwtExpiry;

  /// The renewal in flight, shared by every request that needs it.
  Future<void>? _renewal;

  /// The server ended this JWT session. Nothing more is sent (and
  /// [onUnauthorized] is not repeated) until [setJwt] installs a new token.
  bool _sessionEnded = false;

  /// A handle-login access token is renewed this long before it expires, so a
  /// request never leaves with a token that dies in transit.
  static const _sessionRenewalMargin = Duration(seconds: 60);

  /// An API-key JWT (24 h) is re-exchanged this long before it expires.
  static const _apiKeyRenewalMargin = Duration(minutes: 5);

  /// When the current session token expires. Null until the first API call.
  DateTime? get sessionExpiresAt => _jwtExpiry;

  /// Identity used to decide whether a cached client can be reused — the API key
  /// (legacy mode) or the JWT (handle login). Not for display.
  String get authIdentity => apiKey.isNotEmpty ? apiKey : (_jwt ?? '');

  bool get isSandbox => environment.isSandbox;
  bool get isProduction => environment.isLive;

  /// Construct with an API key (legacy: exchanged for a JWT on demand) and/or a
  /// pre-issued [jwt] (e.g. from @handle + PIN login). When a fresh JWT is
  /// present it is used directly; otherwise the API key is exchanged. A
  /// JWT-only client renews through [refreshSession]; without one it cannot
  /// renew — on expiry it surfaces a 401 so the app re-authenticates.
  BanzamiClient({
    this.apiKey = '',
    this.environment = BanzamiEnvironment.production,
    String? baseUrl,
    http.Client? httpClient,
    this.maxRetries = 3,
    this.retryDelay = const Duration(milliseconds: 500),
    this.requestTimeout = const Duration(seconds: 30),
    this.onRequest,
    this.onResponse,
    this.onError,
    this.onUnauthorized,
    this.refreshSession,
    String? jwt,
    DateTime? jwtExpiresAt,
  })  : baseUrl = (baseUrl ?? environment.defaultBaseUrl)
            .replaceAll(RegExp(r'/$'), ''),
        _http = httpClient ?? http.Client(),
        _uuid = const Uuid(),
        _jwt = jwt,
        _jwtExpiry = jwtExpiresAt;

  /// Install a pre-issued merchant JWT (handle + PIN login). When set and fresh
  /// it is used directly, without exchanging an API key. Installing a token
  /// re-opens a client whose session had ended.
  void setJwt(String token, {DateTime? expiresAt}) {
    _jwt = token;
    _jwtExpiry = expiresAt;
    _sessionEnded = false;
  }

  /// Makes sure this JWT (handle-login) client holds a usable access token,
  /// renewing it through [refreshSession] when it is expired or about to be.
  /// Sends nothing when the token is fresh.
  ///
  /// Throws a 401 [BanzamiApiException] when the session has ended (after
  /// [onUnauthorized]), or the renewal's own error during an outage. Used by an
  /// app to resume a session when the device is unlocked, before any screen
  /// that needs it is shown.
  Future<void> ensureSession() => _ensureJwt();

  /// Log a merchant in by @handle + PIN (unauthenticated endpoint). Returns the
  /// issued access token, its expiry, the environment and — from a gateway with
  /// renewable sessions — the refresh token and its expiry. Does NOT mutate
  /// this client — the caller decides how to build (and store) the session.
  ///
  /// Throws [BanzamiApiException] (401 invalid handle/PIN, 429 `LOCKED`) or
  /// [BanzamiNetworkException].
  Future<MerchantAuthTokens> loginMerchantHandlePin({
    required String handle,
    required String pin,
  }) async {
    late http.Response resp;
    try {
      resp = await _bounded(
          _http.post(
            Uri.parse('$baseUrl/v1/merchant/auth/token'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({'handle': handle, 'pin': pin}),
          ),
          'POST',
          '/v1/merchant/auth/token');
    } catch (e) {
      if (e is BanzamiApiException || e is BanzamiNetworkException) rethrow;
      throw BanzamiNetworkException(e.toString());
    }
    final body = jsonDecode(resp.body) as Map<String, dynamic>;
    if (resp.statusCode >= 400) {
      throw BanzamiApiException.fromJson(resp.statusCode, body);
    }
    return MerchantAuthTokens.fromJson(body);
  }

  /// Renews a Business App session with its refresh token (unauthenticated
  /// endpoint `POST /v1/merchant/auth/refresh`). Does NOT mutate this client.
  ///
  /// * Returns the new tokens. The presented [refreshToken] is now SPENT: the
  ///   caller must persist the returned refresh token before using the access
  ///   token — presenting the old one again ends the whole sign-in.
  /// * Returns `null` when the session has ended — any permanent refusal
  ///   (401 `SESSION_ENDED`: expired, revoked, reused, Business suspended,
  ///   handle gone; or a request the server cannot accept at all).
  /// * Throws [BanzamiApiException] for a temporary failure (5xx, 429, 408) and
  ///   [BanzamiNetworkException] when Banzami could not be reached or answered
  ///   something that is not a session. Neither says the session ended.
  Future<MerchantAuthTokens?> refreshMerchantSession(
      String refreshToken) async {
    if (refreshToken.isEmpty) return null; // no session to renew
    late http.Response resp;
    try {
      resp = await _bounded(
          _http.post(
            Uri.parse('$baseUrl/v1/merchant/auth/refresh'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({'refresh_token': refreshToken}),
          ),
          'POST',
          '/v1/merchant/auth/refresh');
    } catch (e) {
      if (e is BanzamiApiException || e is BanzamiNetworkException) rethrow;
      throw BanzamiNetworkException(e.toString());
    }
    final status = resp.statusCode;
    if (status >= 200 && status < 300) {
      try {
        return MerchantAuthTokens.fromJson(
            jsonDecode(resp.body) as Map<String, dynamic>);
      } catch (_) {
        // A 2xx that is not a session (a proxy page): nothing is known about
        // the session, so it is not ended — the caller may try again.
        throw const BanzamiNetworkException('malformed session renewal answer');
      }
    }
    if (_isTemporary(status)) {
      throw BanzamiApiException.fromJson(status, _errorBody(resp));
    }
    // Every other refusal is permanent: this refresh token will never be
    // accepted, so the session is over.
    return null;
  }

  /// Ends a Business App sign-in (`POST /v1/merchant/auth/logout`), revoking
  /// its refresh token server-side. Banzami answers 204 whether or not the
  /// session was still open. Throws [BanzamiApiException] (e.g. 503) or
  /// [BanzamiNetworkException] when the revocation could not be confirmed — an
  /// app signing out clears its own state regardless.
  Future<void> logoutMerchantSession(String refreshToken) async {
    late http.Response resp;
    try {
      resp = await _bounded(
          _http.post(
            Uri.parse('$baseUrl/v1/merchant/auth/logout'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({'refresh_token': refreshToken}),
          ),
          'POST',
          '/v1/merchant/auth/logout');
    } catch (e) {
      if (e is BanzamiApiException || e is BanzamiNetworkException) rethrow;
      throw BanzamiNetworkException(e.toString());
    }
    if (resp.statusCode >= 200 && resp.statusCode < 300) return;
    throw BanzamiApiException.fromJson(resp.statusCode, _errorBody(resp));
  }

  static bool _isTemporary(int status) =>
      status >= 500 || status == 429 || status == 408;

  /// The JSON error body, or an empty map when the body is not JSON (a proxy
  /// error page) — the status code still carries the meaning.
  static Map<String, dynamic> _errorBody(http.Response resp) {
    try {
      final v = jsonDecode(resp.body);
      return v is Map<String, dynamic> ? v : const {};
    } catch (_) {
      return const {};
    }
  }

  /// Non-secret lookup of a business @handle (unauthenticated) — used so the app
  /// only prompts for a PIN when the account exists and can sign in. Never
  /// returns a PIN/hash/key.
  /// [otherEnvironment] is set ("LIVE"/"SANDBOX") only when the account does NOT
  /// exist in this environment but DOES exist in the other one — so the app can
  /// say "esta conta pertence ao ambiente X" instead of a misleading not-found.
  Future<
      ({
        bool exists,
        bool canLogin,
        String status,
        String? displayName,
        String? otherEnvironment
      })> lookupMerchantHandle(
    String handle,
  ) async {
    late http.Response resp;
    try {
      resp = await _bounded(
          _http.post(
            Uri.parse('$baseUrl/v1/merchant/auth/lookup'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({'handle': handle}),
          ),
          'POST',
          '/v1/merchant/auth/lookup');
    } catch (e) {
      if (e is BanzamiApiException || e is BanzamiNetworkException) rethrow;
      throw BanzamiNetworkException(e.toString());
    }
    final body = jsonDecode(resp.body) as Map<String, dynamic>;
    if (resp.statusCode >= 400) {
      throw BanzamiApiException.fromJson(resp.statusCode, body);
    }
    return (
      exists: body['exists'] as bool? ?? false,
      canLogin: body['can_login'] as bool? ?? false,
      status: body['status'] as String? ?? '',
      displayName: body['display_name'] as String?,
      otherEnvironment: body['other_environment'] as String?,
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
      'handle': handle,
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

  // Consumer wallets — REMOVED.
  //
  // getOrCreateWallet / getBalance / getWalletForConsumer called
  // /v1/consumer-wallets on the gateway, which is not mounted (RA-058): a
  // merchant credential has no relation to a consumer's wallet, and the routes
  // took the consumer straight from client input. Every call answered 404.
  // A consumer reads its own wallet through ConsumerPublicClient (public-api,
  // derived from the consumer's token).

  // ---------------------------------------------------------------------------
  // Transfers
  // ---------------------------------------------------------------------------

  // Transfers (P2P) — REMOVED.
  //
  // sendTransfer / getTransfer / listTransfers called an id-based MERCHANT
  // surface that has been retired. A consumer-to-consumer transfer has two
  // consumer participants and no merchant party, so a merchant credential had
  // no authority over it: the routes took sender_id / transfer id / consumer_id
  // straight from client input, letting a merchant move any consumer's money or
  // read any consumer's transfers.
  //
  // There is deliberately no merchant-facing replacement. The consumer P2P
  // surface lives in ConsumerPublicClient, where the sender is the authenticated
  // consumer and reads are restricted to a transfer's own parties.

  // ---------------------------------------------------------------------------
  // QR Codes
  // ---------------------------------------------------------------------------

  Future<QrResponse> createStaticQr({
    required String ownerId,
    String ownerType = 'CONSUMER',
    String currency = 'AOA',
  }) async {
    final json = await _post('/v1/qr/static', {
      'owner_id': ownerId,
      'owner_type': ownerType,
      'currency': currency,
    });
    return QrResponse.fromJson(json);
  }

  Future<QrResponse> createDynamicQr({
    required String ownerId,
    required int amountMinor,
    required DateTime expiresAt,
    String ownerType = 'CONSUMER',
    String currency = 'AOA',
    String? reference,
  }) async {
    final json = await _post('/v1/qr/dynamic', {
      'owner_id': ownerId,
      'owner_type': ownerType,
      'currency': currency,
      'amount_minor': amountMinor,
      'expires_at': expiresAt.toUtc().toIso8601String(),
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

  // payQr — REMOVED. The gateway does not mount POST /v1/qr/pay (RA-053): a
  // merchant credential is not authority to debit a consumer's wallet, and the
  // route took the payer as free text. The public-api has no QR-pay route
  // either, so no client can settle a structured QR today.

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

  /// Lists the merchant wallet's sub-accounts (PRIMARY + segregated CAMPAIGN/…)
  /// with their balances. Used to break down funds held in campaigns.
  Future<List<MerchantWalletAccount>> listWalletAccounts(
      String walletId) async {
    final json = await _get('/v1/wallet-accounts?wallet_id=$walletId');
    final data = (json['data'] as List<dynamic>?) ?? const [];
    return data
        .map((e) => MerchantWalletAccount.fromJson(e as Map<String, dynamic>))
        .toList();
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
      'wallet_id': walletId,
      'currency': currency,
      if (amountMinor != null) 'amount_minor': amountMinor,
      if (description != null) 'description': description,
      if (expiresAt != null) 'expires_at': expiresAt.toUtc().toIso8601String(),
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

  Future<PaymentLink> getPaymentLink(String id) async {
    final json = await _get('/v1/payment-links/$id');
    return PaymentLink.fromJson(json);
  }

  // ---------------------------------------------------------------------------
  // Collections (BANZA ADR-036) — split a single total into N shares that each
  // settle independently into the merchant wallet. merchant_id/environment are
  // derived from the merchant principal by the gateway; the client only sends
  // the wallet and the split rule.
  // ---------------------------------------------------------------------------

  /// Create an EQUAL_SPLIT collection: `totalAmountMinor` divided across
  /// `participantsCount` shares. Remainder (when not evenly divisible) is added
  /// to the first share, so any total/count is accepted.
  Future<CollectionWithShares> createEqualSplitCollection({
    required String walletId,
    required int totalAmountMinor,
    required int participantsCount,
    String currency = 'AOA',
    String? title,
    String? description,
    DateTime? expiresAt,
    String? idempotencyKey,
  }) async {
    final json = await _postWithRetry(
        '/v1/collections',
        {
          'wallet_id': walletId,
          'currency': currency,
          'total_amount_minor': totalAmountMinor,
          'rule': {
            'type': 'EQUAL_SPLIT',
            'participants_count': participantsCount,
            'divisibility': 'REMAINDER_TO_FIRST',
          },
          if (title != null) 'title': title,
          if (description != null) 'description': description,
          if (expiresAt != null)
            'expires_at': expiresAt.toUtc().toIso8601String(),
          'idempotency_key': idempotencyKey ?? _uuid.v4(),
        },
        idempotencyKey: idempotencyKey);
    return CollectionWithShares.fromJson(json);
  }

  /// Create a FIXED_AMOUNTS collection: one share per amount. The amounts must
  /// sum to `totalAmountMinor` (enforced server-side).
  Future<CollectionWithShares> createFixedAmountsCollection({
    required String walletId,
    required int totalAmountMinor,
    required List<int> amountsMinor,
    String currency = 'AOA',
    String? title,
    String? description,
    DateTime? expiresAt,
    String? idempotencyKey,
  }) async {
    final json = await _postWithRetry(
        '/v1/collections',
        {
          'wallet_id': walletId,
          'currency': currency,
          'total_amount_minor': totalAmountMinor,
          'rule': {
            'type': 'FIXED_AMOUNTS',
            'shares': [
              for (final a in amountsMinor) {'amount_minor': a}
            ],
          },
          if (title != null) 'title': title,
          if (description != null) 'description': description,
          if (expiresAt != null)
            'expires_at': expiresAt.toUtc().toIso8601String(),
          'idempotency_key': idempotencyKey ?? _uuid.v4(),
        },
        idempotencyKey: idempotencyKey);
    return CollectionWithShares.fromJson(json);
  }

  /// Read a collection with derived progress (collected / remaining).
  Future<CollectionDetail> getCollection(String id) async {
    final json = await _get('/v1/collections/$id');
    return CollectionDetail.fromJson(json);
  }

  /// List the shares of a collection.
  Future<List<CollectionShare>> listCollectionShares(String id) async {
    final json = await _get('/v1/collections/$id/shares');
    return ((json['data'] as List?) ?? const [])
        .map((e) => CollectionShare.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// Surface a share as a payable artifact (a payment link by default, or a
  /// dynamic QR). Returns the PaymentIntent + updated share; the concrete
  /// artifact id is `surfaceRef`.
  Future<ShareSurface> surfaceCollectionShare(
    String shareId, {
    String surface = 'LINK',
  }) async {
    final json = await _post('/v1/collection-shares/$shareId/surface', {
      'surface': surface,
    });
    return ShareSurface.fromJson(json);
  }

  /// Cancel an open collection (only allowed while nothing/partly paid).
  Future<Collection> cancelCollection(String id) async {
    final json = await _post('/v1/collections/$id/cancel', null);
    return Collection.fromJson(json);
  }

  // Payment requests — REMOVED.
  //
  // createPaymentRequest / listPaymentRequests / getPaymentRequest /
  // cancelPaymentRequest called /v1/payment-requests, which the gateway does
  // not mount (RA-057): a payment request is consumer-to-consumer, with no
  // merchant party a merchant credential could be scoped against. Every call
  // answered 404. There is no merchant-facing replacement; a Business asks
  // for a fixed amount with a payment link or a dynamic QR.

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
    String documentType = 'BILHETE_DE_IDENTIDADE',
    String requestedLevel = 'BASIC',
  }) async {
    return _postWithRetry('/v1/compliance/customers/verify', {
      'full_name': fullName,
      'document_type': documentType,
      'document_number': documentNumber,
      'date_of_birth': _ymd(dateOfBirth),
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

  // verifyMerchantKyb — REMOVED. A Business cannot verify itself: KYB is
  // decided by Banzami's review of the application and its documents, and
  // POST /v1/compliance/merchants/verify now answers 403
  // KYB_DECIDED_BY_REVIEW. The Business App shows the decision
  // (getMerchantKybStatus) and uploads documents for the review.

  /// KYB + AML as the payout gate sees them. Use [MerchantComplianceStatus.
  /// canWithdraw] before offering a withdrawal — KYB alone is not enough.
  Future<MerchantComplianceStatus> getMerchantComplianceStatus() async =>
      MerchantComplianceStatus.fromJson(
          await _get('/v1/compliance/merchants/status'));

  /// The authenticated merchant's real KYB status + the 3 business document
  /// slots (read-only). The Business app shows this without re-submitting the
  /// application. The operator decides approval — never an upload.
  Future<MerchantKybStatus> getMerchantKybStatus() async {
    return MerchantKybStatus.fromJson(await _get('/v1/merchant/kyb/status'));
  }

  /// The 3 business document slots with their real states (MISSING / PENDING /
  /// VALID / REJECTED / EXPIRED).
  Future<List<MerchantKybDocument>> getMerchantKybDocuments() async {
    final json = await _get('/v1/merchant/kyb/documents');
    return ((json['documents'] as List?) ?? const [])
        .map((e) => MerchantKybDocument.fromJson(e as Map<String, dynamic>))
        .toList(growable: false);
  }

  /// Loads one business document (ownership-scoped; 404 for another merchant).
  Future<MerchantKybDocument> getMerchantKybDocument(String documentId) async {
    return MerchantKybDocument.fromJson(
        await _get('/v1/merchant/kyb/documents/$documentId'));
  }

  /// Requests a short-lived signed PUT URL to upload/replace a business document
  /// of [type]. The app PUTs the bytes to [MerchantKybUploadUrl.url] (never log
  /// it) then calls [completeMerchantKybDocumentUpload].
  Future<MerchantKybUploadUrl> requestMerchantKybDocumentUploadUrl(
    MerchantKybDocumentType type, {
    String contentType = 'image/jpeg',
  }) async {
    final json =
        await _post('/v1/merchant/kyb/documents/${type.wire}/upload-url', {
      'content_type': contentType,
    });
    return MerchantKybUploadUrl.fromJson(json);
  }

  /// Confirms an upload (after the PUT). The operator HEAD-verifies the object
  /// and the document moves to PENDING_REVIEW. Returns the updated document.
  Future<MerchantKybDocument> completeMerchantKybDocumentUpload(
    String documentId, {
    String? sha256,
  }) async {
    final json =
        await _post('/v1/merchant/kyb/documents/$documentId/complete', {
      if (sha256 != null && sha256.isNotEmpty) 'sha256': sha256,
    });
    return MerchantKybDocument.fromJson(json);
  }

  // ---------------------------------------------------------------------------
  // Developer Projects — a Business's consent to be connected to one
  // ---------------------------------------------------------------------------

  /// Issues a consent code with which a Developer Project connects to the
  /// signed-in Business (`POST /v1/merchant/project-link-codes`, merchant
  /// session). The Business gives the code to the developer, who enters it in
  /// the Developers Console; redeeming it binds the Project to this Business.
  ///
  /// Every call issues a NEW code — valid 10 minutes, single use — and retires
  /// the previous one on Banzami, so no idempotency key is sent and nothing is
  /// retried automatically (a retry would retire the code it was retrying).
  ///
  /// Throws [BanzamiApiException] 503 `SERVICE_UNAVAILABLE` / `UNAVAILABLE`
  /// when Banzami cannot issue one now, 401 when the session has ended (after
  /// `onUnauthorized`), and [BanzamiNetworkException] when Banzami could not
  /// be reached or answered something that is not a code. It never returns a
  /// placeholder.
  Future<ProjectLinkCode> createProjectLinkCode() async {
    try {
      // A 2xx body that is not JSON (a proxy page) is a FormatException too.
      return ProjectLinkCode.fromJson(
          await _post('/v1/merchant/project-link-codes', null));
    } on FormatException {
      throw const BanzamiNetworkException('malformed project link code answer');
    }
  }

  static String _ymd(DateTime d) => '${d.year.toString().padLeft(4, '0')}-'
      '${d.month.toString().padLeft(2, '0')}-'
      '${d.day.toString().padLeft(2, '0')}';

  // ---------------------------------------------------------------------------
  // Transactions (merchant)
  // ---------------------------------------------------------------------------

  Future<MerchantTransactionPage> listMerchantTransactions({
    int limit = 20,
    String? cursor,
    DateTime? since,
  }) async {
    var path = '/v1/transactions?limit=$limit';
    if (since != null) {
      path += '&since=${Uri.encodeComponent(since.toUtc().toIso8601String())}';
    }
    if (cursor != null) path += '&cursor=${Uri.encodeComponent(cursor)}';
    final json = await _get(path);
    return MerchantTransactionPage.fromJson(json);
  }

  // ---------------------------------------------------------------------------
  // Received wallet-native payments (canonical: wallet_payments) + receipts
  // ---------------------------------------------------------------------------

  /// Lists the merchant's received wallet-native payments (QR, payment link,
  /// payment session), newest first. Scoped server-side to the authenticated
  /// merchant + environment. [since] maps to the gateway's `date_from`.
  Future<MerchantWalletPaymentPage> listMerchantWalletPayments({
    int limit = 20,
    String? cursor,
    String? status,
    DateTime? since,
  }) async {
    var path = '/v1/merchant/wallet-payments?limit=$limit';
    if (cursor != null) path += '&cursor=${Uri.encodeComponent(cursor)}';
    if (status != null) path += '&status=${Uri.encodeComponent(status)}';
    if (since != null) {
      path +=
          '&date_from=${Uri.encodeComponent(since.toUtc().toIso8601String())}';
    }
    final json = await _get(path);
    return MerchantWalletPaymentPage.fromJson(json);
  }

  /// The FCM topic this Business's payment notifications are published to,
  /// exactly as the gateway names it, or null when push topics are not
  /// configured there.
  ///
  /// The name is a keyed hash of the merchant id, disclosed only to the
  /// Business's own session (A6-06): subscribe to exactly this, and never
  /// derive a topic from the id.
  Future<String?> getMerchantPushTopic() async {
    final json = await _get('/v1/merchant/push-topic');
    return banzamiPushTopicFrom(json);
  }

  /// Fetches the official merchant payment receipt PDF (generated server-side by
  /// the Document Engine). Returns the raw PDF bytes. The app must never build
  /// PDFs locally. Throws [BanzamiApiException] on 403/404/etc.
  Future<List<int>> fetchMerchantReceiptPdf(String id) async {
    final path = '/v1/merchant/transactions/$id/receipt.pdf';
    onRequest?.call('GET', path, 0);
    late http.Response resp;
    try {
      resp = await _authorized((headers) => _bounded(
          _http.get(Uri.parse('$baseUrl$path'), headers: headers), 'GET', path));
    } catch (e) {
      if (e is BanzamiApiException || e is BanzamiNetworkException) rethrow;
      throw BanzamiNetworkException(e.toString());
    }
    if (resp.statusCode != 200) {
      _decode(resp); // throws BanzamiApiException for non-2xx JSON errors
      throw BanzamiNetworkException('receipt unavailable (${resp.statusCode})');
    }
    return resp.bodyBytes;
  }

  // ---------------------------------------------------------------------------
  // Payouts
  // ---------------------------------------------------------------------------

  Future<Map<String, dynamic>> createPayout({
    required String walletId,
    required int amountMinor,
    required String bankAccountNumber,
    required String bankCode,
    required String accountHolderName,
    String? idempotencyKey,
    String currency = 'AOA',
  }) async {
    return _postWithRetry(
        '/v1/payouts',
        {
          'idempotency_key': idempotencyKey ?? _uuid.v4(),
          'wallet_id': walletId,
          'amount_minor': amountMinor,
          'currency': currency,
          'bank_account_number': bankAccountNumber,
          'bank_code': bankCode,
          'account_holder_name': accountHolderName,
        },
        idempotencyKey: idempotencyKey);
  }

  /// The Business's recent withdrawals (`GET /v1/payouts`), newest first.
  Future<List<Payout>> listPayouts({int limit = 20}) async {
    final json = await _get('/v1/payouts?limit=$limit');
    final data = (json['data'] as List<dynamic>? ?? const []);
    return data
        .map((e) => Payout.fromJson(e as Map<String, dynamic>))
        .toList()
      ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
  }

  // ---------------------------------------------------------------------------
  // Payment links — public endpoints (no auth required)
  // ---------------------------------------------------------------------------

  /// Fetch a payment link by its public slug.
  /// Calls the unauthenticated /public/pay/{slug} endpoint.
  Future<PaymentLink> getPaymentLinkBySlug(String slug) async {
    late http.Response resp;
    try {
      resp = await _bounded(_http.get(Uri.parse('$baseUrl/public/pay/$slug')),
          'GET', '/public/pay/$slug');
    } catch (e) {
      if (e is BanzamiApiException) rethrow;
      throw BanzamiNetworkException(e.toString());
    }
    final body = jsonDecode(resp.body) as Map<String, dynamic>;
    if (resp.statusCode >= 400) {
      throw BanzamiApiException.fromJson(resp.statusCode, body);
    }
    return PaymentLink.fromJson(body);
  }

  /// Poll whether a payment link has been paid.
  /// Returns true when the link status is USED.
  Future<bool> getPaymentLinkStatus(String slug) async {
    late http.Response resp;
    try {
      resp = await _bounded(
          _http.get(Uri.parse('$baseUrl/public/pay/$slug/status')),
          'GET',
          '/public/pay/$slug/status');
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

  /// Puts [requestTimeout] on one request. EVERY call this client makes goes
  /// through here: `HttpClient.connectionTimeout` only bounds opening the
  /// socket, so without this an accepted-then-silent connection never
  /// completes and the app waits for ever.
  Future<http.Response> _bounded(
          Future<http.Response> response, String method, String path) =>
      response.timeout(requestTimeout,
          onTimeout: () => throw BanzamiTimeoutException(
              '$method $path took longer than ${requestTimeout.inSeconds}s'));

  // Makes sure a usable token is installed before a request is sent.
  //
  // API-key client: exchanges the key for a short-lived JWT (TTL: 24 h),
  // cached until 5 minutes before expiry, then transparently re-exchanged.
  //
  // JWT (handle-login) client: renews through [refreshSession] shortly before
  // the token expires. A client whose session ended sends nothing at all.
  Future<void> _ensureJwt() async {
    if (apiKey.isNotEmpty) {
      if (_isFresh(_apiKeyRenewalMargin)) return;
      await _exchangeApiKey();
      return;
    }
    if (_sessionEnded) throw _sessionEndedError();
    if (_isFresh(_sessionRenewalMargin)) return;
    if (refreshSession == null) {
      // Nothing can renew this token — surface a 401 and let the app
      // re-authenticate (handle + PIN).
      _endSession();
      throw BanzamiApiException.fromJson(401, const {
        'code': 'TOKEN_EXPIRED',
        'message': 'session expired, please sign in again',
      });
    }
    await _renew();
  }

  bool _isFresh(Duration margin) =>
      _jwt != null &&
      _jwtExpiry != null &&
      DateTime.now().isBefore(_jwtExpiry!.subtract(margin));

  Future<void> _exchangeApiKey() async {
    late http.Response resp;
    try {
      resp = await _bounded(
          _http.post(
            Uri.parse('$baseUrl/v1/auth/token'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({'api_key': apiKey}),
          ),
          'POST',
          '/v1/auth/token');
    } catch (e) {
      if (e is BanzamiApiException || e is BanzamiNetworkException) rethrow;
      throw BanzamiNetworkException(e.toString());
    }
    final body = jsonDecode(resp.body) as Map<String, dynamic>;
    if (resp.statusCode >= 400) {
      throw BanzamiApiException.fromJson(resp.statusCode, body);
    }
    _jwt = body['token'] as String;
    final expiresAtStr = body['expires_at'] as String?;
    _jwtExpiry = expiresAtStr != null
        ? DateTime.parse(expiresAtStr)
        : DateTime.now().add(const Duration(hours: 24));
  }

  /// Single-flight renewal: every request that needs a new token awaits the
  /// SAME renewal — one refresh request however many calls fail together, so a
  /// burst never becomes a refresh storm (and a single-use refresh token is
  /// never presented twice).
  Future<void> _renew() =>
      _renewal ??= _performRenewal().whenComplete(() => _renewal = null);

  Future<void> _performRenewal() async {
    final RenewedSession? renewed;
    try {
      renewed = await refreshSession!();
    } on BanzamiApiException catch (e) {
      if (e.statusCode == 401) {
        _endSession();
        throw _sessionEndedError();
      }
      rethrow; // a temporary failure: the session is not known to have ended
    } on BanzamiNetworkException {
      rethrow;
    } on Exception catch (e) {
      throw BanzamiNetworkException('session renewal failed: $e');
    }
    if (renewed == null) {
      _endSession();
      throw _sessionEndedError();
    }
    _jwt = renewed.token;
    _jwtExpiry = renewed.expiresAt;
    _sessionEnded = false;
  }

  /// The JWT session is over: report it once, then refuse to send.
  void _endSession() {
    if (_sessionEnded) return;
    _sessionEnded = true;
    onUnauthorized?.call();
  }

  static BanzamiApiException _sessionEndedError() =>
      BanzamiApiException.fromJson(401, const {
        'code': 'SESSION_ENDED',
        'message': 'the session has ended; sign in again',
      });

  Map<String, String> _authHeaders() => {
        'Content-Type': 'application/json',
        'User-Agent': 'Banzami/1.0 (mobile)',
        'Authorization': 'Bearer $_jwt',
      };

  /// Sends one authenticated request.
  ///
  /// On a 401 a renewable JWT session is renewed (the shared renewal) and the
  /// request is retried ONCE with the new token; if the retry is refused too
  /// the session has ended. A request that carried a token another request has
  /// already renewed past is retried without renewing again. Never loops.
  Future<http.Response> _authorized(
      Future<http.Response> Function(Map<String, String> headers) send) async {
    await _ensureJwt();
    final sentWith = _jwt;
    final resp = await send(_authHeaders());
    if (resp.statusCode != 401) return resp;

    if (apiKey.isNotEmpty) {
      onUnauthorized?.call(); // API-key client: unchanged behaviour
      return resp;
    }
    if (_sessionEnded) return resp; // already reported
    if (refreshSession == null) {
      _endSession();
      return resp;
    }
    if (_jwt == sentWith) await _renew();
    final retried = await send(_authHeaders());
    if (retried.statusCode == 401) _endSession();
    return retried;
  }

  Future<Map<String, dynamic>> _send(
    String method,
    String path,
    Future<http.Response> Function(Map<String, String> headers) send,
  ) async {
    onRequest?.call(method, path, 0);
    final t0 = DateTime.now().millisecondsSinceEpoch;
    late http.Response resp;
    try {
      resp = await _authorized(send);
    } catch (e) {
      onError?.call(method, path, e, 1);
      if (e is BanzamiApiException || e is BanzamiNetworkException) rethrow;
      throw BanzamiNetworkException(e.toString());
    }
    final result = _decode(resp);
    onResponse?.call(method, path, resp.statusCode,
        DateTime.now().millisecondsSinceEpoch - t0);
    return result;
  }

  Future<Map<String, dynamic>> _get(String path) => _send(
      'GET',
      path,
      (headers) => _bounded(
          _http.get(Uri.parse('$baseUrl$path'), headers: headers),
          'GET',
          path));

  Future<Map<String, dynamic>> _delete(String path) => _send(
      'DELETE',
      path,
      (headers) => _bounded(
          _http.delete(Uri.parse('$baseUrl$path'), headers: headers),
          'DELETE',
          path));

  Future<Map<String, dynamic>> _post(
    String path,
    Map<String, dynamic>? body, {
    String? idempotencyKey,
  }) =>
      _send('POST', path, (headers) {
        if (idempotencyKey != null) {
          headers['Idempotency-Key'] = idempotencyKey;
        }
        return _bounded(
            _http.post(
              Uri.parse('$baseUrl$path'),
              headers: headers,
              body: body != null ? jsonEncode(body) : null,
            ),
            'POST',
            path);
      });

  Future<Map<String, dynamic>> _postWithRetry(
    String path,
    Map<String, dynamic>? body, {
    String? idempotencyKey,
  }) {
    final key = idempotencyKey ?? _uuid.v4();
    return _withRetry(
        () => _post(path, body, idempotencyKey: key), 'POST', path);
  }

  Future<T> _withRetry<T>(
      Future<T> Function() operation, String method, String path) async {
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

  // 401 handling (renewal, onUnauthorized) happens in [_authorized]; here an
  // error is only typed. A non-JSON error body (a proxy page) still becomes a
  // BanzamiApiException carrying its status, never a FormatException.
  Map<String, dynamic> _decode(http.Response resp) {
    if (resp.statusCode >= 200 && resp.statusCode < 300) {
      return jsonDecode(resp.body) as Map<String, dynamic>;
    }
    throw BanzamiApiException.fromJson(resp.statusCode, _errorBody(resp));
  }
}
