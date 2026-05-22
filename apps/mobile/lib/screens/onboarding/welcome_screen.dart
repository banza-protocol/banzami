import 'package:flutter/material.dart';
import 'package:banza_flutter/banza_flutter.dart';

import '../../branding_assets.dart';
import 'create_account_screen.dart';
import 'login_screen.dart';

class WelcomeScreen extends StatefulWidget {
  const WelcomeScreen({super.key});

  @override
  State<WelcomeScreen> createState() => _WelcomeScreenState();
}

class _WelcomeScreenState extends State<WelcomeScreen>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  late final Animation<double>   _fade;
  late final Animation<Offset>   _slide;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync:    this,
      duration: BanzaMotion.slow,
    );
    _fade = CurvedAnimation(parent: _ctrl, curve: const Interval(0, 0.7, curve: Curves.easeOut));
    _slide = Tween(begin: const Offset(0, 0.06), end: Offset.zero).animate(
      CurvedAnimation(parent: _ctrl, curve: BanzaMotion.decelerate),
    );
    _ctrl.forward();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: BanzaColors.wine,
      body: Container(
        decoration: const BoxDecoration(gradient: BanzaGradients.wine),
        child: SafeArea(
          child: FadeTransition(
            opacity: _fade,
            child: SlideTransition(
              position: _slide,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 32),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Spacer(flex: 2),

                    ClipRRect(
                      borderRadius: BorderRadius.circular(16),
                      child: Image.asset(
                        BrandingAssets.icon,
                        height: 56,
                      ),
                    ),
                    const SizedBox(height: 24),

                    Text(
                      'Banza',
                      style: BanzaTextStyles.displayLg.copyWith(
                        color:      BanzaColors.white,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 12),
                    Text(
                      'Envie e receba dinheiro\ninstantaneamente em Angola.',
                      style: BanzaTextStyles.headingSm.copyWith(
                        color:      BanzaColors.white.withValues(alpha: 0.85),
                        fontWeight: FontWeight.w400,
                        height:     1.5,
                      ),
                    ),

                    const Spacer(flex: 3),

                    ...[
                      (Icons.qr_code_scanner_rounded, 'Pague por QR em qualquer loja'),
                      (Icons.send_rounded,            'Envie para qualquer @banza'),
                      (Icons.account_balance_rounded, 'Multicaixa Express integrado'),
                    ].map((item) => Padding(
                      padding: const EdgeInsets.only(bottom: 16),
                      child: Row(children: [
                        Container(
                          width:  32,
                          height: 32,
                          decoration: BoxDecoration(
                            color:  BanzaColors.white.withValues(alpha: 0.10),
                            shape:  BoxShape.circle,
                          ),
                          child: Icon(item.$1, color: BanzaColors.white.withValues(alpha: 0.9), size: 16),
                        ),
                        const SizedBox(width: 12),
                        Text(item.$2, style: BanzaTextStyles.bodyMd.copyWith(
                          color: BanzaColors.white.withValues(alpha: 0.85),
                        )),
                      ]),
                    )),

                    const Spacer(flex: 1),

                    BanzaPrimaryButton(
                      label:           'Criar conta',
                      backgroundColor: BanzaColors.white,
                      foregroundColor: BanzaColors.wine,
                      onPressed: () => Navigator.of(context).push(
                        BanzaPageRoute(page: const CreateAccountScreen()),
                      ),
                    ),
                    const SizedBox(height: 12),

                    BanzaSecondaryButton(
                      label:           'Já tenho conta',
                      borderColor:     BanzaColors.white.withValues(alpha: 0.5),
                      foregroundColor: BanzaColors.white,
                      onPressed: () => Navigator.of(context).push(
                        BanzaPageRoute(page: const LoginScreen()),
                      ),
                    ),
                    const SizedBox(height: 32),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
