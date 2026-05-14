import 'package:flutter/material.dart';
import 'package:banzami_sdk/banzami_sdk.dart';

import 'setup_screen.dart';

class MerchantWelcomeScreen extends StatelessWidget {
  const MerchantWelcomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: BanzamiColors.wine,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 32),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Spacer(flex: 2),

              Container(
                width:  64,
                height: 64,
                decoration: BoxDecoration(
                  color:        BanzamiColors.white.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(18),
                ),
                child: const Icon(Icons.storefront_rounded, color: BanzamiColors.white, size: 36),
              ),
              const SizedBox(height: 24),

              Text(
                'Banzami\nComerciante',
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
                    foregroundColor: BanzamiColors.wine,
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    textStyle: BanzamiTextStyles.headingSm,
                  ),
                  child: const Text('Configurar conta'),
                ),
              ),
              const SizedBox(height: 40),
            ],
          ),
        ),
      ),
    );
  }
}
