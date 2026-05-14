import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:banzami_sdk/banzami_sdk.dart';

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
        backgroundColor: BanzamiColors.white,
        foregroundColor: BanzamiColors.gray900,
        elevation:       0,
        title:  const Text('Histórico', style: BanzamiTextStyles.headingSm),
        bottom: TabBar(
          controller:       _tabs,
          labelColor:       BanzamiColors.wine,
          unselectedLabelColor: BanzamiColors.gray400,
          indicatorColor:   BanzamiColors.wine,
          indicatorWeight:  2,
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

// ---------------------------------------------------------------------------
// Transacções reais
// ---------------------------------------------------------------------------

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
      final page = await client.listMerchantTransactions(
        limit:  30,
        cursor: _cursor,
      );
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

  @override
  Widget build(BuildContext context) {
    super.build(context);
    return RefreshIndicator(
      color:     BanzamiColors.wine,
      onRefresh: () => _load(refresh: true),
      child:     _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_loading && _txs.isEmpty) {
      return const Center(child: CircularProgressIndicator(color: BanzamiColors.wine));
    }
    if (_error != null && _txs.isEmpty) {
      return Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
        const Icon(Icons.error_outline_rounded, color: BanzamiColors.error, size: 40),
        const SizedBox(height: 12),
        Text(_error!, style: BanzamiTextStyles.bodyMd.copyWith(color: BanzamiColors.gray400)),
        const SizedBox(height: 16),
        TextButton(onPressed: _load, child: const Text('Tentar novamente')),
      ]));
    }
    if (_txs.isEmpty) {
      return Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
        Icon(Icons.receipt_long_outlined, color: BanzamiColors.gray400.withValues(alpha: 0.5), size: 56),
        const SizedBox(height: 16),
        Text('Nenhuma transacção ainda.',
            style: BanzamiTextStyles.bodyMd.copyWith(color: BanzamiColors.gray400)),
      ]));
    }
    return ListView.separated(
      padding:          const EdgeInsets.symmetric(vertical: 8),
      itemCount:        _txs.length + (_hasMore ? 1 : 0),
      separatorBuilder: (_, __) => const Divider(height: 1, indent: 16),
      itemBuilder: (ctx, i) {
        if (i == _txs.length) {
          if (!_loading) _load();
          return const Padding(
            padding: EdgeInsets.all(24),
            child:   Center(child: CircularProgressIndicator(color: BanzamiColors.wine)),
          );
        }
        return _TransactionTile(tx: _txs[i]);
      },
    );
  }
}

class _TransactionTile extends StatelessWidget {
  final MerchantTransaction tx;
  const _TransactionTile({required this.tx});

  @override
  Widget build(BuildContext context) {
    final (color, icon) = switch (tx.status.toUpperCase()) {
      'COMPLETED' || 'PAID' => (BanzamiColors.success, Icons.check_circle_rounded),
      'PENDING'             => (BanzamiColors.wine,    Icons.hourglass_top_rounded),
      'FAILED'              => (BanzamiColors.error,   Icons.cancel_rounded),
      _                     => (BanzamiColors.gray400, Icons.help_outline_rounded),
    };

    final local = tx.createdAt.toLocal();
    String pad(int n) => n.toString().padLeft(2, '0');
    final dateStr =
        '${local.day}/${pad(local.month)}/${local.year} ${pad(local.hour)}:${pad(local.minute)}';

    return ListTile(
      tileColor: BanzamiColors.white,
      leading: Container(
        width: 40, height: 40,
        decoration: BoxDecoration(
          color:        color.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Icon(icon, color: color, size: 20),
      ),
      title: Text(
        tx.description ?? 'Pagamento recebido',
        style:    BanzamiTextStyles.bodyMd,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
      ),
      subtitle: Text(dateStr,
          style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.gray400)),
      trailing: Text(
        formatMinor(tx.amountMinor, tx.currency),
        style: BanzamiTextStyles.bodyMd.copyWith(
          color:      color,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Cobranças (payment links) — tab original
// ---------------------------------------------------------------------------

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
      color:     BanzamiColors.wine,
      onRefresh: () => _load(refresh: true),
      child:     _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_loading && _links.isEmpty) {
      return const Center(child: CircularProgressIndicator(color: BanzamiColors.wine));
    }
    if (_error != null && _links.isEmpty) {
      return Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
        const Icon(Icons.error_outline_rounded, color: BanzamiColors.error, size: 40),
        const SizedBox(height: 12),
        Text(_error!, style: BanzamiTextStyles.bodyMd.copyWith(color: BanzamiColors.gray400)),
        const SizedBox(height: 16),
        TextButton(onPressed: _load, child: const Text('Tentar novamente')),
      ]));
    }
    if (_links.isEmpty) {
      return Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
        Icon(Icons.link_off_rounded, color: BanzamiColors.gray400.withValues(alpha: 0.5), size: 56),
        const SizedBox(height: 16),
        Text('Nenhuma cobrança ainda.',
            style: BanzamiTextStyles.bodyMd.copyWith(color: BanzamiColors.gray400)),
      ]));
    }
    return ListView.separated(
      padding:          const EdgeInsets.symmetric(vertical: 8),
      itemCount:        _links.length + (_hasMore ? 1 : 0),
      separatorBuilder: (_, __) => const Divider(height: 1, indent: 16),
      itemBuilder: (ctx, i) {
        if (i == _links.length) {
          if (!_loading) _load();
          return const Padding(
            padding: EdgeInsets.all(24),
            child:   Center(child: CircularProgressIndicator(color: BanzamiColors.wine)),
          );
        }
        return _PaymentLinkTile(link: _links[i]);
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
      PaymentLinkStatus.used      => (BanzamiColors.wine,    'Pago',      Icons.check_circle_rounded),
      PaymentLinkStatus.expired   => (BanzamiColors.gray400, 'Expirado',  Icons.timer_off_rounded),
      PaymentLinkStatus.cancelled => (BanzamiColors.error,   'Cancelado', Icons.cancel_rounded),
    };

    return ListTile(
      tileColor: BanzamiColors.white,
      leading: Container(
        width: 40, height: 40,
        decoration: BoxDecoration(
          color:        color.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Icon(icon, color: color, size: 20),
      ),
      title: Text(link.description ?? 'Cobrança',
          style: BanzamiTextStyles.bodyMd, maxLines: 1, overflow: TextOverflow.ellipsis),
      subtitle: Text(
        link.amountMinor != null
            ? formatMinor(link.amountMinor!, link.currency)
            : 'Valor livre',
        style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.gray400),
      ),
      trailing: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(
          color:        color.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(20),
        ),
        child: Text(label, style: BanzamiTextStyles.label.copyWith(color: color)),
      ),
    );
  }
}
