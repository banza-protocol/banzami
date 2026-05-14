import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:banzami_sdk/banzami_sdk.dart';

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
  int  _todayMinor  = 0;
  int  _monthMinor  = 0;
  bool _loading     = false;
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
    final client  = context.read<BanzamiClient>();

    String? err;

    final balanceFuture = client.getMerchantBalance(session.walletId)
        .then((b) { if (mounted) setState(() => _balance = b); })
        .catchError((_) { err = 'Não foi possível carregar o saldo.'; });

    final linksFuture = client.listPaymentLinks(merchantId: session.merchantId, limit: 5)
        .then((p) { if (mounted) setState(() => _recent = p.data); })
        .catchError((_) { err ??= 'Não foi possível carregar os dados.'; });

    // Stats — compute today and this month from the 100 most recent transactions.
    final statsFuture = client.listMerchantTransactions(limit: 100)
        .then((page) {
          final now   = DateTime.now();
          int today = 0, month = 0;
          for (final tx in page.data) {
            if (!tx.isCompleted) continue;
            final local = tx.createdAt.toLocal();
            if (local.year == now.year && local.month == now.month) {
              month += tx.amountMinor;
              if (local.day == now.day) today += tx.amountMinor;
            }
          }
          if (mounted) setState(() { _todayMinor = today; _monthMinor = month; });
        })
        .catchError((_) {});   // stats are non-critical

    await Future.wait([balanceFuture, linksFuture, statsFuture]);

    if (mounted) setState(() { _loading = false; _error = err; });
  }

  @override
  Widget build(BuildContext context) {
    final session = context.read<MerchantSessionService>().session!;

    return Scaffold(
      backgroundColor: BanzamiColors.offWhite,
      appBar: AppBar(
        backgroundColor: BanzamiColors.wine,
        foregroundColor: BanzamiColors.white,
        elevation:       0,
        title: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Olá, ${session.merchantName}',
              style: BanzamiTextStyles.headingSm.copyWith(color: BanzamiColors.white)),
          Text('Painel de comerciante',
              style: BanzamiTextStyles.bodySm.copyWith(
                  color: BanzamiColors.white.withValues(alpha: 0.75))),
        ]),
        actions: [
          IconButton(
            icon:      const Icon(Icons.refresh_rounded),
            onPressed: _load,
          ),
        ],
      ),
      body: RefreshIndicator(
        color:     BanzamiColors.wine,
        onRefresh: _load,
        child: _loading && _balance == null
            ? const Center(child: CircularProgressIndicator(color: BanzamiColors.wine))
            : _error != null && _balance == null
                ? _buildError()
                : _buildBody(),
      ),
    );
  }

  Widget _buildError() {
    return Center(
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        const Icon(Icons.error_outline_rounded, color: BanzamiColors.error, size: 40),
        const SizedBox(height: 12),
        Text(_error!, style: BanzamiTextStyles.bodyMd.copyWith(color: BanzamiColors.gray400)),
        const SizedBox(height: 16),
        TextButton(onPressed: _load, child: const Text('Tentar novamente')),
      ]),
    );
  }

  Widget _buildBody() {
    final currency = _balance?.currency ?? 'AOA';
    return ListView(
      padding: const EdgeInsets.all(BanzamiSpacing.lg),
      children: [
        _BalanceCard(balance: _balance),
        const SizedBox(height: BanzamiSpacing.md),

        // Stats row
        Row(children: [
          Expanded(child: _StatCard(
            label: 'Hoje',
            value: formatMinor(_todayMinor, currency),
            icon:  Icons.today_rounded,
          )),
          const SizedBox(width: BanzamiSpacing.md),
          Expanded(child: _StatCard(
            label: 'Este mês',
            value: formatMinor(_monthMinor, currency),
            icon:  Icons.calendar_month_rounded,
          )),
        ]),
        const SizedBox(height: BanzamiSpacing.lg),

        _QuickChargeButton(onTap: () => Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => const ChargeScreen()),
        ).then((_) => _load())),
        const SizedBox(height: BanzamiSpacing.xl),
        if (_recent.isNotEmpty) ...[
          const Text('Cobranças recentes', style: BanzamiTextStyles.headingSm),
          const SizedBox(height: BanzamiSpacing.md),
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
      padding: const EdgeInsets.all(BanzamiSpacing.xl),
      decoration: BoxDecoration(
        gradient: BanzamiGradients.wine,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('Saldo disponível',
            style: BanzamiTextStyles.bodySm.copyWith(
                color: BanzamiColors.white.withValues(alpha: 0.8))),
        const SizedBox(height: 8),
        Text(
          balance != null
              ? formatMinor(balance!.availableMinor, balance!.currency)
              : '— Kz',
          style: BanzamiTextStyles.displayLg.copyWith(
              color: BanzamiColors.white, fontWeight: FontWeight.w700),
        ),
        if (balance?.reservedMinor != null && balance!.reservedMinor > 0) ...[
          const SizedBox(height: 4),
          Text(
            'Reservado: ${formatMinor(balance!.reservedMinor, balance!.currency)}',
            style: BanzamiTextStyles.bodySm.copyWith(
                color: BanzamiColors.white.withValues(alpha: 0.65)),
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
          backgroundColor: BanzamiColors.wine,
          foregroundColor: BanzamiColors.white,
          padding:    const EdgeInsets.symmetric(vertical: 16),
          shape:      RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          textStyle:  BanzamiTextStyles.headingSm,
        ),
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  const _StatCard({required this.label, required this.value, required this.icon});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(BanzamiSpacing.md),
      decoration: BoxDecoration(
        color:        BanzamiColors.white,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Icon(icon, color: BanzamiColors.wine, size: 18),
          const SizedBox(width: 6),
          Text(label,
              style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.gray400)),
        ]),
        const SizedBox(height: 6),
        Text(value,
            style: BanzamiTextStyles.headingSm.copyWith(fontWeight: FontWeight.w700),
            maxLines: 1,
            overflow: TextOverflow.ellipsis),
      ]),
    );
  }
}

class _LinkTile extends StatelessWidget {
  final PaymentLink link;
  const _LinkTile({required this.link});

  @override
  Widget build(BuildContext context) {
    final color = switch (link.status) {
      PaymentLinkStatus.active    => BanzamiColors.success,
      PaymentLinkStatus.used      => BanzamiColors.wine,
      PaymentLinkStatus.expired   => BanzamiColors.gray400,
      PaymentLinkStatus.cancelled => BanzamiColors.error,
    };
    final label = switch (link.status) {
      PaymentLinkStatus.active    => 'Activo',
      PaymentLinkStatus.used      => 'Pago',
      PaymentLinkStatus.expired   => 'Expirado',
      PaymentLinkStatus.cancelled => 'Cancelado',
    };

    return Container(
      margin: const EdgeInsets.only(bottom: BanzamiSpacing.sm),
      padding: const EdgeInsets.all(BanzamiSpacing.md),
      decoration: BoxDecoration(
        color:        BanzamiColors.white,
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
        const SizedBox(width: BanzamiSpacing.md),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(
            link.description ?? 'Cobrança',
            style: BanzamiTextStyles.bodyMd,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          Text(
            link.amountMinor != null
                ? formatMinor(link.amountMinor!, link.currency)
                : 'Valor livre',
            style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.gray400),
          ),
        ])),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          decoration: BoxDecoration(
            color:        color.withValues(alpha: 0.12),
            borderRadius: BorderRadius.circular(20),
          ),
          child: Text(label,
              style: BanzamiTextStyles.label.copyWith(color: color)),
        ),
      ]),
    );
  }
}
