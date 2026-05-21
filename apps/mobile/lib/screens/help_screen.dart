import 'package:flutter/material.dart';
import 'package:banza_flutter/banza_flutter.dart';

class HelpScreen extends StatelessWidget {
  const HelpScreen({super.key});

  @override
  Widget build(BuildContext context) {
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
        title: const Text('Ajuda & Suporte', style: BanzaTextStyles.headingMd),
      ),
      body: ListView(
        padding: const EdgeInsets.symmetric(
          horizontal: BanzaSpacing.xl,
          vertical:   BanzaSpacing.lg,
        ),
        children: [

          // ── Support ───────────────────────────────────────────────────────
          const _SectionLabel('Suporte'),
          const SizedBox(height: BanzaSpacing.sm),
          _Card(children: [
            _Row(
              icon:  Icons.help_outline_rounded,
              label: 'Perguntas frequentes',
              onTap: () => _showComingSoon(context, 'FAQ'),
            ),
            const Divider(height: 1, indent: 56, color: BanzaColors.gray100),
            _Row(
              icon:  Icons.support_agent_rounded,
              label: 'Contactar suporte',
              onTap: () => _showComingSoon(context, 'Suporte'),
            ),
            const Divider(height: 1, indent: 56, color: BanzaColors.gray100),
            _Row(
              icon:  Icons.flag_outlined,
              label: 'Relatar um problema',
              onTap: () => _showComingSoon(context, 'Relatar problema'),
            ),
          ]),

          const SizedBox(height: BanzaSpacing.xl),

          // ── Legal ─────────────────────────────────────────────────────────
          const _SectionLabel('Legal'),
          const SizedBox(height: BanzaSpacing.sm),
          _Card(children: [
            _Row(
              icon:  Icons.description_outlined,
              label: 'Termos de uso',
              onTap: () => _showComingSoon(context, 'Termos de uso'),
            ),
            const Divider(height: 1, indent: 56, color: BanzaColors.gray100),
            _Row(
              icon:  Icons.privacy_tip_outlined,
              label: 'Política de privacidade',
              onTap: () => _showComingSoon(context, 'Política de privacidade'),
            ),
          ]),

          const SizedBox(height: BanzaSpacing.xxl),

          // Version
          Center(
            child: Text(
              'Banza v1.0 (2025)',
              style: BanzaTextStyles.bodySm.copyWith(color: BanzaColors.gray400),
            ),
          ),

          const SizedBox(height: BanzaSpacing.xl),
        ],
      ),
    );
  }

  static void _showComingSoon(BuildContext context, String feature) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('$feature em breve')),
    );
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

class _Card extends StatelessWidget {
  final List<Widget> children;
  const _Card({required this.children});

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
          horizontal: BanzaSpacing.lg,
          vertical:   BanzaSpacing.md + 2,
        ),
        child: Row(children: [
          Container(
            width:  36,
            height: 36,
            decoration: BoxDecoration(
              color:        BanzaColors.wine.withValues(alpha: 0.08),
              borderRadius: BanzaRadius.mdAll,
            ),
            child: Icon(icon, color: BanzaColors.wine, size: 18),
          ),
          const SizedBox(width: BanzaSpacing.md),
          Expanded(
            child: Text(
              label,
              style: BanzaTextStyles.bodyMd.copyWith(fontWeight: FontWeight.w500),
            ),
          ),
          const Icon(Icons.chevron_right_rounded, size: 20, color: BanzaColors.gray400),
        ]),
      ),
    );
  }
}
