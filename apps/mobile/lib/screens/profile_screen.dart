import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:banza_flutter/banza_flutter.dart';

import '../services/session_service.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  bool          _bioBusy = false;
  bool          _copied  = false;
  Future<bool>? _canUseBio;

  @override
  Widget build(BuildContext context) {
    final svc     = context.watch<SessionService>();
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

            _ProfileHeader(session: session),

            const SizedBox(height: BanzaSpacing.sm),

            _PaymentAddressCard(
              handle: session.handle,
              copied: _copied,
              onCopy: _copyHandle,
            ),

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
                    onPinTap:          _showPinComingSoon,
                  ),
                  const SizedBox(height: BanzaSpacing.sm),
                ]);
              },
            ),

            // "Conta" section label
            Padding(
              padding: const EdgeInsets.only(
                left: BanzaSpacing.xs,
                bottom: BanzaSpacing.sm,
              ),
              child: Text(
                'Conta',
                style: BanzaTextStyles.label.copyWith(
                  color:         BanzaColors.gray400,
                  letterSpacing: 0.4,
                ),
              ),
            ),

            _ActionTile(
              icon:    Icons.logout_rounded,
              label:   'Terminar sessão',
              color:   BanzaColors.wine,
              onTap:   () => _confirmLogout(svc),
            ),

            const SizedBox(height: BanzaSpacing.sm),

            _ActionTile(
              icon:     Icons.delete_outline_rounded,
              label:    'Remover conta',
              sublabel: 'Apaga todos os dados guardados',
              color:    BanzaColors.gray400,
              onTap:    () => _confirmClearAccount(svc),
            ),

            const SizedBox(height: BanzaSpacing.xxl),

            Center(
              child: Text(
                'Banza v1.0',
                style: BanzaTextStyles.bodySm.copyWith(color: BanzaColors.gray400),
              ),
            ),

            const SizedBox(height: BanzaSpacing.xl),
          ],
        ),
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  Future<void> _copyHandle() async {
    final svc = context.read<SessionService>();
    await Clipboard.setData(ClipboardData(text: '@${svc.session!.handle}'));
    setState(() => _copied = true);
    await Future.delayed(const Duration(seconds: 2));
    if (mounted) setState(() => _copied = false);
  }

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

  void _showPinComingSoon() {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Gestão de PIN em breve'),
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  Future<void> _confirmLogout(SessionService svc) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape:   const RoundedRectangleBorder(borderRadius: BanzaRadius.xlAll),
        title:   const Text('Terminar sessão?'),
        content: const Text(
          'Vai sair da conta neste dispositivo. Pode entrar novamente quando quiser.',
        ),
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

  Future<void> _confirmClearAccount(SessionService svc) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape:   const RoundedRectangleBorder(borderRadius: BanzaRadius.xlAll),
        title:   const Text('Remover conta?'),
        content: const Text(
          'Todos os dados guardados serão apagados. Terá de criar conta ou entrar novamente.',
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
// 1. Profile header — dark premium identity card
// =============================================================================

class _ProfileHeader extends StatelessWidget {
  final Session session;
  const _ProfileHeader({required this.session});

  @override
  Widget build(BuildContext context) {
    final initial = (session.displayName ?? session.handle)[0].toUpperCase();
    final name    = session.displayName ?? '@${session.handle}';

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
                      name,
                      style: BanzaTextStyles.headingSm.copyWith(
                        color:      BanzaColors.white,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    if (session.displayName != null) ...[
                      const SizedBox(height: 1),
                      Text(
                        '@${session.handle}',
                        style: BanzaTextStyles.bodySm.copyWith(
                          color: BanzaColors.white.withValues(alpha: 0.50),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              if (session.verificationBadge != null) ...[
                const SizedBox(width: BanzaSpacing.md),
                _VerificationBadge(type: session.verificationBadge!),
              ],
            ],
          ),

          if (session.verificationBadge != null) ...[
            const SizedBox(height: BanzaSpacing.md),
            Row(children: [
              Icon(
                Icons.shield_outlined,
                size:  13,
                color: BanzaColors.white.withValues(alpha: 0.35),
              ),
              const SizedBox(width: 6),
              Text(
                session.verificationBadge == VerificationBadgeType.merchant
                    ? 'Conta de comerciante verificada'
                    : 'Identidade financeira verificada',
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
      decoration: const BoxDecoration(
        shape:    BoxShape.circle,
        gradient: LinearGradient(
          colors: [BanzaColors.gold, BanzaColors.goldLight],
          begin:  Alignment.topLeft,
          end:    Alignment.bottomRight,
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(2),
        child: Container(
          decoration: const BoxDecoration(
            shape: BoxShape.circle,
            color: BanzaColors.wineDark,
          ),
          child: Center(
            child: Text(
              initial,
              style: BanzaTextStyles.headingLg.copyWith(
                color:      BanzaColors.gold,
                fontSize:   20,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _VerificationBadge extends StatelessWidget {
  final VerificationBadgeType type;
  const _VerificationBadge({required this.type});

  @override
  Widget build(BuildContext context) {
    final isMerchant = type == VerificationBadgeType.merchant;
    final fg     = isMerchant ? const Color(0xFF1D4ED8) : BanzaColors.gold;
    final bg     = fg.withValues(alpha: 0.10);
    final border = fg.withValues(alpha: 0.25);
    final label  = isMerchant ? 'Comerciante' : 'Verificado';

    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: BanzaSpacing.md,
        vertical:   5,
      ),
      decoration: BoxDecoration(
        color:        bg,
        borderRadius: BanzaRadius.fullAll,
        border:       Border.all(color: border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.verified_rounded, size: 12, color: fg),
          const SizedBox(width: 4),
          Text(
            label,
            style: BanzaTextStyles.label.copyWith(
              color:    fg,
              fontSize: 11,
            ),
          ),
        ],
      ),
    );
  }
}

// =============================================================================
// 2. Payment address card
// =============================================================================

class _PaymentAddressCard extends StatelessWidget {
  final String       handle;
  final bool         copied;
  final VoidCallback onCopy;

  const _PaymentAddressCard({
    required this.handle,
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
            _IconBox(icon: Icons.alternate_email_rounded),
            SizedBox(width: BanzaSpacing.md),
            Text('Endereço de pagamento', style: BanzaTextStyles.headingSm),
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
                    '@$handle',
                    style: BanzaTextStyles.mono.copyWith(
                      fontSize:   17,
                      fontWeight: FontWeight.w600,
                      color:      BanzaColors.gray900,
                    ),
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
            'Partilhe este endereço para receber pagamentos',
            style: BanzaTextStyles.bodySm.copyWith(color: BanzaColors.gray400),
          ),
        ],
      ),
    );
  }
}

// =============================================================================
// 3. Security section — biometrics + PIN row
// =============================================================================

class _SecuritySection extends StatelessWidget {
  final bool             biometricsEnabled;
  final bool             busy;
  final void Function(bool) onToggle;
  final VoidCallback     onPinTap;

  const _SecuritySection({
    required this.biometricsEnabled,
    required this.busy,
    required this.onToggle,
    required this.onPinTap,
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

          // Biometrics row
          Row(children: [
            const _IconBox(icon: Icons.fingerprint_rounded),
            const SizedBox(width: BanzaSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Biometria',
                    style: BanzaTextStyles.bodyMd.copyWith(fontWeight: FontWeight.w500),
                  ),
                  Text(
                    'Face ID / impressão digital',
                    style: BanzaTextStyles.bodySm.copyWith(color: BanzaColors.gray400),
                  ),
                ],
              ),
            ),
            if (busy)
              const SizedBox(
                width:  22,
                height: 22,
                child:  CircularProgressIndicator(
                  strokeWidth: 2,
                  color:       BanzaColors.wine,
                ),
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

          const Divider(height: BanzaSpacing.xl, color: BanzaColors.gray200),

          // PIN row
          GestureDetector(
            onTap: onPinTap,
            child: Row(children: [
              const _IconBox(icon: Icons.lock_outline_rounded),
              const SizedBox(width: BanzaSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'PIN & Segurança',
                      style: BanzaTextStyles.bodyMd.copyWith(fontWeight: FontWeight.w500),
                    ),
                    Text(
                      'Gerir o PIN e outras definições',
                      style: BanzaTextStyles.bodySm.copyWith(color: BanzaColors.gray400),
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right_rounded, size: 20, color: BanzaColors.gray400),
            ]),
          ),
        ],
      ),
    );
  }
}

// =============================================================================
// 4. Action tile
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
