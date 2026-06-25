/// Parses a raw QR code string into a typed Banzami payment result.
///
/// Supported formats:
///  • https://pay.banzami.com/{slug}            (merchant payment link)
///  • https://pay.banzami.com/pay/{slug}        (merchant payment link)
///  • https://pay.banzami.com/r/{code}[?sandbox=1]
///  • https://pay.banzami.com/u/{handle}[?amount=N&note=...&sandbox=1]
///  • banzami://pay?request={code}
///  • banzami-sandbox://pay?request={code}
///  • banzami://pay/u/{handle}[?amount=N&note=...]
///  • banzami-sandbox://pay/u/{handle}[?amount=N&note=...]
///  • banza:@{handle}[?amount=N&currency=AOA]
///  • banzami-sandbox:@{handle}[?amount=N&currency=AOA]
library;

import 'dart:convert';

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

/// A structured Banzami QR — the base64url payload a merchant (or consumer)
/// generates via `/v1/qr/static` or `/v1/qr/dynamic`. Settled by passing the
/// raw payload to `/v1/qr/pay`.
class BanzamiQrStructuredPayment extends BanzamiQrResult {
  /// The raw scannable payload, forwarded verbatim to the pay endpoint.
  final String payload;

  /// Static QR needs a payer-entered amount; dynamic carries a fixed amount.
  final bool isStatic;

  const BanzamiQrStructuredPayment({required this.payload, required this.isStatic});
}

/// A split-payment session (P2P-002) — `banzami://split/{id}`. The payer
/// contributes a portion via `ConsumerPublicClient.paySplit`.
class BanzamiQrSplitPayment extends BanzamiQrResult {
  final String splitId;
  final bool   isSandbox;
  const BanzamiQrSplitPayment({required this.splitId, required this.isSandbox});
}

/// A merchant payment link — `pay.banzami.com/{slug}` (or `/pay/{slug}`). The
/// payer resolves it via `ConsumerPublicClient.getPaymentLinkBySlug` and pays
/// in-app (BanzamiPaymentLinkScreen). The environment is implicit in the
/// resolving gateway, so the URL carries no sandbox marker.
class BanzamiQrPaymentLink extends BanzamiQrResult {
  final String slug;
  const BanzamiQrPaymentLink({required this.slug});
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

    // ── Web URLs: https://pay.banzami.com/... ─────────────────────────────────
    if (raw.startsWith('https://pay.banzami.com/')) {
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

        case 'pay':
          // /pay/{slug} — merchant payment link
          if (segs.length < 2 || segs[1].isEmpty) {
            return const BanzamiQrInvalid('Link de pagamento ausente');
          }
          return BanzamiQrPaymentLink(slug: segs[1]);

        default:
          // /{slug} — a bare single-segment path is a merchant payment link.
          if (segs.length == 1) {
            return BanzamiQrPaymentLink(slug: segs[0]);
          }
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

      // banzami://split/{id} — split-payment session
      final segs = uri.pathSegments.where((s) => s.isNotEmpty).toList();
      if (segs.length >= 2 && segs[0] == 'split') {
        return BanzamiQrSplitPayment(splitId: segs[1], isSandbox: isSandbox);
      }

      // banzami://pay/u/{handle}[?amount=N&note=...]
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

    // ── Structured QR: base64url(JSON {"t":"S"|"D", ...}) ─────────────────────
    // The payload a merchant/consumer generates via /v1/qr/static|dynamic.
    final structured = _tryParseStructured(raw);
    if (structured != null) return structured;

    return const BanzamiQrInvalid('Código QR não reconhecido');
  }

  /// Detects a structured Banzami QR payload: base64url(no-pad) of a small JSON
  /// object tagged `"t":"S"` (static) or `"t":"D"` (dynamic). Returns null when
  /// [raw] is not such a payload, so [parse] can fall through to other formats.
  static BanzamiQrResult? _tryParseStructured(String raw) {
    // base64url alphabet only — cheap reject for anything with URL/scheme chars.
    if (!RegExp(r'^[A-Za-z0-9_-]+$').hasMatch(raw)) return null;
    try {
      var b64 = raw;
      final rem = b64.length % 4;
      if (rem != 0) b64 += '=' * (4 - rem); // restore stripped padding
      final obj = jsonDecode(utf8.decode(base64Url.decode(b64)));
      if (obj is! Map) return null;
      switch (obj['t']) {
        case 'S':
          return BanzamiQrStructuredPayment(payload: raw, isStatic: true);
        case 'D':
          return BanzamiQrStructuredPayment(payload: raw, isStatic: false);
        default:
          return null;
      }
    } catch (_) {
      return null;
    }
  }
}
