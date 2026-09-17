import 'dart:convert';

import 'package:banzami_flutter/banzami_flutter.dart';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

/// Business Web session (ADR-066). Unlike the native `MerchantSessionService`,
/// this holds NO credential: the merchant JWT and its rotating refresh live in
/// the same-origin BFF (server-side, sealed), and this session only mirrors the
/// public identity the BFF reports at `/session/state`. There is no browser
/// token storage, no biometrics, no PIN re-lock — sign-in is @handle + PIN once,
/// exactly as the canonical contract, and the BFF renews the access token itself.
enum BusinessWebState { booting, loggedOut, loggingIn, ready }

class MerchantWebSession extends ChangeNotifier {
  MerchantWebSession({required http.Client httpClient, required BanzamiClient client})
      : _http = httpClient,
        _client = client;

  final http.Client _http;
  final BanzamiClient _client;

  BusinessWebState _state = BusinessWebState.booting;
  Merchant? _merchant;
  String _handle = '';
  String? _walletId;
  String _environment = 'SANDBOX';
  String? _error;

  BusinessWebState get state => _state;
  Merchant? get merchant => _merchant;
  String get handle => _handle;
  String? get walletId => _walletId;
  String get environment => _environment;
  bool get isSandbox => _environment.toUpperCase() == 'SANDBOX';
  String? get error => _error;
  BanzamiClient get client => _client;

  Uri _origin(String path) => Uri.parse('${Uri.base.origin}$path');

  /// On boot (page load, hard refresh, or a context switch into Business), ask
  /// the BFF whether a Business authority is live and, if so, hydrate the
  /// identity. No credential is read on the client.
  Future<void> bootstrap() async {
    _state = BusinessWebState.booting;
    notifyListeners();
    try {
      final state = await _sessionState();
      if (state['business'] == true) {
        final ctx = (state['business_context'] as Map?) ?? const {};
        _environment = (ctx['environment'] as String?) ?? 'SANDBOX';
        await _hydrate((ctx['merchant_id'] as String?) ?? '');
        _state = BusinessWebState.ready;
      } else {
        _state = BusinessWebState.loggedOut;
      }
    } catch (_) {
      _state = BusinessWebState.loggedOut;
    }
    notifyListeners();
  }

  Future<Map<String, dynamic>> _sessionState() async {
    final r = await _http.get(_origin('/session/state'));
    if (r.statusCode != 200) return const {};
    return jsonDecode(r.body) as Map<String, dynamic>;
  }

  Future<void> _hydrate(String merchantId) async {
    if (merchantId.isNotEmpty) {
      _merchant = await _client.getMerchant(merchantId);
    }
    try {
      final wallet = await _client.getMerchantWallet();
      _walletId = wallet.id;
    } catch (_) {
      _walletId = null; // a Business with no AOA wallet yet still has a Home
    }
  }

  /// Sign in with the canonical @handle + PIN. The BFF captures the merchant JWT
  /// + refresh; this returns null on success or a user-facing error message.
  Future<String?> login(String handle, String pin) async {
    _state = BusinessWebState.loggingIn;
    _error = null;
    notifyListeners();
    final normalized = handle.trim().replaceFirst(RegExp(r'^@'), '').toLowerCase();
    try {
      await _client.loginMerchantHandlePin(handle: normalized, pin: pin);
      _handle = normalized;
      await bootstrap();
      if (_state != BusinessWebState.ready) {
        _state = BusinessWebState.loggedOut;
        _error = 'Não foi possível abrir a sua conta. Tente novamente.';
        notifyListeners();
        return _error;
      }
      return null;
    } on BanzamiApiException catch (e) {
      _state = BusinessWebState.loggedOut;
      _error = switch (e.statusCode) {
        401 => 'PIN incorrecto.',
        429 => 'Conta temporariamente bloqueada. Tente mais tarde.',
        404 => 'Não encontrámos uma conta com este @banza.',
        _ => 'Não foi possível iniciar sessão. Tente novamente.',
      };
      notifyListeners();
      return _error;
    } catch (_) {
      _state = BusinessWebState.loggedOut;
      _error = 'Serviço temporariamente indisponível.';
      notifyListeners();
      return _error;
    }
  }

  /// Business-only logout: revokes the Business authority in the BFF. Any
  /// Consumer authority in the same session is untouched.
  Future<void> logout() async {
    try {
      await _http.post(_origin('/business/api/v1/merchant/auth/logout'),
          headers: {'content-type': 'application/json'}, body: '{}');
    } catch (_) {/* fail-open on the client; the BFF is authoritative */}
    _merchant = null;
    _handle = '';
    _walletId = null;
    _state = BusinessWebState.loggedOut;
    notifyListeners();
  }

  /// The client saw a terminal 401 (the BFF's own refresh also failed): the
  /// Business authority is gone. Drop to the login screen; any Consumer authority
  /// in the same BFF session is unaffected.
  void markLoggedOut() {
    if (_state == BusinessWebState.loggedOut) return;
    _merchant = null;
    _walletId = null;
    _state = BusinessWebState.loggedOut;
    notifyListeners();
  }

  /// Re-read balance/identity from server truth (Home refresh, realtime tick).
  Future<void> refresh() async {
    if (_state != BusinessWebState.ready) return;
    try {
      final wallet = await _client.getMerchantWallet();
      _walletId = wallet.id;
      notifyListeners();
    } catch (_) {/* keep last-known; a bounded failure is surfaced by callers */}
  }
}
