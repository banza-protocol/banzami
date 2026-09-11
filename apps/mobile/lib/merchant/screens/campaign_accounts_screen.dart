import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:banzami_flutter/banzami_flutter.dart';

import '../services/merchant_session_service.dart';

/// Breakdown of funds held in the merchant wallet's segregated sub-accounts
/// (BANZA ADR-042) — the "Fundos retidos" total from the dashboard. Each
/// account is money received but kept out of the spendable available balance,
/// for the purpose the API names (campaign, project, event, escrow, …). This
/// screen says only that: what happens to the money later is not something the
/// API tells the app, so it makes no promise about it.
class CampaignAccountsScreen extends StatefulWidget {
  const CampaignAccountsScreen({super.key});

  @override
  State<CampaignAccountsScreen> createState() => _CampaignAccountsScreenState();
}

class _CampaignAccountsScreenState extends State<CampaignAccountsScreen> {
  List<MerchantWalletAccount>? _accounts;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final session = context.read<MerchantSessionService>().session!;
      final client = context.read<BanzamiClient>();
      final all = await client.listWalletAccounts(session.walletId);
      // Segregated (non-PRIMARY) accounts only — the held funds.
      final held = all.where((a) => !a.isPrimary).toList()
        ..sort((a, b) => b.availableBalanceMinor.compareTo(a.availableBalanceMinor));
      if (mounted) setState(() { _accounts = held; _loading = false; });
    } catch (_) {
      if (mounted) setState(() { _error = 'Não foi possível carregar os fundos retidos.'; _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return BanzamiScaffold(
      backgroundColor: BanzamiColors.gray100,
      appBar: const BanzamiAppBar(title: 'Fundos retidos', showBack: true),
      body: RefreshIndicator(
        onRefresh: _load,
        color: BanzamiColors.primary,
        child: _buildBody(),
      ),
    );
  }

  Widget _buildBody() {
    if (_loading && _accounts == null) {
      return const Center(child: CircularProgressIndicator(color: BanzamiColors.primary));
    }
    if (_error != null && _accounts == null) {
      return _MessageState(icon: Icons.error_outline_rounded, text: _error!);
    }
    final accounts = _accounts ?? const [];
    if (accounts.isEmpty) {
      return const _MessageState(
        icon: Icons.savings_outlined,
        text: 'Ainda não há fundos retidos.',
      );
    }

    final currency = accounts.first.currency;
    final total = accounts.fold<int>(0, (s, a) => s + a.availableBalanceMinor);

    return ListView(
      padding: const EdgeInsets.all(BanzamiSpacing.lg),
      children: [
        // Total header
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(BanzamiSpacing.lg),
          decoration: const BoxDecoration(
            gradient: BanzamiGradients.primary,
            borderRadius: BanzamiRadius.lgAll,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(children: [
                const Icon(Icons.savings_rounded, size: 16, color: BanzamiColors.white),
                const SizedBox(width: 6),
                Text('Total retido',
                    style: BanzamiTextStyles.bodySm.copyWith(
                        color: BanzamiColors.white.withValues(alpha: 0.85))),
              ]),
              const SizedBox(height: BanzamiSpacing.xs),
              Text(formatMinor(total, currency),
                  style: BanzamiTextStyles.headingLg.copyWith(
                      color: BanzamiColors.white, fontWeight: FontWeight.w700)),
              const SizedBox(height: BanzamiSpacing.xs),
              Text(
                'Recebido, mas separado do saldo disponível, por finalidade.',
                style: BanzamiTextStyles.bodySm.copyWith(
                    color: BanzamiColors.white.withValues(alpha: 0.70)),
              ),
            ],
          ),
        ),
        const SizedBox(height: BanzamiSpacing.lg),
        ...accounts.map((a) => Padding(
              padding: const EdgeInsets.only(bottom: BanzamiSpacing.md),
              child: _AccountCard(account: a),
            )),
      ],
    );
  }
}

class _AccountCard extends StatelessWidget {
  final MerchantWalletAccount account;
  const _AccountCard({required this.account});

  @override
  Widget build(BuildContext context) {
    final purpose = walletAccountPurposeLabel(account.purpose);
    final hasLabel = account.label != null && account.label!.trim().isNotEmpty;
    final title = hasLabel ? account.label!.trim() : purpose;
    final subtitle = hasLabel
        ? '$purpose · ${walletAccountStatusLabel(account.status)}'
        : walletAccountStatusLabel(account.status);
    return Container(
      padding: const EdgeInsets.all(BanzamiSpacing.lg),
      decoration: BoxDecoration(
        color: BanzamiColors.white,
        borderRadius: BanzamiRadius.lgAll,
        border: Border.all(color: BanzamiColors.gray200),
      ),
      child: Row(
        children: [
          Container(
            width: 40, height: 40,
            decoration: BoxDecoration(
              color: BanzamiColors.primary.withValues(alpha: 0.08),
              borderRadius: BanzamiRadius.mdAll,
            ),
            child: Icon(
                account.purpose == 'CAMPAIGN'
                    ? Icons.volunteer_activism_rounded
                    : Icons.savings_outlined,
                size: 20, color: BanzamiColors.primary),
          ),
          const SizedBox(width: BanzamiSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title,
                    style: BanzamiTextStyles.bodyMd.copyWith(fontWeight: FontWeight.w600),
                    maxLines: 1, overflow: TextOverflow.ellipsis),
                const SizedBox(height: 2),
                Text(subtitle,
                    style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.gray400)),
              ],
            ),
          ),
          const SizedBox(width: BanzamiSpacing.sm),
          Text(formatMinor(account.availableBalanceMinor, account.currency),
              style: BanzamiTextStyles.bodyMd.copyWith(
                  fontWeight: FontWeight.w700, color: BanzamiColors.gray900)),
        ],
      ),
    );
  }
}

/// The account's purpose as the API names it (wallet_accounts.purpose).
String walletAccountPurposeLabel(String purpose) => switch (purpose.toUpperCase()) {
      'CAMPAIGN'   => 'Campanha',
      'PROJECT'    => 'Projecto',
      'EVENT'      => 'Evento',
      'STORE'      => 'Loja',
      'ESCROW'     => 'Garantia',
      'RESERVE'    => 'Reserva',
      'SETTLEMENT' => 'Liquidação',
      'CUSTOM'     => 'Conta dedicada',
      _            => 'Conta segregada',
    };

/// The account's state in Portuguese — never the raw wire value.
String walletAccountStatusLabel(String status) => switch (status.toUpperCase()) {
      'ACTIVE'   => 'Activa',
      'INACTIVE' => 'Inactiva',
      'SETTLED'  => 'Liquidada',
      'CLOSED'   => 'Fechada',
      _          => 'Estado desconhecido',
    };

class _MessageState extends StatelessWidget {
  final IconData icon;
  final String text;
  const _MessageState({required this.icon, required this.text});

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(BanzamiSpacing.xxl),
      children: [
        const SizedBox(height: 80),
        Icon(icon, size: 44, color: BanzamiColors.gray400),
        const SizedBox(height: BanzamiSpacing.md),
        Text(text,
            textAlign: TextAlign.center,
            style: BanzamiTextStyles.bodyMd.copyWith(color: BanzamiColors.gray400)),
      ],
    );
  }
}
