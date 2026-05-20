import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'package:banza_flutter/banza_flutter.dart';

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
      backgroundColor: BanzaColors.offWhite,
      appBar: AppBar(
        backgroundColor:        BanzaColors.white,
        foregroundColor:        BanzaColors.gray900,
        elevation:              0,
        scrolledUnderElevation: 0,
        title: const Text('Histórico', style: BanzaTextStyles.headingMd),
        bottom: TabBar(
          controller:          _tabs,
          labelColor:          BanzaColors.wine,
          unselectedLabelColor: BanzaColors.gray400,
          indicatorColor:      BanzaColors.wine,
          indicatorWeight:     2,
          labelStyle:          BanzaTextStyles.label.copyWith(
            fontSize:   14,
            fontWeight: FontWeight.w600,
          ),
          unselectedLabelStyle: BanzaTextStyles.label.copyWith(
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
          color: BanzaColors.gray200,
          shape: BoxShape.circle,
        ),
        child: Icon(icon, size: 28, color: BanzaColors.gray400),
      ),
      const SizedBox(height: BanzaSpacing.md),
      Text(label, style: BanzaTextStyles.headingSm),
      const SizedBox(height: BanzaSpacing.xs),
      Text(
        'As suas actividades aparecerão aqui',
        style: BanzaTextStyles.bodySm.copyWith(color: BanzaColors.gray400),
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

    final client = context.read<BanzaClient>();
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
      color:     BanzaColors.wine,
      onRefresh: () => _load(refresh: true),
      child:     _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_loading && _txs.isEmpty) {
      return const Center(child: CircularProgressIndicator(color: BanzaColors.wine));
    }
    if (_error != null && _txs.isEmpty) {
      return Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
        const Icon(Icons.error_outline_rounded, color: BanzaColors.error, size: 40),
        const SizedBox(height: BanzaSpacing.md),
        Text(_error!, style: BanzaTextStyles.bodyMd.copyWith(color: BanzaColors.gray400)),
        const SizedBox(height: BanzaSpacing.lg),
        TextButton(onPressed: _load, child: const Text('Tentar novamente')),
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
        BanzaSpacing.lg, BanzaSpacing.md, BanzaSpacing.lg, BanzaSpacing.page,
      ),
      itemCount: grouped.length + (_hasMore ? 1 : 0),
      itemBuilder: (context, i) {
        if (i == grouped.length) {
          if (!_loading) _load();
          return const Padding(
            padding: EdgeInsets.all(BanzaSpacing.xl),
            child:   Center(child: CircularProgressIndicator(color: BanzaColors.wine)),
          );
        }

        final item = grouped[i];

        if (item is String) {
          return Padding(
            padding: const EdgeInsets.fromLTRB(
              BanzaSpacing.xs, BanzaSpacing.lg, BanzaSpacing.xs, BanzaSpacing.sm,
            ),
            child: Text(
              item,
              style: BanzaTextStyles.label.copyWith(
                color:         BanzaColors.gray400,
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
            color: BanzaColors.white,
            borderRadius: BorderRadius.vertical(
              top:    Radius.circular(isFirst ? BanzaRadius.xl : 0),
              bottom: Radius.circular(isLast  ? BanzaRadius.xl : 0),
            ),
            boxShadow: isFirst ? BanzaShadows.card : BanzaShadows.none,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              _TransactionTile(tx: tx),
              if (!isLast)
                const Divider(height: 1, indent: 68, color: BanzaColors.gray200),
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
        BanzaColors.success,
        tx.description ?? 'Pagamento recebido',
        BanzaColors.success,
        '+',
      ),
      'CANCELLED' => (
        Icons.arrow_upward_rounded,
        BanzaColors.error,
        tx.description ?? 'Cancelamento',
        BanzaColors.error,
        '−',
      ),
      'FAILED' => (
        Icons.close_rounded,
        BanzaColors.error,
        tx.description ?? 'Falhado',
        BanzaColors.error,
        '−',
      ),
      _ => (
        Icons.access_time_rounded,
        BanzaColors.wine,
        tx.description ?? 'Pendente',
        BanzaColors.gray900,
        '',
      ),
    };

    final local   = tx.createdAt.toLocal();
    final timeStr = '${local.hour.toString().padLeft(2, '0')}:${local.minute.toString().padLeft(2, '0')}';

    return Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: BanzaSpacing.lg,
        vertical:   BanzaSpacing.md,
      ),
      child: Row(children: [
        Container(
          width:  40,
          height: 40,
          decoration: BoxDecoration(
            color:        iconColor.withValues(alpha: 0.10),
            borderRadius: BanzaRadius.mdAll,
          ),
          child: Icon(icon, color: iconColor, size: 20),
        ),
        const SizedBox(width: BanzaSpacing.md),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(
              label,
              style:    BanzaTextStyles.bodyMd.copyWith(fontWeight: FontWeight.w500),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            Text(
              timeStr,
              style: BanzaTextStyles.bodySm.copyWith(color: BanzaColors.gray400),
            ),
          ]),
        ),
        Text(
          '$sign${formatMinor(tx.amountMinor, tx.currency)}',
          style: BanzaTextStyles.mono.copyWith(
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
    final client  = context.read<BanzaClient>();
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
      color:     BanzaColors.wine,
      onRefresh: () => _load(refresh: true),
      child:     _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_loading && _links.isEmpty) {
      return const Center(child: CircularProgressIndicator(color: BanzaColors.wine));
    }
    if (_error != null && _links.isEmpty) {
      return Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
        const Icon(Icons.error_outline_rounded, color: BanzaColors.error, size: 40),
        const SizedBox(height: BanzaSpacing.md),
        Text(_error!, style: BanzaTextStyles.bodyMd.copyWith(color: BanzaColors.gray400)),
        const SizedBox(height: BanzaSpacing.lg),
        TextButton(onPressed: _load, child: const Text('Tentar novamente')),
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
        BanzaSpacing.lg, BanzaSpacing.md, BanzaSpacing.lg, BanzaSpacing.page,
      ),
      itemCount: _links.length + (_hasMore ? 1 : 0),
      itemBuilder: (context, i) {
        if (i == _links.length) {
          if (!_loading) _load();
          return const Padding(
            padding: EdgeInsets.all(BanzaSpacing.xl),
            child:   Center(child: CircularProgressIndicator(color: BanzaColors.wine)),
          );
        }

        final isFirst = i == 0;
        final isLast  = i == _links.length - 1;

        return Container(
          decoration: BoxDecoration(
            color: BanzaColors.white,
            borderRadius: BorderRadius.vertical(
              top:    Radius.circular(isFirst ? BanzaRadius.xl : 0),
              bottom: Radius.circular(isLast  ? BanzaRadius.xl : 0),
            ),
            boxShadow: isFirst ? BanzaShadows.card : BanzaShadows.none,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              _PaymentLinkTile(link: _links[i]),
              if (!isLast)
                const Divider(height: 1, indent: 68, color: BanzaColors.gray200),
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
      PaymentLinkStatus.active    => (BanzaColors.success, 'Activo',    Icons.hourglass_top_rounded),
      PaymentLinkStatus.used      => (BanzaColors.wine,    'Pago',      Icons.check_circle_rounded),
      PaymentLinkStatus.expired   => (BanzaColors.gray400, 'Expirado',  Icons.timer_off_rounded),
      PaymentLinkStatus.cancelled => (BanzaColors.error,   'Cancelado', Icons.cancel_rounded),
    };

    return Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: BanzaSpacing.lg,
        vertical:   BanzaSpacing.md,
      ),
      child: Row(children: [
        Container(
          width:  40,
          height: 40,
          decoration: BoxDecoration(
            color:        color.withValues(alpha: 0.10),
            borderRadius: BanzaRadius.mdAll,
          ),
          child: Icon(icon, color: color, size: 20),
        ),
        const SizedBox(width: BanzaSpacing.md),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(
              link.description ?? 'Cobrança',
              style:    BanzaTextStyles.bodyMd.copyWith(fontWeight: FontWeight.w500),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            Text(
              link.amountMinor != null
                  ? formatMinor(link.amountMinor!, link.currency)
                  : 'Valor livre',
              style: BanzaTextStyles.bodySm.copyWith(color: BanzaColors.gray400),
            ),
          ]),
        ),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: BanzaSpacing.sm, vertical: 4),
          decoration: BoxDecoration(
            color:        color.withValues(alpha: 0.10),
            borderRadius: BanzaRadius.fullAll,
          ),
          child: Text(
            label,
            style: BanzaTextStyles.label.copyWith(color: color, fontSize: 11),
          ),
        ),
      ]),
    );
  }
}
