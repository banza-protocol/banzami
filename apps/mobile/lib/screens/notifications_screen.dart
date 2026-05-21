import 'package:flutter/material.dart';
import 'package:banza_flutter/banza_flutter.dart';

class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  bool _received  = true;
  bool _sent      = true;
  bool _multicaixa = true;
  bool _promos    = false;
  bool _security  = true;

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
        title: const Text('Notificações', style: BanzaTextStyles.headingMd),
      ),
      body: ListView(
        padding: const EdgeInsets.symmetric(
          horizontal: BanzaSpacing.xl,
          vertical:   BanzaSpacing.lg,
        ),
        children: [

          // ── Transacções ──────────────────────────────────────────────────
          const _SectionLabel('Transacções'),
          const SizedBox(height: BanzaSpacing.sm),
          _Card(children: [
            _ToggleRow(
              label:     'Transações recebidas',
              value:     _received,
              onChanged: (v) => setState(() => _received = v),
            ),
            const Divider(height: 1, indent: 16, color: BanzaColors.gray100),
            _ToggleRow(
              label:     'Transações enviadas',
              value:     _sent,
              onChanged: (v) => setState(() => _sent = v),
            ),
            const Divider(height: 1, indent: 16, color: BanzaColors.gray100),
            _ToggleRow(
              label:     'Multicaixa Express',
              value:     _multicaixa,
              onChanged: (v) => setState(() => _multicaixa = v),
            ),
          ]),

          const SizedBox(height: BanzaSpacing.xl),

          // ── Outras ───────────────────────────────────────────────────────
          const _SectionLabel('Outras'),
          const SizedBox(height: BanzaSpacing.sm),
          _Card(children: [
            _ToggleRow(
              label:     'Promoções e novidades',
              value:     _promos,
              onChanged: (v) => setState(() => _promos = v),
            ),
            const Divider(height: 1, indent: 16, color: BanzaColors.gray100),
            _ToggleRow(
              label:     'Alertas de segurança',
              value:     _security,
              onChanged: (v) => setState(() => _security = v),
            ),
          ]),

          const SizedBox(height: BanzaSpacing.xl),

          // Footer note
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: BanzaSpacing.xs),
            child: Text(
              'Receba notificações importantes sobre a sua conta e transações.',
              style: BanzaTextStyles.bodySm.copyWith(color: BanzaColors.gray400),
              textAlign: TextAlign.center,
            ),
          ),

          const SizedBox(height: BanzaSpacing.xxl),
        ],
      ),
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

class _ToggleRow extends StatelessWidget {
  final String              label;
  final bool                value;
  final void Function(bool) onChanged;

  const _ToggleRow({
    required this.label,
    required this.value,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: BanzaSpacing.lg,
        vertical:   BanzaSpacing.md,
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: BanzaTextStyles.bodyMd.copyWith(fontWeight: FontWeight.w500),
            ),
          ),
          Switch(
            value:           value,
            onChanged:       onChanged,
            activeTrackColor: BanzaColors.wine,
            inactiveThumbColor: BanzaColors.white,
          ),
        ],
      ),
    );
  }
}
