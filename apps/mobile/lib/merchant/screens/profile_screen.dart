import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:banzami_sdk/banzami_sdk.dart';

import '../services/merchant_session_service.dart';
import 'payout_screen.dart';

class MerchantProfileScreen extends StatefulWidget {
  const MerchantProfileScreen({super.key});

  @override
  State<MerchantProfileScreen> createState() => _MerchantProfileScreenState();
}

class _MerchantProfileScreenState extends State<MerchantProfileScreen> {
  bool _bioBusy = false;

  Future<void> _toggleBio(MerchantSessionService svc, bool enable) async {
    setState(() => _bioBusy = true);
    try {
      if (enable) {
        final ok = await svc.authenticateWithBiometrics();
        if (ok) await svc.enableBiometrics();
      } else {
        await svc.disableBiometrics();
      }
    } finally {
      if (mounted) setState(() => _bioBusy = false);
    }
  }

  static String _fmtExpiry(DateTime dt) {
    final local = dt.toLocal();
    String pad(int n) => n.toString().padLeft(2, '0');
    return 'Expira em ${local.day}/${pad(local.month)}/${local.year} às ${pad(local.hour)}:${pad(local.minute)}';
  }

  Future<void> _confirmLogout(BuildContext context, MerchantSessionService svc) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title:   const Text('Terminar sessão?'),
        content: const Text('O ecrã vai bloquear. Introduza o PIN para voltar a entrar.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Sair', style: TextStyle(color: BanzamiColors.error)),
          ),
        ],
      ),
    );
    if (confirm == true) await svc.logout();
  }

  Future<void> _confirmClearAccount(BuildContext context, MerchantSessionService svc) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title:   const Text('Remover conta?'),
        content: const Text('Todas as credenciais guardadas serão apagadas. Terá de reconfigurar a aplicação para voltar a usar.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Remover', style: TextStyle(color: BanzamiColors.error)),
          ),
        ],
      ),
    );
    if (confirm == true) await svc.clearAccount();
  }

  @override
  Widget build(BuildContext context) {
    final svc     = context.watch<MerchantSessionService>();
    final session = svc.session!;

    return Scaffold(
      backgroundColor: BanzamiColors.offWhite,
      appBar: AppBar(
        backgroundColor: BanzamiColors.white,
        foregroundColor: BanzamiColors.gray900,
        elevation:       0,
        title: const Text('Perfil', style: BanzamiTextStyles.headingSm),
      ),
      body: ListView(
        children: [
          // Avatar + nome
          Container(
            color:   BanzamiColors.white,
            padding: const EdgeInsets.all(BanzamiSpacing.xl),
            child: Row(children: [
              CircleAvatar(
                radius:          28,
                backgroundColor: BanzamiColors.wine.withValues(alpha: 0.12),
                child: Text(
                  session.merchantName[0].toUpperCase(),
                  style: BanzamiTextStyles.headingLg.copyWith(color: BanzamiColors.wine),
                ),
              ),
              const SizedBox(width: BanzamiSpacing.lg),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(session.merchantName, style: BanzamiTextStyles.headingSm),
                Text(session.merchantEmail,
                    style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.gray400),
                    overflow: TextOverflow.ellipsis),
                if (session.verified) ...[
                  const SizedBox(height: 4),
                  const _VerificationBadge(),
                ],
              ])),
            ]),
          ),

          const SizedBox(height: 8),

          // Merchant ID — tap to copy
          _Section(children: [
            ListTile(
              leading:  const Icon(Icons.badge_outlined, color: BanzamiColors.wine),
              title:    const Text('Merchant ID'),
              subtitle: Text(session.merchantId, overflow: TextOverflow.ellipsis),
              trailing: const Icon(Icons.copy_rounded, size: 18, color: BanzamiColors.gray400),
              onTap: () async {
                await Clipboard.setData(ClipboardData(text: session.merchantId));
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Merchant ID copiado')),
                  );
                }
              },
            ),
          ]),

          const SizedBox(height: 8),

          // Sessão API
          _Section(children: [
            Builder(builder: (ctx) {
              final expiry = ctx.watch<BanzamiClient>().sessionExpiresAt;
              final label  = expiry == null
                  ? 'Renovada automaticamente a cada 24 h'
                  : _fmtExpiry(expiry);
              return ListTile(
                leading:  const Icon(Icons.access_time_rounded, color: BanzamiColors.wine),
                title:    const Text('Sessão API'),
                subtitle: Text(label),
              );
            }),
          ]),

          const SizedBox(height: 8),

          // Segurança
          _Section(children: [
            FutureBuilder<bool>(
              future: svc.canUseBiometrics(),
              builder: (_, snap) {
                if (snap.data != true) return const SizedBox.shrink();
                return SwitchListTile(
                  secondary:       const Icon(Icons.fingerprint_rounded, color: BanzamiColors.wine),
                  title:           const Text('Biometria'),
                  subtitle:        const Text('Face ID / impressão digital'),
                  value:           session.biometricsEnabled,
                  activeThumbColor: BanzamiColors.wine,
                  onChanged:       _bioBusy ? null : (v) => _toggleBio(svc, v),
                );
              },
            ),
          ]),

          const SizedBox(height: 8),

          // Levantamento
          _Section(children: [
            ListTile(
              leading: const Icon(Icons.account_balance_outlined, color: BanzamiColors.wine),
              title:   const Text('Pedir levantamento'),
              subtitle: const Text('Transferir saldo para conta bancária'),
              trailing: const Icon(Icons.chevron_right_rounded, color: BanzamiColors.gray400),
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const PayoutScreen()),
              ),
            ),
          ]),

          const SizedBox(height: 8),

          // Logout / conta
          _Section(children: [
            ListTile(
              leading: const Icon(Icons.logout_rounded, color: BanzamiColors.error),
              title:   const Text('Terminar sessão',
                  style: TextStyle(color: BanzamiColors.error)),
              onTap:   () => _confirmLogout(context, svc),
            ),
            const Divider(height: 1, indent: 56),
            ListTile(
              leading: const Icon(Icons.delete_outline_rounded, color: BanzamiColors.gray400),
              title:   const Text('Remover conta',
                  style: TextStyle(color: BanzamiColors.gray600)),
              subtitle: const Text('Apaga todas as credenciais guardadas'),
              onTap:   () => _confirmClearAccount(context, svc),
            ),
          ]),

          const SizedBox(height: 32),
          Center(child: Text('Banzami Business v1.0',
              style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.gray400))),
          const SizedBox(height: 16),
        ],
      ),
    );
  }
}

class _Section extends StatelessWidget {
  final List<Widget> children;
  const _Section({required this.children});

  @override
  Widget build(BuildContext context) {
    return Container(
      color: BanzamiColors.white,
      child: Column(children: children),
    );
  }
}

class _VerificationBadge extends StatelessWidget {
  const _VerificationBadge();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: const Color(0xFF1D4ED8).withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(12),
      ),
      child: const Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.verified_rounded, size: 12, color: Color(0xFF1D4ED8)),
          SizedBox(width: 4),
          Text('Verificado',
              style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: Color(0xFF1D4ED8))),
        ],
      ),
    );
  }
}
