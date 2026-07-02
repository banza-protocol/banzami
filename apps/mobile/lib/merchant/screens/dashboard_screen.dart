import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:banzami_flutter/banzami_flutter.dart';

import '../services/merchant_session_service.dart';
import '../widgets/merchant_dashboard_stats.dart';
import '../widgets/merchant_kpi_grid.dart';
import '../widgets/merchant_status_badge.dart';
import '../widgets/merchant_volume_chart.dart';
import 'charge_screen.dart';
import 'kyb_screen.dart';
import 'payment_requests_screen.dart';
import 'payout_screen.dart';

/// Banzami Business dashboard — a merchant-oriented panel (KPIs, 7-day volume,
/// settlement summary, recent payments) built entirely from real backend data.
///
/// [onSwitchTab] lets quick actions jump to the QR / History tabs owned by the
/// parent [MerchantMainScreen]; it is optional so the screen renders in tests
/// and previews without the tab host.
class DashboardScreen extends StatefulWidget {
  final void Function(int index)? onSwitchTab;

  const DashboardScreen({super.key, this.onSwitchTab});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  MerchantBalance? _balance;
  MerchantDashboardStats? _stats;
  List<MerchantTransaction> _recent = const [];
  bool _loading = false;
  String? _error;
  // Live KYB-verified state (null until loaded). Overrides the stale login-time
  // session.verified so a sandbox auto-approval reflects immediately.
  bool? _kybVerified;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (_loading) return;
    setState(() { _loading = true; _error = null; });

    final sessionService = context.read<MerchantSessionService>();
    final session = sessionService.session!;
    final client = context.read<BanzamiClient>();
    String? err;

    final balanceFuture = client
        .getMerchantBalance(session.walletId)
        .then((b) { if (mounted) setState(() => _balance = b); })
        .catchError((_) { err = 'Não foi possível carregar o saldo.'; });

    final statsFuture = _loadStats(client)
        .then((r) {
          if (mounted) {
            setState(() { _stats = r.$1; _recent = r.$2; });
          }
        })
        .catchError((_) { err ??= 'Não foi possível carregar os dados.'; });

    // Live KYB status — best-effort. In SANDBOX the application is auto-approved,
    // so the login-time session.verified snapshot can be stale; reconcile it here
    // (and persist) so the dashboard banner + payout gating match the KYB screen.
    final kybFuture = client.getMerchantKybStatus().then((st) async {
      final verified = st.verified || st.kybStatus == 'APPROVED';
      if (mounted) setState(() => _kybVerified = verified);
      await sessionService.setVerified(verified);
    }).catchError((_) { /* leave banner as-is on a transient failure */ });

    await Future.wait([balanceFuture, statsFuture, kybFuture]);
    if (mounted) setState(() { _loading = false; _error = err; });
  }

  /// One paginated transaction read covering both the current month and the
  /// last-7-days window, aggregated into [MerchantDashboardStats] plus the
  /// most recent received payments. No mocked data — everything is derived
  /// from real `listMerchantTransactions` results.
  Future<(MerchantDashboardStats, List<MerchantTransaction>)> _loadStats(
      BanzamiClient client) async {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final monthStart = DateTime(now.year, now.month, 1);
    final sevenAgo = today.subtract(const Duration(days: 6));
    final windowStart =
        (monthStart.isBefore(sevenAgo) ? monthStart : sevenAgo).toUtc();

    final all = <MerchantTransaction>[];
    String? cursor;
    do {
      final page = await client.listMerchantTransactions(
        limit: 100,
        since: windowStart,
        cursor: cursor,
      );
      all.addAll(page.data);
      cursor = page.hasMore ? page.nextCursor : null;
    } while (cursor != null);

    final stats = MerchantDashboardStats.compute(all, now: now);

    final recent = all.where((t) => t.isCompleted).toList()
      ..sort((a, b) => b.createdAt.compareTo(a.createdAt));

    return (stats, recent.take(5).toList());
  }

  @override
  Widget build(BuildContext context) {
    final session = context.read<MerchantSessionService>().session!;

    return Scaffold(
      backgroundColor: BanzamiColors.offWhite,
      body: RefreshIndicator(
        color: BanzamiColors.primary,
        onRefresh: _load,
        child: _loading && _balance == null && _stats == null
            ? const Center(child: CircularProgressIndicator(color: BanzamiColors.primary))
            : _error != null && _balance == null && _stats == null
                ? _buildError()
                : _buildContent(session),
      ),
    );
  }

  Widget _buildError() {
    return ListView(
      children: [
        const SizedBox(height: 120),
        const Icon(Icons.error_outline_rounded, color: BanzamiColors.error, size: 40),
        const SizedBox(height: BanzamiSpacing.md),
        Center(
          child: Text(_error!,
              style: BanzamiTextStyles.bodyMd.copyWith(color: BanzamiColors.gray400)),
        ),
        const SizedBox(height: BanzamiSpacing.lg),
        Center(child: BanzamiGhostButton(label: 'Tentar novamente', onPressed: _load)),
      ],
    );
  }

  Widget _buildContent(MerchantSession session) {
    final currency = _balance?.currency ?? 'AOA';
    final isSandbox = session.isSandbox;
    final stats = _stats;
    // Prefer the live KYB status once loaded; fall back to the session snapshot.
    final verified = _kybVerified ?? session.verified;

    return CustomScrollView(
      slivers: [
        SliverToBoxAdapter(
          child: _DashboardHeader(
            session: session,
            balance: _balance,
            isSandbox: isSandbox,
            onRefresh: _load,
          ),
        ),
        SliverPadding(
          padding: const EdgeInsets.all(BanzamiSpacing.lg),
          sliver: SliverList(
            delegate: SliverChildListDelegate([
              // Shared SANDBOX banner (same component as the Consumer app).
              if (isSandbox) ...[
                const BanzamiSandboxBanner(),
                const SizedBox(height: BanzamiSpacing.lg),
              ],

              // KYB banner — only shown while NOT verified (nothing to nudge
              // once the business is verified).
              if (!verified) ...[
                _KybRow(onVerify: () => _open(const KybScreen())),
                const SizedBox(height: BanzamiSpacing.lg),
              ],

              // Quick actions
              _QuickActions(
                onCharge: () => _open(const ChargeScreen()),
                onQr: () => widget.onSwitchTab?.call(2),
                onPayout: () => _open(const PayoutScreen()),
              ),
              const SizedBox(height: BanzamiSpacing.xl),

              // KPIs
              if (stats != null) ...[
                MerchantKpiGrid(stats: stats, currency: currency),
                const SizedBox(height: BanzamiSpacing.lg),
                MerchantVolumeChart(days: stats.last7Days, currency: currency),
                const SizedBox(height: BanzamiSpacing.lg),
              ],

              // Settlement / payout summary (no merchant settlement endpoint yet)
              _SettlementCard(
                verified: verified,
                onVerify: () => _open(const KybScreen()),
                onPayout: () => _open(const PayoutScreen()),
              ),
              const SizedBox(height: BanzamiSpacing.xl),

              // Recent received payments
              const _SectionTitle('Pagamentos recentes'),
              const SizedBox(height: BanzamiSpacing.sm),
              if (_recent.isEmpty)
                const _EmptyHint('Ainda não há pagamentos recebidos.')
              else
                ..._recent.asMap().entries.map((e) => _RecentPaymentTile(
                      tx: e.value,
                      isFirst: e.key == 0,
                      isLast: e.key == _recent.length - 1,
                    )),

              const SizedBox(height: BanzamiSpacing.sm),
              BanzamiGhostButton(
                label:     'Pedidos de pagamento',
                onPressed: () => _open(const PaymentRequestsScreen()),
              ),

              const SizedBox(height: BanzamiSpacing.page),
            ]),
          ),
        ),
      ],
    );
  }

  void _open(Widget screen) {
    Navigator.of(context)
        .push(MaterialPageRoute(builder: (_) => screen))
        .then((_) => _load());
  }
}

// =============================================================================
// Header
// =============================================================================

class _DashboardHeader extends StatelessWidget {
  final MerchantSession session;
  final MerchantBalance? balance;
  final bool isSandbox;
  final VoidCallback onRefresh;

  const _DashboardHeader({
    required this.session,
    required this.balance,
    required this.isSandbox,
    required this.onRefresh,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(gradient: BanzamiGradients.primary),
      padding: EdgeInsets.fromLTRB(
        BanzamiSpacing.xl,
        MediaQuery.of(context).padding.top + BanzamiSpacing.lg,
        BanzamiSpacing.xl,
        BanzamiSpacing.xxl,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      session.merchantName,
                      style: BanzamiTextStyles.headingMd.copyWith(
                        color: BanzamiColors.white,
                        fontWeight: FontWeight.w700,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
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
                  width: 38,
                  height: 38,
                  decoration: BoxDecoration(
                    color: BanzamiColors.white.withValues(alpha: 0.15),
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: BanzamiColors.white.withValues(alpha: 0.20),
                      width: 1,
                    ),
                  ),
                  child: const Icon(Icons.refresh_rounded, color: BanzamiColors.white, size: 20),
                ),
              ),
            ],
          ),

          const SizedBox(height: BanzamiSpacing.md),
          Row(children: [
            const _HeaderChip(label: 'Business', icon: Icons.storefront_rounded),
            if (isSandbox) ...[
              const SizedBox(width: BanzamiSpacing.sm),
              const _HeaderChip(label: 'Sandbox', icon: Icons.science_rounded),
            ],
          ]),

          const SizedBox(height: BanzamiSpacing.xl),
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
              color: BanzamiColors.white,
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
          if (balance != null && balance!.heldMinor > 0) ...[
            const SizedBox(height: BanzamiSpacing.sm),
            Container(
              padding: const EdgeInsets.symmetric(
                horizontal: BanzamiSpacing.md,
                vertical: 7,
              ),
              decoration: BoxDecoration(
                color: BanzamiColors.white.withValues(alpha: 0.16),
                borderRadius: BanzamiRadius.fullAll,
                border: Border.all(color: BanzamiColors.white.withValues(alpha: 0.28)),
              ),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                const Icon(Icons.savings_rounded, size: 15, color: BanzamiColors.white),
                const SizedBox(width: 7),
                Text(
                  'Retido em campanhas ',
                  style: BanzamiTextStyles.bodySm.copyWith(
                    color: BanzamiColors.white.withValues(alpha: 0.85),
                  ),
                ),
                Text(
                  formatMinor(balance!.heldMinor, balance!.currency),
                  style: BanzamiTextStyles.bodySm.copyWith(
                    color: BanzamiColors.white,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ]),
            ),
          ],
        ],
      ),
    );
  }
}

class _HeaderChip extends StatelessWidget {
  final String label;
  final IconData icon;
  const _HeaderChip({required this.label, required this.icon});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: BanzamiSpacing.md,
        vertical: BanzamiSpacing.xs,
      ),
      decoration: BoxDecoration(
        color: BanzamiColors.white.withValues(alpha: 0.15),
        borderRadius: BanzamiRadius.fullAll,
        border: Border.all(color: BanzamiColors.white.withValues(alpha: 0.25)),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon, size: 12, color: BanzamiColors.white),
        const SizedBox(width: 4),
        Text(
          label,
          style: BanzamiTextStyles.label.copyWith(color: BanzamiColors.white, fontSize: 11),
        ),
      ]),
    );
  }
}

// =============================================================================
// KYB status row
// =============================================================================

class _KybRow extends StatelessWidget {
  final VoidCallback onVerify;
  const _KybRow({required this.onVerify});

  // Only the pending state is shown — the verified badge is intentionally
  // hidden (the caller renders this only while not verified).
  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onVerify,
      child: const Align(
        alignment: Alignment.centerLeft,
        child: MerchantStatusBadge(
          label: 'Verificação (KYB) pendente',
          icon: Icons.error_outline_rounded,
          tone: MerchantBadgeTone.warning,
        ),
      ),
    );
  }
}

// =============================================================================
// Quick actions
// =============================================================================

class _QuickActions extends StatelessWidget {
  final VoidCallback onCharge;
  final VoidCallback onQr;
  final VoidCallback onPayout;

  const _QuickActions({
    required this.onCharge,
    required this.onQr,
    required this.onPayout,
  });

  @override
  Widget build(BuildContext context) {
    // Visual hierarchy via the same BanzamiActionTile design-system component:
    // 'Cobrar' is the primary CTA (premium red gradient, stronger shadow), QR and
    // Payout are secondary (red-tinted icon on a white tile). Equal widths.
    return Row(children: [
      BanzamiActionTile(
        icon:    Icons.add_circle_outline_rounded,
        label:   'Cobrar',
        onTap:   onCharge,
        primary: true,
      ),
      const SizedBox(width: BanzamiSpacing.md),
      BanzamiActionTile(
        icon:   Icons.qr_code_rounded,
        label:  'QR',
        onTap:  onQr,
        accent: true,
      ),
      const SizedBox(width: BanzamiSpacing.md),
      BanzamiActionTile(
        icon:   Icons.account_balance_rounded,
        label:  'Payout',
        onTap:  onPayout,
        accent: true,
      ),
    ]);
  }
}

// =============================================================================
// Settlement / payout summary
// =============================================================================

class _SettlementCard extends StatelessWidget {
  final bool verified;
  final VoidCallback onVerify;
  final VoidCallback onPayout;

  const _SettlementCard({
    required this.verified,
    required this.onVerify,
    required this.onPayout,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(BanzamiSpacing.lg),
      decoration: const BoxDecoration(
        color: BanzamiColors.white,
        borderRadius: BanzamiRadius.xlAll,
        boxShadow: BanzamiShadows.card,
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Row(children: [
          Icon(Icons.account_balance_rounded, color: BanzamiColors.primary, size: 18),
          SizedBox(width: BanzamiSpacing.sm),
          Text('Liquidações e payouts', style: BanzamiTextStyles.headingSm),
        ]),
        const SizedBox(height: BanzamiSpacing.sm),
        Text(
          'Os teus payouts e liquidações aparecerão aqui.',
          style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.gray400),
        ),
        const SizedBox(height: BanzamiSpacing.md),
        if (!verified)
          Container(
            padding: const EdgeInsets.all(BanzamiSpacing.md),
            decoration: const BoxDecoration(
              color: BanzamiColors.warningBg,
              borderRadius: BanzamiRadius.lgAll,
            ),
            child: Row(children: [
              const Icon(Icons.info_outline_rounded, color: BanzamiColors.warning, size: 16),
              const SizedBox(width: BanzamiSpacing.sm),
              Expanded(
                child: Text(
                  'Verificação (KYB) necessária para solicitar payouts.',
                  style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.warning),
                ),
              ),
            ]),
          )
        else
          const SizedBox.shrink(),
        const SizedBox(height: BanzamiSpacing.md),
        BanzamiSecondaryButton(
          label:     verified ? 'Solicitar payout' : 'Verificar negócio',
          onPressed: verified ? onPayout : onVerify,
        ),
      ]),
    );
  }
}

// =============================================================================
// Recent payment tile + small helpers
// =============================================================================

class _RecentPaymentTile extends StatelessWidget {
  final MerchantTransaction tx;
  final bool isFirst;
  final bool isLast;

  const _RecentPaymentTile({required this.tx, required this.isFirst, required this.isLast});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: BanzamiColors.white,
        borderRadius: BorderRadius.vertical(
          top: Radius.circular(isFirst ? BanzamiRadius.xl : 0),
          bottom: Radius.circular(isLast ? BanzamiRadius.xl : 0),
        ),
        boxShadow: isFirst ? BanzamiShadows.card : BanzamiShadows.none,
      ),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: BanzamiSpacing.lg,
            vertical: BanzamiSpacing.md,
          ),
          child: Row(children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: BanzamiColors.success.withValues(alpha: 0.10),
                borderRadius: BanzamiRadius.mdAll,
              ),
              child: const Icon(Icons.arrow_downward_rounded, color: BanzamiColors.success, size: 20),
            ),
            const SizedBox(width: BanzamiSpacing.md),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(
                  tx.description?.isNotEmpty == true ? tx.description! : 'Pagamento recebido',
                  style: BanzamiTextStyles.bodyMd.copyWith(fontWeight: FontWeight.w500),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                Text(
                  BanzamiDateFormatter.formatListTime(tx.createdAt),
                  style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.gray400),
                ),
              ]),
            ),
            const SizedBox(width: BanzamiSpacing.md),
            Text(
              '+${formatMinor(tx.amountMinor, tx.currency)}',
              style: BanzamiTextStyles.bodyMd.copyWith(
                color: BanzamiColors.success,
                fontWeight: FontWeight.w700,
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
          ]),
        ),
        if (!isLast)
          const Divider(height: 1, indent: 64, color: BanzamiColors.gray200),
      ]),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  final String text;
  const _SectionTitle(this.text);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(left: BanzamiSpacing.xs),
      child: Text(text, style: BanzamiTextStyles.headingSm),
    );
  }
}

class _EmptyHint extends StatelessWidget {
  final String text;
  const _EmptyHint(this.text);

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(BanzamiSpacing.lg),
      decoration: const BoxDecoration(
        color: BanzamiColors.white,
        borderRadius: BanzamiRadius.xlAll,
        boxShadow: BanzamiShadows.card,
      ),
      child: Text(
        text,
        style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.gray400),
      ),
    );
  }
}
