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
  int     _todayMinor  = 0;
  int     _monthMinor  = 0;
  bool    _loading     = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<(int, int)> _loadStats(BanzamiClient client) async {
    final now        = DateTime.now().toLocal();
    final monthStart = DateTime(now.year, now.month, 1).toUtc();
    int today = 0, month = 0;
    String? cursor;

    do {
      final page = await client.listMerchantTransactions(
        limit:  100,
        since:  monthStart,
        cursor: cursor,
      );
      for (final tx in page.data) {
        if (!tx.isCompleted) continue;
        month += tx.amountMinor;
        final local = tx.createdAt.toLocal();
        if (local.year == now.year && local.month == now.month && local.day == now.day) {
          today += tx.amountMinor;
        }
      }
      cursor = page.hasMore ? page.nextCursor : null;
    } while (cursor != null);

    return (today, month);
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

    final linksFuture = client
        .listPaymentLinks(merchantId: session.merchantId, limit: 5)
        .then((p) { if (mounted) setState(() => _recent = p.data); })
        .catchError((_) { err ??= 'Não foi possível carregar os dados.'; });

    final statsFuture = _loadStats(client)
        .then((r) {
          if (mounted) setState(() { _todayMinor = r.$1; _monthMinor = r.$2; });
        })
        .catchError((_) {});

    await Future.wait([balanceFuture, linksFuture, statsFuture]);

    if (mounted) setState(() { _loading = false; _error = err; });
  }

  @override
  Widget build(BuildContext context) {
    final session = context.read<MerchantSessionService>().session!;

    return Scaffold(
      backgroundColor: BanzamiColors.offWhite,
      body: RefreshIndicator(
        color:     BanzamiColors.wine,
        onRefresh: _load,
        child: _loading && _balance == null
            ? const Center(child: CircularProgressIndicator(color: BanzamiColors.wine))
            : _error != null && _balance == null
                ? _buildError()
                : _buildContent(session),
      ),
    );
  }

  Widget _buildError() {
    return Center(
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        const Icon(Icons.error_outline_rounded, color: BanzamiColors.error, size: 40),
        const SizedBox(height: BanzamiSpacing.md),
        Text(_error!, style: BanzamiTextStyles.bodyMd.copyWith(color: BanzamiColors.gray400)),
        const SizedBox(height: BanzamiSpacing.lg),
        TextButton(onPressed: _load, child: const Text('Tentar novamente')),
      ]),
    );
  }

  Widget _buildContent(MerchantSession session) {
    final currency = _balance?.currency ?? 'AOA';
    return CustomScrollView(
      slivers: [
        // Gradient header
        SliverToBoxAdapter(
          child: _DashboardHeader(
            session:  session,
            balance:  _balance,
            onRefresh: _load,
          ),
        ),

        // Stats + CTA + recent
        SliverPadding(
          padding: const EdgeInsets.all(BanzamiSpacing.lg),
          sliver: SliverList(
            delegate: SliverChildListDelegate([
              // Stat cards row
              Row(children: [
                Expanded(child: _StatCard(
                  icon:  Icons.today_rounded,
                  label: 'Hoje',
                  value: formatMinor(_todayMinor, currency),
                )),
                const SizedBox(width: BanzamiSpacing.md),
                Expanded(child: _StatCard(
                  icon:  Icons.calendar_month_rounded,
                  label: 'Este mês',
                  value: formatMinor(_monthMinor, currency),
                )),
              ]),

              const SizedBox(height: BanzamiSpacing.lg),

              // CTA
              _NewChargeButton(onTap: () => Navigator.of(context)
                  .push(MaterialPageRoute(builder: (_) => const ChargeScreen()))
                  .then((_) => _load())),

              // Recent charges
              if (_recent.isNotEmpty) ...[
                const SizedBox(height: BanzamiSpacing.xl),
                const Padding(
                  padding: EdgeInsets.only(
                    left: BanzamiSpacing.xs, bottom: BanzamiSpacing.sm,
                  ),
                  child: Text(
                    'Cobranças recentes',
                    style: BanzamiTextStyles.headingSm,
                  ),
                ),
                ..._recent.asMap().entries.map((e) {
                  final i      = e.key;
                  final link   = e.value;
                  final isFirst = i == 0;
                  final isLast  = i == _recent.length - 1;
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
                        _LinkTile(link: link),
                        if (!isLast)
                          const Divider(height: 1, indent: 64, color: BanzamiColors.gray200),
                      ],
                    ),
                  );
                }),
              ],

              const SizedBox(height: BanzamiSpacing.page),
            ]),
          ),
        ),
      ],
    );
  }
}

// =============================================================================
// Gradient header
// =============================================================================

class _DashboardHeader extends StatelessWidget {
  final MerchantSession  session;
  final MerchantBalance? balance;
  final VoidCallback     onRefresh;

  const _DashboardHeader({
    required this.session,
    required this.balance,
    required this.onRefresh,
  });

  @override
  Widget build(BuildContext context) {
    final firstName = session.merchantName.split(' ').first;

    return Container(
      decoration: const BoxDecoration(gradient: BanzamiGradients.wine),
      padding: EdgeInsets.fromLTRB(
        BanzamiSpacing.xl,
        MediaQuery.of(context).padding.top + BanzamiSpacing.lg,
        BanzamiSpacing.xl,
        BanzamiSpacing.xxl,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Greeting + refresh
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Olá, $firstName',
                      style: BanzamiTextStyles.headingMd.copyWith(
                        color:      BanzamiColors.white,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'Painel de negócio',
                      style: BanzamiTextStyles.bodySm.copyWith(
                        color: BanzamiColors.white.withValues(alpha: 0.65),
                      ),
                    ),
                  ],
                ),
              ),
              GestureDetector(
                onTap: onRefresh,
                child: Container(
                  width:  38,
                  height: 38,
                  decoration: BoxDecoration(
                    color:  BanzamiColors.white.withValues(alpha: 0.15),
                    shape:  BoxShape.circle,
                    border: Border.all(
                      color: BanzamiColors.white.withValues(alpha: 0.20),
                      width: 1,
                    ),
                  ),
                  child: const Icon(
                    Icons.refresh_rounded,
                    color: BanzamiColors.white,
                    size:  20,
                  ),
                ),
              ),
            ],
          ),

          const SizedBox(height: BanzamiSpacing.xl),

          // Balance
          Text(
            'Saldo disponível',
            style: BanzamiTextStyles.bodySm.copyWith(
              color: BanzamiColors.white.withValues(alpha: 0.65),
            ),
          ),
          const SizedBox(height: BanzamiSpacing.xs),
          Text(
            balance != null
                ? formatMinor(balance!.availableMinor, balance!.currency)
                : '— Kz',
            style: BanzamiTextStyles.displayLg.copyWith(
              color:      BanzamiColors.white,
              fontWeight: FontWeight.w700,
            ),
          ),

          if (balance != null && balance!.reservedMinor > 0) ...[
            const SizedBox(height: BanzamiSpacing.xs),
            Text(
              'Reservado: ${formatMinor(balance!.reservedMinor, balance!.currency)}',
              style: BanzamiTextStyles.bodySm.copyWith(
                color: BanzamiColors.white.withValues(alpha: 0.50),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

// =============================================================================
// Stat card
// =============================================================================

class _StatCard extends StatelessWidget {
  final IconData icon;
  final String   label;
  final String   value;

  const _StatCard({
    required this.icon,
    required this.label,
    required this.value,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(BanzamiSpacing.md),
      decoration: const BoxDecoration(
        color:        BanzamiColors.white,
        borderRadius: BanzamiRadius.xlAll,
        boxShadow:    BanzamiShadows.card,
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Container(
            width:  28,
            height: 28,
            decoration: BoxDecoration(
              color:        BanzamiColors.wine.withValues(alpha: 0.08),
              borderRadius: BanzamiRadius.smAll,
            ),
            child: Icon(icon, color: BanzamiColors.wine, size: 15),
          ),
          const SizedBox(width: BanzamiSpacing.sm),
          Text(
            label,
            style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.gray400),
          ),
        ]),
        const SizedBox(height: BanzamiSpacing.sm),
        Text(
          value,
          style: BanzamiTextStyles.headingSm.copyWith(fontWeight: FontWeight.w700),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
      ]),
    );
  }
}

// =============================================================================
// CTA button
// =============================================================================

class _NewChargeButton extends StatelessWidget {
  final VoidCallback onTap;
  const _NewChargeButton({required this.onTap});

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
          padding:   const EdgeInsets.symmetric(vertical: 16),
          shape:     const RoundedRectangleBorder(borderRadius: BanzamiRadius.lgAll),
          textStyle: BanzamiTextStyles.headingSm,
          elevation: 0,
        ),
      ),
    );
  }
}

// =============================================================================
// Recent charge tile
// =============================================================================

class _LinkTile extends StatelessWidget {
  final PaymentLink link;
  const _LinkTile({required this.link});

  @override
  Widget build(BuildContext context) {
    final (color, label) = switch (link.status) {
      PaymentLinkStatus.active    => (BanzamiColors.success, 'Activo'),
      PaymentLinkStatus.used      => (BanzamiColors.wine,    'Pago'),
      PaymentLinkStatus.expired   => (BanzamiColors.gray400, 'Expirado'),
      PaymentLinkStatus.cancelled => (BanzamiColors.error,   'Cancelado'),
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
          child: Icon(Icons.receipt_outlined, color: color, size: 20),
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
          child: Text(label, style: BanzamiTextStyles.label.copyWith(color: color, fontSize: 11)),
        ),
      ]),
    );
  }
}
