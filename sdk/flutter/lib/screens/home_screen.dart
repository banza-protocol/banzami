import 'package:flutter/material.dart';

import '../client/banzami_environment.dart';
import '../client/consumer_public_client.dart';
import '../models/transfer.dart';
import '../models/wallet_balance.dart';
import '../theme/banzami_theme.dart';
import '../widgets/banzami_transfer_item.dart';
import 'receive_screen.dart';
import 'scan_screen.dart';
import 'send_screen.dart';

/// The main payment hub screen for consumer accounts.
///
/// Shows available balance, quick-action buttons (Scan, Send, Receive)
/// and a list of recent transfers. All data is fetched from the public-api
/// using the consumer JWT stored in [ConsumerPublicClient].
class BanzamiHomeScreen extends StatefulWidget {
  final ConsumerPublicClient client;
  final String consumerId;
  final String handle;
  final String? logoAssetPath;
  final BanzamiEnvironment environment;

  const BanzamiHomeScreen({
    super.key,
    required this.client,
    required this.consumerId,
    required this.handle,
    this.logoAssetPath,
    this.environment = BanzamiEnvironment.production,
  });

  @override
  State<BanzamiHomeScreen> createState() => _BanzamiHomeScreenState();
}

class _BanzamiHomeScreenState extends State<BanzamiHomeScreen> {
  WalletBalance? _balance;
  List<Transfer> _transfers = [];
  bool _loadingBalance   = true;
  bool _loadingTransfers = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    await Future.wait([_loadBalance(), _loadTransfers()]);
  }

  Future<void> _loadBalance() async {
    try {
      final bal = await widget.client.getBalance();
      if (mounted) setState(() { _balance = bal; _loadingBalance = false; });
    } catch (_) {
      if (mounted) setState(() { _error = 'Não foi possível carregar o saldo'; _loadingBalance = false; });
    }
  }

  Future<void> _loadTransfers() async {
    try {
      final page = await widget.client.listTransfers(limit: 20);
      if (mounted) setState(() { _transfers = page.data; _loadingTransfers = false; });
    } catch (_) {
      if (mounted) setState(() { _loadingTransfers = false; });
    }
  }

  void _onScan() => Navigator.of(context).push(MaterialPageRoute(
    builder: (_) => BanzamiScanScreen(
      client:    widget.client,
      onSuccess: (_) { Navigator.of(context).pop(); _load(); },
    ),
  ));

  void _onSend() => Navigator.of(context).push(MaterialPageRoute(
    builder: (_) => BanzamiSendScreen(
      client:    widget.client,
      ownHandle: widget.handle,
      onSuccess: (_) { Navigator.of(context).pop(); _load(); },
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
      backgroundColor: BanzamiColors.offWhite,
      body: RefreshIndicator(
        color:     BanzamiColors.wine,
        onRefresh: _load,
        child: CustomScrollView(
          slivers: [
            _BalanceHeader(
              balance:   _balance,
              loading:   _loadingBalance,
              error:     _error,
              onScan:    _onScan,
              onSend:    _onSend,
              onReceive: _onReceive,
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
                  BanzamiSpacing.lg, BanzamiSpacing.xl,
                  BanzamiSpacing.lg, BanzamiSpacing.sm,
                ),
                child: Text('Actividade recente', style: BanzamiTextStyles.headingSm),
              ),
            ),
            if (_loadingTransfers)
              const SliverToBoxAdapter(
                child: Center(
                  child: Padding(
                    padding: EdgeInsets.all(BanzamiSpacing.xl),
                    child: CircularProgressIndicator(color: BanzamiColors.wine),
                  ),
                ),
              )
            else if (_transfers.isEmpty)
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.all(BanzamiSpacing.xl),
                  child: Center(
                    child: Text(
                      'Nenhuma transacção ainda',
                      style: BanzamiTextStyles.bodyMd.copyWith(color: BanzamiColors.gray400),
                    ),
                  ),
                ),
              )
            else
              SliverList(
                delegate: SliverChildBuilderDelegate(
                  (context, i) => BanzamiTransferItem(
                    transfer:          _transfers[i],
                    currentConsumerId: widget.consumerId,
                  ),
                  childCount: _transfers.length,
                ),
              ),
            const SliverToBoxAdapter(child: SizedBox(height: BanzamiSpacing.page)),
          ],
        ),
      ),
    );
  }
}

class _BalanceHeader extends StatelessWidget {
  final WalletBalance? balance;
  final bool loading;
  final String? error;
  final VoidCallback onScan;
  final VoidCallback onSend;
  final VoidCallback onReceive;

  const _BalanceHeader({
    required this.balance,
    required this.loading,
    required this.error,
    required this.onScan,
    required this.onSend,
    required this.onReceive,
  });

  @override
  Widget build(BuildContext context) {
    return SliverToBoxAdapter(
      child: Container(
        decoration: const BoxDecoration(gradient: BanzamiGradients.wine),
        padding: EdgeInsets.fromLTRB(
          BanzamiSpacing.xl,
          MediaQuery.of(context).padding.top + BanzamiSpacing.xl,
          BanzamiSpacing.xl,
          BanzamiSpacing.xxl,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Saldo disponível',
              style: BanzamiTextStyles.bodyMd.copyWith(
                color: BanzamiColors.white.withValues(alpha: 0.7),
              ),
            ),
            const SizedBox(height: BanzamiSpacing.xs),
            if (loading)
              const SizedBox(
                height: 48,
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: SizedBox(
                    width: 24, height: 24,
                    child: CircularProgressIndicator(
                      color: BanzamiColors.white, strokeWidth: 2,
                    ),
                  ),
                ),
              )
            else
              Text(
                balance?.availableFormatted ?? '— Kz',
                style: BanzamiTextStyles.displayLg.copyWith(color: BanzamiColors.white),
              ),
            const SizedBox(height: BanzamiSpacing.xxl),
            Row(
              children: [
                _ActionButton(
                  icon:    Icons.qr_code_scanner_rounded,
                  label:   'Scan',
                  onTap:   onScan,
                  primary: true,
                ),
                const SizedBox(width: BanzamiSpacing.md),
                _ActionButton(
                  icon:  Icons.arrow_upward_rounded,
                  label: 'Enviar',
                  onTap: onSend,
                ),
                const SizedBox(width: BanzamiSpacing.md),
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
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool primary;

  const _ActionButton({
    required this.icon,
    required this.label,
    required this.onTap,
    this.primary = false,
  });

  @override
  Widget build(BuildContext context) {
    final bg = primary ? BanzamiColors.white : BanzamiColors.white.withValues(alpha: 0.15);
    final fg = primary ? BanzamiColors.wine  : BanzamiColors.white;

    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          padding:    const EdgeInsets.symmetric(vertical: BanzamiSpacing.md),
          decoration: BoxDecoration(
            color:        bg,
            borderRadius: BanzamiRadius.mdAll,
          ),
          child: Column(
            children: [
              Icon(icon, color: fg, size: 24),
              const SizedBox(height: BanzamiSpacing.xs),
              Text(label, style: BanzamiTextStyles.label.copyWith(color: fg)),
            ],
          ),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Sandbox fund panel
// ---------------------------------------------------------------------------

class _SandboxFundPanel extends StatefulWidget {
  final ConsumerPublicClient client;
  final VoidCallback onFunded;

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
        BanzamiSpacing.lg, BanzamiSpacing.lg, BanzamiSpacing.lg, 0,
      ),
      padding: const EdgeInsets.all(BanzamiSpacing.lg),
      decoration: BoxDecoration(
        color:        const Color(0xFFFEF3C7),
        borderRadius: BorderRadius.circular(BanzamiRadius.md),
        border:       Border.all(color: const Color(0xFFF59E0B)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            const Icon(Icons.science_rounded, size: 16, color: Color(0xFF92400E)),
            const SizedBox(width: BanzamiSpacing.xs),
            Text(
              'Modo Sandbox — adicionar fundos',
              style: BanzamiTextStyles.bodySm.copyWith(
                color:      const Color(0xFF92400E),
                fontWeight: FontWeight.w600,
              ),
            ),
          ]),
          const SizedBox(height: BanzamiSpacing.md),
          Wrap(
            spacing: BanzamiSpacing.sm,
            runSpacing: BanzamiSpacing.sm,
            children: _presets.map((p) {
              return OutlinedButton(
                onPressed: _loading ? null : () => _fund(p.minor),
                style: OutlinedButton.styleFrom(
                  foregroundColor: const Color(0xFF92400E),
                  side: const BorderSide(color: Color(0xFFF59E0B)),
                  padding: const EdgeInsets.symmetric(
                    horizontal: BanzamiSpacing.md,
                    vertical:   BanzamiSpacing.xs,
                  ),
                  textStyle: BanzamiTextStyles.bodySm,
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                ),
                child: _loading
                    ? const SizedBox(
                        width: 12, height: 12,
                        child: CircularProgressIndicator(strokeWidth: 1.5, color: Color(0xFF92400E)),
                      )
                    : Text(p.label),
              );
            }).toList(),
          ),
          if (_success != null) ...[
            const SizedBox(height: BanzamiSpacing.sm),
            Text(_success!, style: BanzamiTextStyles.bodySm.copyWith(color: const Color(0xFF166534))),
          ],
          if (_error != null) ...[
            const SizedBox(height: BanzamiSpacing.sm),
            Text(_error!, style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.error)),
          ],
        ],
      ),
    );
  }
}
