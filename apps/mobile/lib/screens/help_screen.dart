import 'package:flutter/material.dart';
import 'package:banza_flutter/banza_flutter.dart';

class HelpScreen extends StatelessWidget {
  const HelpScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: BanzamiColors.offWhite,
      appBar: AppBar(
        backgroundColor:        BanzamiColors.offWhite,
        foregroundColor:        BanzamiColors.gray900,
        elevation:              0,
        scrolledUnderElevation: 0,
        leading: IconButton(
          icon:      const Icon(Icons.arrow_back_ios_new_rounded, size: 20),
          onPressed: () => Navigator.of(context).pop(),
        ),
        title: const Text('Ajuda & Suporte', style: BanzamiTextStyles.headingMd),
      ),
      body: ListView(
        padding: const EdgeInsets.symmetric(
          horizontal: BanzamiSpacing.xl,
          vertical:   BanzamiSpacing.lg,
        ),
        children: [

          // ── Support ───────────────────────────────────────────────────────
          const _SectionLabel('Suporte'),
          const SizedBox(height: BanzamiSpacing.sm),
          _Card(children: [
            _Row(
              icon:  Icons.help_outline_rounded,
              label: 'Perguntas frequentes',
              onTap: () => _showComingSoon(context, 'FAQ'),
            ),
            const Divider(height: 1, indent: 56, color: BanzamiColors.gray100),
            _Row(
              icon:  Icons.support_agent_rounded,
              label: 'Contactar suporte',
              onTap: () => _showComingSoon(context, 'Suporte'),
            ),
            const Divider(height: 1, indent: 56, color: BanzamiColors.gray100),
            _Row(
              icon:  Icons.flag_outlined,
              label: 'Relatar um problema',
              onTap: () => _showComingSoon(context, 'Relatar problema'),
            ),
          ]),

          const SizedBox(height: BanzamiSpacing.xl),

          // ── Legal ─────────────────────────────────────────────────────────
          const _SectionLabel('Legal'),
          const SizedBox(height: BanzamiSpacing.sm),
          _Card(children: [
            _Row(
              icon:  Icons.description_outlined,
              label: 'Termos de uso',
              onTap: () => _showComingSoon(context, 'Termos de uso'),
            ),
            const Divider(height: 1, indent: 56, color: BanzamiColors.gray100),
            _Row(
              icon:  Icons.privacy_tip_outlined,
              label: 'Política de privacidade',
              onTap: () => _showComingSoon(context, 'Política de privacidade'),
            ),
          ]),

          const SizedBox(height: BanzamiSpacing.xxl),

          // Version
          Center(
            child: Text(
              'Banzami v1.0 (2025)',
              style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.gray400),
            ),
          ),

          const SizedBox(height: BanzamiSpacing.xl),
        ],
      ),
    );
  }

  static void _showComingSoon(BuildContext context, String feature) {
    BanzamiToast.showInfo(context, '$feature em breve');
  }
}

// =============================================================================
// Helpers
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

class _Card extends StatelessWidget {
  final List<Widget> children;
  const _Card({required this.children});

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

class _Row extends StatelessWidget {
  final IconData     icon;
  final String       label;
  final VoidCallback onTap;

  const _Row({required this.icon, required this.label, required this.onTap});

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
              color:        BanzamiColors.primary.withValues(alpha: 0.08),
              borderRadius: BanzamiRadius.mdAll,
            ),
            child: Icon(icon, color: BanzamiColors.primary, size: 18),
          ),
          const SizedBox(width: BanzamiSpacing.md),
          Expanded(
            child: Text(
              label,
              style: BanzamiTextStyles.bodyMd.copyWith(fontWeight: FontWeight.w500),
            ),
          ),
          const Icon(Icons.chevron_right_rounded, size: 20, color: BanzamiColors.gray400),
        ]),
      ),
    );
  }
}
