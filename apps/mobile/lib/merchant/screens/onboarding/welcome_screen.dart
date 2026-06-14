import 'package:flutter/material.dart';
import 'package:banzami_flutter/banzami_flutter.dart';

import '../../../branding_assets.dart';
import 'setup_screen.dart';

class MerchantWelcomeScreen extends StatelessWidget {
  const MerchantWelcomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: BanzamiColors.primary,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 32),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Spacer(flex: 2),

              Image.asset(
                BrandingAssets.logo,
                height: 80,
              ),
              const SizedBox(height: 24),

              Text(
                'Banzami\nBusiness',
                style: BanzamiTextStyles.displayLg.copyWith(
                  color:      BanzamiColors.white,
                  fontWeight: FontWeight.w800,
                  height:     1.15,
                ),
              ),
              const SizedBox(height: 12),
              Text(
                'Receba pagamentos instantâneos\nno seu negócio.',
                style: BanzamiTextStyles.headingSm.copyWith(
                  color:      BanzamiColors.white.withValues(alpha: 0.85),
                  fontWeight: FontWeight.w400,
                  height:     1.5,
                ),
              ),

              const Spacer(flex: 3),

              ...[
                (Icons.qr_code_rounded,        'Gere QR e links de pagamento'),
                (Icons.bar_chart_rounded,       'Acompanhe as suas receitas'),
                (Icons.notifications_rounded,   'Notificações em tempo real'),
              ].map((item) => Padding(
                padding: const EdgeInsets.only(bottom: 16),
                child: Row(children: [
                  Icon(item.$1, color: BanzamiColors.white.withValues(alpha: 0.8), size: 20),
                  const SizedBox(width: 12),
                  Text(item.$2, style: BanzamiTextStyles.bodyMd.copyWith(
                    color: BanzamiColors.white.withValues(alpha: 0.8),
                  )),
                ]),
              )),

              const Spacer(flex: 1),

              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: () => Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => const MerchantSetupScreen()),
                  ),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: BanzamiColors.white,
                    foregroundColor: BanzamiColors.primary,
                    padding:   const EdgeInsets.symmetric(vertical: 16),
                    shape:     RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    textStyle: BanzamiTextStyles.headingSm,
                  ),
                  child: const Text('Conectar conta'),
                ),
              ),
              const SizedBox(height: 32),
            ],
          ),
        ),
      ),
    );
  }
}
