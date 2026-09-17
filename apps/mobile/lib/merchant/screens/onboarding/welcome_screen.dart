import 'package:flutter/material.dart';
import 'package:banzami_flutter/banzami_flutter.dart';

import '../../../branding_assets.dart';
import 'login_screen.dart';

/// Banzami Business welcome — mirrors the consumer WelcomeScreen (gradient hero,
/// fade/slide entry, circular feature icons, BanzamiPrimaryButton) with a
/// business tone.
class MerchantWelcomeScreen extends StatefulWidget {
  const MerchantWelcomeScreen({super.key});

  @override
  State<MerchantWelcomeScreen> createState() => _MerchantWelcomeScreenState();
}

class _MerchantWelcomeScreenState extends State<MerchantWelcomeScreen>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  late final Animation<double> _fade;
  late final Animation<Offset> _slide;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(vsync: this, duration: BanzamiMotion.slow);
    _fade = CurvedAnimation(parent: _ctrl, curve: const Interval(0, 0.7, curve: Curves.easeOut));
    _slide = Tween(begin: const Offset(0, 0.06), end: Offset.zero).animate(
      CurvedAnimation(parent: _ctrl, curve: BanzamiMotion.decelerate),
    );
    _ctrl.forward();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  /// White at ~0.9 alpha as a CONST color, so the feature `Icon`s below can be
  /// const (required for Web icon tree-shaking to keep the glyphs).
  static const Color _featureIcon = Color(0xE6FFFFFF);

  /// One feature row: a circular translucent chip holding [icon] + [label]. The
  /// icon is passed as an already-built const widget so the tree-shaker keeps it.
  Widget _feature(Widget icon, String label) => Padding(
        padding: const EdgeInsets.only(bottom: BanzamiSpacing.lg),
        child: Row(children: [
          Container(
            width: 32,
            height: 32,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: BanzamiColors.white.withValues(alpha: 0.10),
              shape: BoxShape.circle,
            ),
            child: icon,
          ),
          const SizedBox(width: BanzamiSpacing.md),
          Expanded(
            child: Text(label,
                style: BanzamiTextStyles.bodyMd.copyWith(
                  color: BanzamiColors.white.withValues(alpha: 0.85),
                )),
          ),
        ]),
      );

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: BanzamiColors.primary,
      body: Container(
        decoration: const BoxDecoration(gradient: BanzamiGradients.primary),
        child: SafeArea(
          child: FadeTransition(
            opacity: _fade,
            child: SlideTransition(
              position: _slide,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: BanzamiSpacing.xxl),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Spacer(flex: 2),

                    ClipRRect(
                      borderRadius: BorderRadius.circular(16),
                      child: Image.asset(BrandingAssets.businessIcon, height: 56),
                    ),
                    const SizedBox(height: BanzamiSpacing.xl),

                    Text(
                      'Banzami\nBusiness',
                      style: BanzamiTextStyles.displayLg.copyWith(
                        color:      BanzamiColors.white,
                        fontWeight: FontWeight.w800,
                        height:     1.15,
                      ),
                    ),
                    const SizedBox(height: BanzamiSpacing.md),
                    Text(
                      'Receba pagamentos instantâneos\nno seu negócio.',
                      style: BanzamiTextStyles.headingSm.copyWith(
                        color:      BanzamiColors.white.withValues(alpha: 0.85),
                        fontWeight: FontWeight.w400,
                        height:     1.5,
                      ),
                    ),

                    const Spacer(flex: 3),

                    // Feature rows. The icons are passed as CONST Icon widgets at
                    // the call site — never through a record/variable — so Flutter's
                    // Web icon tree-shaker (const_finder) always keeps them. A
                    // dynamic icon built from a record/list entry silently vanishes
                    // on Web for any glyph not also referenced as a const Icon
                    // elsewhere (that was the missing bar-chart + bell here).
                    _feature(
                      const Icon(Icons.qr_code_rounded, color: _featureIcon, size: 16),
                      'Gere QR e links de pagamento',
                    ),
                    _feature(
                      const Icon(Icons.bar_chart_rounded, color: _featureIcon, size: 16),
                      'Acompanhe as suas receitas',
                    ),
                    _feature(
                      const Icon(Icons.notifications_rounded, color: _featureIcon, size: 16),
                      'Notificações em tempo real',
                    ),

                    const Spacer(flex: 1),

                    BanzamiPrimaryButton(
                      label:           'Conectar conta',
                      backgroundColor: BanzamiColors.white,
                      foregroundColor: BanzamiColors.primary,
                      onPressed: () => Navigator.of(context).push(
                        BanzamiPageRoute(page: const MerchantLoginScreen()),
                      ),
                    ),
                    const SizedBox(height: BanzamiSpacing.xxl),
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
