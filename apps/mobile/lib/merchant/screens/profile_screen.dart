import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:banza_flutter/banza_flutter.dart';

import '../services/merchant_session_service.dart';
import 'payout_screen.dart';

class MerchantProfileScreen extends StatefulWidget {
  const MerchantProfileScreen({super.key});

  @override
  State<MerchantProfileScreen> createState() => _MerchantProfileScreenState();
}

class _MerchantProfileScreenState extends State<MerchantProfileScreen> {
  bool          _bioBusy = false;
  bool          _copied  = false;
  Future<bool>? _canUseBio;

  @override
  Widget build(BuildContext context) {
    final svc     = context.watch<MerchantSessionService>();
    final session = svc.session!;

    _canUseBio ??= svc.canUseBiometrics();

    return Scaffold(
      backgroundColor: BanzaColors.offWhite,
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.symmetric(horizontal: BanzaSpacing.lg),
          children: [
            const SizedBox(height: BanzaSpacing.xl),

            const Text('Perfil', style: BanzaTextStyles.headingMd),

            const SizedBox(height: BanzaSpacing.lg),

            _MerchantProfileHeader(session: session),

            const SizedBox(height: BanzaSpacing.sm),

            _MerchantIdCard(
              merchantId: session.merchantId,
              copied:     _copied,
              onCopy:     _copyId,
            ),

            const SizedBox(height: BanzaSpacing.sm),

            // Sessão API
            Builder(builder: (ctx) {
              final expiry = ctx.watch<BanzaClient>().sessionExpiresAt;
              return _InfoCard(
                icon:  Icons.access_time_rounded,
                title: 'Sessão API',
                value: expiry == null
                    ? 'Renovada automaticamente a cada 24 h'
                    : _fmtExpiry(expiry),
              );
            }),

            const SizedBox(height: BanzaSpacing.sm),

            FutureBuilder<bool>(
              future: _canUseBio,
              builder: (_, snap) {
                if (snap.data != true) return const SizedBox.shrink();
                return Column(children: [
                  _SecuritySection(
                    biometricsEnabled: session.biometricsEnabled,
                    busy:              _bioBusy,
                    onToggle:          (v) => _toggleBio(svc, v),
                  ),
                  const SizedBox(height: BanzaSpacing.sm),
                ]);
              },
            ),

            _ActionTile(
              icon:     Icons.account_balance_outlined,
              label:    'Pedir levantamento',
              sublabel: 'Transferir saldo para conta bancária',
              color:    BanzaColors.wine,
              onTap:    () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const PayoutScreen()),
              ),
            ),

            const SizedBox(height: BanzaSpacing.sm),

            _ActionTile(
              icon:  Icons.logout_rounded,
              label: 'Terminar sessão',
              color: BanzaColors.wine,
              onTap: () => _confirmLogout(svc),
            ),

            const SizedBox(height: BanzaSpacing.sm),

            _ActionTile(
              icon:     Icons.delete_outline_rounded,
              label:    'Remover conta',
              sublabel: 'Apaga todas as credenciais guardadas',
              color:    BanzaColors.gray400,
              onTap:    () => _confirmClearAccount(svc),
            ),

            const SizedBox(height: BanzaSpacing.xxl),

            Center(
              child: Text(
                'Banza Business v1.0',
                style: BanzaTextStyles.bodySm.copyWith(color: BanzaColors.gray400),
              ),
            ),

            const SizedBox(height: BanzaSpacing.xl),
          ],
        ),
      ),
    );
  }

  static String _fmtExpiry(DateTime dt) {
    final local = dt.toLocal();
    String pad(int n) => n.toString().padLeft(2, '0');
    return 'Expira em ${local.day}/${pad(local.month)}/${local.year} às ${pad(local.hour)}:${pad(local.minute)}';
  }

  Future<void> _copyId() async {
    final svc = context.read<MerchantSessionService>();
    await Clipboard.setData(ClipboardData(text: svc.session!.merchantId));
    setState(() => _copied = true);
    await Future.delayed(const Duration(seconds: 2));
    if (mounted) setState(() => _copied = false);
  }

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

  Future<void> _confirmLogout(MerchantSessionService svc) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape:   const RoundedRectangleBorder(borderRadius: BanzaRadius.xlAll),
        title:   const Text('Terminar sessão?'),
        content: const Text('O ecrã vai bloquear. Introduza o PIN para voltar a entrar.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Sair', style: TextStyle(color: BanzaColors.wine)),
          ),
        ],
      ),
    );
    if (confirm == true) await svc.logout();
  }

  Future<void> _confirmClearAccount(MerchantSessionService svc) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape:   const RoundedRectangleBorder(borderRadius: BanzaRadius.xlAll),
        title:   const Text('Remover conta?'),
        content: const Text(
          'Todas as credenciais guardadas serão apagadas. Terá de reconfigurar a aplicação para voltar a usar.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Remover', style: TextStyle(color: BanzaColors.error)),
          ),
        ],
      ),
    );
    if (confirm == true) await svc.clearAccount();
  }
}

// =============================================================================
// 1. Profile header
// =============================================================================

class _MerchantProfileHeader extends StatelessWidget {
  final MerchantSession session;
  const _MerchantProfileHeader({required this.session});

  @override
  Widget build(BuildContext context) {
    final initial = session.merchantName[0].toUpperCase();

    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        gradient:     BanzaGradients.wine,
        borderRadius: BanzaRadius.xlAll,
        boxShadow: [
          BoxShadow(
            color:      BanzaColors.wineDark.withValues(alpha: 0.30),
            blurRadius: 24,
            offset:     const Offset(0, 8),
          ),
        ],
      ),
      padding: const EdgeInsets.all(BanzaSpacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              _Avatar(initial: initial),
              const SizedBox(width: BanzaSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      session.merchantName,
                      style: BanzaTextStyles.headingSm.copyWith(
                        color:      BanzaColors.white,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 1),
                    Text(
                      session.merchantEmail,
                      style: BanzaTextStyles.bodySm.copyWith(
                        color: BanzaColors.white.withValues(alpha: 0.60),
                      ),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
              if (session.verified) ...[
                const SizedBox(width: BanzaSpacing.md),
                const _VerifiedBadge(),
              ],
            ],
          ),
          if (session.verified) ...[
            const SizedBox(height: BanzaSpacing.md),
            Row(children: [
              Icon(
                Icons.shield_outlined,
                size:  13,
                color: BanzaColors.white.withValues(alpha: 0.35),
              ),
              const SizedBox(width: 6),
              Text(
                'Conta de comerciante verificada',
                style: BanzaTextStyles.bodySm.copyWith(
                  color: BanzaColors.white.withValues(alpha: 0.35),
                ),
              ),
            ]),
          ],
        ],
      ),
    );
  }
}

class _Avatar extends StatelessWidget {
  final String initial;
  const _Avatar({required this.initial});

  @override
  Widget build(BuildContext context) {
    return Container(
      width:  52,
      height: 52,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: BanzaColors.white.withValues(alpha: 0.15),
        border: Border.all(
          color: BanzaColors.white.withValues(alpha: 0.30),
          width: 2,
        ),
      ),
      child: Center(
        child: Text(
          initial,
          style: BanzaTextStyles.headingLg.copyWith(
            color:      BanzaColors.white,
            fontSize:   20,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
    );
  }
}

class _VerifiedBadge extends StatelessWidget {
  const _VerifiedBadge();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: BanzaSpacing.md,
        vertical:   5,
      ),
      decoration: BoxDecoration(
        color:        const Color(0xFF1D4ED8).withValues(alpha: 0.15),
        borderRadius: BanzaRadius.fullAll,
        border:       Border.all(color: const Color(0xFF1D4ED8).withValues(alpha: 0.35)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.verified_rounded, size: 12, color: Color(0xFFBFDBFE)),
          const SizedBox(width: 4),
          Text(
            'Verificado',
            style: BanzaTextStyles.label.copyWith(
              color:    const Color(0xFFBFDBFE),
              fontSize: 11,
            ),
          ),
        ],
      ),
    );
  }
}

// =============================================================================
// 2. Merchant ID card
// =============================================================================

class _MerchantIdCard extends StatelessWidget {
  final String       merchantId;
  final bool         copied;
  final VoidCallback onCopy;

  const _MerchantIdCard({
    required this.merchantId,
    required this.copied,
    required this.onCopy,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color:        BanzaColors.white,
        borderRadius: BanzaRadius.xlAll,
        boxShadow:    BanzaShadows.card,
      ),
      padding: const EdgeInsets.symmetric(
        horizontal: BanzaSpacing.lg,
        vertical:   BanzaSpacing.md,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(children: [
            _IconBox(icon: Icons.badge_outlined),
            SizedBox(width: BanzaSpacing.md),
            Text('Merchant ID', style: BanzaTextStyles.headingSm),
          ]),

          const SizedBox(height: BanzaSpacing.sm),

          GestureDetector(
            onTap: onCopy,
            child: Container(
              width:   double.infinity,
              padding: const EdgeInsets.symmetric(
                horizontal: BanzaSpacing.md,
                vertical:   BanzaSpacing.sm,
              ),
              decoration: const BoxDecoration(
                color:        BanzaColors.gray100,
                borderRadius: BanzaRadius.lgAll,
              ),
              child: Row(children: [
                Expanded(
                  child: Text(
                    merchantId,
                    style: BanzaTextStyles.mono.copyWith(
                      fontSize: 12,
                      color:    BanzaColors.gray900,
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                const SizedBox(width: BanzaSpacing.md),
                AnimatedSwitcher(
                  duration: const Duration(milliseconds: 220),
                  transitionBuilder: (child, anim) =>
                      ScaleTransition(scale: anim, child: child),
                  child: copied
                      ? const Icon(
                          Icons.check_rounded,
                          key:   ValueKey('check'),
                          size:  20,
                          color: BanzaColors.success,
                        )
                      : const Icon(
                          Icons.copy_rounded,
                          key:   ValueKey('copy'),
                          size:  20,
                          color: BanzaColors.gray400,
                        ),
                ),
              ]),
            ),
          ),

          const SizedBox(height: BanzaSpacing.sm),

          Text(
            'Toque para copiar o seu identificador único',
            style: BanzaTextStyles.bodySm.copyWith(color: BanzaColors.gray400),
          ),
        ],
      ),
    );
  }
}

// =============================================================================
// 3. Generic info card (Sessão API)
// =============================================================================

class _InfoCard extends StatelessWidget {
  final IconData icon;
  final String   title;
  final String   value;

  const _InfoCard({
    required this.icon,
    required this.title,
    required this.value,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color:        BanzaColors.white,
        borderRadius: BanzaRadius.xlAll,
        boxShadow:    BanzaShadows.card,
      ),
      padding: const EdgeInsets.symmetric(
        horizontal: BanzaSpacing.lg,
        vertical:   BanzaSpacing.md,
      ),
      child: Row(children: [
        _IconBox(icon: icon),
        const SizedBox(width: BanzaSpacing.md),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title,
                  style: BanzaTextStyles.bodyMd.copyWith(fontWeight: FontWeight.w500)),
              const SizedBox(height: 2),
              Text(value,
                  style: BanzaTextStyles.bodySm.copyWith(color: BanzaColors.gray400)),
            ],
          ),
        ),
      ]),
    );
  }
}

// =============================================================================
// 4. Security section (biometrics)
// =============================================================================

class _SecuritySection extends StatelessWidget {
  final bool             biometricsEnabled;
  final bool             busy;
  final void Function(bool) onToggle;

  const _SecuritySection({
    required this.biometricsEnabled,
    required this.busy,
    required this.onToggle,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color:        BanzaColors.white,
        borderRadius: BanzaRadius.xlAll,
        boxShadow:    BanzaShadows.card,
      ),
      padding: const EdgeInsets.symmetric(
        horizontal: BanzaSpacing.lg,
        vertical:   BanzaSpacing.md,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Segurança', style: BanzaTextStyles.headingSm),

          const SizedBox(height: BanzaSpacing.sm),

          Row(children: [
            const _IconBox(icon: Icons.fingerprint_rounded),
            const SizedBox(width: BanzaSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Biometria',
                      style: BanzaTextStyles.bodyMd.copyWith(fontWeight: FontWeight.w500)),
                  Text('Face ID / impressão digital',
                      style: BanzaTextStyles.bodySm.copyWith(color: BanzaColors.gray400)),
                ],
              ),
            ),
            if (busy)
              const SizedBox(
                width:  22,
                height: 22,
                child:  CircularProgressIndicator(strokeWidth: 2, color: BanzaColors.wine),
              )
            else
              Switch(
                value:            biometricsEnabled,
                onChanged:        onToggle,
                activeThumbColor: BanzaColors.wine,
                trackColor: WidgetStateProperty.resolveWith((states) =>
                  states.contains(WidgetState.selected)
                      ? BanzaColors.wine.withValues(alpha: 0.25)
                      : BanzaColors.gray200),
                thumbColor: WidgetStateProperty.resolveWith((states) =>
                  states.contains(WidgetState.selected)
                      ? BanzaColors.wine
                      : BanzaColors.white),
              ),
          ]),
        ],
      ),
    );
  }
}

// =============================================================================
// 5. Action tile
// =============================================================================

class _ActionTile extends StatelessWidget {
  final IconData     icon;
  final String       label;
  final String?      sublabel;
  final Color        color;
  final VoidCallback onTap;

  const _ActionTile({
    required this.icon,
    required this.label,
    this.sublabel,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color:        BanzaColors.white,
        borderRadius: BanzaRadius.xlAll,
        boxShadow:    BanzaShadows.card,
      ),
      child: ClipRRect(
        borderRadius: BanzaRadius.xlAll,
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            onTap:          onTap,
            splashColor:    color.withValues(alpha: 0.05),
            highlightColor: color.withValues(alpha: 0.03),
            child: Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: BanzaSpacing.lg,
                vertical:   BanzaSpacing.md,
              ),
              child: Row(children: [
                _IconBox(icon: icon, color: color),
                const SizedBox(width: BanzaSpacing.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        label,
                        style: BanzaTextStyles.bodyMd.copyWith(
                          color:      color,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                      if (sublabel != null)
                        Text(
                          sublabel!,
                          style: BanzaTextStyles.bodySm.copyWith(
                            color: BanzaColors.gray400,
                          ),
                        ),
                    ],
                  ),
                ),
                Icon(
                  Icons.chevron_right_rounded,
                  size:  20,
                  color: color.withValues(alpha: 0.35),
                ),
              ]),
            ),
          ),
        ),
      ),
    );
  }
}

// =============================================================================
// Shared helpers
// =============================================================================

class _IconBox extends StatelessWidget {
  final IconData icon;
  final Color    color;

  const _IconBox({
    required this.icon,
    this.color = BanzaColors.wine,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width:  36,
      height: 36,
      decoration: BoxDecoration(
        color:        color.withValues(alpha: 0.08),
        borderRadius: BanzaRadius.mdAll,
      ),
      child: Icon(icon, color: color, size: 18),
    );
  }
}
