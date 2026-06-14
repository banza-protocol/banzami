import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:banzami_flutter/banzami_flutter.dart';

import '../services/merchant_session_service.dart';

class MerchantHistoryScreen extends StatefulWidget {
  const MerchantHistoryScreen({super.key});

  @override
  State<MerchantHistoryScreen> createState() => _MerchantHistoryScreenState();
}

class _MerchantHistoryScreenState extends State<MerchantHistoryScreen> {
  final List<PaymentLink> _links = [];
  String? _cursor;
  bool    _loading  = false;
  bool    _hasMore  = true;
  String? _error;

  static const int _pageSize = 30;

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
        limit:      _pageSize,
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
    return Scaffold(
      backgroundColor: BanzamiColors.offWhite,
      appBar: AppBar(
        backgroundColor: BanzamiColors.white,
        foregroundColor: BanzamiColors.gray900,
        elevation:       0,
        title: const Text('Histórico', style: BanzamiTextStyles.headingSm),
        actions: [
          IconButton(
            icon:      const Icon(Icons.refresh_rounded),
            onPressed: () => _load(refresh: true),
          ),
        ],
      ),
      body: RefreshIndicator(
        color:     BanzamiColors.primary,
        onRefresh: () => _load(refresh: true),
        child:     _buildBody(),
      ),
    );
  }

  Widget _buildBody() {
    if (_loading && _links.isEmpty) {
      return const Center(child: CircularProgressIndicator(color: BanzamiColors.primary));
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
      return Center(child: Text(
        'Nenhuma cobrança ainda.',
        style: BanzamiTextStyles.bodyMd.copyWith(color: BanzamiColors.gray400),
      ));
    }

    return ListView.separated(
      padding:          const EdgeInsets.symmetric(vertical: 8),
      itemCount:        _links.length + (_hasMore ? 1 : 0),
      separatorBuilder: (_, __) => const Divider(height: 1, indent: 16),
      itemBuilder: (context, i) {
        if (i == _links.length) {
          if (!_loading) _load();
          return const Padding(
            padding: EdgeInsets.all(24),
            child:   Center(child: CircularProgressIndicator(color: BanzamiColors.primary)),
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
      PaymentLinkStatus.active    => (BanzamiColors.success,  'Activo',    Icons.hourglass_top_rounded),
      PaymentLinkStatus.used      => (BanzamiColors.primary,     'Pago',      Icons.check_circle_rounded),
      PaymentLinkStatus.expired   => (BanzamiColors.gray400,  'Expirado',  Icons.timer_off_rounded),
      PaymentLinkStatus.cancelled => (BanzamiColors.error,    'Cancelado', Icons.cancel_rounded),
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
      title: Text(
        link.description ?? 'Cobrança',
        style: BanzamiTextStyles.bodyMd,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
      ),
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
