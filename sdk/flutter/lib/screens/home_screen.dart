import 'package:flutter/material.dart';

import '../client/banza_environment.dart';
import '../client/consumer_public_client.dart';
import '../models/activity_item.dart';
import '../models/wallet_balance.dart';
import '../theme/banza_theme.dart';
import '../utils/money_format.dart';
import '../widgets/banza_components.dart';
import 'receive_screen.dart';
import 'scan_screen.dart';
import 'send_screen.dart';

class BanzamiHomeScreen extends StatefulWidget {
  final ConsumerPublicClient client;
  final String               consumerId;
  final String               handle;
  final String?              displayName;
  final String?              logoAssetPath;
  final VoidCallback?        onNotifications;
  final BanzaEnvironment     environment;

  const BanzamiHomeScreen({
    super.key,
    required this.client,
    required this.consumerId,
    required this.handle,
    this.displayName,
    this.logoAssetPath,
    this.onNotifications,
    this.environment = BanzaEnvironment.production,
  });

  @override
  State<BanzamiHomeScreen> createState() => _BanzamiHomeScreenState();
}

class _BanzamiHomeScreenState extends State<BanzamiHomeScreen>
    with SingleTickerProviderStateMixin {
  WalletBalance?     _balance;
  List<ActivityItem> _activity        = [];
  bool               _loadingBalance  = true;
  bool               _loadingActivity = true;
  bool               _balanceVisible  = true;
  String?            _error;

  late final AnimationController _entryCtrl;
  late final Animation<double>   _entryFade;
  late final Animation<Offset>   _entrySlide;

  @override
  void initState() {
    super.initState();
    _entryCtrl = AnimationController(
      vsync:    this,
      duration: BanzaMotion.slow,
    );
    _entryFade  = CurvedAnimation(parent: _entryCtrl, curve: BanzaMotion.decelerate);
    _entrySlide = Tween<Offset>(
      begin: const Offset(0, 0.04),
      end:   Offset.zero,
    ).animate(CurvedAnimation(parent: _entryCtrl, curve: BanzaMotion.decelerate));

    _load();
    _entryCtrl.forward();
  }

  @override
  void dispose() {
    _entryCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    await Future.wait([_loadBalance(), _loadActivity()]);
  }

  Future<void> _loadBalance() async {
    try {
      final bal = await widget.client.getBalance();
      if (mounted) setState(() { _balance = bal; _loadingBalance = false; });
    } catch (_) {
      if (mounted) setState(() { _error = 'Não foi possível carregar o saldo'; _loadingBalance = false; });
    }
  }

  Future<void> _loadActivity() async {
    try {
      final page = await widget.client.getActivity(limit: 10);
      if (mounted) setState(() { _activity = page.items; _loadingActivity = false; });
    } catch (_) {
      if (mounted) setState(() { _loadingActivity = false; });
    }
  }

  void _onScan() => Navigator.of(context).push(BanzaPageRoute(
    page: BanzamiScanScreen(client: widget.client, onSuccess: (_) => _load()),
  ));

  void _onSend() => Navigator.of(context).push(BanzaPageRoute(
    page: BanzamiSendScreen(
      client:    widget.client,
      ownHandle: widget.handle,
      onSuccess: (_) => _load(),
    ),
  ));

  void _onReceive() => Navigator.of(context).push(BanzaPageRoute(
    page: BanzamiReceiveScreen(
      handle:        widget.handle,
      logoAssetPath: widget.logoAssetPath,
    ),
  ));

  @override
  Widget build(BuildContext context) {
    final topPad = MediaQuery.of(context).padding.top;

    return BanzaScaffold(
      body: RefreshIndicator(
        color:        BanzaColors.wine,
        displacement: 60,
        onRefresh:    _load,
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
                    handle:          widget.handle,
                    displayName:     widget.displayName,
                    topPad:          topPad,
                    onNotifications: widget.onNotifications,
                  ),
                ),

                // ── Balance card ──────────────────────────────────────────
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(
                      BanzaSpacing.xl, BanzaSpacing.sm,
                      BanzaSpacing.xl, BanzaSpacing.xl,
                    ),
                    child: _BalanceCard(
                      balance:         _balance,
                      loading:         _loadingBalance,
                      error:           _error,
                      balanceVisible:  _balanceVisible,
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
                      horizontal: BanzaSpacing.xl,
                    ),
                    child: Row(
                      children: [
                        BanzaActionTile(
                          icon:    Icons.arrow_upward_rounded,
                          label:   'Enviar',
                          onTap:   _onSend,
                          primary: true,
                        ),
                        const SizedBox(width: BanzaSpacing.md),
                        BanzaActionTile(
                          icon:  Icons.arrow_downward_rounded,
                          label: 'Receber',
                          onTap: _onReceive,
                        ),
                        const SizedBox(width: BanzaSpacing.md),
                        BanzaActionTile(
                          icon:  Icons.qr_code_rounded,
                          label: 'QR Code',
                          onTap: _onScan,
                        ),
                      ],
                    ),
                  ),
                ),

                const SliverToBoxAdapter(child: SizedBox(height: BanzaSpacing.xxl)),

                // ── Sandbox panel ─────────────────────────────────────────
                if (widget.environment.isSandbox)
                  SliverToBoxAdapter(
                    child: _SandboxFundPanel(
                      client:   widget.client,
                      onFunded: _load,
                    ),
                  ),

                // ── Section header ────────────────────────────────────────
                SliverToBoxAdapter(
                  child: BanzaSectionTitle(
                    title:  'Actividade recente',
                    action: 'Ver tudo',
                  ),
                ),

                const SliverToBoxAdapter(child: SizedBox(height: BanzaSpacing.md)),

                // ── Activity list ─────────────────────────────────────────
                if (_loadingActivity)
                  const SliverToBoxAdapter(
                    child: Padding(
                      padding: EdgeInsets.all(BanzaSpacing.xxl),
                      child: Center(
                        child: CircularProgressIndicator(
                          color: BanzaColors.wine,
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
                        horizontal: BanzaSpacing.xl,
                      ),
                      child: BanzaCard(
                        padding: EdgeInsets.zero,
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            for (int i = 0; i < _activity.length; i++) ...[
                              _ActivityRow(item: _activity[i]),
                              if (i < _activity.length - 1)
                                const Divider(
                                  height: 1,
                                  indent: BanzaSpacing.xl + 44 + BanzaSpacing.md,
                                  color:  BanzaColors.gray100,
                                ),
                            ],
                          ],
                        ),
                      ),
                    ),
                  ),

                const SliverToBoxAdapter(child: SizedBox(height: BanzaSpacing.page)),
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
  final String  handle;
  final String? displayName;
  final double  topPad;
  final VoidCallback? onNotifications;

  const _TopBar({
    required this.handle,
    required this.displayName,
    required this.topPad,
    this.onNotifications,
  });

  @override
  Widget build(BuildContext context) {
    final initials = displayName != null
        ? displayName!.split(' ').take(2).map((w) => w[0]).join().toUpperCase()
        : handle[0].toUpperCase();

    return Padding(
      padding: EdgeInsets.fromLTRB(
        BanzaSpacing.xl,
        topPad + BanzaSpacing.md,
        BanzaSpacing.xl,
        BanzaSpacing.sm,
      ),
      child: Row(
        children: [
          // Avatar
          Container(
            width:  40,
            height: 40,
            decoration: const BoxDecoration(
              gradient: BanzaGradients.wine,
              shape:    BoxShape.circle,
            ),
            child: Center(
              child: Text(
                initials,
                style: BanzaTextStyles.bodySm.copyWith(
                  color:      BanzaColors.white,
                  fontWeight: FontWeight.w700,
                  fontSize:   14,
                ),
              ),
            ),
          ),
          const SizedBox(width: BanzaSpacing.md),
          // Greeting
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize:       MainAxisSize.min,
              children: [
                Text(
                  'Olá, ${displayName?.split(' ').first ?? '@$handle'}',
                  style: BanzaTextStyles.headingSm.copyWith(
                    color:      BanzaColors.gray900,
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
              width:  40,
              height: 40,
              decoration: BoxDecoration(
                color:        BanzaColors.white,
                shape:        BoxShape.circle,
                boxShadow:    BanzaShadows.card,
              ),
              child: const Icon(
                Icons.notifications_none_rounded,
                color: BanzaColors.gray600,
                size:  20,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// =============================================================================
// Balance card — light floating card
// =============================================================================

class _BalanceCard extends StatelessWidget {
  final WalletBalance? balance;
  final bool           loading;
  final String?        error;
  final bool           balanceVisible;
  final VoidCallback   onToggle;

  const _BalanceCard({
    required this.balance,
    required this.loading,
    required this.error,
    required this.balanceVisible,
    required this.onToggle,
  });

  @override
  Widget build(BuildContext context) {
    return BanzaCard(
      shadow: BanzaShadows.cardElevated,
      padding: const EdgeInsets.fromLTRB(
        BanzaSpacing.xl, BanzaSpacing.xl,
        BanzaSpacing.xl, BanzaSpacing.xl,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize:       MainAxisSize.min,
        children: [
          // Label + eye
          Row(
            children: [
              Text(
                'Saldo disponível',
                style: BanzaTextStyles.bodySm.copyWith(
                  color:      BanzaColors.gray400,
                  fontWeight: FontWeight.w500,
                  fontSize:   13,
                ),
              ),
              const SizedBox(width: BanzaSpacing.sm),
              GestureDetector(
                onTap: onToggle,
                child: Icon(
                  balanceVisible
                      ? Icons.visibility_outlined
                      : Icons.visibility_off_outlined,
                  color: BanzaColors.gray400,
                  size:  18,
                ),
              ),
            ],
          ),
          const SizedBox(height: BanzaSpacing.sm),
          // Amount
          if (loading)
            Container(
              height: 48,
              width:  160,
              decoration: BoxDecoration(
                color:        BanzaColors.gray100,
                borderRadius: BanzaRadius.smAll,
              ),
            )
          else
            AnimatedSwitcher(
              duration:       BanzaMotion.normal,
              switchInCurve:  BanzaMotion.decelerate,
              switchOutCurve: BanzaMotion.accelerate,
              child: Text(
                key: ValueKey(balanceVisible),
                balanceVisible
                    ? (balance?.availableFormatted ?? (error != null ? '— Kz' : '0,00 Kz'))
                    : '• • • • •',
                style: TextStyle(
                  fontFamily:   'JetBrains Mono',
                  fontSize:     32,
                  fontWeight:   FontWeight.w700,
                  color:        BanzaColors.gray900,
                  height:       1.1,
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
            ),
          if (error != null && !loading)
            Padding(
              padding: const EdgeInsets.only(top: BanzaSpacing.xs),
              child: Text(
                error!,
                style: BanzaTextStyles.bodySm.copyWith(color: BanzaColors.error),
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
    final amountFormatted = '${isCredit ? "+" : "−"}${formatMinor(item.amountMinor, item.currency)}';
    final subtitle = _subtitle(item);
    final initial = (item.counterpartyDisplayName ?? item.counterpartyHandle ?? item.itemType)[0];

    return BanzaActivityRow(
      title:    item.counterpartyDisplayName ??
                (item.counterpartyHandle != null ? '@${item.counterpartyHandle}' : _typeLabel(item.itemType)),
      subtitle: subtitle,
      amount:   amountFormatted,
      time:     _formatTime(item.createdAt),
      isCredit: isCredit,
      leading:  _ActivityIcon(type: item.itemType, initial: initial, isCredit: isCredit),
    );
  }

  String _subtitle(ActivityItem item) {
    if (item.itemType == 'P2P_SENT')      return 'Enviado';
    if (item.itemType == 'P2P_RECEIVED')  return 'Recebido';
    if (item.itemType == 'WALLET_FUNDED') return 'Carregamento';
    return item.itemType;
  }

  String _typeLabel(String type) {
    if (type == 'WALLET_FUNDED') return 'Multicaixa';
    return type;
  }

  String _formatTime(DateTime? dt) {
    if (dt == null) return '';
    final now  = DateTime.now();
    final diff = now.difference(dt);
    if (diff.inDays == 0) {
      return 'Hoje, ${_pad(dt.hour)}:${_pad(dt.minute)}';
    } else if (diff.inDays == 1) {
      return 'Ontem, ${_pad(dt.hour)}:${_pad(dt.minute)}';
    }
    return '${dt.day}/${dt.month}';
  }

  String _pad(int n) => n.toString().padLeft(2, '0');
}

class _ActivityIcon extends StatelessWidget {
  final String type;
  final String initial;
  final bool   isCredit;

  const _ActivityIcon({
    required this.type,
    required this.initial,
    required this.isCredit,
  });

  @override
  Widget build(BuildContext context) {
    if (type == 'WALLET_FUNDED') {
      return Container(
        width:  44,
        height: 44,
        decoration: BoxDecoration(
          color: BanzaColors.successBg,
          shape: BoxShape.circle,
        ),
        child: const Icon(Icons.add_rounded, color: BanzaColors.success, size: 22),
      );
    }
    return Container(
      width:  44,
      height: 44,
      decoration: const BoxDecoration(
        gradient: BanzaGradients.wine,
        shape:    BoxShape.circle,
      ),
      child: Center(
        child: Text(
          initial.toUpperCase(),
          style: BanzaTextStyles.headingSm.copyWith(
            color:      BanzaColors.white,
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
        horizontal: BanzaSpacing.xl,
        vertical:   BanzaSpacing.xxl,
      ),
      child: BanzaCard(
        padding: const EdgeInsets.all(BanzaSpacing.xxl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width:  56,
              height: 56,
              decoration: const BoxDecoration(
                color: BanzaColors.gray100,
                shape: BoxShape.circle,
              ),
              child: const Icon(
                Icons.receipt_long_outlined,
                size:  24,
                color: BanzaColors.gray400,
              ),
            ),
            const SizedBox(height: BanzaSpacing.md),
            Text(
              'Nenhuma transacção ainda',
              style: BanzaTextStyles.headingSm.copyWith(color: BanzaColors.gray900),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: BanzaSpacing.xs),
            Text(
              'As suas actividades aparecerão aqui',
              style: BanzaTextStyles.bodySm,
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}

// =============================================================================
// Sandbox fund panel
// =============================================================================

class _SandboxFundPanel extends StatefulWidget {
  final ConsumerPublicClient client;
  final VoidCallback         onFunded;
  const _SandboxFundPanel({required this.client, required this.onFunded});

  @override
  State<_SandboxFundPanel> createState() => _SandboxFundPanelState();
}

class _SandboxFundPanelState extends State<_SandboxFundPanel> {
  bool    _loading = false;
  String? _error;
  String? _success;

  static const _presets = [
    (label: '10 000 Kz',    minor: 1000000),
    (label: '50 000 Kz',    minor: 5000000),
    (label: '200 000 Kz',   minor: 20000000),
    (label: '1 000 000 Kz', minor: 100000000),
  ];

  Future<void> _fund(int amountMinor) async {
    setState(() { _loading = true; _error = null; _success = null; });
    try {
      final result = await widget.client.sandboxFund(amountMinor: amountMinor);
      if (!mounted) return;
      setState(() {
        _success = 'Adicionados ${result.creditedMinor ~/ 100} Kz';
      });
      widget.onFunded();
    } catch (e) {
      if (mounted) setState(() => _error = 'Erro ao adicionar fundos');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        BanzaSpacing.xl, 0, BanzaSpacing.xl, BanzaSpacing.xl,
      ),
      child: Container(
        padding: const EdgeInsets.all(BanzaSpacing.lg),
        decoration: BoxDecoration(
          color:        const Color(0xFFFEF3C7),
          borderRadius: BanzaRadius.lgAll,
          border:       Border.all(color: const Color(0xFFF59E0B)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              const Icon(Icons.science_rounded, size: 14, color: Color(0xFF92400E)),
              const SizedBox(width: BanzaSpacing.xs),
              Text('Sandbox', style: BanzaTextStyles.bodySm.copyWith(
                color:      const Color(0xFF92400E),
                fontWeight: FontWeight.w600,
              )),
            ]),
            const SizedBox(height: BanzaSpacing.md),
            Wrap(
              spacing:    BanzaSpacing.sm,
              runSpacing: BanzaSpacing.sm,
              children: _presets.map((p) => OutlinedButton(
                onPressed: _loading ? null : () => _fund(p.minor),
                style: OutlinedButton.styleFrom(
                  foregroundColor: const Color(0xFF92400E),
                  side: const BorderSide(color: Color(0xFFF59E0B)),
                  padding: const EdgeInsets.symmetric(
                    horizontal: BanzaSpacing.md, vertical: BanzaSpacing.xs,
                  ),
                  textStyle:     BanzaTextStyles.bodySm,
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                ),
                child: Text(p.label),
              )).toList(),
            ),
            if (_success != null) ...[
              const SizedBox(height: BanzaSpacing.sm),
              Text(_success!, style: BanzaTextStyles.bodySm.copyWith(color: BanzaColors.success)),
            ],
            if (_error != null) ...[
              const SizedBox(height: BanzaSpacing.sm),
              Text(_error!, style: BanzaTextStyles.bodySm.copyWith(color: BanzaColors.error)),
            ],
          ],
        ),
      ),
    );
  }
}
