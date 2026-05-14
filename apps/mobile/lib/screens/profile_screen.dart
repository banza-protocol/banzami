import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:banzami_sdk/banzami_sdk.dart';

import '../services/session_service.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  bool _bioBusy = false;

  Future<void> _toggleBio(SessionService svc, bool enable) async {
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

  Future<void> _confirmLogout(BuildContext context, SessionService svc) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title:   const Text('Terminar sessão?'),
        content: const Text('A aplicação vai bloquear. Introduza o PIN para voltar a entrar.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancelar')),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Bloquear', style: TextStyle(color: BanzamiColors.error)),
          ),
        ],
      ),
    );
    if (confirm == true) await svc.logout();
  }

  Future<void> _confirmClearAccount(BuildContext context, SessionService svc) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title:   const Text('Remover conta?'),
        content: const Text('Todos os dados guardados serão apagados. Terá de criar conta ou entrar novamente.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancelar')),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Remover', style: TextStyle(color: BanzamiColors.error)),
          ),
        ],
      ),
    );
    if (confirm == true) await svc.clearAccount();
  }

  @override
  Widget build(BuildContext context) {
    final svc     = context.watch<SessionService>();
    final session = svc.session!;

    return Scaffold(
      backgroundColor: BanzamiColors.offWhite,
      appBar: AppBar(
        backgroundColor: BanzamiColors.white,
        foregroundColor: BanzamiColors.gray900,
        elevation:       0,
        title:           const Text('Perfil', style: BanzamiTextStyles.headingSm),
      ),
      body: ListView(
        children: [
          // Avatar + name
          Container(
            color:   BanzamiColors.white,
            padding: const EdgeInsets.all(BanzamiSpacing.xl),
            child: Row(children: [
              CircleAvatar(
                radius:          28,
                backgroundColor: BanzamiColors.wine.withValues(alpha: 0.12),
                child: Text(
                  session.handle[0].toUpperCase(),
                  style: BanzamiTextStyles.headingLg.copyWith(color: BanzamiColors.wine),
                ),
              ),
              const SizedBox(width: BanzamiSpacing.lg),
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(
                  session.displayName ?? '@${session.handle}',
                  style: BanzamiTextStyles.headingSm,
                ),
                if (session.displayName != null)
                  Text('@${session.handle}',
                    style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.gray400)),
              ]),
            ]),
          ),

          const SizedBox(height: 8),

          // Handle — tap to copy
          _Section(children: [
            ListTile(
              leading:  const Icon(Icons.alternate_email_rounded, color: BanzamiColors.wine),
              title:    const Text('Endereço de pagamento'),
              subtitle: Text('@${session.handle}'),
              trailing: const Icon(Icons.copy_rounded, size: 18, color: BanzamiColors.gray400),
              onTap: () async {
                await Clipboard.setData(ClipboardData(text: '@${session.handle}'));
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Handle copiado')),
                  );
                }
              },
            ),
          ]),

          const SizedBox(height: 8),

          // Security
          _Section(children: [
            FutureBuilder<bool>(
              future: svc.canUseBiometrics(),
              builder: (_, snap) {
                if (snap.data != true) return const SizedBox.shrink();
                return SwitchListTile(
                  secondary:    const Icon(Icons.fingerprint_rounded, color: BanzamiColors.wine),
                  title:        const Text('Biometria'),
                  subtitle:     const Text('Face ID / impressão digital'),
                  value:        session.biometricsEnabled,
                  activeThumbColor:  BanzamiColors.wine,
                  onChanged:    _bioBusy ? null : (v) => _toggleBio(svc, v),
                );
              },
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
              leading:  const Icon(Icons.delete_outline_rounded, color: BanzamiColors.gray400),
              title:    const Text('Remover conta',
                  style: TextStyle(color: BanzamiColors.gray600)),
              subtitle: const Text('Apaga todos os dados guardados'),
              onTap:    () => _confirmClearAccount(context, svc),
            ),
          ]),

          const SizedBox(height: 32),
          Center(child: Text('Banzami v1.0',
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
      color:  BanzamiColors.white,
      child:  Column(children: children),
    );
  }
}
