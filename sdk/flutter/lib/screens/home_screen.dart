import 'package:flutter/material.dart';

import '../client/banzami_environment.dart';
import '../client/consumer_public_client.dart';
import '../models/activity_item.dart';
import '../models/wallet_balance.dart';
import '../theme/banzami_theme.dart';
import '../utils/banzami_toast.dart';
import '../widgets/banzami_sandbox_banner.dart';
import '../utils/camera_permission.dart';
import '../utils/date_formatter.dart';
import '../utils/error_messages.dart';
import '../utils/money_format.dart';
import '../widgets/banzami_components.dart';
import 'receive_screen.dart';
import 'scan_screen.dart';
import 'send_screen.dart';

class BanzamiHomeScreen extends StatefulWidget {
  final ConsumerPublicClient client;
  final String consumerId;
  final String handle;
  final String? displayName;
  final String? logoAssetPath;
  final VoidCallback? onNotifications;

  /// Called when the user taps the "Receber" quick action.
  /// When provided the host app handles routing (e.g. switching a bottom-nav
  /// tab) instead of pushing the standalone BanzamiReceiveScreen.
  final VoidCallback? onReceive;
  final BanzamiEnvironment environment;

  /// Optional external signal (a [Listenable], e.g. the host app's payment
  /// refresh bus). Whenever it notifies, the home reloads its balance and
  /// activity from the backend via `getBalance()` — never a local mutation.
  /// This is how a payment made on a screen the home didn't push (deep link /
  /// QR / notification) refreshes the displayed balance with no pull-to-refresh.
  final Listenable? refreshSignal;

  const BanzamiHomeScreen({
    super.key,
    required this.client,
    required this.consumerId,
    required this.handle,
    this.displayName,
    this.logoAssetPath,
    this.onNotifications,
    this.onReceive,
    this.environment = BanzamiEnvironment.production,
    this.refreshSignal,
  });

  @override
  State<BanzamiHomeScreen> createState() => _BanzamiHomeScreenState();
}

class _BanzamiHomeScreenState extends State<BanzamiHomeScreen>
    with SingleTickerProviderStateMixin {
  WalletBalance? _balance;
  List<ActivityItem> _activity = [];
  bool _loadingBalance = true;
  bool _loadingActivity = true;
  bool _balanceVisible = true;
  String? _error;

  late final AnimationController _entryCtrl;
  late final Animation<double> _entryFade;
  late final Animation<Offset> _entrySlide;

  @override
  void initState() {
    super.initState();
    _entryCtrl = AnimationController(
      vsync: this,
      duration: BanzamiMotion.slow,
    );
    _entryFade =
        CurvedAnimation(parent: _entryCtrl, curve: BanzamiMotion.decelerate);
    _entrySlide = Tween<Offset>(
      begin: const Offset(0, 0.04),
      end: Offset.zero,
    ).animate(
        CurvedAnimation(parent: _entryCtrl, curve: BanzamiMotion.decelerate));

    _load();
    _entryCtrl.forward();

    // Reload from the backend whenever the host app signals a payment completed
    // (deep-link / QR / notification flow the home didn't push itself).
    widget.refreshSignal?.addListener(_onExternalRefresh);
  }

  @override
  void didUpdateWidget(covariant BanzamiHomeScreen old) {
    super.didUpdateWidget(old);
    if (old.refreshSignal != widget.refreshSignal) {
      old.refreshSignal?.removeListener(_onExternalRefresh);
      widget.refreshSignal?.addListener(_onExternalRefresh);
    }
  }

  @override
  void dispose() {
    widget.refreshSignal?.removeListener(_onExternalRefresh);
    _entryCtrl.dispose();
    super.dispose();
  }

  // External refresh signal (e.g. a payment completed elsewhere). Reload from
  // the backend — no spinner reset, no local balance mutation.
  void _onExternalRefresh() {
    debugPrint('[refresh] Home received signal → getBalance');
    _load();
  }

  Future<void> _load() async {
    await Future.wait([_loadBalance(), _loadActivity()]);
  }

  Future<void> _loadBalance() async {
    try {
      final bal = await widget.client.getBalance();
      debugPrint(
          '[refresh] Home balance updated: ${bal.availableMinor} ${bal.currency}');
      if (mounted) {
        setState(() {
          _balance = bal;
          _error = null; // a successful reload clears the old failure
          _loadingBalance = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = banzamiErrorMessage(e);
          _loadingBalance = false;
        });
      }
    }
  }

  Future<void> _loadActivity() async {
    try {
      final page = await widget.client.getActivity(limit: 10);
      if (mounted)
        setState(() {
          _activity = page.items;
          _loadingActivity = false;
        });
    } catch (_) {
      if (mounted)
        setState(() {
          _loadingActivity = false;
        });
    }
  }

  Future<void> _onScan() async {
    final granted = await BanzamiCameraPermission.ensure(context);
    if (!granted || !mounted) return;
    debugPrint('[QR-CAMERA] initializing scanner');
    Navigator.of(context).push(BanzamiPageRoute(
      page: BanzamiScanScreen(
        client: widget.client,
        ownHandle: widget.handle,
        isSandbox: widget.environment.isSandbox,
        onSuccess: (_) => _load(),
      ),
    ));
  }

  void _onSend() => Navigator.of(context).push(BanzamiPageRoute(
        page: BanzamiSendScreen(
          client: widget.client,
          ownHandle: widget.handle,
          onSuccess: (_) => _load(),
          isSandbox: widget.environment.isSandbox,
          logoAssetPath: widget.logoAssetPath,
        ),
      ));

  void _onReceive() {
    if (widget.onReceive != null) {
      widget.onReceive!();
      return;
    }
    Navigator.of(context).push(BanzamiPageRoute(
      page: BanzamiReceiveScreen(
        handle: widget.handle,
        logoAssetPath: widget.logoAssetPath,
        isSandbox: widget.environment.isSandbox,
      ),
    ));
  }

  @override
  Widget build(BuildContext context) {
    final topPad = MediaQuery.of(context).padding.top;

    return BanzamiScaffold(
      body: RefreshIndicator(
        color: BanzamiColors.primary,
        displacement: 60,
        onRefresh: _load,
        child: FadeTransition(
          opacity: _entryFade,
          child: SlideTransition(
            position: _entrySlide,
            child: CustomScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              slivers: [
                // ── Top bar ───────────────────────────────────────────────
                SliverToBoxAdapter(
                  child: _TopBar(
                    handle: widget.handle,
                    displayName: widget.displayName,
                    topPad: topPad,
                    onNotifications: widget.onNotifications,
                  ),
                ),

                // ── Sandbox environment card ──────────────────────────────
                if (widget.environment.isSandbox)
                  const SliverToBoxAdapter(
                    child: Padding(
                      padding: EdgeInsets.fromLTRB(BanzamiSpacing.xl, 0,
                          BanzamiSpacing.xl, BanzamiSpacing.md),
                      child: BanzamiSandboxBanner(),
                    ),
                  ),

                // ── Balance card ──────────────────────────────────────────
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(
                      BanzamiSpacing.xl,
                      BanzamiSpacing.sm,
                      BanzamiSpacing.xl,
                      BanzamiSpacing.xl,
                    ),
                    child: _BalanceCard(
                      balance: _balance,
                      loading: _loadingBalance,
                      error: _error,
                      balanceVisible: _balanceVisible,
                      onToggle: () => setState(
                        () => _balanceVisible = !_balanceVisible,
                      ),
                    ),
                  ),
                ),

                // ── Quick actions ─────────────────────────────────────────
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: BanzamiSpacing.xl,
                    ),
                    child: Row(
                      children: [
                        // Same hierarchy as the Merchant dashboard: 'QR Code' is
                        // the primary CTA (premium red gradient); Enviar/Receber
                        // are secondary (accent). Identical BanzamiActionTile
                        // variants — one shared design-system component.
                        BanzamiActionTile(
                          icon: Icons.qr_code_rounded,
                          label: 'QR Code',
                          onTap: _onScan,
                          primary: true,
                        ),
                        const SizedBox(width: BanzamiSpacing.md),
                        BanzamiActionTile(
                          icon: Icons.arrow_upward_rounded,
                          label: 'Enviar',
                          onTap: _onSend,
                          accent: true,
                        ),
                        const SizedBox(width: BanzamiSpacing.md),
                        BanzamiActionTile(
                          icon: Icons.arrow_downward_rounded,
                          label: 'Receber',
                          onTap: _onReceive,
                          accent: true,
                        ),
                      ],
                    ),
                  ),
                ),

                const SliverToBoxAdapter(
                    child: SizedBox(height: BanzamiSpacing.xxl)),

                // ── Sandbox panel ─────────────────────────────────────────
                if (widget.environment.isSandbox)
                  SliverToBoxAdapter(
                    child: _SandboxFundPanel(
                      client: widget.client,
                      onFunded: _load,
                    ),
                  ),

                // ── Section header ────────────────────────────────────────
                SliverToBoxAdapter(
                  child: BanzamiSectionTitle(
                    title: 'Actividade recente',
                    action: 'Ver tudo',
                  ),
                ),

                const SliverToBoxAdapter(
                    child: SizedBox(height: BanzamiSpacing.md)),

                // ── Activity list ─────────────────────────────────────────
                if (_loadingActivity)
                  const SliverToBoxAdapter(
                    child: Padding(
                      padding: EdgeInsets.all(BanzamiSpacing.xxl),
                      child: Center(
                        child: CircularProgressIndicator(
                          color: BanzamiColors.primary,
                          strokeWidth: 2,
                        ),
                      ),
                    ),
                  )
                else if (_activity.isEmpty)
                  SliverToBoxAdapter(child: _EmptyActivity())
                else
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(
                        horizontal: BanzamiSpacing.xl,
                      ),
                      child: BanzamiCard(
                        padding: EdgeInsets.zero,
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            for (int i = 0; i < _activity.length; i++) ...[
                              _ActivityRow(item: _activity[i]),
                              if (i < _activity.length - 1)
                                const Divider(
                                  height: 1,
                                  indent: BanzamiSpacing.xl +
                                      44 +
                                      BanzamiSpacing.md,
                                  color: BanzamiColors.gray100,
                                ),
                            ],
                          ],
                        ),
                      ),
                    ),
                  ),

                const SliverToBoxAdapter(
                    child: SizedBox(height: BanzamiSpacing.page)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// =============================================================================
// Top bar
// =============================================================================

class _TopBar extends StatelessWidget {
  final String handle;
  final String? displayName;
  final double topPad;
  final VoidCallback? onNotifications;

  const _TopBar({
    required this.handle,
    required this.displayName,
    required this.topPad,
    this.onNotifications,
  });

  @override
  Widget build(BuildContext context) {
    final initials = homeInitials(displayName: displayName, handle: handle);

    return Padding(
      padding: EdgeInsets.fromLTRB(
        BanzamiSpacing.xl,
        topPad + BanzamiSpacing.md,
        BanzamiSpacing.xl,
        BanzamiSpacing.sm,
      ),
      child: Row(
        children: [
          // Avatar
          Container(
            width: 40,
            height: 40,
            decoration: const BoxDecoration(
              gradient: BanzamiGradients.primary,
              shape: BoxShape.circle,
            ),
            child: Center(
              child: Text(
                initials,
                style: BanzamiTextStyles.bodySm.copyWith(
                  color: BanzamiColors.white,
                  fontWeight: FontWeight.w700,
                  fontSize: 14,
                ),
              ),
            ),
          ),
          const SizedBox(width: BanzamiSpacing.md),
          // Greeting
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  'Olá, ${displayName?.split(' ').first ?? '@$handle'}',
                  style: BanzamiTextStyles.headingSm.copyWith(
                    color: BanzamiColors.gray900,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
          // Notifications
          GestureDetector(
            onTap: onNotifications,
            child: Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: BanzamiColors.white,
                shape: BoxShape.circle,
                boxShadow: BanzamiShadows.card,
              ),
              child: const Icon(
                Icons.notifications_none_rounded,
                color: BanzamiColors.gray600,
                size: 20,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// =============================================================================
// Balance card — premium gradient hero
// =============================================================================

class _BalanceCard extends StatelessWidget {
  final WalletBalance? balance;
  final bool loading;
  final String? error;
  final bool balanceVisible;
  final VoidCallback onToggle;

  const _BalanceCard({
    required this.balance,
    required this.loading,
    required this.error,
    required this.balanceVisible,
    required this.onToggle,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        gradient: BanzamiGradients.primary,
        borderRadius: BanzamiRadius.xxlAll,
        boxShadow: [
          BoxShadow(
            color: const Color(0xFFB5101F).withValues(alpha: 0.42),
            blurRadius: 36,
            offset: const Offset(0, 12),
            spreadRadius: -6,
          ),
          BoxShadow(
            color: const Color(0xFF9A1B22).withValues(alpha: 0.22),
            blurRadius: 8,
            offset: const Offset(0, 3),
          ),
        ],
      ),
      clipBehavior: Clip.hardEdge,
      child: Stack(
        children: [
          // ── Decorative depth layers ──────────────────────────────────────
          // Large glow disc — top-right
          Positioned(
            top: -50,
            right: -40,
            child: Container(
              width: 180,
              height: 180,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: Colors.white.withValues(alpha: 0.05),
              ),
            ),
          ),
          // Smaller inner disc
          Positioned(
            top: 10,
            right: 50,
            child: Container(
              width: 80,
              height: 80,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: Colors.white.withValues(alpha: 0.03),
              ),
            ),
          ),
          // Subtle top sheen — matches profile card treatment (vertical, no left wash)
          Positioned.fill(
            child: Container(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.center,
                  colors: [
                    Colors.white.withValues(alpha: 0.05),
                    Colors.transparent,
                  ],
                ),
              ),
            ),
          ),
          // ── Content ─────────────────────────────────────────────────────
          Padding(
            padding: const EdgeInsets.fromLTRB(24, 22, 24, 22),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                // Label row
                Row(
                  children: [
                    Text(
                      'Saldo disponível',
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.72),
                        fontSize: 13,
                        fontWeight: FontWeight.w500,
                        height: 1.2,
                      ),
                    ),
                    const SizedBox(width: BanzamiSpacing.sm),
                    GestureDetector(
                      onTap: onToggle,
                      child: Icon(
                        balanceVisible
                            ? Icons.visibility_outlined
                            : Icons.visibility_off_outlined,
                        color: Colors.white.withValues(alpha: 0.72),
                        size: 17,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                // Amount
                if (loading)
                  Container(
                    height: 44,
                    width: 160,
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.15),
                      borderRadius: BanzamiRadius.smAll,
                    ),
                  )
                else
                  AnimatedSwitcher(
                    duration: BanzamiMotion.normal,
                    switchInCurve: BanzamiMotion.decelerate,
                    switchOutCurve: BanzamiMotion.accelerate,
                    child: Text(
                      key: ValueKey(balanceVisible),
                      balanceVisible
                          ? (balance?.availableFormatted ??
                              (error != null ? '— Kz' : '0,00 Kz'))
                          : '• • • • •',
                      style: const TextStyle(
                        fontFamily: 'JetBrains Mono',
                        fontSize: 36,
                        fontWeight: FontWeight.w700,
                        color: Colors.white,
                        height: 1.1,
                        fontFeatures: [FontFeature.tabularFigures()],
                      ),
                    ),
                  ),
                const SizedBox(height: 10),
                // Subtitle / error
                Text(
                  error != null && !loading
                      ? error!
                      : 'Saldo na sua carteira Banzami',
                  style: TextStyle(
                    color: error != null && !loading
                        ? Colors.white.withValues(alpha: 0.85)
                        : Colors.white.withValues(alpha: 0.52),
                    fontSize: 13,
                    fontWeight: FontWeight.w400,
                    height: 1.3,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// =============================================================================
// Activity row
// =============================================================================

class _ActivityRow extends StatelessWidget {
  final ActivityItem item;
  const _ActivityRow({required this.item});

  @override
  Widget build(BuildContext context) {
    final isCredit = item.isIncoming;
    final amountFormatted =
        '${isCredit ? "+" : "−"}${formatMinor(item.amountMinor, item.currency)}';
    final initial = item.avatarInitial;

    return BanzamiActivityRow(
      title: item.displayTitle,
      subtitle: item.displaySubtitle,
      amount: amountFormatted,
      time: _formatTime(item.createdAt),
      isCredit: isCredit,
      leading: _ActivityIcon(
          type: item.itemType, initial: initial, isCredit: isCredit),
    );
  }

  String _formatTime(DateTime? dt) {
    if (dt == null) return '';
    return BanzamiDateFormatter.formatActivityTime(dt);
  }
}

class _ActivityIcon extends StatelessWidget {
  final String type;
  final String initial;
  final bool isCredit;

  const _ActivityIcon({
    required this.type,
    required this.initial,
    required this.isCredit,
  });

  @override
  Widget build(BuildContext context) {
    if (type == 'WALLET_FUNDED') {
      return Container(
        width: 44,
        height: 44,
        decoration: BoxDecoration(
          color: BanzamiColors.successBg,
          shape: BoxShape.circle,
        ),
        child: const Icon(Icons.add_rounded,
            color: BanzamiColors.success, size: 22),
      );
    }
    return Container(
      width: 44,
      height: 44,
      decoration: const BoxDecoration(
        gradient: BanzamiGradients.primary,
        shape: BoxShape.circle,
      ),
      child: Center(
        child: Text(
          initial.toUpperCase(),
          style: BanzamiTextStyles.headingSm.copyWith(
            color: BanzamiColors.white,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
    );
  }
}

// =============================================================================
// Empty state
// =============================================================================

class _EmptyActivity extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: BanzamiSpacing.xl,
        vertical: BanzamiSpacing.xxl,
      ),
      child: BanzamiCard(
        padding: const EdgeInsets.all(BanzamiSpacing.xxl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 56,
              height: 56,
              decoration: const BoxDecoration(
                color: BanzamiColors.gray100,
                shape: BoxShape.circle,
              ),
              child: const Icon(
                Icons.receipt_long_outlined,
                size: 24,
                color: BanzamiColors.gray400,
              ),
            ),
            const SizedBox(height: BanzamiSpacing.md),
            Text(
              'Nenhuma transacção ainda',
              style: BanzamiTextStyles.headingSm
                  .copyWith(color: BanzamiColors.gray900),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: BanzamiSpacing.xs),
            Text(
              'As suas actividades aparecerão aqui',
              style: BanzamiTextStyles.bodySm,
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}

// =============================================================================
// Sandbox fund panel — premium funding card
// =============================================================================

/// The avatar initials: the first letters of up to two words of the name
/// (any run of spaces between them), else the handle's first letter — never a
/// crash on "Ana  Silva", a blank name or an empty handle.
String homeInitials({String? displayName, required String handle}) {
  final words = (displayName ?? '')
      .trim()
      .split(RegExp(r'\s+'))
      .where((w) => w.isNotEmpty)
      .take(2);
  if (words.isNotEmpty) return words.map((w) => w[0]).join().toUpperCase();
  final h = handle.replaceFirst('@', '').trim();
  return h.isEmpty ? '·' : h[0].toUpperCase();
}

/// Whole kwanzas in the standard money format ("50 000 Kz").
String _fmtKz(int kz) => formatMinor(kz * 100, 'AOA');

class _SandboxFundPanel extends StatefulWidget {
  final ConsumerPublicClient client;
  final VoidCallback onFunded;
  const _SandboxFundPanel({required this.client, required this.onFunded});

  @override
  State<_SandboxFundPanel> createState() => _SandboxFundPanelState();
}

class _SandboxFundPanelState extends State<_SandboxFundPanel> {
  bool _loading = false;
  // Sandbox funding is a test convenience, not a primary wallet action — so the
  // panel starts collapsed as a discreet bar and expands on tap.
  bool _expanded = false;
  int _amountKz = 10000;

  static const int _step = 1000;
  static const int _minKz = 1000;
  static const int _maxKz = 1000000;
  static const _chips = [10, 50, 200, 1000];

  void _increment() =>
      setState(() => _amountKz = (_amountKz + _step).clamp(_minKz, _maxKz));
  void _decrement() =>
      setState(() => _amountKz = (_amountKz - _step).clamp(_minKz, _maxKz));
  void _addChip(int kz) =>
      setState(() => _amountKz = (_amountKz + kz).clamp(_minKz, _maxKz));

  Future<void> _fund() async {
    setState(() => _loading = true);
    try {
      final result =
          await widget.client.sandboxFund(amountMinor: _amountKz * 100);
      if (!mounted) return;
      widget.onFunded();
      // Collapse back to the discreet bar after a successful top-up; the toast
      // is the brief feedback and the balance refreshes via onFunded → _load.
      setState(() => _expanded = false);
      BanzamiToast.showSuccess(
        context,
        '${formatMinor(result.creditedMinor, result.currency)} adicionados à carteira sandbox',
      );
    } catch (e) {
      if (!mounted) return;
      // e.g. PILOT_LIMIT_AGGREGATE_FUNDS_EXCEEDED: the pilot's test-funds cap
      // was reached — say that, not a generic error.
      BanzamiToast.showError(context, banzamiErrorMessage(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        BanzamiSpacing.xl,
        0,
        BanzamiSpacing.xl,
        BanzamiSpacing.xl,
      ),
      child: Container(
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            colors: [Color(0xFFFFF8E8), Color(0xFFFFF0C0)],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          borderRadius: const BorderRadius.all(Radius.circular(22)),
          border: Border.all(color: const Color(0xFFF7C65A)),
          boxShadow: [
            BoxShadow(
              color: const Color(0xFFF59E0B).withValues(alpha: 0.12),
              blurRadius: 16,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // ── Header (tappable toggle) ────────────────────────────────
            Material(
              type: MaterialType.transparency,
              child: InkWell(
                onTap: () => setState(() => _expanded = !_expanded),
                borderRadius: const BorderRadius.all(Radius.circular(22)),
                child: Padding(
                  padding: EdgeInsets.fromLTRB(16, 14, 16, _expanded ? 0 : 14),
                  child: Row(
                    children: [
                      Container(
                        width: 30,
                        height: 30,
                        decoration: const BoxDecoration(
                          color: Color(0xFFFDE68A),
                          borderRadius: BorderRadius.all(Radius.circular(8)),
                        ),
                        child: const Icon(Icons.science_rounded,
                            size: 15, color: Color(0xFF92400E)),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'Adicionar dinheiro de teste',
                              style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w700,
                                color: Color(0xFF78350F),
                                height: 1.2,
                              ),
                            ),
                            const SizedBox(height: 1),
                            Text(
                              _expanded
                                  ? 'Crédito instantâneo sandbox'
                                  : 'Toque para adicionar dinheiro de teste',
                              style: const TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.w400,
                                color: Color(0xFFB45309),
                                height: 1.3,
                              ),
                            ),
                          ],
                        ),
                      ),
                      AnimatedRotation(
                        turns: _expanded ? 0.5 : 0.0,
                        duration: BanzamiMotion.normal,
                        curve: BanzamiMotion.standard,
                        child: const Icon(Icons.expand_more_rounded,
                            size: 20, color: Color(0xFFD97706)),
                      ),
                    ],
                  ),
                ),
              ),
            ),

            // ── Collapsible body ────────────────────────────────────────
            AnimatedSize(
              duration: BanzamiMotion.normal,
              curve: BanzamiMotion.standard,
              alignment: Alignment.topCenter,
              child: !_expanded
                  ? const SizedBox(width: double.infinity)
                  : Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        // ── Amount selector ──────────────────────────────────────────
                        Padding(
                          padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
                          child: Row(
                            children: [
                              _SandboxCircleBtn(
                                icon: Icons.remove_rounded,
                                onTap: _loading || _amountKz <= _minKz
                                    ? null
                                    : _decrement,
                                enabled: !_loading && _amountKz > _minKz,
                              ),
                              Expanded(
                                child: Column(
                                  children: [
                                    AnimatedSwitcher(
                                      duration:
                                          const Duration(milliseconds: 200),
                                      transitionBuilder: (child, anim) =>
                                          FadeTransition(
                                        opacity: anim,
                                        child: SlideTransition(
                                          position: Tween<Offset>(
                                            begin: const Offset(0, 0.15),
                                            end: Offset.zero,
                                          ).animate(anim),
                                          child: child,
                                        ),
                                      ),
                                      child: Text(
                                        key: ValueKey(_amountKz),
                                        _fmtKz(_amountKz),
                                        textAlign: TextAlign.center,
                                        style: const TextStyle(
                                          fontFamily: 'JetBrains Mono',
                                          fontSize: 22,
                                          fontWeight: FontWeight.w700,
                                          color: Color(0xFF78350F),
                                          height: 1.1,
                                        ),
                                      ),
                                    ),
                                    const SizedBox(height: 2),
                                    const Text(
                                      'Valor atual',
                                      style: TextStyle(
                                        fontSize: 10,
                                        color: Color(0xFFB45309),
                                        fontWeight: FontWeight.w400,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              _SandboxCircleBtn(
                                icon: Icons.add_rounded,
                                onTap: _loading || _amountKz >= _maxKz
                                    ? null
                                    : _increment,
                                enabled: !_loading && _amountKz < _maxKz,
                              ),
                            ],
                          ),
                        ),

                        // ── Quick chips ──────────────────────────────────────────────
                        Padding(
                          padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
                          child: Row(
                            children: _chips
                                .map((kz) => Expanded(
                                      child: Padding(
                                        padding: EdgeInsets.only(
                                          right: kz != _chips.last ? 6 : 0,
                                        ),
                                        child: _SandboxChip(
                                          label: '+${_fmtKz(kz)}',
                                          onTap: _loading
                                              ? null
                                              : () => _addChip(kz),
                                        ),
                                      ),
                                    ))
                                .toList(),
                          ),
                        ),

                        // ── CTA button ───────────────────────────────────────────────
                        Padding(
                          padding: const EdgeInsets.fromLTRB(14, 0, 14, 12),
                          child: _loading
                              ? const Center(
                                  child: Padding(
                                    padding: EdgeInsets.symmetric(vertical: 14),
                                    child: SizedBox(
                                      width: 20,
                                      height: 20,
                                      child: CircularProgressIndicator(
                                        strokeWidth: 2,
                                        valueColor: AlwaysStoppedAnimation(
                                            Color(0xFF92400E)),
                                      ),
                                    ),
                                  ),
                                )
                              : _SandboxFundButton(onTap: _fund),
                        ),
                      ],
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SandboxCircleBtn extends StatelessWidget {
  final IconData icon;
  final VoidCallback? onTap;
  final bool enabled;
  const _SandboxCircleBtn({
    required this.icon,
    required this.enabled,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 34,
        height: 34,
        decoration: BoxDecoration(
          color: enabled ? BanzamiColors.white : const Color(0xFFFDE68A),
          shape: BoxShape.circle,
          boxShadow: enabled
              ? [
                  BoxShadow(
                      color: Colors.black.withValues(alpha: 0.06),
                      blurRadius: 6,
                      offset: const Offset(0, 1))
                ]
              : null,
        ),
        child: Icon(
          icon,
          size: 16,
          color: enabled ? const Color(0xFF92400E) : const Color(0xFFD97706),
        ),
      ),
    );
  }
}

class _SandboxChip extends StatelessWidget {
  final String label;
  final VoidCallback? onTap;
  const _SandboxChip({required this.label, this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
        decoration: BoxDecoration(
          color: const Color(0xFFFFF4D6),
          borderRadius: const BorderRadius.all(Radius.circular(20)),
          border: Border.all(color: const Color(0xFFF7C65A), width: 0.75),
        ),
        child: Text(
          label,
          textAlign: TextAlign.center,
          style: const TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w600,
            color: Color(0xFF92400E),
          ),
        ),
      ),
    );
  }
}

class _SandboxFundButton extends StatelessWidget {
  final VoidCallback onTap;
  const _SandboxFundButton({required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 11),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            colors: [Color(0xFFF59E0B), Color(0xFFD97706)],
            begin: Alignment.centerLeft,
            end: Alignment.centerRight,
          ),
          borderRadius: const BorderRadius.all(Radius.circular(14)),
          boxShadow: [
            BoxShadow(
              color: const Color(0xFFF59E0B).withValues(alpha: 0.28),
              blurRadius: 8,
              offset: const Offset(0, 3),
            ),
          ],
        ),
        child: const Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.add_circle_outline_rounded,
                color: Colors.white, size: 16),
            SizedBox(width: 6),
            Text(
              'Adicionar ao saldo',
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                color: Colors.white,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
