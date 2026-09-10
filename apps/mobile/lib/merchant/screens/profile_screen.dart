import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:banzami_flutter/banzami_flutter.dart';

import '../../widgets/app_screen_header.dart';
import '../../widgets/banzami_premium_dialog.dart';
import '../services/merchant_reauth.dart';
import '../services/merchant_session_service.dart';
import '../widgets/merchant_status_badge.dart';
import 'kyb_screen.dart';
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
  bool?         _soundOn;

  @override
  void initState() {
    super.initState();
    MerchantSessionService.isNotifSoundEnabled()
        .then((v) { if (mounted) setState(() => _soundOn = v); });
  }

  @override
  Widget build(BuildContext context) {
    final svc     = context.watch<MerchantSessionService>();
    final session = svc.session!;

    _canUseBio ??= svc.canUseBiometrics();

    return Scaffold(
      backgroundColor: BanzamiColors.offWhite,
      body: SafeArea(
        child: ListView(
          padding: EdgeInsets.zero,
          children: [
            const AppScreenHeader(
              title:    'Perfil',
              subtitle: 'O seu perfil e definições',
            ),

            Padding(
              padding: const EdgeInsets.symmetric(horizontal: BanzamiSpacing.xl),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                mainAxisSize:       MainAxisSize.min,
                children: [
            _MerchantProfileHeader(session: session),

            const SizedBox(height: BanzamiSpacing.sm),

            _PaymentAddressCard(
              address: session.banzaAddress,
              copied:  _copied,
              onCopy:  _copyHandle,
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

            // Configurable confirmation sound for payment notifications. Built
            // with the same plain Container + Row + Switch as the Biometria card
            // so the rounded corners match (a SwitchListTile's Material paints
            // square corners over the rounded card).
            Container(
              decoration: const BoxDecoration(
                color:        BanzamiColors.white,
                borderRadius: BanzamiRadius.xlAll,
                boxShadow:    BanzamiShadows.card,
              ),
              padding: const EdgeInsets.symmetric(
                horizontal: BanzamiSpacing.lg,
                vertical:   BanzamiSpacing.md,
              ),
              child: Row(children: [
                const _IconBox(icon: Icons.volume_up_outlined),
                const SizedBox(width: BanzamiSpacing.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Som de notificação',
                          style: BanzamiTextStyles.bodyMd.copyWith(fontWeight: FontWeight.w500)),
                      Text('Tocar som ao receber um pagamento',
                          style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.gray400)),
                    ],
                  ),
                ),
                Switch(
                  value:            _soundOn ?? true,
                  activeThumbColor: BanzamiColors.primary,
                  trackColor: WidgetStateProperty.resolveWith((states) =>
                    states.contains(WidgetState.selected)
                        ? BanzamiColors.primary.withValues(alpha: 0.25)
                        : BanzamiColors.gray200),
                  thumbColor: WidgetStateProperty.resolveWith((states) =>
                    states.contains(WidgetState.selected)
                        ? BanzamiColors.primary
                        : BanzamiColors.white),
                  onChanged: (v) async {
                    await MerchantSessionService.setNotifSoundEnabled(v);
                    if (mounted) setState(() => _soundOn = v);
                  },
                ),
              ]),
            ),
            const SizedBox(height: BanzamiSpacing.sm),

            _ActionTile(
              icon:     Icons.verified_outlined,
              label:    'Verificar negócio (KYB)',
              sublabel: 'Verificação para processar pagamentos',
              color:    BanzamiColors.primary,
              onTap:    () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const KybScreen()),
              ),
            ),

            const SizedBox(height: BanzamiSpacing.sm),

            _ActionTile(
              icon:     Icons.account_balance_outlined,
              label:    'Pedir levantamento',
              sublabel: 'Transferir saldo para conta bancária',
              color:    BanzamiColors.primary,
              onTap:    () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const PayoutScreen()),
              ),
            ),

            const SizedBox(height: BanzamiSpacing.sm),

            // Advanced: internal Merchant UUID for support (collapsed).
            _TechnicalIdsCard(merchantId: session.merchantId, onCopy: _copyUuid),

            const SizedBox(height: BanzamiSpacing.sm),

            _ActionTile(
              icon:  Icons.logout_rounded,
              label: 'Terminar sessão',
              color: BanzamiColors.primary,
              onTap: () => _confirmLogout(svc),
            ),

            const SizedBox(height: BanzamiSpacing.sm),

            _ActionTile(
              icon:     Icons.delete_outline_rounded,
              label:    'Remover conta',
              sublabel: 'Apaga todas as credenciais guardadas',
              color:    BanzamiColors.gray400,
              onTap:    () => _confirmClearAccount(svc),
            ),

            const SizedBox(height: BanzamiSpacing.xxl),

            const Center(child: _AppVersionLabel()),

            const SizedBox(height: BanzamiSpacing.xl),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }


  Future<void> _copyHandle() async {
    final address = context.read<MerchantSessionService>().session!.banzaAddress;
    if (address == null) return; // nothing to copy until the @banza is known
    await Clipboard.setData(ClipboardData(text: address));
    if (mounted) BanzamiToast.showSuccess(context, 'Endereço @banza copiado.');
    setState(() => _copied = true);
    await Future.delayed(const Duration(seconds: 2));
    if (mounted) setState(() => _copied = false);
  }

  // Copy the internal merchant UUID from the advanced/technical area.
  Future<void> _copyUuid() async {
    final svc = context.read<MerchantSessionService>();
    await Clipboard.setData(ClipboardData(text: svc.session!.merchantId));
    if (mounted) BanzamiToast.showSuccess(context, 'Merchant UUID copiado.');
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

  // Signing out ends the session on Banzami too (its refresh token is
  // revoked, best effort) and clears it from this device regardless.
  Future<void> _confirmLogout(MerchantSessionService svc) async {
    final client  = context.read<BanzamiClient>();
    final confirm = await showBanzamiDialog(
      context:      context,
      icon:         Icons.logout_rounded,
      title:        'Terminar sessão?',
      description:  'A sessão termina neste dispositivo.\nIntroduza o PIN para voltar a entrar.',
      cancelLabel:  'Cancelar',
      confirmLabel: 'Sair',
      variant:      BanzamiDialogVariant.standard,
    );
    if (confirm == true) await signOutBusiness(client: client, session: svc);
  }

  Future<void> _confirmClearAccount(MerchantSessionService svc) async {
    final client  = context.read<BanzamiClient>();
    final confirm = await showBanzamiDialog(
      context:      context,
      icon:         Icons.delete_forever_rounded,
      title:        'Remover conta?',
      description:  'Todas as credenciais guardadas serão apagadas.\nTerá de reconfigurar a aplicação para voltar a usar.',
      cancelLabel:  'Cancelar',
      confirmLabel: 'Remover',
      variant:      BanzamiDialogVariant.danger,
    );
    if (confirm == true) {
      await signOutBusiness(client: client, session: svc, removeAccount: true);
    }
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
        gradient:     BanzamiGradients.primary,
        borderRadius: BanzamiRadius.xlAll,
        boxShadow: [
          BoxShadow(
            color:      BanzamiColors.primaryDark.withValues(alpha: 0.30),
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
                      // @banza is the identity; fall back to email only when the
                      // handle isn't known (legacy API-key session).
                      session.banzaAddress ?? session.merchantEmail,
                      style: BanzamiTextStyles.bodyMd.copyWith(
                        color:      BanzamiColors.white.withValues(alpha: 0.85),
                        fontWeight: session.banzaAddress != null ? FontWeight.w700 : FontWeight.w400,
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
              // What "verified" means here, precisely: Banzami approved this
              // business's KYB. Not the account class (merchant, application,
              // platform), not settlement readiness, not the session.
              Text(
                'Negócio verificado · KYB aprovado',
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
    return const MerchantStatusBadge(
      label: 'Verificado',
      icon: Icons.verified_rounded,
      tone: MerchantBadgeTone.success,
    );
  }
}

/// App version label, read at runtime from the bundle (never hardcoded).
/// Falls back to the product name alone if the platform lookup is unavailable.
class _AppVersionLabel extends StatefulWidget {
  const _AppVersionLabel();

  @override
  State<_AppVersionLabel> createState() => _AppVersionLabelState();
}

class _AppVersionLabelState extends State<_AppVersionLabel> {
  String _text = 'Banzami Business';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final info = await PackageInfo.fromPlatform();
      if (mounted) {
        setState(() => _text = 'Banzami Business v${info.version} (${info.buildNumber})');
      }
    } catch (_) {/* keep the product-name fallback */}
  }

  @override
  Widget build(BuildContext context) {
    return Text(
      _text,
      style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.gray400),
    );
  }
}

// =============================================================================
// 2. @banza payment address card (primary public identifier)
// =============================================================================

class _PaymentAddressCard extends StatelessWidget {
  final String?      address; // e.g. "@doa"; null when not set yet
  final bool         copied;
  final VoidCallback onCopy;

  const _PaymentAddressCard({
    required this.address,
    required this.copied,
    required this.onCopy,
  });

  @override
  Widget build(BuildContext context) {
    final hasAddress = address != null;
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
            _IconBox(icon: Icons.alternate_email_rounded),
            SizedBox(width: BanzamiSpacing.md),
            Text('Endereço @banza', style: BanzamiTextStyles.headingSm),
          ]),

          const SizedBox(height: BanzamiSpacing.sm),

          GestureDetector(
            onTap: hasAddress ? onCopy : null,
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
                    address ?? '@banza ainda não definido',
                    style: hasAddress
                        ? BanzamiTextStyles.headingSm.copyWith(
                            color: BanzamiColors.primary, fontWeight: FontWeight.w800)
                        : BanzamiTextStyles.bodyMd.copyWith(color: BanzamiColors.gray400),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                if (hasAddress) ...[
                  const SizedBox(width: BanzamiSpacing.md),
                  AnimatedSwitcher(
                    duration: const Duration(milliseconds: 220),
                    transitionBuilder: (child, anim) =>
                        ScaleTransition(scale: anim, child: child),
                    child: copied
                        ? const Icon(Icons.check_rounded,
                            key: ValueKey('check'), size: 20, color: BanzamiColors.success)
                        : const Icon(Icons.copy_rounded,
                            key: ValueKey('copy'), size: 20, color: BanzamiColors.gray400),
                  ),
                ],
              ]),
            ),
          ),

          const SizedBox(height: BanzamiSpacing.sm),

          Text(
            hasAddress
                ? 'Partilhe este endereço para receber pagamentos.'
                : 'Defina o seu @banza para receber pagamentos.',
            style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.gray400),
          ),
        ],
      ),
    );
  }
}

// =============================================================================
// 2b. Technical identifiers (advanced) — internal Merchant UUID for support.
//     Collapsed by default; never the primary identity.
// =============================================================================

class _TechnicalIdsCard extends StatefulWidget {
  final String       merchantId;
  final VoidCallback onCopy;
  const _TechnicalIdsCard({required this.merchantId, required this.onCopy});

  @override
  State<_TechnicalIdsCard> createState() => _TechnicalIdsCardState();
}

class _TechnicalIdsCardState extends State<_TechnicalIdsCard> {
  bool _open = false;

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
        vertical:   BanzamiSpacing.sm,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: () => setState(() => _open = !_open),
            child: Row(children: [
              const _IconBox(icon: Icons.tune_rounded),
              const SizedBox(width: BanzamiSpacing.md),
              const Expanded(
                child: Text('Identificadores técnicos', style: BanzamiTextStyles.bodyMd),
              ),
              Icon(_open ? Icons.expand_less_rounded : Icons.expand_more_rounded,
                  color: BanzamiColors.gray400),
            ]),
          ),
          if (_open) ...[
            const SizedBox(height: BanzamiSpacing.sm),
            Text('Merchant UUID',
                style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.gray400)),
            const SizedBox(height: 4),
            GestureDetector(
              onTap: widget.onCopy,
              child: Container(
                width:   double.infinity,
                padding: const EdgeInsets.symmetric(
                  horizontal: BanzamiSpacing.md, vertical: BanzamiSpacing.sm),
                decoration: const BoxDecoration(
                  color: BanzamiColors.gray100, borderRadius: BanzamiRadius.lgAll),
                child: Row(children: [
                  Expanded(
                    child: Text(widget.merchantId,
                        style: BanzamiTextStyles.mono.copyWith(fontSize: 12, color: BanzamiColors.gray900),
                        overflow: TextOverflow.ellipsis),
                  ),
                  const SizedBox(width: BanzamiSpacing.md),
                  const Icon(Icons.copy_rounded, size: 18, color: BanzamiColors.gray400),
                ]),
              ),
            ),
            const SizedBox(height: BanzamiSpacing.sm),
            Text('Uso interno para suporte.',
                style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.gray400)),
          ],
        ],
      ),
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
                child:  CircularProgressIndicator(strokeWidth: 2, color: BanzamiColors.primary),
              )
            else
              Switch(
                value:            biometricsEnabled,
                onChanged:        onToggle,
                activeThumbColor: BanzamiColors.primary,
                trackColor: WidgetStateProperty.resolveWith((states) =>
                  states.contains(WidgetState.selected)
                      ? BanzamiColors.primary.withValues(alpha: 0.25)
                      : BanzamiColors.gray200),
                thumbColor: WidgetStateProperty.resolveWith((states) =>
                  states.contains(WidgetState.selected)
                      ? BanzamiColors.primary
                      : BanzamiColors.white),
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

class _IconBox extends StatelessWidget {
  final IconData icon;
  final Color    color;

  const _IconBox({
    required this.icon,
    this.color = BanzamiColors.primary,
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
