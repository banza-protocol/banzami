import 'package:flutter/foundation.dart';

/// App-side signal bus pinged the moment a payment commits on the backend, so
/// the consumer home shell reloads its wallet balance and activity from the API.
///
/// The ledger is the single source of truth (CLAUDE.md §2.1). We NEVER mutate
/// the displayed balance locally — a [signal] forces a fresh `getBalance()` /
/// activity reload, instead of subtracting the paid amount in the UI. This is
/// what fixes the "stale balance after a successful payment" bug: the app
/// signals on success (e.g. the `BanzamiPaymentLinkScreen.onSuccess` callback),
/// and the home shell (MainScreen) listens and recreates the home screen so it
/// re-fetches from the backend.
class WalletRefreshBus extends ChangeNotifier {
  WalletRefreshBus._();

  /// Process-wide singleton. The payment flow pings it; the home shell listens.
  static final WalletRefreshBus instance = WalletRefreshBus._();

  /// Notify listeners that wallet data must be reloaded from the backend.
  void signal() => notifyListeners();
}
