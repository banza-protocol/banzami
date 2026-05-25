/// Parses a raw QR code string into a typed Banza payment result.
///
/// Supported formats:
///  • https://pay.banzami.org/r/{code}[?sandbox=1]
///  • https://pay.banzami.org/u/{handle}[?amount=N&note=...&sandbox=1]
///  • banza://pay?request={code}
///  • banza-sandbox://pay?request={code}
///  • banza://pay/u/{handle}[?amount=N&note=...]
///  • banza-sandbox://pay/u/{handle}[?amount=N&note=...]
///  • banza:@{handle}[?amount=N&currency=AOA]
///  • banza-sandbox:@{handle}[?amount=N&currency=AOA]
library;

// ─────────────────────────────────────────────────────────────────────────────
// Result types
// ─────────────────────────────────────────────────────────────────────────────

sealed class BanzaQrResult {
  const BanzaQrResult();
}

/// A consumer pay-link request code: resolves via GET /v1/consumer-pay-links/{code}.
class BanzaQrPaymentRequest extends BanzaQrResult {
  final String code;
  final bool   isSandbox;
  const BanzaQrPaymentRequest({required this.code, required this.isSandbox});
}

/// A handle-based payment: optionally pre-filled amount + note.
class BanzaQrHandlePayment extends BanzaQrResult {
  final String  handle;
  final int?    amountMinor;
  final String? note;
  final String  currency;
  final bool    isSandbox;
  const BanzaQrHandlePayment({
    required this.handle,
    this.amountMinor,
    this.note,
    this.currency = 'AOA',
    required this.isSandbox,
  });
}

/// Not a recognised Banza QR payload.
class BanzaQrInvalid extends BanzaQrResult {
  final String reason;
  const BanzaQrInvalid(this.reason);
}

// ─────────────────────────────────────────────────────────────────────────────
// Parser
// ─────────────────────────────────────────────────────────────────────────────

class BanzaQrParser {
  BanzaQrParser._();

  static const _maxLength = 512;

  /// Parses [raw] and returns a typed [BanzaQrResult].
  static BanzaQrResult parse(String raw) {
    if (raw.isEmpty || raw.length > _maxLength) {
      return const BanzaQrInvalid('QR inválido');
    }

    // ── Web URLs: https://pay.banzami.org/... ─────────────────────────────────
    if (raw.startsWith('https://pay.banzami.org/')) {
      final uri = Uri.tryParse(raw);
      if (uri == null) return const BanzaQrInvalid('URL inválido');
      final segs      = uri.pathSegments.where((s) => s.isNotEmpty).toList();
      final sandbox   = uri.queryParameters['sandbox'] == '1';
      if (segs.isEmpty) return const BanzaQrInvalid('URL incompleto');

      switch (segs[0]) {
        case 'r':
          // /r/{code}[?sandbox=1]
          if (segs.length < 2 || segs[1].isEmpty) {
            return const BanzaQrInvalid('Código de pagamento ausente');
          }
          return BanzaQrPaymentRequest(code: segs[1], isSandbox: sandbox);

        case 'u':
          // /u/{handle}[?amount=N&note=...&sandbox=1]
          if (segs.length < 2 || segs[1].isEmpty) {
            return const BanzaQrInvalid('Endereço de pagamento ausente');
          }
          final amountStr = uri.queryParameters['amount'];
          return BanzaQrHandlePayment(
            handle:      segs[1],
            amountMinor: amountStr != null ? int.tryParse(amountStr) : null,
            note:        uri.queryParameters['note'],
            isSandbox:   sandbox,
          );

        default:
          return const BanzaQrInvalid('Formato de QR não reconhecido');
      }
    }

    // ── Deep link: banza:// or banza-sandbox:// ───────────────────────────────
    if (raw.startsWith('banza://') || raw.startsWith('banza-sandbox://')) {
      final isSandbox = raw.startsWith('banza-sandbox://');
      final uri       = Uri.tryParse(raw);
      if (uri == null) return const BanzaQrInvalid('Link inválido');

      // banza://pay?request={code}
      final code = uri.queryParameters['request'];
      if (code != null && code.isNotEmpty) {
        return BanzaQrPaymentRequest(code: code, isSandbox: isSandbox);
      }

      // banza://pay/u/{handle}[?amount=N&note=...]
      final segs = uri.pathSegments.where((s) => s.isNotEmpty).toList();
      if (segs.length >= 2 && segs[0] == 'u') {
        final amountStr = uri.queryParameters['amount'];
        return BanzaQrHandlePayment(
          handle:      segs[1],
          amountMinor: amountStr != null ? int.tryParse(amountStr) : null,
          note:        uri.queryParameters['note'],
          isSandbox:   isSandbox,
        );
      }

      return const BanzaQrInvalid('Formato de link inválido');
    }

    // ── Handle QR: banza:@{handle} or banza-sandbox:@{handle} ────────────────
    if (raw.startsWith('banza:@') || raw.startsWith('banza-sandbox:@')) {
      final isSandbox = raw.startsWith('banza-sandbox:');
      final rest      = isSandbox
          ? raw.substring('banza-sandbox:@'.length)
          : raw.substring('banza:@'.length);
      // rest = 'fm65' or 'fm65?amount=5000&currency=AOA'
      final qIdx      = rest.indexOf('?');
      final handle    = qIdx >= 0 ? rest.substring(0, qIdx) : rest;
      if (handle.isEmpty) return const BanzaQrInvalid('Endereço inválido');
      final params    = qIdx >= 0 ? Uri.splitQueryString(rest.substring(qIdx + 1)) : <String, String>{};
      final amountStr = params['amount'];

      return BanzaQrHandlePayment(
        handle:      handle,
        amountMinor: amountStr != null ? int.tryParse(amountStr) : null,
        currency:    params['currency'] ?? 'AOA',
        isSandbox:   isSandbox,
      );
    }

    return const BanzaQrInvalid('Código QR não reconhecido');
  }
}
