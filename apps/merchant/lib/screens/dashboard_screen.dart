import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:banzami_flutter/banzami_flutter.dart';

import '../services/merchant_session_service.dart';
import 'charge_screen.dart';
import 'receive_qr_screen.dart';
import 'payout_screen.dart';

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
    final client  = context.read<BanzamiClient>();

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
      backgroundColor: BanzamiColors.offWhite,
      appBar: AppBar(
        backgroundColor: BanzamiColors.primary,
        foregroundColor: BanzamiColors.white,
        elevation:       0,
        title: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Olá, ${session.merchantName}',
              style: BanzamiTextStyles.headingSm.copyWith(color: BanzamiColors.white)),
          Text('Painel de negócio',
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
        color:     BanzamiColors.primary,
        onRefresh: _load,
        child: _loading && _balance == null
            ? const Center(child: CircularProgressIndicator(color: BanzamiColors.primary))
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
    return ListView(
      padding: const EdgeInsets.all(BanzamiSpacing.lg),
      children: [
        _BalanceCard(balance: _balance),
        const SizedBox(height: BanzamiSpacing.lg),
        Row(children: [
          Expanded(
            child: _ActionButton(
              icon:    Icons.add_circle_outline_rounded,
              label:   'Nova cobrança',
              filled:  true,
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const ChargeScreen()),
              ).then((_) => _load()),
            ),
          ),
          const SizedBox(width: BanzamiSpacing.md),
          Expanded(
            child: _ActionButton(
              icon:   Icons.qr_code_2_rounded,
              label:  'Meu QR',
              filled: false,
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const ReceiveQrScreen()),
              ),
            ),
          ),
        ]),
        const SizedBox(height: BanzamiSpacing.md),
        SizedBox(
          width: double.infinity,
          child: TextButton.icon(
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const PayoutScreen()),
            ).then((_) => _load()),
            icon:  const Icon(Icons.account_balance_rounded, size: 18),
            label: const Text('Levantar para conta bancária'),
            style: TextButton.styleFrom(foregroundColor: BanzamiColors.primary),
          ),
        ),
        const SizedBox(height: BanzamiSpacing.xl),
        if (_recent.isNotEmpty) ...[
          const Text('Recentes', style: BanzamiTextStyles.headingSm),
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
        gradient: LinearGradient(
          colors: [BanzamiColors.primary, BanzamiColors.primary.withValues(alpha: 0.8)],
          begin:  Alignment.topLeft,
          end:    Alignment.bottomRight,
        ),
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

class _ActionButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool filled;
  final VoidCallback onTap;
  const _ActionButton({
    required this.icon,
    required this.label,
    required this.filled,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final shape = RoundedRectangleBorder(borderRadius: BorderRadius.circular(14));
    const pad = EdgeInsets.symmetric(vertical: 16);
    if (filled) {
      return ElevatedButton.icon(
        onPressed: onTap,
        icon:  Icon(icon),
        label: Text(label),
        style: ElevatedButton.styleFrom(
          backgroundColor: BanzamiColors.primary,
          foregroundColor: BanzamiColors.white,
          padding:   pad,
          shape:     shape,
          textStyle: BanzamiTextStyles.headingSm,
        ),
      );
    }
    return OutlinedButton.icon(
      onPressed: onTap,
      icon:  Icon(icon),
      label: Text(label),
      style: OutlinedButton.styleFrom(
        foregroundColor: BanzamiColors.primary,
        side:      const BorderSide(color: BanzamiColors.primary),
        padding:   pad,
        shape:     shape,
        textStyle: BanzamiTextStyles.headingSm,
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
      PaymentLinkStatus.active    => BanzamiColors.success,
      PaymentLinkStatus.used      => BanzamiColors.primary,
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
