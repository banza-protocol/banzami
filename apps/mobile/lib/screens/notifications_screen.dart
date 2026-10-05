import 'package:flutter/material.dart';
import 'package:banzami_flutter/banzami_flutter.dart';

/// Notifications — an honest, informational view.
///
/// The app has no per-type notification preference store: there is no backend for
/// it and no local persistence, and push delivery is driven by the device's
/// system permission and the server-named topic, not by in-app switches. Showing
/// interactive toggles would imply a persistent setting that does not exist (they
/// reset on reopen and control nothing), so this screen instead describes what
/// Banzami notifies about and points to the device settings for control — no fake
/// switches, nothing that silently resets.
class NotificationsScreen extends StatelessWidget {
  const NotificationsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: BanzamiColors.offWhite,
      body: SafeArea(
        bottom: false,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            AppScreenHeader(
              title: 'Notificações',
              onBack: () => Navigator.of(context).pop(),
            ),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(
                  BanzamiSpacing.xl, 0, BanzamiSpacing.xl, BanzamiSpacing.lg),
                children: const [
                  _InfoCard(
                    icon: Icons.notifications_active_outlined,
                    title: 'Notificações da Banzami',
                    body:
                        'A Banzami envia notificações sobre a sua conta e as suas '
                        'transações — por exemplo, quando recebe um pagamento.',
                  ),
                  SizedBox(height: BanzamiSpacing.md),
                  _InfoCard(
                    icon: Icons.settings_outlined,
                    title: 'Gerir no dispositivo',
                    body:
                        'A ativação das notificações é gerida nas definições do '
                        'sistema do seu dispositivo.',
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _InfoCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String body;
  const _InfoCard({required this.icon, required this.title, required this.body});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: BanzamiColors.white,
        borderRadius: BanzamiRadius.xlAll,
        boxShadow: BanzamiShadows.card,
      ),
      padding: const EdgeInsets.symmetric(
        horizontal: BanzamiSpacing.lg, vertical: BanzamiSpacing.md),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: BanzamiColors.primary.withValues(alpha: 0.08),
              borderRadius: BanzamiRadius.mdAll,
            ),
            child: Icon(icon, color: BanzamiColors.primary, size: 18),
          ),
          const SizedBox(width: BanzamiSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title,
                    style: BanzamiTextStyles.bodyMd.copyWith(fontWeight: FontWeight.w700)),
                const SizedBox(height: 4),
                Text(body,
                    style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.gray600)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
