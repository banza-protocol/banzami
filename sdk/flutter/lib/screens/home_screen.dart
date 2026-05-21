import 'package:flutter/material.dart';

import '../client/banza_environment.dart';
import '../client/consumer_public_client.dart';
import '../models/activity_item.dart';
import '../models/wallet_balance.dart';
import '../theme/banza_theme.dart';
import '../widgets/banza_transfer_item.dart';
import 'receive_screen.dart';
import 'scan_screen.dart';
import 'send_screen.dart';

/// The main payment hub screen for consumer accounts.
///
/// Shows a personalised greeting, available balance with visibility toggle,
/// quick-action buttons (Scan, Send, Receive) and a list of recent transfers.
class BanzamiHomeScreen extends StatefulWidget {
  final ConsumerPublicClient client;
  final String consumerId;
  final String handle;
  final String? displayName;
  final String? logoAssetPath;
  final VoidCallback? onNotifications;
  final BanzaEnvironment environment;

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

class _BanzamiHomeScreenState extends State<BanzamiHomeScreen> {
  WalletBalance?    _balance;
  List<ActivityItem> _activity        = [];
  bool               _loadingBalance   = true;
  bool               _loadingActivity  = true;
  bool               _balanceVisible   = true;
  String?            _error;

  @override
  void initState() {
    super.initState();
    _load();
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
      final page = await widget.client.getActivity(limit: 20);
      if (mounted) setState(() { _activity = page.items; _loadingActivity = false; });
    } catch (_) {
      if (mounted) setState(() { _loadingActivity = false; });
    }
  }

  void _onScan() => Navigator.of(context).push(MaterialPageRoute(
    builder: (_) => BanzamiScanScreen(
      client:    widget.client,
      onSuccess: (_) => _load(),
    ),
  ));

  void _onSend() => Navigator.of(context).push(MaterialPageRoute(
    builder: (_) => BanzamiSendScreen(
      client:    widget.client,
      ownHandle: widget.handle,
      onSuccess: (_) => _load(),
    ),
  ));

  void _onReceive() => Navigator.of(context).push(MaterialPageRoute(
    builder: (_) => BanzamiReceiveScreen(
      handle:        widget.handle,
      logoAssetPath: widget.logoAssetPath,
    ),
  ));

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: BanzaColors.offWhite,
      body: RefreshIndicator(
        color:     BanzaColors.wine,
        onRefresh: _load,
        child: CustomScrollView(
          slivers: [
            _BalanceHeader(
              balance:         _balance,
              loading:         _loadingBalance,
              error:           _error,
              handle:          widget.handle,
              displayName:     widget.displayName,
              balanceVisible:  _balanceVisible,
              onToggleBalance: () => setState(() => _balanceVisible = !_balanceVisible),
              onNotifications: widget.onNotifications,
              onScan:          _onScan,
              onSend:          _onSend,
              onReceive:       _onReceive,
            ),

            if (widget.environment.isSandbox)
              SliverToBoxAdapter(
                child: _SandboxFundPanel(
                  client:   widget.client,
                  onFunded: _load,
                ),
              ),

            const SliverToBoxAdapter(
              child: Padding(
                padding: EdgeInsets.fromLTRB(
                  BanzaSpacing.lg, BanzaSpacing.xl,
                  BanzaSpacing.lg, BanzaSpacing.sm,
                ),
                child: Text('Actividade recente', style: BanzaTextStyles.headingSm),
              ),
            ),

            if (_loadingActivity)
              const SliverToBoxAdapter(
                child: Center(
                  child: Padding(
                    padding: EdgeInsets.all(BanzaSpacing.xl),
                    child: CircularProgressIndicator(color: BanzaColors.wine),
                  ),
                ),
              )
            else if (_activity.isEmpty)
              SliverToBoxAdapter(child: _EmptyActivity())
            else
              SliverPadding(
                padding: const EdgeInsets.symmetric(horizontal: BanzaSpacing.lg),
                sliver: SliverList(
                  delegate: SliverChildBuilderDelegate(
                    (context, i) {
                      final isFirst = i == 0;
                      final isLast  = i == _activity.length - 1;
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
                            BanzaTransferItem(item: _activity[i]),
                            if (!isLast)
                              const Divider(height: 1, indent: 68, color: BanzaColors.gray200),
                          ],
                        ),
                      );
                    },
                    childCount: _activity.length,
                  ),
                ),
              ),

            const SliverToBoxAdapter(child: SizedBox(height: BanzaSpacing.page)),
          ],
        ),
      ),
    );
  }
}

// =============================================================================
// Balance header
// =============================================================================

class _BalanceHeader extends StatelessWidget {
  final WalletBalance? balance;
  final bool           loading;
  final String?        error;
  final String         handle;
  final String?        displayName;
  final bool           balanceVisible;
  final VoidCallback   onToggleBalance;
  final VoidCallback?  onNotifications;
  final VoidCallback   onScan;
  final VoidCallback   onSend;
  final VoidCallback   onReceive;

  const _BalanceHeader({
    required this.balance,
    required this.loading,
    required this.error,
    required this.handle,
    required this.displayName,
    required this.balanceVisible,
    required this.onToggleBalance,
    required this.onNotifications,
    required this.onScan,
    required this.onSend,
    required this.onReceive,
  });

  @override
  Widget build(BuildContext context) {
    final firstName = displayName?.split(' ').first ?? '@$handle';

    return SliverToBoxAdapter(
      child: Container(
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
            // Greeting row
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Olá, $firstName',
                    style: BanzaTextStyles.headingMd.copyWith(
                      color:      BanzaColors.white,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                GestureDetector(
                  onTap: onNotifications,
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
                      Icons.notifications_none_rounded,
                      color: BanzaColors.white,
                      size:  20,
                    ),
                  ),
                ),
              ],
            ),

            const SizedBox(height: BanzaSpacing.lg),

            // Balance label + toggle
            Row(
              children: [
                Text(
                  'Saldo disponível',
                  style: BanzaTextStyles.bodySm.copyWith(
                    color: BanzaColors.white.withValues(alpha: 0.65),
                  ),
                ),
                const SizedBox(width: BanzaSpacing.xs),
                GestureDetector(
                  onTap: onToggleBalance,
                  child: Icon(
                    balanceVisible
                        ? Icons.visibility_outlined
                        : Icons.visibility_off_outlined,
                    color: BanzaColors.white.withValues(alpha: 0.55),
                    size:  16,
                  ),
                ),
              ],
            ),

            const SizedBox(height: BanzaSpacing.xs),

            // Balance amount
            if (loading)
              const SizedBox(
                height: 48,
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: SizedBox(
                    width: 24, height: 24,
                    child: CircularProgressIndicator(
                      color: BanzaColors.white, strokeWidth: 2,
                    ),
                  ),
                ),
              )
            else
              AnimatedSwitcher(
                duration: const Duration(milliseconds: 300),
                child: Text(
                  balanceVisible
                      ? (balance?.availableFormatted ?? '— Kz')
                      : '• • • • •',
                  key:   ValueKey(balanceVisible),
                  style: BanzaTextStyles.displayLg.copyWith(
                    color: BanzaColors.white,
                  ),
                ),
              ),

            const SizedBox(height: BanzaSpacing.xl),

            // Quick actions
            Row(
              children: [
                _ActionButton(
                  icon:    Icons.qr_code_scanner_rounded,
                  label:   'Scan',
                  onTap:   onScan,
                  primary: true,
                ),
                const SizedBox(width: BanzaSpacing.md),
                _ActionButton(
                  icon:  Icons.arrow_upward_rounded,
                  label: 'Enviar',
                  onTap: onSend,
                ),
                const SizedBox(width: BanzaSpacing.md),
                _ActionButton(
                  icon:  Icons.arrow_downward_rounded,
                  label: 'Receber',
                  onTap: onReceive,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _ActionButton extends StatelessWidget {
  final IconData     icon;
  final String       label;
  final VoidCallback onTap;
  final bool         primary;

  const _ActionButton({
    required this.icon,
    required this.label,
    required this.onTap,
    this.primary = false,
  });

  @override
  Widget build(BuildContext context) {
    final bg = primary ? BanzaColors.white : BanzaColors.white.withValues(alpha: 0.15);
    final fg = primary ? BanzaColors.wine  : BanzaColors.white;

    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          padding:    const EdgeInsets.symmetric(vertical: BanzaSpacing.md),
          decoration: BoxDecoration(
            color:        bg,
            borderRadius: BanzaRadius.lgAll,
          ),
          child: Column(
            children: [
              Icon(icon, color: fg, size: 24),
              const SizedBox(height: BanzaSpacing.xs),
              Text(label, style: BanzaTextStyles.label.copyWith(color: fg)),
            ],
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
      padding: const EdgeInsets.fromLTRB(
        BanzaSpacing.xl, BanzaSpacing.xxl,
        BanzaSpacing.xl, BanzaSpacing.xl,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width:  64,
            height: 64,
            decoration: const BoxDecoration(
              color:  BanzaColors.gray200,
              shape:  BoxShape.circle,
            ),
            child: const Icon(
              Icons.receipt_long_outlined,
              size:  28,
              color: BanzaColors.gray400,
            ),
          ),
          const SizedBox(height: BanzaSpacing.md),
          Text(
            'Nenhuma transacção ainda',
            style: BanzaTextStyles.headingSm.copyWith(
              color: BanzaColors.gray900,
            ),
          ),
          const SizedBox(height: BanzaSpacing.xs),
          Text(
            'As suas actividades aparecerão aqui',
            style: BanzaTextStyles.bodySm.copyWith(
              color: BanzaColors.gray400,
            ),
            textAlign: TextAlign.center,
          ),
        ],
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
        _success = 'Adicionados ${result.creditedMinor ~/ 100} Kz (saldo: ${result.newBalance ~/ 100} Kz)';
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
    return Container(
      margin:  const EdgeInsets.fromLTRB(
        BanzaSpacing.lg, BanzaSpacing.lg, BanzaSpacing.lg, 0,
      ),
      padding: const EdgeInsets.all(BanzaSpacing.lg),
      decoration: BoxDecoration(
        color:        const Color(0xFFFEF3C7),
        borderRadius: BorderRadius.circular(BanzaRadius.md),
        border:       Border.all(color: const Color(0xFFF59E0B)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            const Icon(Icons.science_rounded, size: 16, color: Color(0xFF92400E)),
            const SizedBox(width: BanzaSpacing.xs),
            Text(
              'Modo Sandbox — adicionar fundos',
              style: BanzaTextStyles.bodySm.copyWith(
                color:      const Color(0xFF92400E),
                fontWeight: FontWeight.w600,
              ),
            ),
          ]),
          const SizedBox(height: BanzaSpacing.md),
          Wrap(
            spacing:    BanzaSpacing.sm,
            runSpacing: BanzaSpacing.sm,
            children:   _presets.map((p) {
              return OutlinedButton(
                onPressed: _loading ? null : () => _fund(p.minor),
                style: OutlinedButton.styleFrom(
                  foregroundColor: const Color(0xFF92400E),
                  side: const BorderSide(color: Color(0xFFF59E0B)),
                  padding: const EdgeInsets.symmetric(
                    horizontal: BanzaSpacing.md,
                    vertical:   BanzaSpacing.xs,
                  ),
                  textStyle:      BanzaTextStyles.bodySm,
                  tapTargetSize:  MaterialTapTargetSize.shrinkWrap,
                ),
                child: _loading
                    ? const SizedBox(
                        width: 12, height: 12,
                        child: CircularProgressIndicator(
                          strokeWidth: 1.5,
                          color:       Color(0xFF92400E),
                        ),
                      )
                    : Text(p.label),
              );
            }).toList(),
          ),
          if (_success != null) ...[
            const SizedBox(height: BanzaSpacing.sm),
            Text(_success!, style: BanzaTextStyles.bodySm.copyWith(color: const Color(0xFF166534))),
          ],
          if (_error != null) ...[
            const SizedBox(height: BanzaSpacing.sm),
            Text(_error!, style: BanzaTextStyles.bodySm.copyWith(color: BanzaColors.error)),
          ],
        ],
      ),
    );
  }
}
