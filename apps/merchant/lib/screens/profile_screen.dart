import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:banza_flutter/banza_flutter.dart';

import '../services/merchant_session_service.dart';

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
      backgroundColor: BanzamiColors.offWhite,
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.symmetric(horizontal: BanzamiSpacing.lg),
          children: [
            const SizedBox(height: BanzamiSpacing.xl),

            const Text('Perfil', style: BanzamiTextStyles.headingMd),

            const SizedBox(height: BanzamiSpacing.lg),

            _MerchantProfileHeader(session: session),

            const SizedBox(height: BanzamiSpacing.sm),

            _MerchantIdCard(
              merchantId: session.merchantId,
              copied:     _copied,
              onCopy:     _copyId,
            ),

            const SizedBox(height: BanzamiSpacing.sm),

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
                  const SizedBox(height: BanzamiSpacing.sm),
                ]);
              },
            ),

            _ActionTile(
              icon:  Icons.logout_rounded,
              label: 'Terminar sessão',
              color: BanzamiColors.wine,
              onTap: () => _confirmLogout(svc),
            ),

            const SizedBox(height: BanzamiSpacing.xxl),

            Center(
              child: Text(
                'Banza Business v1.0',
                style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.gray400),
              ),
            ),

            const SizedBox(height: BanzamiSpacing.xl),
          ],
        ),
      ),
    );
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
        shape:   const RoundedRectangleBorder(borderRadius: BanzamiRadius.xlAll),
        title:   const Text('Terminar sessão?'),
        content: const Text(
          'Terá de introduzir as suas credenciais novamente para voltar a entrar.',
        ),
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
        gradient:     BanzamiGradients.wine,
        borderRadius: BanzamiRadius.xlAll,
        boxShadow: [
          BoxShadow(
            color:      BanzamiColors.wineDark.withValues(alpha: 0.30),
            blurRadius: 24,
            offset:     const Offset(0, 8),
          ),
        ],
      ),
      padding: const EdgeInsets.all(BanzamiSpacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              _Avatar(initial: initial),
              const SizedBox(width: BanzamiSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      session.merchantName,
                      style: BanzamiTextStyles.headingSm.copyWith(
                        color:      BanzamiColors.white,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 1),
                    Text(
                      session.merchantEmail,
                      style: BanzamiTextStyles.bodySm.copyWith(
                        color: BanzamiColors.white.withValues(alpha: 0.60),
                      ),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
              if (session.verified) ...[
                const SizedBox(width: BanzamiSpacing.md),
                const _VerifiedBadge(),
              ],
            ],
          ),
          if (session.verified) ...[
            const SizedBox(height: BanzamiSpacing.md),
            Row(children: [
              Icon(
                Icons.shield_outlined,
                size:  13,
                color: BanzamiColors.white.withValues(alpha: 0.35),
              ),
              const SizedBox(width: 6),
              Text(
                'Conta de comerciante verificada',
                style: BanzamiTextStyles.bodySm.copyWith(
                  color: BanzamiColors.white.withValues(alpha: 0.35),
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
        color: BanzamiColors.white.withValues(alpha: 0.15),
        border: Border.all(
          color: BanzamiColors.white.withValues(alpha: 0.30),
          width: 2,
        ),
      ),
      child: Center(
        child: Text(
          initial,
          style: BanzamiTextStyles.headingLg.copyWith(
            color:      BanzamiColors.white,
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
        horizontal: BanzamiSpacing.md,
        vertical:   5,
      ),
      decoration: BoxDecoration(
        color:        const Color(0xFF1D4ED8).withValues(alpha: 0.15),
        borderRadius: BanzamiRadius.fullAll,
        border:       Border.all(color: const Color(0xFF1D4ED8).withValues(alpha: 0.35)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.verified_rounded, size: 12, color: Color(0xFFBFDBFE)),
          const SizedBox(width: 4),
          Text(
            'Verificado',
            style: BanzamiTextStyles.label.copyWith(
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
        color:        BanzamiColors.white,
        borderRadius: BanzamiRadius.xlAll,
        boxShadow:    BanzamiShadows.card,
      ),
      padding: const EdgeInsets.symmetric(
        horizontal: BanzamiSpacing.lg,
        vertical:   BanzamiSpacing.md,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(children: [
            _IconBox(icon: Icons.badge_outlined),
            SizedBox(width: BanzamiSpacing.md),
            Text('Merchant ID', style: BanzamiTextStyles.headingSm),
          ]),

          const SizedBox(height: BanzamiSpacing.sm),

          GestureDetector(
            onTap: onCopy,
            child: Container(
              width:   double.infinity,
              padding: const EdgeInsets.symmetric(
                horizontal: BanzamiSpacing.md,
                vertical:   BanzamiSpacing.sm,
              ),
              decoration: const BoxDecoration(
                color:        BanzamiColors.gray100,
                borderRadius: BanzamiRadius.lgAll,
              ),
              child: Row(children: [
                Expanded(
                  child: Text(
                    merchantId,
                    style: BanzamiTextStyles.mono.copyWith(
                      fontSize: 12,
                      color:    BanzamiColors.gray900,
                    ),
                    overflow: TextOverflow.ellipsis,
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
            'Toque para copiar o seu identificador único',
            style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.gray400),
          ),
        ],
      ),
    );
  }
}

// =============================================================================
// 3. Security section (biometrics)
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
      padding: const EdgeInsets.symmetric(
        horizontal: BanzamiSpacing.lg,
        vertical:   BanzamiSpacing.md,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Segurança', style: BanzamiTextStyles.headingSm),

          const SizedBox(height: BanzamiSpacing.sm),

          Row(children: [
            const _IconBox(icon: Icons.fingerprint_rounded),
            const SizedBox(width: BanzamiSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Biometria',
                      style: BanzamiTextStyles.bodyMd.copyWith(fontWeight: FontWeight.w500)),
                  Text('Face ID / impressão digital',
                      style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.gray400)),
                ],
              ),
            ),
            if (busy)
              const SizedBox(
                width:  22,
                height: 22,
                child:  CircularProgressIndicator(strokeWidth: 2, color: BanzamiColors.wine),
              )
            else
              Switch(
                value:            biometricsEnabled,
                onChanged:        onToggle,
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
// 4. Action tile
// =============================================================================

class _ActionTile extends StatelessWidget {
  final IconData     icon;
  final String       label;
  final Color        color;
  final VoidCallback onTap;

  const _ActionTile({
    required this.icon,
    required this.label,
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
                horizontal: BanzamiSpacing.lg,
                vertical:   BanzamiSpacing.md,
              ),
              child: Row(children: [
                _IconBox(icon: icon, color: color),
                const SizedBox(width: BanzamiSpacing.md),
                Expanded(
                  child: Text(
                    label,
                    style: BanzamiTextStyles.bodyMd.copyWith(
                      color:      color,
                      fontWeight: FontWeight.w500,
                    ),
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
