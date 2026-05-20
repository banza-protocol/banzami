import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:banza_flutter/banza_flutter.dart';

import '../services/merchant_session_service.dart';
import 'charge_screen.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  MerchantBalance? _balance;
  List<PaymentLink> _recent = [];
  bool   _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (_loading) return;
    setState(() { _loading = true; _error = null; });

    final session = context.read<MerchantSessionService>().session!;
    final client  = context.read<BanzaClient>();

    try {
      final results = await Future.wait([
        client.getMerchantBalance(session.walletId),
        client.listPaymentLinks(merchantId: session.merchantId, limit: 5),
      ]);
      setState(() {
        _balance = results[0] as MerchantBalance;
        _recent  = (results[1] as PaymentLinkPage).data;
      });
    } catch (_) {
      setState(() => _error = 'Não foi possível carregar os dados.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = context.read<MerchantSessionService>().session!;

    return Scaffold(
      backgroundColor: BanzaColors.offWhite,
      appBar: AppBar(
        backgroundColor: BanzaColors.wine,
        foregroundColor: BanzaColors.white,
        elevation:       0,
        title: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Olá, ${session.merchantName}',
              style: BanzaTextStyles.headingSm.copyWith(color: BanzaColors.white)),
          Text('Painel de negócio',
              style: BanzaTextStyles.bodySm.copyWith(
                  color: BanzaColors.white.withValues(alpha: 0.75))),
        ]),
        actions: [
          IconButton(
            icon:      const Icon(Icons.refresh_rounded),
            onPressed: _load,
          ),
        ],
      ),
      body: RefreshIndicator(
        color:     BanzaColors.wine,
        onRefresh: _load,
        child: _loading && _balance == null
            ? const Center(child: CircularProgressIndicator(color: BanzaColors.wine))
            : _error != null && _balance == null
                ? _buildError()
                : _buildBody(),
      ),
    );
  }

  Widget _buildError() {
    return Center(
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        const Icon(Icons.error_outline_rounded, color: BanzaColors.error, size: 40),
        const SizedBox(height: 12),
        Text(_error!, style: BanzaTextStyles.bodyMd.copyWith(color: BanzaColors.gray400)),
        const SizedBox(height: 16),
        TextButton(onPressed: _load, child: const Text('Tentar novamente')),
      ]),
    );
  }

  Widget _buildBody() {
    return ListView(
      padding: const EdgeInsets.all(BanzaSpacing.lg),
      children: [
        _BalanceCard(balance: _balance),
        const SizedBox(height: BanzaSpacing.lg),
        _QuickChargeButton(onTap: () => Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => const ChargeScreen()),
        ).then((_) => _load())),
        const SizedBox(height: BanzaSpacing.xl),
        if (_recent.isNotEmpty) ...[
          const Text('Recentes', style: BanzaTextStyles.headingSm),
          const SizedBox(height: BanzaSpacing.md),
          ..._recent.map((l) => _LinkTile(link: l)),
        ],
      ],
    );
  }
}

class _BalanceCard extends StatelessWidget {
  final MerchantBalance? balance;
  const _BalanceCard({this.balance});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(BanzaSpacing.xl),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [BanzaColors.wine, BanzaColors.wine.withValues(alpha: 0.8)],
          begin:  Alignment.topLeft,
          end:    Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('Saldo disponível',
            style: BanzaTextStyles.bodySm.copyWith(
                color: BanzaColors.white.withValues(alpha: 0.8))),
        const SizedBox(height: 8),
        Text(
          balance != null
              ? formatMinor(balance!.availableMinor, balance!.currency)
              : '— Kz',
          style: BanzaTextStyles.displayLg.copyWith(
              color: BanzaColors.white, fontWeight: FontWeight.w700),
        ),
        if (balance?.reservedMinor != null && balance!.reservedMinor > 0) ...[
          const SizedBox(height: 4),
          Text(
            'Reservado: ${formatMinor(balance!.reservedMinor, balance!.currency)}',
            style: BanzaTextStyles.bodySm.copyWith(
                color: BanzaColors.white.withValues(alpha: 0.65)),
          ),
        ],
      ]),
    );
  }
}

class _QuickChargeButton extends StatelessWidget {
  final VoidCallback onTap;
  const _QuickChargeButton({required this.onTap});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      child: ElevatedButton.icon(
        onPressed: onTap,
        icon:  const Icon(Icons.add_circle_outline_rounded),
        label: const Text('Nova cobrança'),
        style: ElevatedButton.styleFrom(
          backgroundColor: BanzaColors.wine,
          foregroundColor: BanzaColors.white,
          padding:    const EdgeInsets.symmetric(vertical: 16),
          shape:      RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          textStyle:  BanzaTextStyles.headingSm,
        ),
      ),
    );
  }
}

class _LinkTile extends StatelessWidget {
  final PaymentLink link;
  const _LinkTile({required this.link});

  @override
  Widget build(BuildContext context) {
    final color = switch (link.status) {
      PaymentLinkStatus.active    => BanzaColors.success,
      PaymentLinkStatus.used      => BanzaColors.wine,
      PaymentLinkStatus.expired   => BanzaColors.gray400,
      PaymentLinkStatus.cancelled => BanzaColors.error,
    };
    final label = switch (link.status) {
      PaymentLinkStatus.active    => 'Activo',
      PaymentLinkStatus.used      => 'Pago',
      PaymentLinkStatus.expired   => 'Expirado',
      PaymentLinkStatus.cancelled => 'Cancelado',
    };

    return Container(
      margin: const EdgeInsets.only(bottom: BanzaSpacing.sm),
      padding: const EdgeInsets.all(BanzaSpacing.md),
      decoration: BoxDecoration(
        color:        BanzaColors.white,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(children: [
        Container(
          width: 40, height: 40,
          decoration: BoxDecoration(
            color:        color.withValues(alpha: 0.12),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Icon(Icons.link_rounded, color: color, size: 20),
        ),
        const SizedBox(width: BanzaSpacing.md),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(
            link.description ?? 'Cobrança',
            style: BanzaTextStyles.bodyMd,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          Text(
            link.amountMinor != null
                ? formatMinor(link.amountMinor!, link.currency)
                : 'Valor livre',
            style: BanzaTextStyles.bodySm.copyWith(color: BanzaColors.gray400),
          ),
        ])),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          decoration: BoxDecoration(
            color:        color.withValues(alpha: 0.12),
            borderRadius: BorderRadius.circular(20),
          ),
          child: Text(label,
              style: BanzaTextStyles.label.copyWith(color: color)),
        ),
      ]),
    );
  }
}
