import 'package:flutter/material.dart';
import 'package:banza_flutter/banza_flutter.dart';

import '../config.dart';
import '../branding_assets.dart';
import '../screens/history_screen.dart';

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
class BanzaNotificationRouter {
  BanzaNotificationRouter._();

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
    debugPrint('[FCM-ROUTE] appEnvironment=${AppConfig.isSandbox ? "SANDBOX" : "PRODUCTION"}');

    // ── Environment isolation ──────────────────────────────────────────────
    if (environment.isNotEmpty) {
      final expected = AppConfig.isSandbox ? 'SANDBOX' : 'PRODUCTION';
      if (environment.toUpperCase() != expected) {
        debugPrint('[FCM-ROUTE] environment mismatch — blocking');
        if (toastContext.mounted) {
          BanzaToast.showWarning(
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
    required Map<String, String> data,
    required NavigatorState      navigator,
    required String              ownHandle,
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
        onDone:        (_) {},
        isSandbox:     AppConfig.isSandbox,
        logoAssetPath: BrandingAssets.logo,
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
          BanzaToast.showWarning(toastContext, 'Este pedido já foi pago ou expirou.');
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
          onSuccess:            (_) {},
          isSandbox:            AppConfig.isSandbox,
          logoAssetPath:        BrandingAssets.logo,
        ),
      ));
    } catch (e) {
      debugPrint('[FCM-ROUTE] fallback history reason=fetch_failed error=$e');
      if (toastContext.mounted) {
        BanzaToast.showWarning(toastContext, 'Não foi possível abrir o pedido.');
      }
      _pushHistory(navigator);
    }
  }

  // ── Fallback ─────────────────────────────────────────────────────────────

  static void _pushHistory(NavigatorState navigator) {
    navigator.push(MaterialPageRoute(builder: (_) => const HistoryScreen()));
  }
}
