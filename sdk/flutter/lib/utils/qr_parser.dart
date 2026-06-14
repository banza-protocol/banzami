/// Parses a raw QR code string into a typed Banzami payment result.
///
/// Supported formats:
///  • https://pay.banzami.org/r/{code}[?sandbox=1]
///  • https://pay.banzami.org/u/{handle}[?amount=N&note=...&sandbox=1]
///  • banzami://pay?request={code}
///  • banzami-sandbox://pay?request={code}
///  • banzami://pay/u/{handle}[?amount=N&note=...]
///  • banzami-sandbox://pay/u/{handle}[?amount=N&note=...]
///  • banza:@{handle}[?amount=N&currency=AOA]
///  • banzami-sandbox:@{handle}[?amount=N&currency=AOA]
library;

// ─────────────────────────────────────────────────────────────────────────────
// Result types
// ─────────────────────────────────────────────────────────────────────────────

sealed class BanzamiQrResult {
  const BanzamiQrResult();
}

/// A consumer pay-link request code: resolves via GET /v1/consumer-pay-links/{code}.
class BanzamiQrPaymentRequest extends BanzamiQrResult {
  final String code;
  final bool   isSandbox;
  const BanzamiQrPaymentRequest({required this.code, required this.isSandbox});
}

/// A handle-based payment: optionally pre-filled amount + note.
class BanzamiQrHandlePayment extends BanzamiQrResult {
  final String  handle;
  final int?    amountMinor;
  final String? note;
  final String  currency;
  final bool    isSandbox;
  const BanzamiQrHandlePayment({
    required this.handle,
    this.amountMinor,
    this.note,
    this.currency = 'AOA',
    required this.isSandbox,
  });
}

/// Not a recognised Banzami QR payload.
class BanzamiQrInvalid extends BanzamiQrResult {
  final String reason;
  const BanzamiQrInvalid(this.reason);
}

// ─────────────────────────────────────────────────────────────────────────────
// Parser
// ─────────────────────────────────────────────────────────────────────────────

class BanzamiQrParser {
  BanzamiQrParser._();

  static const _maxLength = 512;

  /// Parses [raw] and returns a typed [BanzamiQrResult].
  static BanzamiQrResult parse(String raw) {
    if (raw.isEmpty || raw.length > _maxLength) {
      return const BanzamiQrInvalid('QR inválido');
    }

    // ── Web URLs: https://pay.banzami.org/... ─────────────────────────────────
    if (raw.startsWith('https://pay.banzami.org/')) {
      final uri = Uri.tryParse(raw);
      if (uri == null) return const BanzamiQrInvalid('URL inválido');
      final segs      = uri.pathSegments.where((s) => s.isNotEmpty).toList();
      final sandbox   = uri.queryParameters['sandbox'] == '1';
      if (segs.isEmpty) return const BanzamiQrInvalid('URL incompleto');

      switch (segs[0]) {
        case 'r':
          // /r/{code}[?sandbox=1]
          if (segs.length < 2 || segs[1].isEmpty) {
            return const BanzamiQrInvalid('Código de pagamento ausente');
          }
          return BanzamiQrPaymentRequest(code: segs[1], isSandbox: sandbox);

        case 'u':
          // /u/{handle}[?amount=N&note=...&sandbox=1]
          if (segs.length < 2 || segs[1].isEmpty) {
            return const BanzamiQrInvalid('Endereço de pagamento ausente');
          }
          final amountStr = uri.queryParameters['amount'];
          return BanzamiQrHandlePayment(
            handle:      segs[1],
            amountMinor: amountStr != null ? int.tryParse(amountStr) : null,
            note:        uri.queryParameters['note'],
            isSandbox:   sandbox,
          );

        default:
          return const BanzamiQrInvalid('Formato de QR não reconhecido');
      }
    }

    // ── Deep link: banzami:// or banzami-sandbox:// ───────────────────────────────
    if (raw.startsWith('banzami://') || raw.startsWith('banzami-sandbox://')) {
      final isSandbox = raw.startsWith('banzami-sandbox://');
      final uri       = Uri.tryParse(raw);
      if (uri == null) return const BanzamiQrInvalid('Link inválido');

      // banzami://pay?request={code}
      final code = uri.queryParameters['request'];
      if (code != null && code.isNotEmpty) {
        return BanzamiQrPaymentRequest(code: code, isSandbox: isSandbox);
      }

      // banzami://pay/u/{handle}[?amount=N&note=...]
      final segs = uri.pathSegments.where((s) => s.isNotEmpty).toList();
      if (segs.length >= 2 && segs[0] == 'u') {
        final amountStr = uri.queryParameters['amount'];
        return BanzamiQrHandlePayment(
          handle:      segs[1],
          amountMinor: amountStr != null ? int.tryParse(amountStr) : null,
          note:        uri.queryParameters['note'],
          isSandbox:   isSandbox,
        );
      }

      return const BanzamiQrInvalid('Formato de link inválido');
    }

    // ── Handle QR: banza:@{handle} or banzami-sandbox:@{handle} ────────────────
    if (raw.startsWith('banza:@') || raw.startsWith('banzami-sandbox:@')) {
      final isSandbox = raw.startsWith('banzami-sandbox:');
      final rest      = isSandbox
          ? raw.substring('banzami-sandbox:@'.length)
          : raw.substring('banza:@'.length);
      // rest = 'fm65' or 'fm65?amount=5000&currency=AOA'
      final qIdx      = rest.indexOf('?');
      final handle    = qIdx >= 0 ? rest.substring(0, qIdx) : rest;
      if (handle.isEmpty) return const BanzamiQrInvalid('Endereço inválido');
      final params    = qIdx >= 0 ? Uri.splitQueryString(rest.substring(qIdx + 1)) : <String, String>{};
      final amountStr = params['amount'];

      return BanzamiQrHandlePayment(
        handle:      handle,
        amountMinor: amountStr != null ? int.tryParse(amountStr) : null,
        currency:    params['currency'] ?? 'AOA',
        isSandbox:   isSandbox,
      );
    }

    return const BanzamiQrInvalid('Código QR não reconhecido');
  }
}
