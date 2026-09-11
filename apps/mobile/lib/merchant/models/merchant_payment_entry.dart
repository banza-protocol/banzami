import 'package:banzami_flutter/banzami_flutter.dart';

/// What a payment means for the Business, whatever table it came from.
enum MerchantPaymentState {
  /// Money the Business received (acquiring CAPTURED).
  received,

  /// Not settled yet (acquiring PENDING / AUTHORIZED).
  pending,

  /// Never happened — no money moved (acquiring FAILED).
  failed,

  /// Authorised then voided before capture, or a wallet payment reversed —
  /// the Business does not keep this money (REVERSED).
  reversed,

  /// Cancelled before it was paid — no money moved (wallet CANCELLED).
  cancelled,

  /// Received, then returned to the payer (REFUNDED).
  refunded,

  /// A status this app does not know. Shown neutrally, never counted.
  unknown,
}

/// Where a payment row came from.
enum MerchantPaymentSource {
  /// Core acquiring transactions (`GET /v1/transactions`).
  acquiring,

  /// Wallet-native payments — QR, payment link, payment session
  /// (`GET /v1/merchant/wallet-payments`).
  wallet,
}

/// One payment row on the Business dashboard, history and poller.
///
/// Two sources feed it, and a Business needs both: acquiring transactions
/// (statuses PENDING, AUTHORIZED, CAPTURED, FAILED, REVERSED, REFUNDED — only
/// CAPTURED is money received) and wallet-native payments (PENDING, COMPLETED,
/// FAILED, CANCELLED, REVERSED — only COMPLETED is money received). Every QR,
/// link and session payment lives in the second; the first alone shows none.
class MerchantPaymentEntry {
  final String id;
  final MerchantPaymentSource source;
  final MerchantPaymentState state;
  final int amountMinor;
  final String currency;

  /// Merchant-written description, when there is one.
  final String? description;

  /// Who paid, as the server names them (display name or @banza).
  final String? payer;
  final DateTime createdAt;

  /// The official receipt PDF can be fetched for this payment.
  final bool receiptAvailable;

  const MerchantPaymentEntry({
    required this.id,
    required this.state,
    required this.amountMinor,
    required this.currency,
    required this.createdAt,
    this.source = MerchantPaymentSource.acquiring,
    this.description,
    this.payer,
    this.receiptAvailable = false,
  });

  bool get isReceived => state == MerchantPaymentState.received;

  /// Terminal without money received — the failure side of the success rate.
  /// A refund is not a failed payment: it was received first.
  bool get isUnsuccessful =>
      state == MerchantPaymentState.failed ||
      state == MerchantPaymentState.reversed ||
      state == MerchantPaymentState.cancelled;

  static MerchantPaymentState stateOfTransaction(String status) {
    switch (status.toUpperCase()) {
      case 'CAPTURED':
        return MerchantPaymentState.received;
      case 'PENDING':
      case 'AUTHORIZED':
        return MerchantPaymentState.pending;
      case 'FAILED':
        return MerchantPaymentState.failed;
      case 'REVERSED':
        return MerchantPaymentState.reversed;
      case 'REFUNDED':
        return MerchantPaymentState.refunded;
      default:
        return MerchantPaymentState.unknown;
    }
  }

  static MerchantPaymentState stateOfWalletPayment(String status) {
    switch (status.toUpperCase()) {
      case 'COMPLETED':
        return MerchantPaymentState.received;
      case 'PENDING':
        return MerchantPaymentState.pending;
      case 'FAILED':
        return MerchantPaymentState.failed;
      case 'CANCELLED':
        return MerchantPaymentState.cancelled;
      case 'REVERSED':
        return MerchantPaymentState.reversed;
      default:
        return MerchantPaymentState.unknown;
    }
  }

  factory MerchantPaymentEntry.fromWalletPayment(MerchantWalletPayment p) =>
      MerchantPaymentEntry(
        id: p.id,
        source: MerchantPaymentSource.wallet,
        state: stateOfWalletPayment(p.status),
        amountMinor: p.amountMinor,
        currency: p.currency,
        payer: p.payerName.trim().isNotEmpty ? p.payerName.trim() : null,
        createdAt: p.createdAt,
        receiptAvailable: p.receiptAvailable,
      );

  factory MerchantPaymentEntry.fromTransaction(MerchantTransaction tx) =>
      MerchantPaymentEntry(
        id: tx.id,
        state: stateOfTransaction(tx.status),
        amountMinor: tx.amountMinor,
        currency: tx.currency,
        description:
            (tx.description?.trim().isNotEmpty ?? false) ? tx.description : null,
        createdAt: tx.createdAt,
      );

  /// The status as the Business reads it.
  String get stateLabel => switch (state) {
        MerchantPaymentState.received => 'Pagamento recebido',
        MerchantPaymentState.pending => 'Pendente',
        MerchantPaymentState.failed => 'Falhou',
        MerchantPaymentState.reversed => 'Anulado',
        MerchantPaymentState.refunded => 'Reembolsado',
        MerchantPaymentState.cancelled => 'Cancelado',
        MerchantPaymentState.unknown => 'Estado desconhecido',
      };

  /// The row title: the merchant's description, else who paid, else the
  /// status itself.
  String get title => description ?? payer ?? stateLabel;

  /// The sign in front of the amount. Only money received carries one: a
  /// failed or voided payment moved nothing, and a refund row shows the amount
  /// that was received and then returned — never as a "−" debit.
  String get amountSign => isReceived ? '+' : '';
}

/// Newest first; a tie is broken by id so the order never flickers.
int compareNewestFirst(MerchantPaymentEntry a, MerchantPaymentEntry b) {
  final byTime = b.createdAt.compareTo(a.createdAt);
  return byTime != 0 ? byTime : b.id.compareTo(a.id);
}

/// Merges several lists into one newest-first list, each payment once.
/// Rows are keyed by source + id: the same id never appears twice even when a
/// page is fetched again.
List<MerchantPaymentEntry> mergePaymentEntries(
    Iterable<Iterable<MerchantPaymentEntry>> lists) {
  final byKey = <String, MerchantPaymentEntry>{};
  for (final list in lists) {
    for (final e in list) {
      byKey['${e.source.name}:${e.id}'] = e;
    }
  }
  return byKey.values.toList()..sort(compareNewestFirst);
}

/// One page from one source: its rows (newest first) and the cursor for the
/// next page (null when the source is exhausted).
typedef MerchantPaymentPage = (List<MerchantPaymentEntry>, String?);
typedef MerchantPaymentPageFetcher = Future<MerchantPaymentPage> Function(
    String? cursor);

class _FeedSource {
  final MerchantPaymentPageFetcher fetch;
  final List<MerchantPaymentEntry> rows = [];
  String? cursor;
  bool hasMore = true;
  _FeedSource(this.fetch);

  DateTime? get oldest => rows.isEmpty ? null : rows.last.createdAt;
}

/// A single newest-first history over several cursor-paginated sources.
///
/// A row is shown only once every source that still has pages has been read
/// at least as far back as that row — otherwise an older page of one source
/// could later reveal a payment that belongs above rows already on screen.
class MerchantPaymentFeed {
  final List<_FeedSource> _sources;

  MerchantPaymentFeed(List<MerchantPaymentPageFetcher> fetchers)
      : _sources = fetchers.map(_FeedSource.new).toList();

  bool get hasMore => _sources.any((s) => s.hasMore);

  /// Rows that are safe to show, newest first.
  List<MerchantPaymentEntry> get visible {
    final all = mergePaymentEntries(_sources.map((s) => s.rows));
    final boundary = _boundary();
    if (boundary == null) return all;
    return all.where((e) => !e.createdAt.isBefore(boundary)).toList();
  }

  /// The oldest instant every unfinished source has reached; null when all are
  /// exhausted. A source not read yet blocks everything.
  DateTime? _boundary() {
    DateTime? boundary;
    for (final s in _sources.where((s) => s.hasMore)) {
      final oldest = s.oldest;
      if (oldest == null) return DateTime.utc(275760); // nothing read yet
      if (boundary == null || oldest.isAfter(boundary)) boundary = oldest;
    }
    return boundary;
  }

  void reset() {
    for (final s in _sources) {
      s.rows.clear();
      s.cursor = null;
      s.hasMore = true;
    }
  }

  /// Reads the next page of each source that limits what can be shown, until
  /// at least one more row becomes visible or every source is exhausted.
  Future<void> loadMore() async {
    final before = visible.length;
    for (var round = 0; round < 10 && hasMore; round++) {
      final boundary = _boundary();
      final limiting = _sources.where((s) =>
          s.hasMore &&
          (s.oldest == null || boundary == null || !s.oldest!.isBefore(boundary)));
      await Future.wait(limiting.map((s) async {
        final (rows, next) = await s.fetch(s.cursor);
        s.rows.addAll(rows);
        s.cursor = next;
        s.hasMore = next != null && rows.isNotEmpty;
      }));
      if (visible.length > before) return;
    }
  }
}

/// Decides which received payments are new since the last look — for the
/// foreground poller. The first look only records what is already there.
/// A payment still pending when first seen is announced once it is received.
class ReceivedPaymentTracker {
  static const int _maxRemembered = 500;
  final List<String> _announced = [];
  bool _primed = false;

  List<MerchantPaymentEntry> newlyReceived(
      Iterable<MerchantPaymentEntry> latest) {
    final received = latest.where((e) => e.isReceived).toList();
    final fresh = <MerchantPaymentEntry>[];
    for (final e in received) {
      final key = '${e.source.name}:${e.id}';
      if (_announced.contains(key)) continue;
      _announced.add(key);
      if (_primed) fresh.add(e);
    }
    _primed = true;
    if (_announced.length > _maxRemembered) {
      _announced.removeRange(0, _announced.length - _maxRemembered);
    }
    return fresh;
  }
}
