import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:banza_flutter/banza_flutter.dart';

import '../services/session_service.dart';

class SecurityScreen extends StatefulWidget {
  const SecurityScreen({super.key});

  @override
  State<SecurityScreen> createState() => _SecurityScreenState();
}

class _SecurityScreenState extends State<SecurityScreen> {
  bool          _bioBusy   = false;
  Future<bool>? _canUseBio;

  @override
  Widget build(BuildContext context) {
    final svc     = context.watch<SessionService>();
    final session = svc.session!;

    _canUseBio ??= svc.canUseBiometrics();

    return Scaffold(
      backgroundColor: BanzaColors.offWhite,
      appBar: AppBar(
        backgroundColor:        BanzaColors.offWhite,
        foregroundColor:        BanzaColors.gray900,
        elevation:              0,
        scrolledUnderElevation: 0,
        leading: IconButton(
          icon:      const Icon(Icons.arrow_back_ios_new_rounded, size: 20),
          onPressed: () => Navigator.of(context).pop(),
        ),
        title: const Text('PIN & Segurança', style: BanzaTextStyles.headingMd),
      ),
      body: ListView(
        padding: const EdgeInsets.symmetric(
          horizontal: BanzaSpacing.xl,
          vertical:   BanzaSpacing.lg,
        ),
        children: [

          // ── PIN section ──────────────────────────────────────────────────
          _SectionLabel(label: 'PIN'),
          const SizedBox(height: BanzaSpacing.sm),
          _SettingsCard(children: [
            _RowChevron(
              icon:    Icons.lock_outline_rounded,
              label:   'Alterar PIN',
              onTap:   () => _showComingSoon('Alteração de PIN'),
            ),
          ]),

          const SizedBox(height: BanzaSpacing.xl),

          // ── Session section ──────────────────────────────────────────────
          _SectionLabel(label: 'Sessão'),
          const SizedBox(height: BanzaSpacing.sm),
          FutureBuilder<bool>(
            future: _canUseBio,
            builder: (_, snap) {
              final hasBio = snap.data == true;
              return _SettingsCard(children: [
                if (hasBio)
                  _RowToggle(
                    icon:    Icons.fingerprint_rounded,
                    label:   'Login com biometria',
                    sub:     'Face ID / impressão digital',
                    value:   session.biometricsEnabled,
                    busy:    _bioBusy,
                    onChanged: (v) => _toggleBio(svc, v),
                  ),
                if (hasBio)
                  const Divider(height: 1, indent: 56, color: BanzaColors.gray100),
                _RowChevron(
                  icon:  Icons.timer_outlined,
                  label: 'Bloqueio automático',
                  sub:   'Após 5 minutos',
                  onTap: () => _showComingSoon('Bloqueio automático'),
                ),
              ]);
            },
          ),

          const SizedBox(height: BanzaSpacing.xl),

          // ── Notifications section ─────────────────────────────────────────
          _SectionLabel(label: 'Alertas'),
          const SizedBox(height: BanzaSpacing.sm),
          _SettingsCard(children: [
            _RowToggle(
              icon:    Icons.shield_outlined,
              label:   'Notificações de segurança',
              sub:     'Alertas de login e actividade suspeita',
              value:   true,
              onChanged: (_) => _showComingSoon('Notificações de segurança'),
            ),
          ]),

          const SizedBox(height: BanzaSpacing.xxl),
        ],
      ),
    );
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

  void _showComingSoon(String feature) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('$feature em breve')),
    );
  }
}

// =============================================================================
// Shared layout helpers
// =============================================================================

class _SectionLabel extends StatelessWidget {
  final String label;
  const _SectionLabel({required this.label});

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
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: children,
      ),
    );
  }
}

class _RowChevron extends StatelessWidget {
  final IconData     icon;
  final String       label;
  final String?      sub;
  final VoidCallback onTap;

  const _RowChevron({
    required this.icon,
    required this.label,
    this.sub,
    required this.onTap,
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
          _IconChip(icon: icon),
          const SizedBox(width: BanzaSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize:       MainAxisSize.min,
              children: [
                Text(label,
                    style: BanzaTextStyles.bodyMd.copyWith(
                      fontWeight: FontWeight.w500,
                    )),
                if (sub != null)
                  Text(sub!,
                      style: BanzaTextStyles.bodySm.copyWith(color: BanzaColors.gray400)),
              ],
            ),
          ),
          const Icon(Icons.chevron_right_rounded, size: 20, color: BanzaColors.gray400),
        ]),
      ),
    );
  }
}

class _RowToggle extends StatelessWidget {
  final IconData              icon;
  final String                label;
  final String?               sub;
  final bool                  value;
  final bool                  busy;
  final void Function(bool)   onChanged;

  const _RowToggle({
    required this.icon,
    required this.label,
    this.sub,
    required this.value,
    this.busy = false,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: BanzaSpacing.lg,
        vertical:   BanzaSpacing.md,
      ),
      child: Row(children: [
        _IconChip(icon: icon),
        const SizedBox(width: BanzaSpacing.md),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize:       MainAxisSize.min,
            children: [
              Text(label, style: BanzaTextStyles.bodyMd.copyWith(fontWeight: FontWeight.w500)),
              if (sub != null)
                Text(sub!, style: BanzaTextStyles.bodySm.copyWith(color: BanzaColors.gray400)),
            ],
          ),
        ),
        if (busy)
          const SizedBox(
            width: 22, height: 22,
            child: CircularProgressIndicator(strokeWidth: 2, color: BanzaColors.wine),
          )
        else
          Switch(
            value:     value,
            onChanged: onChanged,
            activeTrackColor:  BanzaColors.wine,
            inactiveThumbColor: BanzaColors.white,
          ),
      ]),
    );
  }
}

class _IconChip extends StatelessWidget {
  final IconData icon;
  const _IconChip({required this.icon});

  @override
  Widget build(BuildContext context) {
    return Container(
      width:  36,
      height: 36,
      decoration: BoxDecoration(
        color:        BanzaColors.wine.withValues(alpha: 0.10),
        borderRadius: BanzaRadius.mdAll,
      ),
      child: Icon(icon, color: BanzaColors.wine, size: 18),
    );
  }
}
