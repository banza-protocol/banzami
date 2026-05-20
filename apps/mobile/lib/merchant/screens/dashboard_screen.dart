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
  int     _todayMinor  = 0;
  int     _monthMinor  = 0;
  bool    _loading     = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<(int, int)> _loadStats(BanzaClient client) async {
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
    final client  = context.read<BanzaClient>();
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
      backgroundColor: BanzaColors.offWhite,
      body: RefreshIndicator(
        color:     BanzaColors.wine,
        onRefresh: _load,
        child: _loading && _balance == null
            ? const Center(child: CircularProgressIndicator(color: BanzaColors.wine))
            : _error != null && _balance == null
                ? _buildError()
                : _buildContent(session),
      ),
    );
  }

  Widget _buildError() {
    return Center(
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        const Icon(Icons.error_outline_rounded, color: BanzaColors.error, size: 40),
        const SizedBox(height: BanzaSpacing.md),
        Text(_error!, style: BanzaTextStyles.bodyMd.copyWith(color: BanzaColors.gray400)),
        const SizedBox(height: BanzaSpacing.lg),
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
          padding: const EdgeInsets.all(BanzaSpacing.lg),
          sliver: SliverList(
            delegate: SliverChildListDelegate([
              // Stat cards row
              Row(children: [
                Expanded(child: _StatCard(
                  icon:  Icons.today_rounded,
                  label: 'Hoje',
                  value: formatMinor(_todayMinor, currency),
                )),
                const SizedBox(width: BanzaSpacing.md),
                Expanded(child: _StatCard(
                  icon:  Icons.calendar_month_rounded,
                  label: 'Este mês',
                  value: formatMinor(_monthMinor, currency),
                )),
              ]),

              const SizedBox(height: BanzaSpacing.lg),

              // CTA
              _NewChargeButton(onTap: () => Navigator.of(context)
                  .push(MaterialPageRoute(builder: (_) => const ChargeScreen()))
                  .then((_) => _load())),

              // Recent charges
              if (_recent.isNotEmpty) ...[
                const SizedBox(height: BanzaSpacing.xl),
                const Padding(
                  padding: EdgeInsets.only(
                    left: BanzaSpacing.xs, bottom: BanzaSpacing.sm,
                  ),
                  child: Text(
                    'Cobranças recentes',
                    style: BanzaTextStyles.headingSm,
                  ),
                ),
                ..._recent.asMap().entries.map((e) {
                  final i      = e.key;
                  final link   = e.value;
                  final isFirst = i == 0;
                  final isLast  = i == _recent.length - 1;
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
                        _LinkTile(link: link),
                        if (!isLast)
                          const Divider(height: 1, indent: 64, color: BanzaColors.gray200),
                      ],
                    ),
                  );
                }),
              ],

              const SizedBox(height: BanzaSpacing.page),
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
      decoration: const BoxDecoration(gradient: BanzaGradients.wine),
      padding: EdgeInsets.fromLTRB(
        BanzaSpacing.xl,
        MediaQuery.of(context).padding.top + BanzaSpacing.lg,
        BanzaSpacing.xl,
        BanzaSpacing.xxl,
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
                      style: BanzaTextStyles.headingMd.copyWith(
                        color:      BanzaColors.white,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'Painel de negócio',
                      style: BanzaTextStyles.bodySm.copyWith(
                        color: BanzaColors.white.withValues(alpha: 0.65),
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
                    color:  BanzaColors.white.withValues(alpha: 0.15),
                    shape:  BoxShape.circle,
                    border: Border.all(
                      color: BanzaColors.white.withValues(alpha: 0.20),
                      width: 1,
                    ),
                  ),
                  child: const Icon(
                    Icons.refresh_rounded,
                    color: BanzaColors.white,
                    size:  20,
                  ),
                ),
              ),
            ],
          ),

          const SizedBox(height: BanzaSpacing.xl),

          // Balance
          Text(
            'Saldo disponível',
            style: BanzaTextStyles.bodySm.copyWith(
              color: BanzaColors.white.withValues(alpha: 0.65),
            ),
          ),
          const SizedBox(height: BanzaSpacing.xs),
          Text(
            balance != null
                ? formatMinor(balance!.availableMinor, balance!.currency)
                : '— Kz',
            style: BanzaTextStyles.displayLg.copyWith(
              color:      BanzaColors.white,
              fontWeight: FontWeight.w700,
            ),
          ),

          if (balance != null && balance!.reservedMinor > 0) ...[
            const SizedBox(height: BanzaSpacing.xs),
            Text(
              'Reservado: ${formatMinor(balance!.reservedMinor, balance!.currency)}',
              style: BanzaTextStyles.bodySm.copyWith(
                color: BanzaColors.white.withValues(alpha: 0.50),
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
      padding: const EdgeInsets.all(BanzaSpacing.md),
      decoration: const BoxDecoration(
        color:        BanzaColors.white,
        borderRadius: BanzaRadius.xlAll,
        boxShadow:    BanzaShadows.card,
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Container(
            width:  28,
            height: 28,
            decoration: BoxDecoration(
              color:        BanzaColors.wine.withValues(alpha: 0.08),
              borderRadius: BanzaRadius.smAll,
            ),
            child: Icon(icon, color: BanzaColors.wine, size: 15),
          ),
          const SizedBox(width: BanzaSpacing.sm),
          Text(
            label,
            style: BanzaTextStyles.bodySm.copyWith(color: BanzaColors.gray400),
          ),
        ]),
        const SizedBox(height: BanzaSpacing.sm),
        Text(
          value,
          style: BanzaTextStyles.headingSm.copyWith(fontWeight: FontWeight.w700),
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
          backgroundColor: BanzaColors.wine,
          foregroundColor: BanzaColors.white,
          padding:   const EdgeInsets.symmetric(vertical: 16),
          shape:     const RoundedRectangleBorder(borderRadius: BanzaRadius.lgAll),
          textStyle: BanzaTextStyles.headingSm,
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
      PaymentLinkStatus.active    => (BanzaColors.success, 'Activo'),
      PaymentLinkStatus.used      => (BanzaColors.wine,    'Pago'),
      PaymentLinkStatus.expired   => (BanzaColors.gray400, 'Expirado'),
      PaymentLinkStatus.cancelled => (BanzaColors.error,   'Cancelado'),
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
          child: Icon(Icons.receipt_outlined, color: color, size: 20),
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
          child: Text(label, style: BanzaTextStyles.label.copyWith(color: color, fontSize: 11)),
        ),
      ]),
    );
  }
}
