import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:uuid/uuid.dart';

import '../models/consumer.dart';
import '../models/merchant.dart';
import '../models/payment_link.dart';
import '../models/qr_code.dart';
import '../models/transfer.dart';
import '../models/wallet_balance.dart';
import 'api_exception.dart';

/// HTTP client for the Banzami Go api-gateway.
///
/// All financial operations are delegated to the gateway, which in turn
/// calls the Rust core-api. This client mirrors the gateway's REST surface.
///
/// Usage:
/// ```dart
/// final client = BanzamiClient(
///   baseUrl: 'https://api.banzami.ao',
///   apiKey:  'bz_live_...',
/// );
/// ```
class BanzamiClient {
  final String baseUrl;
  final String apiKey;
  final http.Client _http;
  final Uuid _uuid;

  BanzamiClient({
    required this.baseUrl,
    required this.apiKey,
    http.Client? httpClient,
  })  : _http = httpClient ?? http.Client(),
        _uuid = const Uuid();

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
    return _post('/v1/consumer-wallets', {
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

  Future<Transfer> sendTransfer({
    required String senderId,
    required String recipientId,
    required int amountMinor,
    String currency = 'AOA',
    String? description,
    String? idempotencyKey,
  }) async {
    final json = await _post('/v1/transfers', {
      'idempotency_key': idempotencyKey ?? _uuid.v4(),
      'sender_id':       senderId,
      'recipient_id':    recipientId,
      'amount_minor':    amountMinor,
      'currency':        currency,
      if (description != null) 'description': description,
    });
    return Transfer.fromJson(json);
  }

  Future<Transfer> getTransfer(String id) async {
    final json = await _get('/v1/transfers/$id');
    return Transfer.fromJson(json);
  }

  Future<TransferPage> listTransfers({
    required String consumerId,
    int limit = 20,
    String? cursor,
  }) async {
    var path = '/v1/transfers?consumer_id=$consumerId&limit=$limit';
    if (cursor != null) path += '&cursor=$cursor';
    final json = await _get(path);
    return TransferPage.fromJson(json);
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
    final json = await _post('/v1/payment-links', {
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
  // Payment links — public endpoints (no auth required)
  // ---------------------------------------------------------------------------

  /// Fetch a payment link by its public slug.
  /// Calls the unauthenticated /public/pay/{slug} endpoint.
  Future<PaymentLink> getPaymentLinkBySlug(String slug) async {
    late http.Response resp;
    try {
      resp = await _http.get(Uri.parse('$baseUrl/public/pay/$slug'));
    } catch (e) {
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

  Map<String, String> get _headers => {
    'Content-Type':  'application/json',
    'Authorization': 'Bearer $apiKey',
  };

  Future<Map<String, dynamic>> _get(String path) async {
    late http.Response resp;
    try {
      resp = await _http.get(
        Uri.parse('$baseUrl$path'),
        headers: _headers,
      );
    } catch (e) {
      throw BanzamiNetworkException(e.toString());
    }
    return _decode(resp);
  }

  Future<Map<String, dynamic>> _delete(String path) async {
    late http.Response resp;
    try {
      resp = await _http.delete(
        Uri.parse('$baseUrl$path'),
        headers: _headers,
      );
    } catch (e) {
      throw BanzamiNetworkException(e.toString());
    }
    return _decode(resp);
  }

  Future<Map<String, dynamic>> _post(String path, Map<String, dynamic>? body) async {
    late http.Response resp;
    try {
      resp = await _http.post(
        Uri.parse('$baseUrl$path'),
        headers: _headers,
        body:    body != null ? jsonEncode(body) : null,
      );
    } catch (e) {
      throw BanzamiNetworkException(e.toString());
    }
    return _decode(resp);
  }

  Map<String, dynamic> _decode(http.Response resp) {
    final body = jsonDecode(resp.body) as Map<String, dynamic>;
    if (resp.statusCode >= 200 && resp.statusCode < 300) return body;
    throw BanzamiApiException.fromJson(resp.statusCode, body);
  }
}
