import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:banzami_flutter/banzami_flutter.dart';

import '../models/merchant_payment_entry.dart';
import '../services/merchant_session_service.dart';
import '../widgets/merchant_dashboard_stats.dart';
import '../widgets/merchant_kpi_grid.dart';
import '../widgets/merchant_status_badge.dart';
import '../widgets/merchant_volume_chart.dart';
import 'campaign_accounts_screen.dart';
import 'charge_screen.dart';
import 'kyb_screen.dart';
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
  /// Why the balance is not shown, when it is not. Distinct from a zero
  /// balance, which is shown as 0 Kz.
  String? _balanceError;
  MerchantDashboardStats? _stats;
  List<MerchantPaymentEntry> _recent = const [];
  bool _loading = false;
  String? _error;
  // Live KYB-verified state (null until loaded). Overrides the stale login-time
  // session.verified so a sandbox auto-approval reflects immediately.
  bool? _kybVerified;
  // KYB + AML as the payout gate sees them (null until loaded / unreadable).
  // A withdrawal needs both — KYB alone never says "levantamentos disponíveis".
  MerchantComplianceStatus? _compliance;
  // The Business's latest withdrawals from GET /v1/payouts (null until loaded
  // or when unreadable — shown as such, never as "none").
  List<Payout>? _payouts;
  bool _payoutsFailed = false;

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
        .then((b) { if (mounted) setState(() { _balance = b; _balanceError = null; }); })
        .catchError((Object e) {
          final m = balanceFailureMessage(e);
          if (m == null) return; // the session ended; the app has left this screen
          err = m;
          if (mounted) setState(() => _balanceError = m);
        });

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

    final complianceFuture = client.getMerchantComplianceStatus().then((c) {
      if (mounted) setState(() => _compliance = c);
    }).catchError((_) { /* the card says it could not confirm */ });

    final payoutsFuture = client.listPayouts(limit: 3).then((p) {
      if (mounted) setState(() { _payouts = p; _payoutsFailed = false; });
    }).catchError((_) {
      if (mounted) setState(() => _payoutsFailed = true);
    });

    await Future.wait([
      balanceFuture, statsFuture, kybFuture, complianceFuture, payoutsFuture,
    ]);
    if (mounted) setState(() { _loading = false; _error = err; });
  }

  /// Every payment of the current month and the last-7-days window, from both
  /// sources — acquiring transactions and wallet-native payments (QR, link,
  /// session) — aggregated into [MerchantDashboardStats] plus the most recent
  /// received payments. No mocked data.
  Future<(MerchantDashboardStats, List<MerchantPaymentEntry>)> _loadStats(
      BanzamiClient client) async {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final monthStart = DateTime(now.year, now.month, 1);
    final sevenAgo = today.subtract(const Duration(days: 6));
    final windowStart =
        (monthStart.isBefore(sevenAgo) ? monthStart : sevenAgo).toUtc();

    Future<List<MerchantPaymentEntry>> acquiring() async {
      final out = <MerchantPaymentEntry>[];
      String? cursor;
      do {
        final page = await client.listMerchantTransactions(
          limit: 100,
          since: windowStart,
          cursor: cursor,
        );
        out.addAll(page.data.map(MerchantPaymentEntry.fromTransaction));
        cursor = page.hasMore ? page.nextCursor : null;
      } while (cursor != null);
      return out;
    }

    Future<List<MerchantPaymentEntry>> wallet() async {
      final out = <MerchantPaymentEntry>[];
      String? cursor;
      do {
        final page = await client.listMerchantWalletPayments(
          limit: 100,
          since: windowStart,
          cursor: cursor,
        );
        out.addAll(page.items.map(MerchantPaymentEntry.fromWalletPayment));
        cursor = page.items.isEmpty ? null : page.nextCursor;
      } while (cursor != null);
      return out;
    }

    final lists = await Future.wait([acquiring(), wallet()]);
    final all = mergePaymentEntries(lists);

    final stats = MerchantDashboardStats.compute(all, now: now);
    final recent = all.where((t) => t.isReceived).take(5).toList();
    return (stats, recent);
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
            balanceError: _balanceError,
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

              // Withdrawals — gated on what the payout endpoint enforces.
              _PayoutsCard(
                gate: withdrawGate(compliance: _compliance, kybVerified: verified),
                payouts: _payouts,
                failed: _payoutsFailed,
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

              // No "Pedidos de pagamento" entry: /v1/payment-requests is not
              // mounted on the gateway (RA-057 — a payment request has no
              // merchant party), so that screen could only ever fail.

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
  final String? balanceError;
  final bool isSandbox;
  final VoidCallback onRefresh;

  const _DashboardHeader({
    required this.session,
    required this.balance,
    this.balanceError,
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
          if (balance == null && balanceError != null) ...[
            const SizedBox(height: BanzamiSpacing.xs),
            Text(
              balanceError!,
              style: BanzamiTextStyles.bodySm.copyWith(
                color: BanzamiColors.white.withValues(alpha: 0.8),
              ),
            ),
          ],
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
            GestureDetector(
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const CampaignAccountsScreen()),
              ),
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: BanzamiSpacing.md,
                  vertical: 8,
                ),
                decoration: BoxDecoration(
                  // Same translucent style as the Business/Sandbox header chips.
                  color: BanzamiColors.white.withValues(alpha: 0.15),
                  borderRadius: BanzamiRadius.fullAll,
                  border: Border.all(color: BanzamiColors.white.withValues(alpha: 0.25)),
                ),
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  const Icon(Icons.savings_rounded, size: 15, color: BanzamiColors.white),
                  const SizedBox(width: 7),
                  Text(
                    'Fundos retidos ',
                    style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.white),
                  ),
                  Text(
                    formatMinor(balance!.heldMinor, balance!.currency),
                    style: BanzamiTextStyles.bodySm.copyWith(
                      color: BanzamiColors.white,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(width: 4),
                  Icon(Icons.chevron_right_rounded, size: 16,
                      color: BanzamiColors.white.withValues(alpha: 0.75)),
                ]),
              ),
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
    // Levantar are secondary (red-tinted icon on a white tile). Equal widths.
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
        label:  'Levantar',
        onTap:  onPayout,
        accent: true,
      ),
    ]);
  }
}

// =============================================================================
// Withdrawals (levantamentos)
// =============================================================================

/// Whether the Business may ask for a withdrawal, as the gateway decides it:
/// KYB AND AML approved (services/api-gateway compliance CanProcess).
enum WithdrawGate { ready, kybPending, amlPending, unknown }

WithdrawGate withdrawGate({
  required MerchantComplianceStatus? compliance,
  required bool kybVerified,
}) {
  if (compliance == null) {
    return kybVerified ? WithdrawGate.unknown : WithdrawGate.kybPending;
  }
  if (compliance.canWithdraw) return WithdrawGate.ready;
  if (!compliance.kybApproved) return WithdrawGate.kybPending;
  return WithdrawGate.amlPending;
}

class _PayoutsCard extends StatelessWidget {
  final WithdrawGate gate;
  final List<Payout>? payouts;
  final bool failed;
  final VoidCallback onVerify;
  final VoidCallback onPayout;

  const _PayoutsCard({
    required this.gate,
    required this.payouts,
    required this.failed,
    required this.onVerify,
    required this.onPayout,
  });

  @override
  Widget build(BuildContext context) {
    final note = switch (gate) {
      WithdrawGate.ready => null,
      WithdrawGate.kybPending =>
        'Verificação do negócio (KYB) necessária para pedir levantamentos.',
      WithdrawGate.amlPending =>
        'Negócio verificado. Os levantamentos ficam disponíveis quando a '
            'verificação AML estiver concluída.',
      WithdrawGate.unknown =>
        'Não foi possível confirmar agora se os levantamentos estão disponíveis.',
    };
    final (label, action) = switch (gate) {
      WithdrawGate.kybPending => ('Verificar negócio', onVerify),
      WithdrawGate.amlPending => ('Ver verificação', onVerify),
      _ => ('Pedir levantamento', onPayout),
    };

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
          Text('Levantamentos', style: BanzamiTextStyles.headingSm),
        ]),
        const SizedBox(height: BanzamiSpacing.sm),
        if (payouts != null && payouts!.isNotEmpty)
          ...payouts!.map((p) => PayoutRow(payout: p))
        else
          Text(
            failed
                ? 'Não foi possível carregar os levantamentos.'
                : payouts == null
                    ? 'A carregar levantamentos…'
                    : 'Ainda não pediu nenhum levantamento.',
            style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.gray400),
          ),
        const SizedBox(height: BanzamiSpacing.md),
        if (note != null)
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
                  note,
                  style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.warning),
                ),
              ),
            ]),
          ),
        const SizedBox(height: BanzamiSpacing.md),
        BanzamiSecondaryButton(label: label, onPressed: action),
      ]),
    );
  }
}

/// One requested withdrawal: amount asked, its state, when it was asked.
class PayoutRow extends StatelessWidget {
  final Payout payout;
  const PayoutRow({super.key, required this.payout});

  @override
  Widget build(BuildContext context) {
    final color = switch (payout.status.toUpperCase()) {
      'CONFIRMED' => BanzamiColors.success,
      'FAILED' || 'RETURNED' => BanzamiColors.error,
      _ => BanzamiColors.warning,
    };
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: BanzamiSpacing.xs),
      child: Row(children: [
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            MoneyAmount(payout.amountMinor, currency: payout.currency, size: MoneySize.sm),
            Text(
              BanzamiDateFormatter.formatActivityTime(payout.createdAt),
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
          child: Text(
            payout.statusLabel,
            style: BanzamiTextStyles.label.copyWith(color: color, fontSize: 11),
          ),
        ),
      ]),
    );
  }
}

// =============================================================================
// Recent payment tile + small helpers
// =============================================================================

class _RecentPaymentTile extends StatelessWidget {
  final MerchantPaymentEntry tx;
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
                  tx.description ?? tx.payer ?? 'Pagamento recebido',
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


/// What to tell a Business user when its balance could not be read. Each cause
/// reads differently — a zero balance is not a failure at all (it shows 0 Kz).
/// Returns null for an ended session: the app routes to the PIN screen, and a
/// message here would be read against screens that are already gone.
String? balanceFailureMessage(Object e) {
  if (e is BanzamiApiException) {
    if (e.statusCode == 401) return null;
    if (e.statusCode == 403 || e.statusCode == 404) {
      return 'A carteira desta conta Business ainda não está disponível.';
    }
    return 'O Banzami não conseguiu calcular o saldo agora. Tente novamente.';
  }
  if (e is BanzamiNetworkException) return 'Sem ligação ao Banzami. Tente novamente.';
  return 'Não foi possível carregar o saldo.';
}
