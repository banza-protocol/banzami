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
  bool          _bioBusy = false;
  bool          _copied  = false;
  Future<bool>? _canUseBio;

  @override
  Widget build(BuildContext context) {
    final svc     = context.watch<SessionService>();
    final session = svc.session!;

    // Lazy-init once; never recreated on rebuild.
    _canUseBio ??= svc.canUseBiometrics();

    return Scaffold(
      backgroundColor: BanzamiColors.offWhite,
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.symmetric(horizontal: BanzamiSpacing.lg),
          children: [
            const SizedBox(height: BanzamiSpacing.xl),

            const Text('Perfil', style: BanzamiTextStyles.headingMd),

            const SizedBox(height: BanzamiSpacing.lg),

            _ProfileHeader(session: session),

            const SizedBox(height: BanzamiSpacing.md),

            _PaymentAddressCard(
              handle: session.handle,
              copied: _copied,
              onCopy: _copyHandle,
            ),

            const SizedBox(height: BanzamiSpacing.md),

            const _TrustStatusChips(),

            const SizedBox(height: BanzamiSpacing.md),

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
                  const SizedBox(height: BanzamiSpacing.md),
                ]);
              },
            ),

            _AccountActions(
              onLogout:       () => _confirmLogout(svc),
              onClearAccount: () => _confirmClearAccount(svc),
            ),

            const SizedBox(height: BanzamiSpacing.xxl),

            Center(
              child: Text(
                'Banzami v1.0',
                style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.gray400),
              ),
            ),

            const SizedBox(height: BanzamiSpacing.xl),
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

  Future<void> _confirmLogout(SessionService svc) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape:   const RoundedRectangleBorder(borderRadius: BanzamiRadius.xlAll),
        title:   const Text('Terminar sessão?'),
        content: const Text(
          'Vai sair da conta neste dispositivo. Pode entrar novamente quando quiser.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Sair', style: TextStyle(color: BanzamiColors.wine)),
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
        shape:   const RoundedRectangleBorder(borderRadius: BanzamiRadius.xlAll),
        title:   const Text('Remover conta?'),
        content: const Text(
          'Todos os dados guardados serão apagados. Terá de criar conta ou entrar novamente.',
        ),
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
        gradient: const LinearGradient(
          colors: [Color(0xFF1C0A0E), Color(0xFF3D0B1A)],
          begin:  Alignment.topLeft,
          end:    Alignment.bottomRight,
        ),
        borderRadius: BanzamiRadius.xlAll,
        boxShadow: [
          BoxShadow(
            color:      const Color(0xFF1C0A0E).withValues(alpha: 0.30),
            blurRadius: 24,
            offset:     const Offset(0, 8),
          ),
        ],
      ),
      padding: const EdgeInsets.all(BanzamiSpacing.xl),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Top row: avatar + verification badge
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Avatar — gold ring + dark inner circle
              _Avatar(initial: initial),
              const Spacer(),
              const _VerificationBadge(),
            ],
          ),

          const SizedBox(height: BanzamiSpacing.lg),

          // Full name
          Text(
            name,
            style: BanzamiTextStyles.headingLg.copyWith(color: BanzamiColors.white),
          ),

          // @handle (only if displayName is set)
          if (session.displayName != null) ...[
            const SizedBox(height: 2),
            Text(
              '@${session.handle}',
              style: BanzamiTextStyles.bodyMd.copyWith(
                color: BanzamiColors.white.withValues(alpha: 0.45),
              ),
            ),
          ],

          const SizedBox(height: BanzamiSpacing.lg),

          // Trust microcopy
          Row(children: [
            Icon(
              Icons.shield_outlined,
              size:  13,
              color: BanzamiColors.white.withValues(alpha: 0.35),
            ),
            const SizedBox(width: 6),
            Text(
              'Identidade financeira verificada',
              style: BanzamiTextStyles.bodySm.copyWith(
                color: BanzamiColors.white.withValues(alpha: 0.35),
              ),
            ),
          ]),
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
      width:  72,
      height: 72,
      decoration: const BoxDecoration(
        shape: BoxShape.circle,
        gradient: LinearGradient(
          colors: [BanzamiColors.gold, BanzamiColors.goldLight],
          begin:  Alignment.topLeft,
          end:    Alignment.bottomRight,
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(2),
        child: Container(
          decoration: const BoxDecoration(
            shape: BoxShape.circle,
            color: Color(0xFF2A0D16),
          ),
          child: Center(
            child: Text(
              initial,
              style: BanzamiTextStyles.headingLg.copyWith(
                color:      BanzamiColors.gold,
                fontSize:   26,
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
  const _VerificationBadge();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: BanzamiSpacing.md,
        vertical:   5,
      ),
      decoration: BoxDecoration(
        color:        BanzamiColors.gold.withValues(alpha: 0.12),
        borderRadius: BanzamiRadius.fullAll,
        border:       Border.all(color: BanzamiColors.gold.withValues(alpha: 0.25)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.verified_rounded, size: 12, color: BanzamiColors.gold),
          const SizedBox(width: 4),
          Text(
            'Verificado',
            style: BanzamiTextStyles.label.copyWith(
              color:    BanzamiColors.gold,
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
        color:        BanzamiColors.white,
        borderRadius: BanzamiRadius.xlAll,
        boxShadow:    BanzamiShadows.card,
      ),
      padding: const EdgeInsets.all(BanzamiSpacing.xl),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Section label
          const Row(children: [
            _IconBox(icon: Icons.alternate_email_rounded),
            SizedBox(width: BanzamiSpacing.md),
            Text('Endereço de pagamento', style: BanzamiTextStyles.headingSm),
          ]),

          const SizedBox(height: BanzamiSpacing.lg),

          // Handle pill — tap to copy
          GestureDetector(
            onTap: onCopy,
            child: Container(
              width:   double.infinity,
              padding: const EdgeInsets.symmetric(
                horizontal: BanzamiSpacing.lg,
                vertical:   BanzamiSpacing.md,
              ),
              decoration: const BoxDecoration(
                color:        BanzamiColors.gray100,
                borderRadius: BanzamiRadius.lgAll,
              ),
              child: Row(children: [
                Expanded(
                  child: Text(
                    '@$handle',
                    style: BanzamiTextStyles.mono.copyWith(
                      fontSize:   17,
                      fontWeight: FontWeight.w600,
                      color:      BanzamiColors.gray900,
                    ),
                  ),
                ),
                const SizedBox(width: BanzamiSpacing.md),
                AnimatedSwitcher(
                  duration: const Duration(milliseconds: 220),
                  transitionBuilder: (child, anim) =>
                      ScaleTransition(scale: anim, child: child),
                  child: copied
                      ? const Icon(
                          Icons.check_rounded,
                          key:   ValueKey('check'),
                          size:  20,
                          color: BanzamiColors.success,
                        )
                      : const Icon(
                          Icons.copy_rounded,
                          key:   ValueKey('copy'),
                          size:  20,
                          color: BanzamiColors.gray400,
                        ),
                ),
              ]),
            ),
          ),

          const SizedBox(height: BanzamiSpacing.sm),

          Text(
            'Partilhe este endereço para receber pagamentos',
            style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.gray400),
          ),
        ],
      ),
    );
  }
}

// =============================================================================
// 3. Trust status chips
// =============================================================================

class _TrustStatusChips extends StatelessWidget {
  const _TrustStatusChips();

  @override
  Widget build(BuildContext context) {
    return const Row(children: [
      _TrustChip(icon: Icons.lock_outline_rounded,    label: 'Protegida'),
      SizedBox(width: BanzamiSpacing.sm),
      _TrustChip(icon: Icons.security_rounded,        label: 'Encriptada'),
      SizedBox(width: BanzamiSpacing.sm),
      _TrustChip(icon: Icons.verified_user_outlined,  label: 'Segura'),
    ]);
  }
}

class _TrustChip extends StatelessWidget {
  final IconData icon;
  final String   label;

  const _TrustChip({required this.icon, required this.label});

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(
          horizontal: BanzamiSpacing.sm,
          vertical:   BanzamiSpacing.md,
        ),
        decoration: const BoxDecoration(
          color:        BanzamiColors.white,
          borderRadius: BanzamiRadius.lgAll,
          boxShadow:    BanzamiShadows.card,
        ),
        child: Column(children: [
          Icon(icon, size: 18, color: BanzamiColors.wine.withValues(alpha: 0.75)),
          const SizedBox(height: 5),
          Text(
            label,
            style: BanzamiTextStyles.label.copyWith(
              fontSize: 10,
              color:    BanzamiColors.gray600,
            ),
            textAlign: TextAlign.center,
          ),
        ]),
      ),
    );
  }
}

// =============================================================================
// 4. Security section
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
        color:        BanzamiColors.white,
        borderRadius: BanzamiRadius.xlAll,
        boxShadow:    BanzamiShadows.card,
      ),
      padding: const EdgeInsets.all(BanzamiSpacing.xl),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Segurança', style: BanzamiTextStyles.headingSm),

          const SizedBox(height: BanzamiSpacing.lg),

          Row(children: [
            const _IconBox(icon: Icons.fingerprint_rounded),
            const SizedBox(width: BanzamiSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Biometria',
                    style: BanzamiTextStyles.bodyMd.copyWith(
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  Text(
                    'Face ID / impressão digital',
                    style: BanzamiTextStyles.bodySm.copyWith(
                      color: BanzamiColors.gray400,
                    ),
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
                  color:       BanzamiColors.wine,
                ),
              )
            else
              Switch(
                value:           biometricsEnabled,
                onChanged:       onToggle,
                activeThumbColor: BanzamiColors.wine,
                trackColor: WidgetStateProperty.resolveWith((states) =>
                  states.contains(WidgetState.selected)
                      ? BanzamiColors.wine.withValues(alpha: 0.25)
                      : BanzamiColors.gray200),
                thumbColor: WidgetStateProperty.resolveWith((states) =>
                  states.contains(WidgetState.selected)
                      ? BanzamiColors.wine
                      : BanzamiColors.white),
              ),
          ]),
        ],
      ),
    );
  }
}

// =============================================================================
// 5. Account actions
// =============================================================================

class _AccountActions extends StatelessWidget {
  final VoidCallback onLogout;
  final VoidCallback onClearAccount;

  const _AccountActions({
    required this.onLogout,
    required this.onClearAccount,
  });

  @override
  Widget build(BuildContext context) {
    return Column(children: [
      _ActionTile(
        icon:    Icons.logout_rounded,
        label:   'Terminar sessão',
        color:   BanzamiColors.wine,
        onTap:   onLogout,
      ),
      const SizedBox(height: BanzamiSpacing.sm),
      _ActionTile(
        icon:     Icons.delete_outline_rounded,
        label:    'Remover conta',
        sublabel: 'Apaga todos os dados guardados',
        color:    BanzamiColors.gray400,
        onTap:    onClearAccount,
      ),
    ]);
  }
}

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
        color:        BanzamiColors.white,
        borderRadius: BanzamiRadius.xlAll,
        boxShadow:    BanzamiShadows.card,
      ),
      child: ClipRRect(
        borderRadius: BanzamiRadius.xlAll,
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            onTap:          onTap,
            splashColor:    color.withValues(alpha: 0.05),
            highlightColor: color.withValues(alpha: 0.03),
            child: Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: BanzamiSpacing.xl,
                vertical:   BanzamiSpacing.lg,
              ),
              child: Row(children: [
                _IconBox(icon: icon, color: color),
                const SizedBox(width: BanzamiSpacing.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        label,
                        style: BanzamiTextStyles.bodyMd.copyWith(
                          color:      color,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                      if (sublabel != null)
                        Text(
                          sublabel!,
                          style: BanzamiTextStyles.bodySm.copyWith(
                            color: BanzamiColors.gray400,
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

/// Rounded icon box used throughout the profile screen.
class _IconBox extends StatelessWidget {
  final IconData icon;
  final Color    color;

  const _IconBox({
    required this.icon,
    this.color = BanzamiColors.wine,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width:  36,
      height: 36,
      decoration: BoxDecoration(
        color:        color.withValues(alpha: 0.08),
        borderRadius: BanzamiRadius.mdAll,
      ),
      child: Icon(icon, color: color, size: 18),
    );
  }
}
