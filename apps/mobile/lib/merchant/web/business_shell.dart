import 'dart:async';

import 'package:banzami_flutter/banzami_flutter.dart' hide Consumer;
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../platform/web_location.dart';
import 'business_charge_screen.dart';
import 'merchant_web_session.dart';

/// The signed-in Business Web shell — one App Banzami visual universe, the native
/// Business information architecture (Início / Histórico / Receber / Perfil),
/// adapted responsively to the browser (ADR-066 §54).
class BusinessWebShell extends StatefulWidget {
  const BusinessWebShell({super.key});
  @override
  State<BusinessWebShell> createState() => _BusinessWebShellState();
}

class _BusinessWebShellState extends State<BusinessWebShell> {
  int _tab = 0;

  @override
  Widget build(BuildContext context) {
    const tabs = [_HomeTab(), _HistoryTab(), _ReceiveTab(), _ProfileTab()];
    return Scaffold(
      backgroundColor: BanzamiColors.offWhite,
      body: SafeArea(
        bottom: false,
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 640),
            child: IndexedStack(index: _tab, children: tabs),
          ),
        ),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        backgroundColor: Colors.white,
        indicatorColor: BanzamiColors.primary.withValues(alpha: 0.12),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home_rounded), label: 'Início'),
          NavigationDestination(icon: Icon(Icons.receipt_long_outlined), selectedIcon: Icon(Icons.receipt_long), label: 'Histórico'),
          NavigationDestination(icon: Icon(Icons.qr_code_2_outlined), selectedIcon: Icon(Icons.qr_code_2), label: 'Receber'),
          NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person), label: 'Perfil'),
        ],
      ),
    );
  }
}

// ── Shared bits ───────────────────────────────────────────────────────────────
class _SandboxChip extends StatelessWidget {
  const _SandboxChip();
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: const Color(0xFFFBF3D0), borderRadius: BorderRadius.circular(8)),
      child: const Text('SANDBOX · Dinheiro de teste', style: TextStyle(fontSize: 12, color: Color(0xFF8A6D1B), fontWeight: FontWeight.w600)),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  final String title;
  const _SectionHeader(this.title);
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 8),
        child: Align(alignment: Alignment.centerLeft, child: Text(title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: BanzamiColors.gray900))),
      );
}

// ── Início ────────────────────────────────────────────────────────────────────
class _HomeTab extends StatefulWidget {
  const _HomeTab();
  @override
  State<_HomeTab> createState() => _HomeTabState();
}

class _HomeTabState extends State<_HomeTab> {
  MerchantBalance? _balance;
  List<MerchantWalletPayment> _recent = const [];
  bool _loading = true;
  String? _error;
  Timer? _poll;

  @override
  void initState() {
    super.initState();
    _load();
    // Canonical server-truth convergence without a manual pull (mirrors the native
    // Business app's poll): an incoming payment shows on Home on its own. No local
    // arithmetic — every value is re-read from the server.
    _poll = Timer.periodic(const Duration(seconds: 10), (_) { if (mounted) _load(); });
  }

  @override
  void dispose() {
    _poll?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    final session = context.read<MerchantWebSession>();
    setState(() { _loading = true; _error = null; });
    try {
      final wid = session.walletId;
      if (wid != null) _balance = await session.client.getMerchantBalance(wid);
      final page = await session.client.listMerchantWalletPayments(limit: 8);
      _recent = page.items;
    } catch (_) {
      _error = 'Não foi possível carregar. Puxe para actualizar.';
    }
    if (mounted) setState(() => _loading = false);
  }

  @override
  Widget build(BuildContext context) {
    final session = context.watch<MerchantWebSession>();
    final name = session.merchant?.name ?? 'Negócio';
    return RefreshIndicator(
      color: BanzamiColors.primary,
      onRefresh: () async { await session.refresh(); await _load(); },
      child: ListView(
        padding: const EdgeInsets.only(bottom: 24),
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
            child: Row(
              children: [
                Expanded(child: Text('Olá, $name', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700, color: BanzamiColors.gray900))),
                if (session.isSandbox) const _SandboxChip(),
              ],
            ),
          ),
          if (session.handle.isNotEmpty)
            Padding(padding: const EdgeInsets.fromLTRB(20, 2, 20, 0), child: Align(alignment: Alignment.centerLeft, child: Text('@${session.handle}', style: const TextStyle(color: BanzamiColors.gray400, fontSize: 14)))),
          Padding(
            padding: const EdgeInsets.all(20),
            child: Container(
              padding: const EdgeInsets.all(22),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: const Color(0xFFEEE4E4)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Saldo disponível', style: TextStyle(color: BanzamiColors.gray400, fontSize: 14)),
                  const SizedBox(height: 8),
                  _loading
                      ? const Padding(padding: EdgeInsets.symmetric(vertical: 6), child: SizedBox(height: 28, width: 28, child: CircularProgressIndicator(strokeWidth: 2, color: BanzamiColors.primary)))
                      : MoneyAmount(_balance?.availableMinor ?? 0, size: MoneySize.xl, tone: MoneyTone.brand),
                  const SizedBox(height: 6),
                  const Text('Carteira Banzami Business', style: TextStyle(color: BanzamiColors.gray400, fontSize: 13)),
                ],
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Row(
              children: [
                Expanded(child: _ActionTile(icon: Icons.qr_code_2_rounded, label: 'Receber', onTap: () => _goReceive(context))),
                const SizedBox(width: 12),
                Expanded(child: _ActionTile(icon: Icons.add_rounded, label: 'Criar cobrança', onTap: () => _goCharge(context))),
              ],
            ),
          ),
          const _SectionHeader('Actividade recente'),
          if (_error != null) Padding(padding: const EdgeInsets.symmetric(horizontal: 20), child: Text(_error!, style: const TextStyle(color: BanzamiColors.gray400)))
          else if (_recent.isEmpty && !_loading) const Padding(padding: EdgeInsets.symmetric(horizontal: 20), child: Text('Ainda sem pagamentos recebidos.', style: TextStyle(color: BanzamiColors.gray400)))
          else ..._recent.map((p) => _PaymentRow(p)),
        ],
      ),
    );
  }

  void _goReceive(BuildContext context) {
    final shell = context.findAncestorStateOfType<_BusinessWebShellState>();
    shell?.setState(() => shell._tab = 2);
  }

  void _goCharge(BuildContext context) => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const BusinessChargeScreen()));
}

class _ActionTile extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  const _ActionTile({required this.icon, required this.label, required this.onTap});
  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 18),
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16), border: Border.all(color: const Color(0xFFEEE4E4))),
        child: Column(children: [Icon(icon, color: BanzamiColors.primary), const SizedBox(height: 8), Text(label, style: const TextStyle(fontWeight: FontWeight.w600, color: BanzamiColors.gray900))]),
      ),
    );
  }
}

class _PaymentRow extends StatelessWidget {
  final MerchantWalletPayment p;
  const _PaymentRow(this.p);
  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: CircleAvatar(backgroundColor: BanzamiColors.primary.withValues(alpha: 0.1), child: const Icon(Icons.south_west_rounded, color: BanzamiColors.primary, size: 20)),
      title: Text(p.payerName.isEmpty ? 'Pagamento recebido' : p.payerName, style: const TextStyle(fontWeight: FontWeight.w600)),
      subtitle: Text(p.status, style: const TextStyle(fontSize: 12, color: BanzamiColors.gray400)),
      trailing: MoneyAmount(p.amountMinor, size: MoneySize.sm),
      onTap: () => _showDetail(context, p),
    );
  }

  // Canonical transaction detail — amount, status, date and the proof reference
  // (the same reference the canonical receipt carries; no Business-Web receipt fork).
  void _showDetail(BuildContext context, MerchantWalletPayment p) {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => Padding(
        padding: const EdgeInsets.fromLTRB(24, 20, 24, 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Pagamento recebido', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: BanzamiColors.gray900)),
            const SizedBox(height: 12),
            MoneyAmount(p.amountMinor, currency: p.currency, size: MoneySize.lg, tone: MoneyTone.brand),
            const SizedBox(height: 16),
            _detailRow('De', p.payerName.isEmpty ? '—' : p.payerName),
            _detailRow('Estado', p.status),
            _detailRow('Referência', p.reference.isEmpty ? '—' : p.reference),
          ],
        ),
      ),
    );
  }

  Widget _detailRow(String k, String v) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          Text(k, style: const TextStyle(color: BanzamiColors.gray400)),
          Flexible(child: Text(v, textAlign: TextAlign.right, style: const TextStyle(fontWeight: FontWeight.w600, color: BanzamiColors.gray900))),
        ]),
      );
}

// ── Histórico ─────────────────────────────────────────────────────────────────
class _HistoryTab extends StatefulWidget {
  const _HistoryTab();
  @override
  State<_HistoryTab> createState() => _HistoryTabState();
}

class _HistoryTabState extends State<_HistoryTab> {
  List<MerchantWalletPayment> _payments = const [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final session = context.read<MerchantWebSession>();
    setState(() => _loading = true);
    try {
      final page = await session.client.listMerchantWalletPayments(limit: 50);
      _payments = page.items;
    } catch (_) {/* bounded: show empty with a retry via pull */}
    if (mounted) setState(() => _loading = false);
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      color: BanzamiColors.primary,
      onRefresh: _load,
      child: _loading
          ? const Center(child: CircularProgressIndicator(color: BanzamiColors.primary))
          : ListView(
              children: [
                const _SectionHeader('Recebidos'),
                if (_payments.isEmpty) const Padding(padding: EdgeInsets.symmetric(horizontal: 20), child: Text('Ainda sem histórico.', style: TextStyle(color: BanzamiColors.gray400)))
                else ..._payments.map((p) => _PaymentRow(p)),
              ],
            ),
    );
  }
}

// ── Receber (the persistent Business Receive Point — ADR-065) ─────────────────
class _ReceiveTab extends StatefulWidget {
  const _ReceiveTab();
  @override
  State<_ReceiveTab> createState() => _ReceiveTabState();
}

class _ReceiveTabState extends State<_ReceiveTab> {
  MerchantReceivePoint? _point;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final session = context.read<MerchantWebSession>();
    setState(() { _loading = true; _error = null; });
    try {
      _point = await session.client.getReceivePoint();
    } catch (_) {
      _error = 'Não foi possível obter o seu QR. Tente novamente.';
    }
    if (mounted) setState(() => _loading = false);
  }

  @override
  Widget build(BuildContext context) {
    final session = context.watch<MerchantWebSession>();
    if (_loading) return const Center(child: CircularProgressIndicator(color: BanzamiColors.primary));
    if (_error != null || _point == null) {
      return Center(child: Padding(padding: const EdgeInsets.all(24), child: Column(mainAxisSize: MainAxisSize.min, children: [Text(_error ?? 'QR indisponível', textAlign: TextAlign.center, style: const TextStyle(color: BanzamiColors.gray400)), const SizedBox(height: 16), FilledButton(onPressed: _load, style: FilledButton.styleFrom(backgroundColor: BanzamiColors.primary), child: const Text('Tentar novamente'))])));
    }
    final point = _point!;
    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Column(
        children: [
          const Text('Receber', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700, color: BanzamiColors.gray900)),
          const SizedBox(height: 4),
          Text(session.merchant?.name ?? '', style: const TextStyle(fontSize: 15, color: BanzamiColors.gray900, fontWeight: FontWeight.w600)),
          if (session.handle.isNotEmpty) Text('@${session.handle}', style: const TextStyle(color: BanzamiColors.gray400)),
          const SizedBox(height: 6),
          if (session.isSandbox) const _SandboxChip(),
          const SizedBox(height: 20),
          if (point.isActive)
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(24), border: Border.all(color: const Color(0xFFEEE4E4))),
              child: BanzamiQrDisplay(payload: point.payUrl, size: 260),
            )
          else
            const Padding(padding: EdgeInsets.all(24), child: Text('O seu ponto de recebimento não está activo.', style: TextStyle(color: BanzamiColors.gray400))),
          const SizedBox(height: 16),
          const Text('Mostre este QR para receber pagamentos na App Banzami.', textAlign: TextAlign.center, style: TextStyle(color: BanzamiColors.gray400, fontSize: 14, height: 1.4)),
          const SizedBox(height: 20),
          FilledButton.icon(
            onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const BusinessChargeScreen())),
            style: FilledButton.styleFrom(backgroundColor: BanzamiColors.primary, padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14)),
            icon: const Icon(Icons.add_rounded),
            label: const Text('Criar cobrança'),
          ),
        ],
      ),
    );
  }
}

// ── Perfil ────────────────────────────────────────────────────────────────────
class _ProfileTab extends StatelessWidget {
  const _ProfileTab();
  @override
  Widget build(BuildContext context) {
    final session = context.watch<MerchantWebSession>();
    final m = session.merchant;
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        const SizedBox(height: 8),
        CircleAvatar(radius: 32, backgroundColor: BanzamiColors.primary, child: Text((m?.name.isNotEmpty == true ? m!.name[0] : 'B').toUpperCase(), style: const TextStyle(color: Colors.white, fontSize: 26, fontWeight: FontWeight.w700))),
        const SizedBox(height: 12),
        Center(child: Text(m?.name ?? 'Negócio', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: BanzamiColors.gray900))),
        if (session.handle.isNotEmpty) Center(child: Text('@${session.handle}', style: const TextStyle(color: BanzamiColors.gray400))),
        const SizedBox(height: 8),
        if (session.isSandbox) const Center(child: _SandboxChip()),
        const SizedBox(height: 24),
        _tile(Icons.swap_horiz_rounded, 'Mudar para Pessoal', 'Ir para a sua conta pessoal', () => navigateToPath('/')),
        _tile(Icons.logout_rounded, 'Terminar sessão Business', 'Sair apenas do Business', () => _confirmLogout(context)),
      ],
    );
  }

  Widget _tile(IconData icon, String title, String subtitle, VoidCallback onTap) => Card(
        elevation: 0,
        color: Colors.white,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14), side: const BorderSide(color: Color(0xFFEEE4E4))),
        child: ListTile(leading: Icon(icon, color: BanzamiColors.primary), title: Text(title, style: const TextStyle(fontWeight: FontWeight.w600)), subtitle: Text(subtitle, style: const TextStyle(fontSize: 12, color: BanzamiColors.gray400)), onTap: onTap),
      );

  Future<void> _confirmLogout(BuildContext context) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Terminar sessão Business?'),
        content: const Text('A sua conta Pessoal continua ligada.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
          FilledButton(style: FilledButton.styleFrom(backgroundColor: BanzamiColors.primary), onPressed: () => Navigator.pop(ctx, true), child: const Text('Terminar')),
        ],
      ),
    );
    if (ok == true && context.mounted) await context.read<MerchantWebSession>().logout();
  }
}
