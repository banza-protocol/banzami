import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:banza_flutter/banza_flutter.dart';

import '../config.dart';
import '../services/session_service.dart';
import '../widgets/banza_premium_dialog.dart';
import '../widgets/sandbox_banner.dart';
import 'help_screen.dart';
import 'notifications_screen.dart';
import 'onboarding/welcome_screen.dart';
import 'security_screen.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  bool _copied = false;

  @override
  Widget build(BuildContext context) {
    final svc     = context.watch<SessionService>();
    final session = svc.session!;

    return Scaffold(
      backgroundColor: BanzamiColors.offWhite,
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.symmetric(horizontal: BanzamiSpacing.xl),
          children: [
            const SizedBox(height: BanzamiSpacing.xl),

            Text(
              'Perfil',
              style: BanzamiTextStyles.displayMd.copyWith(
                fontWeight:    FontWeight.w700,
                letterSpacing: -0.5,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              'O seu perfil e definições',
              style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.gray400),
            ),

            const SizedBox(height: BanzamiSpacing.lg),

            // ── Identity card ──────────────────────────────────────────────
            _ProfileHeader(session: session),

            if (AppConfig.isSandbox) ...[
              const SizedBox(height: BanzamiSpacing.sm),
              const SandboxBanner(),
            ],

            const SizedBox(height: BanzamiSpacing.sm),

            // ── Payment address ────────────────────────────────────────────
            _PaymentAddressCard(
              handle: session.handle,
              copied: _copied,
              onCopy: _copyHandle,
            ),

            const SizedBox(height: BanzamiSpacing.xl),

            // ── Settings section label ─────────────────────────────────────
            const _SectionLabel('Definições'),
            const SizedBox(height: BanzamiSpacing.sm),

            _SettingsCard(children: [
              _RowChevron(
                icon:  Icons.lock_outline_rounded,
                label: 'PIN & Segurança',
                sub:   'Gerir PIN e biometria',
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const SecurityScreen()),
                ),
              ),
              const Divider(height: 1, indent: 56, color: BanzamiColors.gray100),
              _RowChevron(
                icon:  Icons.notifications_none_rounded,
                label: 'Notificações',
                sub:   'Gerir alertas e notificações',
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const NotificationsScreen()),
                ),
              ),
              const Divider(height: 1, indent: 56, color: BanzamiColors.gray100),
              _RowChevron(
                icon:  Icons.help_outline_rounded,
                label: 'Ajuda & Suporte',
                sub:   'FAQ, contacto e termos',
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const HelpScreen()),
                ),
              ),
            ]),

            const SizedBox(height: BanzamiSpacing.xl),

            // ── Account section ────────────────────────────────────────────
            const _SectionLabel('Conta'),
            const SizedBox(height: BanzamiSpacing.sm),

            _SettingsCard(children: [
              _RowChevron(
                icon:  Icons.logout_rounded,
                label: 'Terminar sessão',
                onTap: () => _confirmLogout(svc),
                color: BanzamiColors.wine,
              ),
              const Divider(height: 1, indent: 56, color: BanzamiColors.gray100),
              _RowChevron(
                icon:  Icons.delete_outline_rounded,
                label: 'Remover conta',
                sub:   'Apaga todos os dados guardados',
                onTap: () => _confirmClearAccount(svc),
                color: BanzamiColors.error,
              ),
            ]),

            const SizedBox(height: BanzamiSpacing.xxl),

            Center(
              child: Text(
                'Banza v1.0',
                style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.gray400),
              ),
            ),

            const SizedBox(height: BanzamiSpacing.xl),
          ],
        ),
      ),
    );
  }

  Future<void> _copyHandle() async {
    final svc = context.read<SessionService>();
    await Clipboard.setData(ClipboardData(text: '@${svc.session!.handle}'));
    setState(() => _copied = true);
    await Future.delayed(const Duration(seconds: 2));
    if (mounted) setState(() => _copied = false);
  }

  Future<void> _confirmLogout(SessionService svc) async {
    final confirm = await showBanzamiDialog(
      context:      context,
      icon:         Icons.logout_rounded,
      title:        'Terminar sessão?',
      description:  'Vai sair da sua conta neste dispositivo.\nPode entrar novamente quando quiser.',
      cancelLabel:  'Cancelar',
      confirmLabel: 'Sair',
      variant:      BanzamiDialogVariant.standard,
    );
    if (confirm == true) {
      await svc.logout();
      if (mounted) {
        Navigator.of(context).pushAndRemoveUntil(
          MaterialPageRoute(builder: (_) => const WelcomeScreen()),
          (_) => false,
        );
      }
    }
  }

  Future<void> _confirmClearAccount(SessionService svc) async {
    final confirm = await showBanzamiDialog(
      context:      context,
      icon:         Icons.delete_forever_rounded,
      title:        'Remover conta?',
      description:  'Todos os dados guardados neste dispositivo serão apagados.\nTerá de iniciar sessão novamente.',
      cancelLabel:  'Cancelar',
      confirmLabel: 'Remover',
      variant:      BanzamiDialogVariant.danger,
    );
    if (confirm == true) {
      await svc.clearAccount();
      if (mounted) {
        Navigator.of(context).pushAndRemoveUntil(
          MaterialPageRoute(builder: (_) => const WelcomeScreen()),
          (_) => false,
        );
      }
    }
  }
}

// =============================================================================
// Profile header — gradient cherry card
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
        gradient:     BanzamiGradients.wine,
        borderRadius: BanzamiRadius.xlAll,
        boxShadow: [
          BoxShadow(
            color:      BanzamiColors.wineDark.withValues(alpha: 0.28),
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
              // Gold-ringed avatar
              Container(
                width:  56,
                height: 56,
                decoration: const BoxDecoration(
                  shape:    BoxShape.circle,
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
                      color: BanzamiColors.wineDark,
                    ),
                    child: Center(
                      child: Text(
                        initial,
                        style: BanzamiTextStyles.headingMd.copyWith(
                          color:      BanzamiColors.gold,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ),
                ),
              ),

              const SizedBox(width: BanzamiSpacing.md),

              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      name,
                      style: BanzamiTextStyles.headingSm.copyWith(
                        color:      BanzamiColors.white,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    if (session.displayName != null) ...[
                      const SizedBox(height: 2),
                      Text(
                        '@${session.handle}',
                        style: BanzamiTextStyles.bodySm.copyWith(
                          color: BanzamiColors.white.withValues(alpha: 0.55),
                        ),
                      ),
                    ],
                  ],
                ),
              ),

              if (session.verificationBadge != null)
                _VerificationBadge(type: session.verificationBadge!),
            ],
          ),

          if (session.verificationBadge != null) ...[
            const SizedBox(height: BanzamiSpacing.md),
            Row(children: [
              Icon(
                Icons.shield_outlined,
                size:  13,
                color: BanzamiColors.white.withValues(alpha: 0.35),
              ),
              const SizedBox(width: 6),
              Text(
                session.verificationBadge == VerificationBadgeType.merchant
                    ? 'Conta de comerciante verificada'
                    : 'Identidade financeira verificada',
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

class _VerificationBadge extends StatelessWidget {
  final VerificationBadgeType type;
  const _VerificationBadge({required this.type});

  @override
  Widget build(BuildContext context) {
    final isMerchant = type == VerificationBadgeType.merchant;
    final fg     = isMerchant ? const Color(0xFF1D4ED8) : BanzamiColors.gold;
    final bg     = fg.withValues(alpha: 0.10);
    final border = fg.withValues(alpha: 0.25);
    final label  = isMerchant ? 'Comerciante' : 'Verificado';

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: BanzamiSpacing.md, vertical: 5),
      decoration: BoxDecoration(
        color:        bg,
        borderRadius: BanzamiRadius.fullAll,
        border:       Border.all(color: border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.verified_rounded, size: 12, color: fg),
          const SizedBox(width: 4),
          Text(label, style: BanzamiTextStyles.label.copyWith(color: fg, fontSize: 11)),
        ],
      ),
    );
  }
}

// =============================================================================
// Payment address card
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
      padding: const EdgeInsets.all(BanzamiSpacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Container(
              width:  36,
              height: 36,
              decoration: BoxDecoration(
                color:        BanzamiColors.wine.withValues(alpha: 0.08),
                borderRadius: BanzamiRadius.mdAll,
              ),
              child: const Icon(Icons.alternate_email_rounded, color: BanzamiColors.wine, size: 18),
            ),
            const SizedBox(width: BanzamiSpacing.md),
            const Text('Endereço de pagamento', style: BanzamiTextStyles.headingSm),
          ]),

          const SizedBox(height: BanzamiSpacing.md),

          GestureDetector(
            onTap: onCopy,
            child: Container(
              width:   double.infinity,
              padding: const EdgeInsets.symmetric(
                horizontal: BanzamiSpacing.md,
                vertical:   BanzamiSpacing.sm + 2,
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
                  duration: const Duration(milliseconds: 200),
                  transitionBuilder: (child, anim) =>
                      ScaleTransition(scale: anim, child: child),
                  child: copied
                      ? const Icon(Icons.check_rounded,
                          key: ValueKey('check'), size: 20, color: BanzamiColors.success)
                      : const Icon(Icons.copy_rounded,
                          key: ValueKey('copy'), size: 20, color: BanzamiColors.gray400),
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
// Shared layout primitives
// =============================================================================

class _SectionLabel extends StatelessWidget {
  final String label;
  const _SectionLabel(this.label);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(left: BanzamiSpacing.xs),
      child: Text(
        label.toUpperCase(),
        style: BanzamiTextStyles.label.copyWith(
          color:         BanzamiColors.gray400,
          letterSpacing: 0.6,
          fontSize:      11,
        ),
      ),
    );
  }
}

class _SettingsCard extends StatelessWidget {
  final List<Widget> children;
  const _SettingsCard({required this.children});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color:        BanzamiColors.white,
        borderRadius: BanzamiRadius.xlAll,
        boxShadow:    BanzamiShadows.card,
      ),
      clipBehavior: Clip.hardEdge,
      child: Column(mainAxisSize: MainAxisSize.min, children: children),
    );
  }
}

class _RowChevron extends StatelessWidget {
  final IconData     icon;
  final String       label;
  final String?      sub;
  final VoidCallback onTap;
  final Color        color;

  const _RowChevron({
    required this.icon,
    required this.label,
    this.sub,
    required this.onTap,
    this.color = BanzamiColors.gray900,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: BanzamiSpacing.lg,
          vertical:   BanzamiSpacing.md + 2,
        ),
        child: Row(children: [
          Container(
            width:  36,
            height: 36,
            decoration: BoxDecoration(
              color:        color.withValues(alpha: 0.08),
              borderRadius: BanzamiRadius.mdAll,
            ),
            child: Icon(icon, color: color, size: 18),
          ),
          const SizedBox(width: BanzamiSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize:       MainAxisSize.min,
              children: [
                Text(label,
                    style: BanzamiTextStyles.bodyMd.copyWith(
                      color: color, fontWeight: FontWeight.w500,
                    )),
                if (sub != null)
                  Text(sub!,
                      style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.gray400)),
              ],
            ),
          ),
          Icon(Icons.chevron_right_rounded, size: 20,
              color: color.withValues(alpha: 0.35)),
        ]),
      ),
    );
  }
}
