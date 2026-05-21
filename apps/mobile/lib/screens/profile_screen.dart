import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:banza_flutter/banza_flutter.dart';

import '../services/session_service.dart';
import 'help_screen.dart';
import 'notifications_screen.dart';
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
      backgroundColor: BanzaColors.offWhite,
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.symmetric(horizontal: BanzaSpacing.xl),
          children: [
            const SizedBox(height: BanzaSpacing.xl),

            Text(
              'Perfil',
              style: BanzaTextStyles.displayMd.copyWith(
                fontWeight:    FontWeight.w700,
                letterSpacing: -0.5,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              'O seu perfil e definições',
              style: BanzaTextStyles.bodySm.copyWith(color: BanzaColors.gray400),
            ),

            const SizedBox(height: BanzaSpacing.lg),

            // ── Identity card ──────────────────────────────────────────────
            _ProfileHeader(session: session),

            const SizedBox(height: BanzaSpacing.sm),

            // ── Payment address ────────────────────────────────────────────
            _PaymentAddressCard(
              handle: session.handle,
              copied: _copied,
              onCopy: _copyHandle,
            ),

            const SizedBox(height: BanzaSpacing.xl),

            // ── Settings section label ─────────────────────────────────────
            const _SectionLabel('Definições'),
            const SizedBox(height: BanzaSpacing.sm),

            _SettingsCard(children: [
              _RowChevron(
                icon:  Icons.lock_outline_rounded,
                label: 'PIN & Segurança',
                sub:   'Gerir PIN e biometria',
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const SecurityScreen()),
                ),
              ),
              const Divider(height: 1, indent: 56, color: BanzaColors.gray100),
              _RowChevron(
                icon:  Icons.notifications_none_rounded,
                label: 'Notificações',
                sub:   'Gerir alertas e notificações',
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const NotificationsScreen()),
                ),
              ),
              const Divider(height: 1, indent: 56, color: BanzaColors.gray100),
              _RowChevron(
                icon:  Icons.help_outline_rounded,
                label: 'Ajuda & Suporte',
                sub:   'FAQ, contacto e termos',
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const HelpScreen()),
                ),
              ),
            ]),

            const SizedBox(height: BanzaSpacing.xl),

            // ── Account section ────────────────────────────────────────────
            const _SectionLabel('Conta'),
            const SizedBox(height: BanzaSpacing.sm),

            _SettingsCard(children: [
              _RowChevron(
                icon:  Icons.logout_rounded,
                label: 'Terminar sessão',
                onTap: () => _confirmLogout(svc),
                color: BanzaColors.wine,
              ),
              const Divider(height: 1, indent: 56, color: BanzaColors.gray100),
              _RowChevron(
                icon:  Icons.delete_outline_rounded,
                label: 'Remover conta',
                sub:   'Apaga todos os dados guardados',
                onTap: () => _confirmClearAccount(svc),
                color: BanzaColors.error,
              ),
            ]),

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

  Future<void> _copyHandle() async {
    final svc = context.read<SessionService>();
    await Clipboard.setData(ClipboardData(text: '@${svc.session!.handle}'));
    setState(() => _copied = true);
    await Future.delayed(const Duration(seconds: 2));
    if (mounted) setState(() => _copied = false);
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
        gradient:     BanzaGradients.wine,
        borderRadius: BanzaRadius.xlAll,
        boxShadow: [
          BoxShadow(
            color:      BanzaColors.wineDark.withValues(alpha: 0.28),
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
              // Gold-ringed avatar
              Container(
                width:  56,
                height: 56,
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
                        style: BanzaTextStyles.headingMd.copyWith(
                          color:      BanzaColors.gold,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ),
                ),
              ),

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
                      const SizedBox(height: 2),
                      Text(
                        '@${session.handle}',
                        style: BanzaTextStyles.bodySm.copyWith(
                          color: BanzaColors.white.withValues(alpha: 0.55),
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
      padding: const EdgeInsets.symmetric(horizontal: BanzaSpacing.md, vertical: 5),
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
          Text(label, style: BanzaTextStyles.label.copyWith(color: fg, fontSize: 11)),
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
        color:        BanzaColors.white,
        borderRadius: BanzaRadius.xlAll,
        boxShadow:    BanzaShadows.card,
      ),
      padding: const EdgeInsets.all(BanzaSpacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Container(
              width:  36,
              height: 36,
              decoration: BoxDecoration(
                color:        BanzaColors.wine.withValues(alpha: 0.08),
                borderRadius: BanzaRadius.mdAll,
              ),
              child: const Icon(Icons.alternate_email_rounded, color: BanzaColors.wine, size: 18),
            ),
            const SizedBox(width: BanzaSpacing.md),
            const Text('Endereço de pagamento', style: BanzaTextStyles.headingSm),
          ]),

          const SizedBox(height: BanzaSpacing.md),

          GestureDetector(
            onTap: onCopy,
            child: Container(
              width:   double.infinity,
              padding: const EdgeInsets.symmetric(
                horizontal: BanzaSpacing.md,
                vertical:   BanzaSpacing.sm + 2,
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
                  duration: const Duration(milliseconds: 200),
                  transitionBuilder: (child, anim) =>
                      ScaleTransition(scale: anim, child: child),
                  child: copied
                      ? const Icon(Icons.check_rounded,
                          key: ValueKey('check'), size: 20, color: BanzaColors.success)
                      : const Icon(Icons.copy_rounded,
                          key: ValueKey('copy'), size: 20, color: BanzaColors.gray400),
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
// Shared layout primitives
// =============================================================================

class _SectionLabel extends StatelessWidget {
  final String label;
  const _SectionLabel(this.label);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(left: BanzaSpacing.xs),
      child: Text(
        label.toUpperCase(),
        style: BanzaTextStyles.label.copyWith(
          color:         BanzaColors.gray400,
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
        color:        BanzaColors.white,
        borderRadius: BanzaRadius.xlAll,
        boxShadow:    BanzaShadows.card,
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
    this.color = BanzaColors.gray900,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: BanzaSpacing.lg,
          vertical:   BanzaSpacing.md + 2,
        ),
        child: Row(children: [
          Container(
            width:  36,
            height: 36,
            decoration: BoxDecoration(
              color:        color.withValues(alpha: 0.08),
              borderRadius: BanzaRadius.mdAll,
            ),
            child: Icon(icon, color: color, size: 18),
          ),
          const SizedBox(width: BanzaSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize:       MainAxisSize.min,
              children: [
                Text(label,
                    style: BanzaTextStyles.bodyMd.copyWith(
                      color: color, fontWeight: FontWeight.w500,
                    )),
                if (sub != null)
                  Text(sub!,
                      style: BanzaTextStyles.bodySm.copyWith(color: BanzaColors.gray400)),
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
