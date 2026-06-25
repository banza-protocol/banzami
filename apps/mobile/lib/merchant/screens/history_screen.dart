import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'package:banzami_flutter/banzami_flutter.dart';

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
    _tabs = TabController(length: 2, vsync: this);
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
      appBar: AppBar(
        backgroundColor:        BanzamiColors.white,
        foregroundColor:        BanzamiColors.gray900,
        elevation:              0,
        scrolledUnderElevation: 0,
        title: const Text('Histórico', style: BanzamiTextStyles.headingMd),
        bottom: TabBar(
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
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabs,
        children: const [
          _TransactionsTab(),
          _PaymentLinksTab(),
        ],
      ),
    );
  }
}

// =============================================================================
// Shared date-grouping helpers
// =============================================================================

String _dateHeader(DateTime dt) {
  final now       = DateTime.now();
  final today     = DateUtils.dateOnly(now);
  final yesterday = today.subtract(const Duration(days: 1));
  final date      = DateUtils.dateOnly(dt);

  if (date == today)     return 'Hoje';
  if (date == yesterday) return 'Ontem';
  return DateFormat('d MMM yyyy', 'pt_PT').format(date);
}

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

  final List<MerchantTransaction> _txs = [];
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
    if (refresh) { _txs.clear(); _cursor = null; _hasMore = true; }

    final client = context.read<BanzamiClient>();
    try {
      final page = await client.listMerchantTransactions(limit: 30, cursor: _cursor);
      setState(() {
        _txs.addAll(page.data);
        _cursor  = page.nextCursor;
        _hasMore = page.hasMore;
      });
    } catch (_) {
      setState(() => _error = 'Não foi possível carregar as transacções.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  List<dynamic> _grouped() {
    final items = <dynamic>[];
    String? lastKey;
    for (final tx in _txs) {
      final key = _dateHeader(tx.createdAt.toLocal());
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
          if (!_loading) _load();
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

        final tx      = item as MerchantTransaction;
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
  final MerchantTransaction tx;
  const _TransactionTile({required this.tx});

  @override
  Widget build(BuildContext context) {
    final statusUp = tx.status.toUpperCase();
    final (icon, iconColor, label, amountColor, sign) = switch (statusUp) {
      'COMPLETED' || 'PAID' => (
        Icons.arrow_downward_rounded,
        BanzamiColors.success,
        tx.description ?? 'Pagamento recebido',
        BanzamiColors.success,
        '+',
      ),
      'CANCELLED' => (
        Icons.arrow_upward_rounded,
        BanzamiColors.error,
        tx.description ?? 'Cancelamento',
        BanzamiColors.error,
        '−',
      ),
      'FAILED' => (
        Icons.close_rounded,
        BanzamiColors.error,
        tx.description ?? 'Falhado',
        BanzamiColors.error,
        '−',
      ),
      _ => (
        Icons.access_time_rounded,
        BanzamiColors.primary,
        tx.description ?? 'Pendente',
        BanzamiColors.gray900,
        '',
      ),
    };

    final local   = tx.createdAt.toLocal();
    final timeStr = '${local.hour.toString().padLeft(2, '0')}:${local.minute.toString().padLeft(2, '0')}';

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
              timeStr,
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
