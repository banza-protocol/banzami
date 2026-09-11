import 'dart:io';

import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';
import 'package:banzami_flutter/banzami_flutter.dart';

import '../../widgets/app_screen_header.dart';
import '../models/merchant_payment_entry.dart';
import '../services/merchant_session_service.dart';

class MerchantHistoryScreen extends StatefulWidget {
  const MerchantHistoryScreen({super.key});

  @override
  State<MerchantHistoryScreen> createState() => _MerchantHistoryScreenState();
}

class _MerchantHistoryScreenState extends State<MerchantHistoryScreen>
    with SingleTickerProviderStateMixin {

  late final TabController _tabs;

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 3, vsync: this);
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: BanzamiColors.offWhite,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const AppScreenHeader(
              title:    'Histórico',
              subtitle: 'As suas transações e cobranças',
            ),
            TabBar(
              controller:          _tabs,
              labelColor:          BanzamiColors.primary,
              unselectedLabelColor: BanzamiColors.gray400,
              indicatorColor:      BanzamiColors.primary,
              indicatorWeight:     2,
              labelStyle:          BanzamiTextStyles.label.copyWith(
                fontSize:   14,
                fontWeight: FontWeight.w600,
              ),
              unselectedLabelStyle: BanzamiTextStyles.label.copyWith(
                fontSize:   14,
                fontWeight: FontWeight.w500,
              ),
              tabs: const [
                Tab(text: 'Transacções'),
                Tab(text: 'Cobranças'),
                Tab(text: 'Recebidos'),
              ],
            ),
            Expanded(
              child: TabBarView(
                controller: _tabs,
                children: const [
                  _TransactionsTab(),
                  _PaymentLinksTab(),
                  _ReceivedPaymentsTab(),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// =============================================================================
// Shared date-grouping helpers
// =============================================================================

// Server timestamps are UTC: every date shown here goes through the shared
// formatter, which converts to local time before comparing calendar days.
String _dateHeader(DateTime dt) => BanzamiDateFormatter.formatDayHeader(dt);

Widget _emptyState({required IconData icon, required String label}) {
  return Center(
    child: Column(mainAxisSize: MainAxisSize.min, children: [
      Container(
        width: 64, height: 64,
        decoration: const BoxDecoration(
          color: BanzamiColors.gray200,
          shape: BoxShape.circle,
        ),
        child: Icon(icon, size: 28, color: BanzamiColors.gray400),
      ),
      const SizedBox(height: BanzamiSpacing.md),
      Text(label, style: BanzamiTextStyles.headingSm),
      const SizedBox(height: BanzamiSpacing.xs),
      Text(
        'As suas actividades aparecerão aqui',
        style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.gray400),
      ),
    ]),
  );
}

// =============================================================================
// Transactions tab
// =============================================================================

class _TransactionsTab extends StatefulWidget {
  const _TransactionsTab();

  @override
  State<_TransactionsTab> createState() => _TransactionsTabState();
}

class _TransactionsTabState extends State<_TransactionsTab>
    with AutomaticKeepAliveClientMixin {

  // Acquiring transactions + wallet-native payments (QR, link, session), as
  // one newest-first history. The Transacções tab read only the first, so no
  // QR or link payment ever appeared here.
  late final MerchantPaymentFeed _feed = MerchantPaymentFeed([
    (cursor) async {
      final page = await context
          .read<BanzamiClient>()
          .listMerchantTransactions(limit: 30, cursor: cursor);
      return (
        page.data.map(MerchantPaymentEntry.fromTransaction).toList(),
        page.hasMore ? page.nextCursor : null,
      );
    },
    (cursor) async {
      final page = await context
          .read<BanzamiClient>()
          .listMerchantWalletPayments(limit: 30, cursor: cursor);
      return (
        page.items.map(MerchantPaymentEntry.fromWalletPayment).toList(),
        page.nextCursor,
      );
    },
  ]);
  List<MerchantPaymentEntry> _txs = const [];
  bool    _loading = false;
  bool    _hasMore = true;
  String? _error;

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load({bool refresh = false}) async {
    if (_loading) return;
    if (!_hasMore && !refresh) return;

    setState(() { _loading = true; _error = null; });
    if (refresh) { _feed.reset(); _txs = const []; _hasMore = true; }

    try {
      await _feed.loadMore();
      if (!mounted) return;
      setState(() {
        _txs     = _feed.visible;
        _hasMore = _feed.hasMore;
      });
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'Não foi possível carregar as transacções.');
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  List<dynamic> _grouped() {
    final items = <dynamic>[];
    String? lastKey;
    for (final tx in _txs) {
      final key = _dateHeader(tx.createdAt);
      if (key != lastKey) { items.add(key); lastKey = key; }
      items.add(tx);
    }
    return items;
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    return RefreshIndicator(
      color:     BanzamiColors.primary,
      onRefresh: () => _load(refresh: true),
      child:     _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_loading && _txs.isEmpty) {
      return const Center(child: CircularProgressIndicator(color: BanzamiColors.primary));
    }
    if (_error != null && _txs.isEmpty) {
      return Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
        const Icon(Icons.error_outline_rounded, color: BanzamiColors.error, size: 40),
        const SizedBox(height: BanzamiSpacing.md),
        Text(_error!, style: BanzamiTextStyles.bodyMd.copyWith(color: BanzamiColors.gray400)),
        const SizedBox(height: BanzamiSpacing.lg),
        BanzamiGhostButton(label: 'Tentar novamente', onPressed: _load),
      ]));
    }
    if (_txs.isEmpty) {
      return _emptyState(
        icon:  Icons.receipt_long_outlined,
        label: 'Nenhuma transacção ainda',
      );
    }

    final grouped = _grouped();

    return ListView.builder(
      padding:   const EdgeInsets.fromLTRB(
        BanzamiSpacing.lg, BanzamiSpacing.md, BanzamiSpacing.lg, BanzamiSpacing.page,
      ),
      itemCount: grouped.length + (_hasMore ? 1 : 0),
      itemBuilder: (context, i) {
        if (i == grouped.length) {
          // A page that failed waits for a tap — it is never re-requested on
          // every frame.
          if (_error != null) {
            return Padding(
              padding: const EdgeInsets.all(BanzamiSpacing.lg),
              child:   Center(child: BanzamiGhostButton(
                label:     'Tentar novamente',
                onPressed: _load,
              )),
            );
          }
          if (!_loading) {
            WidgetsBinding.instance.addPostFrameCallback((_) {
              if (mounted) _load();
            });
          }
          return const Padding(
            padding: EdgeInsets.all(BanzamiSpacing.xl),
            child:   Center(child: CircularProgressIndicator(color: BanzamiColors.primary)),
          );
        }

        final item = grouped[i];

        if (item is String) {
          return Padding(
            padding: const EdgeInsets.fromLTRB(
              BanzamiSpacing.xs, BanzamiSpacing.lg, BanzamiSpacing.xs, BanzamiSpacing.sm,
            ),
            child: Text(
              item,
              style: BanzamiTextStyles.label.copyWith(
                color:         BanzamiColors.gray400,
                letterSpacing: 0.4,
              ),
            ),
          );
        }

        final tx      = item as MerchantPaymentEntry;
        final prev    = i > 0 ? grouped[i - 1] : null;
        final next    = i < grouped.length - 1 ? grouped[i + 1] : null;
        final isFirst = prev == null || prev is String;
        final isLast  = next == null || next is String;

        return Container(
          decoration: BoxDecoration(
            color: BanzamiColors.white,
            borderRadius: BorderRadius.vertical(
              top:    Radius.circular(isFirst ? BanzamiRadius.xl : 0),
              bottom: Radius.circular(isLast  ? BanzamiRadius.xl : 0),
            ),
            boxShadow: isFirst ? BanzamiShadows.card : BanzamiShadows.none,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              _TransactionTile(tx: tx),
              if (!isLast)
                const Divider(height: 1, indent: 68, color: BanzamiColors.gray200),
            ],
          ),
        );
      },
    );
  }
}

class _TransactionTile extends StatelessWidget {
  final MerchantPaymentEntry tx;
  const _TransactionTile({required this.tx});

  @override
  Widget build(BuildContext context) {
    final (icon, iconColor, amountColor) = switch (tx.state) {
      MerchantPaymentState.received => (
        Icons.arrow_downward_rounded,
        BanzamiColors.success,
        BanzamiColors.success,
      ),
      MerchantPaymentState.refunded => (
        Icons.undo_rounded,
        BanzamiColors.gray400,
        BanzamiColors.gray400,
      ),
      MerchantPaymentState.failed || MerchantPaymentState.reversed => (
        Icons.close_rounded,
        BanzamiColors.error,
        BanzamiColors.gray400,
      ),
      _ => (
        Icons.access_time_rounded,
        BanzamiColors.primary,
        BanzamiColors.gray900,
      ),
    };
    // The description (when the merchant wrote one) is the title; the status is
    // always said on the second line so a refund never reads as a receipt.
    final label = tx.title;
    final sign  = tx.amountSign;

    // Rows sit under a day header: the time of day is enough.
    final timeStr = BanzamiDateFormatter.formatTime(tx.createdAt);

    return Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: BanzamiSpacing.lg,
        vertical:   BanzamiSpacing.md,
      ),
      child: Row(children: [
        Container(
          width:  40,
          height: 40,
          decoration: BoxDecoration(
            color:        iconColor.withValues(alpha: 0.10),
            borderRadius: BanzamiRadius.mdAll,
          ),
          child: Icon(icon, color: iconColor, size: 20),
        ),
        const SizedBox(width: BanzamiSpacing.md),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(
              label,
              style:    BanzamiTextStyles.bodyMd.copyWith(fontWeight: FontWeight.w500),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            Text(
              label != tx.stateLabel ? '$timeStr · ${tx.stateLabel}' : timeStr,
              style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.gray400),
            ),
          ]),
        ),
        Text(
          '$sign${formatMinor(tx.amountMinor, tx.currency)}',
          style: BanzamiTextStyles.mono.copyWith(
            color:      amountColor,
            fontWeight: FontWeight.w600,
            fontSize:   15,
          ),
        ),
      ]),
    );
  }
}

// =============================================================================
// Payment links tab
// =============================================================================

class _PaymentLinksTab extends StatefulWidget {
  const _PaymentLinksTab();

  @override
  State<_PaymentLinksTab> createState() => _PaymentLinksTabState();
}

class _PaymentLinksTabState extends State<_PaymentLinksTab>
    with AutomaticKeepAliveClientMixin {

  final List<PaymentLink> _links = [];
  String? _cursor;
  bool    _loading = false;
  bool    _hasMore = true;
  String? _error;

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load({bool refresh = false}) async {
    if (_loading) return;
    if (!_hasMore && !refresh) return;

    setState(() { _loading = true; _error = null; });
    if (refresh) { _links.clear(); _cursor = null; _hasMore = true; }

    final session = context.read<MerchantSessionService>().session!;
    final client  = context.read<BanzamiClient>();
    try {
      final page = await client.listPaymentLinks(
        merchantId: session.merchantId,
        limit:      30,
        cursor:     _cursor,
      );
      setState(() {
        _links.addAll(page.data);
        _cursor  = page.nextCursor;
        _hasMore = page.nextCursor != null;
      });
    } catch (_) {
      setState(() => _error = 'Não foi possível carregar o histórico.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    return RefreshIndicator(
      color:     BanzamiColors.primary,
      onRefresh: () => _load(refresh: true),
      child:     _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_loading && _links.isEmpty) {
      return const Center(child: CircularProgressIndicator(color: BanzamiColors.primary));
    }
    if (_error != null && _links.isEmpty) {
      return Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
        const Icon(Icons.error_outline_rounded, color: BanzamiColors.error, size: 40),
        const SizedBox(height: BanzamiSpacing.md),
        Text(_error!, style: BanzamiTextStyles.bodyMd.copyWith(color: BanzamiColors.gray400)),
        const SizedBox(height: BanzamiSpacing.lg),
        BanzamiGhostButton(label: 'Tentar novamente', onPressed: _load),
      ]));
    }
    if (_links.isEmpty) {
      return _emptyState(
        icon:  Icons.receipt_outlined,
        label: 'Nenhuma cobrança ainda',
      );
    }

    return ListView.builder(
      padding:   const EdgeInsets.fromLTRB(
        BanzamiSpacing.lg, BanzamiSpacing.md, BanzamiSpacing.lg, BanzamiSpacing.page,
      ),
      itemCount: _links.length + (_hasMore ? 1 : 0),
      itemBuilder: (context, i) {
        if (i == _links.length) {
          if (!_loading) _load();
          return const Padding(
            padding: EdgeInsets.all(BanzamiSpacing.xl),
            child:   Center(child: CircularProgressIndicator(color: BanzamiColors.primary)),
          );
        }

        final isFirst = i == 0;
        final isLast  = i == _links.length - 1;

        return Container(
          decoration: BoxDecoration(
            color: BanzamiColors.white,
            borderRadius: BorderRadius.vertical(
              top:    Radius.circular(isFirst ? BanzamiRadius.xl : 0),
              bottom: Radius.circular(isLast  ? BanzamiRadius.xl : 0),
            ),
            boxShadow: isFirst ? BanzamiShadows.card : BanzamiShadows.none,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              _PaymentLinkTile(link: _links[i]),
              if (!isLast)
                const Divider(height: 1, indent: 68, color: BanzamiColors.gray200),
            ],
          ),
        );
      },
    );
  }
}

class _PaymentLinkTile extends StatelessWidget {
  final PaymentLink link;
  const _PaymentLinkTile({required this.link});

  @override
  Widget build(BuildContext context) {
    final (color, label, icon) = switch (link.status) {
      PaymentLinkStatus.active    => (BanzamiColors.success, 'Activo',    Icons.hourglass_top_rounded),
      PaymentLinkStatus.used      => (BanzamiColors.primary,    'Pago',      Icons.check_circle_rounded),
      PaymentLinkStatus.expired   => (BanzamiColors.gray400, 'Expirado',  Icons.timer_off_rounded),
      PaymentLinkStatus.cancelled => (BanzamiColors.error,   'Cancelado', Icons.cancel_rounded),
    };

    return Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: BanzamiSpacing.lg,
        vertical:   BanzamiSpacing.md,
      ),
      child: Row(children: [
        Container(
          width:  40,
          height: 40,
          decoration: BoxDecoration(
            color:        color.withValues(alpha: 0.10),
            borderRadius: BanzamiRadius.mdAll,
          ),
          child: Icon(icon, color: color, size: 20),
        ),
        const SizedBox(width: BanzamiSpacing.md),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(
              link.description ?? 'Cobrança',
              style:    BanzamiTextStyles.bodyMd.copyWith(fontWeight: FontWeight.w500),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            Text(
              link.amountMinor != null
                  ? formatMinor(link.amountMinor!, link.currency)
                  : 'Valor livre',
              style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.gray400),
            ),
          ]),
        ),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: BanzamiSpacing.sm, vertical: 4),
          decoration: BoxDecoration(
            color:        color.withValues(alpha: 0.10),
            borderRadius: BanzamiRadius.fullAll,
          ),
          child: Text(
            label,
            style: BanzamiTextStyles.label.copyWith(color: color, fontSize: 11),
          ),
        ),
      ]),
    );
  }
}

// =============================================================================
// Received payments tab (wallet_payments) — official receipt via Document Engine
// =============================================================================

class _ReceivedPaymentsTab extends StatefulWidget {
  const _ReceivedPaymentsTab();

  @override
  State<_ReceivedPaymentsTab> createState() => _ReceivedPaymentsTabState();
}

class _ReceivedPaymentsTabState extends State<_ReceivedPaymentsTab>
    with AutomaticKeepAliveClientMixin {

  final List<MerchantWalletPayment> _items = [];
  String? _cursor;
  bool    _loading = false;
  bool    _hasMore = true;
  bool    _busyReceipt = false;
  String? _error;

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load({bool refresh = false}) async {
    if (_loading) return;
    if (!_hasMore && !refresh) return;
    setState(() { _loading = true; _error = null; });
    if (refresh) { _items.clear(); _cursor = null; _hasMore = true; }

    final client = context.read<BanzamiClient>();
    try {
      final page = await client.listMerchantWalletPayments(limit: 30, cursor: _cursor);
      setState(() {
        _items.addAll(page.items);
        _cursor  = page.nextCursor;
        _hasMore = page.nextCursor != null;
      });
    } catch (_) {
      setState(() => _error = 'Não foi possível carregar os pagamentos recebidos.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _shareReceipt(MerchantWalletPayment p) async {
    if (_busyReceipt) return;
    setState(() => _busyReceipt = true);
    final client = context.read<BanzamiClient>();
    // Share the official Banzami PDF only (Document Engine: dados + QR de
    // verificação). Never plain text. On failure show a clear error — tocar de
    // novo tenta outra vez.
    File? file;
    try {
      final bytes = await client.fetchMerchantReceiptPdf(p.id);
      final dir   = await getTemporaryDirectory();
      file        = File('${dir.path}/Banzami-Comprovativo-${p.reference}.pdf');
      await file.writeAsBytes(bytes, flush: true);
      await Share.shareXFiles(
        [XFile(file.path, mimeType: 'application/pdf')],
        subject: 'Comprovativo Banzami · ${p.reference}',
      );
    } catch (_) {
      if (mounted) _snack('Não foi possível obter o comprovativo.');
    } finally {
      // Never accumulate PDFs — delete the temp file after sharing.
      if (file != null) {
        try { await file.delete(); } catch (_) {}
      }
      if (mounted) setState(() => _busyReceipt = false);
    }
  }

  void _snack(String msg) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    if (_items.isEmpty && _loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_items.isEmpty && _error != null) {
      return _emptyState(icon: Icons.error_outline, label: _error!);
    }
    if (_items.isEmpty) {
      return _emptyState(icon: Icons.receipt_long_outlined, label: 'Sem pagamentos recebidos');
    }
    return RefreshIndicator(
      onRefresh: () => _load(refresh: true),
      child: ListView.separated(
        padding: const EdgeInsets.all(BanzamiSpacing.md),
        itemCount: _items.length + (_hasMore ? 1 : 0),
        separatorBuilder: (_, __) => const SizedBox(height: BanzamiSpacing.sm),
        itemBuilder: (context, i) {
          if (i >= _items.length) {
            _load();
            return const Padding(
              padding: EdgeInsets.all(BanzamiSpacing.md),
              child: Center(child: CircularProgressIndicator()),
            );
          }
          final p = _items[i];
          return Container(
            padding: const EdgeInsets.all(BanzamiSpacing.md),
            decoration: BoxDecoration(
              color: BanzamiColors.white,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: BanzamiColors.gray200),
            ),
            child: Row(children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      p.payerName.isNotEmpty ? p.payerName : 'Pagamento',
                      style: BanzamiTextStyles.label.copyWith(fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${formatMinor(p.amountMinor, p.currency)} · '
                      '${BanzamiDateFormatter.formatActivityTime(p.createdAt)}',
                      style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.gray400),
                    ),
                  ],
                ),
              ),
              if (p.receiptAvailable)
                BanzamiGhostButton(
                  label:     'Comprovativo',
                  color:     BanzamiColors.primary,
                  onPressed: _busyReceipt ? null : () => _shareReceipt(p),
                ),
            ]),
          );
        },
      ),
    );
  }
}
