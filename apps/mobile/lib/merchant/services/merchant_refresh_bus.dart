import 'package:flutter/foundation.dart';

/// Pinged when a Business's money may have moved, so the Business Home reloads
/// balance and activity from the backend.
///
/// The merchant counterpart of [WalletRefreshBus]. It carries NO financial
/// state and never adjusts a displayed balance: a [signal] forces a fresh
/// canonical read, because the ledger is the single source of truth
/// (CLAUDE.md §2.1). The signal says WHEN to refetch; the API says WHAT is true.
///
/// Why this exists: on Web the Business Home had no refresh path at all. The
/// payment poller was started only on native — the Web branch returned before
/// it, under a comment claiming "Home loads and refreshes over the BFF like
/// every other screen", which the dashboard did not do. It loaded once in
/// initState and then only on pull-to-refresh, so a merchant who was paid while
/// looking at their Home kept seeing the old balance until they pulled down.
/// The Consumer Home converges in milliseconds; this closes the same loop for
/// the Business surface (CLAUDE.md §2.6 — the merchant sees the payment).
class MerchantRefreshBus extends ChangeNotifier {
  MerchantRefreshBus._();

  /// Process-wide singleton. The payment poller pings it; the Home listens.
  static final MerchantRefreshBus instance = MerchantRefreshBus._();

  /// Notify listeners that Business money data must be reloaded from the backend.
  void signal() => notifyListeners();
}
