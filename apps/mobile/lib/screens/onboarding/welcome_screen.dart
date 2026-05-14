import 'package:flutter/material.dart';
import 'package:banzami_sdk/banzami_sdk.dart';

import 'create_account_screen.dart';
import 'login_screen.dart';

class WelcomeScreen extends StatelessWidget {
  const WelcomeScreen({super.key});

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

              // Official logo
              ClipRRect(
                borderRadius: BorderRadius.circular(18),
                child: Image.asset(
                  'assets/images/icon_master_1024.png',
                  width:  72,
                  height: 72,
                  fit:    BoxFit.cover,
                ),
              ),
              const SizedBox(height: 24),

              // Headline
              Text(
                'Banzami',
                style: BanzamiTextStyles.displayLg.copyWith(
                  color:      BanzamiColors.white,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 12),
              Text(
                'Envie e receba dinheiro\ninstantaneamente em Angola.',
                style: BanzamiTextStyles.headingSm.copyWith(
                  color:      BanzamiColors.white.withValues(alpha: 0.85),
                  fontWeight: FontWeight.w400,
                  height:     1.5,
                ),
              ),

              const Spacer(flex: 3),

              // Features list
              ...[
                (Icons.qr_code_scanner_rounded, 'Pague por QR em qualquer loja'),
                (Icons.send_rounded,            'Envie para qualquer @handle'),
                (Icons.account_balance_rounded, 'Multicaixa Express integrado'),
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

              // Primary CTA
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: () => Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => const CreateAccountScreen()),
                  ),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: BanzamiColors.white,
                    foregroundColor: BanzamiColors.wine,
                    padding:         const EdgeInsets.symmetric(vertical: 16),
                    shape:           RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    textStyle:       BanzamiTextStyles.headingSm,
                  ),
                  child: const Text('Criar conta'),
                ),
              ),
              const SizedBox(height: 12),

              // Secondary CTA
              SizedBox(
                width: double.infinity,
                child: OutlinedButton(
                  onPressed: () => Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => const LoginScreen()),
                  ),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: BanzamiColors.white,
                    side:            BorderSide(color: BanzamiColors.white.withValues(alpha: 0.5), width: 1.5),
                    padding:         const EdgeInsets.symmetric(vertical: 16),
                    shape:           RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    textStyle:       BanzamiTextStyles.headingSm,
                  ),
                  child: const Text('Já tenho conta'),
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
