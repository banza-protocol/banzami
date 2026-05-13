import 'package:flutter/material.dart';

import '../client/banzami_client.dart';
import '../models/transfer.dart';
import '../models/wallet_balance.dart';
import '../theme/banzami_theme.dart';
import '../widgets/banzami_transfer_item.dart';
import 'receive_screen.dart';
import 'scan_screen.dart';
import 'send_screen.dart';

/// The main payment hub screen.
///
/// Hierarchy (per brand spec):
///   1. Available balance — dominant, immediately visible
///   2. Scan QR  — primary action
///   3. Send     — second action
///   4. Receive  — third action
///   5. Recent activity — scrollable below the fold
class BanzamiHomeScreen extends StatefulWidget {
  final BanzamiClient client;
  final String consumerId;
  final String walletId;

  const BanzamiHomeScreen({
    super.key,
    required this.client,
    required this.consumerId,
    required this.walletId,
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
      final bal = await widget.client.getBalance(widget.walletId);
      if (mounted) setState(() { _balance = bal; _loadingBalance = false; });
    } catch (e) {
      if (mounted) setState(() { _error = 'Não foi possível carregar o saldo'; _loadingBalance = false; });
    }
  }

  Future<void> _loadTransfers() async {
    try {
      final page = await widget.client.listTransfers(consumerId: widget.consumerId, limit: 20);
      if (mounted) setState(() { _transfers = page.data; _loadingTransfers = false; });
    } catch (_) {
      if (mounted) setState(() { _loadingTransfers = false; });
    }
  }

  void _onScan() => Navigator.of(context).push(MaterialPageRoute(
    builder: (_) => BanzamiScanScreen(
      client:     widget.client,
      consumerId: widget.consumerId,
      onSuccess:  (_) { Navigator.of(context).pop(); _load(); },
    ),
  ));

  void _onSend() => Navigator.of(context).push(MaterialPageRoute(
    builder: (_) => BanzamiSendScreen(
      client:     widget.client,
      senderId:   widget.consumerId,
      onSuccess:  (_) { Navigator.of(context).pop(); _load(); },
    ),
  ));

  void _onReceive() => Navigator.of(context).push(MaterialPageRoute(
    builder: (_) => BanzamiReceiveScreen(
      client:    widget.client,
      ownerId:   widget.consumerId,
      walletId:  widget.walletId,
    ),
  ));

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: BanzamiColors.offWhite,
      body: RefreshIndicator(
        color:        BanzamiColors.wine,
        onRefresh:    _load,
        child: CustomScrollView(
          slivers: [
            _BalanceHeader(
              balance:        _balance,
              loading:        _loadingBalance,
              error:          _error,
              onScan:         _onScan,
              onSend:         _onSend,
              onReceive:      _onReceive,
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
                  (context, i) {
                    final t = _transfers[i];
                    return BanzamiTransferItem(
                      transfer:          t,
                      currentConsumerId: widget.consumerId,
                    );
                  },
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
        color: BanzamiColors.wine,
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
            else if (error != null)
              Text(
                '— Kz',
                style: BanzamiTextStyles.displayLg.copyWith(color: BanzamiColors.white),
              )
            else
              Text(
                balance?.availableFormatted ?? '0 Kz',
                style: BanzamiTextStyles.displayLg.copyWith(color: BanzamiColors.white),
              ),

            const SizedBox(height: BanzamiSpacing.xxl),

            // Action buttons row
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
    final bg   = primary ? BanzamiColors.white : BanzamiColors.white.withValues(alpha: 0.15);
    final fg   = primary ? BanzamiColors.wine  : BanzamiColors.white;

    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          padding:     const EdgeInsets.symmetric(vertical: BanzamiSpacing.md),
          decoration:  BoxDecoration(
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
