import 'package:flutter/material.dart';
import 'package:banzami_flutter/banzami_flutter.dart';

import '../config.dart';
import '../branding_assets.dart';
import '../screens/history_screen.dart';
import 'wallet_refresh_bus.dart';

/// Routes push notification taps to the correct screen.
///
/// All navigation decisions are centralised here — never scattered across
/// app.dart or individual screens.
///
/// Rules:
/// - payment_received → BanzamiReceiptScreen (built from FCM payload)
/// - payment_request  → BanzamiPaymentRequestScreen (fetched by link_code)
/// - generic/unknown  → HistoryScreen
///
/// Environment isolation: if the notification's environment field does not
/// match the running build (sandbox vs live), navigation is blocked and a
/// warning toast is shown.
///
/// Duplicate guard: the same transfer_id or link_code within 2 seconds is
/// silently discarded to prevent double-push from getInitialMessage() +
/// onMessageOpenedApp firing together on cold start.
/// Whether a push's `environment` belongs to this build. The canonical wire
/// value for Live is `LIVE` (services/common/env); `PRODUCTION` is still
/// accepted from older senders. Anything else — including an unknown value —
/// is treated as another environment and opens nothing.
bool notificationIsForThisEnvironment(String environment, {required bool appIsSandbox}) {
  final env = environment.trim().toUpperCase();
  if (appIsSandbox) return env == 'SANDBOX';
  return env == 'LIVE' || env == 'PRODUCTION';
}

class BanzamiNotificationRouter {
  BanzamiNotificationRouter._();

  // ── Duplicate guard ──────────────────────────────────────────────────────

  static String?   _lastDedupeId;
  static DateTime? _lastSeenAt;

  static bool _isDuplicate(String id) {
    if (id.isEmpty || _lastDedupeId == null || _lastSeenAt == null) return false;
    final age = DateTime.now().difference(_lastSeenAt!);
    return age < const Duration(seconds: 2) && id == _lastDedupeId;
  }

  static void _markSeen(String id) {
    if (id.isEmpty) return;
    _lastDedupeId = id;
    _lastSeenAt   = DateTime.now();
  }

  // ── Public entry point ───────────────────────────────────────────────────

  /// Route [data] (RemoteMessage.data) to the appropriate screen.
  ///
  /// [toastContext] must be mounted — used for environment-mismatch and error
  /// toasts only.  [navigator] is used for all push-navigation.
  static Future<void> route({
    required Map<String, String> data,
    required BuildContext        toastContext,
    required NavigatorState      navigator,
    required ConsumerPublicClient client,
    required String              ownHandle,
  }) async {
    final type        = data['type']        ?? '';
    final environment = data['environment'] ?? '';
    final transferId  = data['transfer_id'] ?? '';
    final linkCode    = data['link_code']   ?? data['request_code'] ?? '';

    debugPrint('[FCM-ROUTE] payload=$data');
    debugPrint('[FCM-ROUTE] type=$type environment=$environment');
    debugPrint('[FCM-ROUTE] appEnvironment=${AppConfig.isSandbox ? "SANDBOX" : "LIVE"}');

    // ── Environment isolation ──────────────────────────────────────────────
    if (environment.isNotEmpty) {
      if (!notificationIsForThisEnvironment(environment, appIsSandbox: AppConfig.isSandbox)) {
        debugPrint('[FCM-ROUTE] environment mismatch — blocking');
        if (toastContext.mounted) {
          BanzamiToast.showWarning(
              toastContext, 'Esta notificação pertence a outro ambiente.');
        }
        return;
      }
    }

    // ── Duplicate guard ────────────────────────────────────────────────────
    final dedupeId = transferId.isNotEmpty ? transferId : linkCode;
    if (_isDuplicate(dedupeId)) {
      debugPrint('[FCM-ROUTE] duplicate — ignoring id=$dedupeId');
      return;
    }
    _markSeen(dedupeId);

    // ── Route by type ──────────────────────────────────────────────────────
    switch (type) {
      case 'payment_received':
        _routePaymentReceived(
          data:         data,
          navigator:    navigator,
          ownHandle:    ownHandle,
          client:       client,
        );

      case 'payment_request':
        await _routePaymentRequest(
          data:         data,
          toastContext: toastContext,
          navigator:    navigator,
          client:       client,
          ownHandle:    ownHandle,
        );

      default:
        debugPrint('[FCM-ROUTE] fallback history reason=unknown_type type=$type');
        _pushHistory(navigator);
    }
  }

  // ── payment_received ─────────────────────────────────────────────────────

  static void _routePaymentReceived({
    required Map<String, String>  data,
    required NavigatorState       navigator,
    required String               ownHandle,
    required ConsumerPublicClient client,
  }) {
    final transferId   = data['transfer_id']  ?? '';
    final senderHandle = data['sender_handle'] ?? '';
    final amountMinor  = int.tryParse(data['amount_minor'] ?? '0') ?? 0;
    final currency     = data['currency'] ?? 'AOA';

    debugPrint('[FCM-ROUTE] opening receipt transfer_id=$transferId');

    if (transferId.isEmpty) {
      debugPrint('[FCM-ROUTE] fallback history reason=missing_transfer_id');
      _pushHistory(navigator);
      return;
    }

    // This device RECEIVED the money: the sender is the push's sender_handle,
    // this account is the recipient. The payload carries no time of its own —
    // the receipt screen waits for the canonical receipt's confirmed time
    // (incoming) instead of showing when the notification was tapped.
    final transfer = Transfer(
      transferId:  transferId,
      sender:      senderHandle,
      recipient:   ownHandle,
      amountMinor: amountMinor,
      currency:    currency,
      status:      'COMPLETED',
      createdAt:   DateTime.now().toUtc(),
    );

    navigator.push(MaterialPageRoute(
      builder: (_) => BanzamiReceiptScreen(
        transfer:      transfer,
        ownHandle:     ownHandle,
        incoming:      true,
        // Received money — refresh the home balance when the receipt is closed.
        onDone:          (_) => WalletRefreshBus.instance.signal(),
        isSandbox:       AppConfig.isSandbox,
        logoAssetPath:   BrandingAssets.icon,
        fetchReceiptPdf: () => client.fetchReceiptPdf(transferId),
        fetchReceipt:    () => client.fetchReceipt(transferId),
      ),
    ));
  }

  // ── payment_request ──────────────────────────────────────────────────────

  static Future<void> _routePaymentRequest({
    required Map<String, String>  data,
    required BuildContext          toastContext,
    required NavigatorState        navigator,
    required ConsumerPublicClient  client,
    required String                ownHandle,
  }) async {
    final code = data['link_code'] ?? data['request_code'] ?? '';
    debugPrint('[FCM-ROUTE] opening payment request code=$code');

    if (code.isEmpty) {
      debugPrint('[FCM-ROUTE] fallback history reason=missing_code');
      _pushHistory(navigator);
      return;
    }

    try {
      final link = await client.getConsumerPayLinkByCode(code);
      if (!link.isActive) {
        debugPrint('[FCM-ROUTE] fallback history reason=link_not_active');
        if (toastContext.mounted) {
          BanzamiToast.showWarning(toastContext, 'Este pedido já foi pago ou expirou.');
        }
        _pushHistory(navigator);
        return;
      }
      navigator.push(MaterialPageRoute(
        builder: (_) => BanzamiPaymentRequestScreen(
          client:               client,
          recipientHandle:      link.receiverHandle,
          recipientDisplayName: link.receiverDisplayName,
          amountMinor:          link.amountMinor,
          note:                 link.note,
          currency:             link.currency,
          locked:               link.locked,
          ownHandle:            ownHandle,
          linkCode:             link.linkCode,
          onSuccess:            (_) => WalletRefreshBus.instance.signal(),
          isSandbox:            AppConfig.isSandbox,
          logoAssetPath:        BrandingAssets.logo,
        ),
      ));
    } catch (e) {
      debugPrint('[FCM-ROUTE] fallback history reason=fetch_failed error=$e');
      if (toastContext.mounted) {
        BanzamiToast.showWarning(toastContext, 'Não foi possível abrir o pedido.');
      }
      _pushHistory(navigator);
    }
  }

  // ── Fallback ─────────────────────────────────────────────────────────────

  static void _pushHistory(NavigatorState navigator) {
    navigator.push(MaterialPageRoute(builder: (_) => const HistoryScreen()));
  }
}
