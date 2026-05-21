import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:banza_flutter/banza_flutter.dart';

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;

  // Icon: 0 ms — fade + scale
  late final Animation<double> _iconFade;
  late final Animation<double> _iconScale;

  // Title: 300 ms
  late final Animation<double> _titleFade;

  // Subtitle: 500 ms
  late final Animation<double> _subtitleFade;

  // Loader: 650 ms
  late final Animation<double> _loaderFade;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync:    this,
      duration: const Duration(milliseconds: 1200),
    );

    _iconFade = CurvedAnimation(
      parent: _ctrl,
      curve:  const Interval(0.00, 0.45, curve: Curves.easeOut),
    );
    _iconScale = Tween<double>(begin: 0.94, end: 1.0).animate(
      CurvedAnimation(
        parent: _ctrl,
        curve:  const Interval(0.00, 0.42, curve: Curves.easeOutCubic),
      ),
    );
    _titleFade = CurvedAnimation(
      parent: _ctrl,
      curve:  const Interval(0.25, 0.60, curve: Curves.easeOut),
    );
    _subtitleFade = CurvedAnimation(
      parent: _ctrl,
      curve:  const Interval(0.40, 0.70, curve: Curves.easeOut),
    );
    _loaderFade = CurvedAnimation(
      parent: _ctrl,
      curve:  const Interval(0.55, 0.80, curve: Curves.easeOut),
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
      backgroundColor: const Color(0xFF5E000A),
      body: Stack(
        children: [
          // ── Background gradient ─────────────────────────────────────────
          const SizedBox.expand(
            child: DecoratedBox(decoration: BoxDecoration(gradient: BanzaGradients.wine)),
          ),

          // ── Top-left radial bloom ───────────────────────────────────────
          Positioned(
            top:  -100,
            left: -60,
            child: IgnorePointer(
              child: Container(
                width:  360,
                height: 360,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: RadialGradient(
                    colors: [
                      const Color(0xFFC21A2C).withValues(alpha: 0.40),
                      const Color(0xFFC21A2C).withValues(alpha: 0.0),
                    ],
                  ),
                ),
              ),
            ),
          ),

          // ── Bottom-right vignette ───────────────────────────────────────
          Positioned(
            bottom: -70,
            right:  -70,
            child: IgnorePointer(
              child: Container(
                width:  260,
                height: 260,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: RadialGradient(
                    colors: [
                      const Color(0xFF000000).withValues(alpha: 0.22),
                      const Color(0xFF000000).withValues(alpha: 0.0),
                    ],
                  ),
                ),
              ),
            ),
          ),

          // ── Animated content ────────────────────────────────────────────
          Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                // Icon
                FadeTransition(
                  opacity: _iconFade,
                  child: ScaleTransition(
                    scale: _iconScale,
                    child: _FloatingIcon(),
                  ),
                ),

                const SizedBox(height: 28),

                // Title
                FadeTransition(
                  opacity: _titleFade,
                  child: Text(
                    'Banza',
                    style: BanzaTextStyles.displayMd.copyWith(
                      color:         BanzaColors.white,
                      fontWeight:    FontWeight.w700,
                      fontSize:      36,
                      letterSpacing: -0.5,
                    ),
                  ),
                ),

                const SizedBox(height: 10),

                // Subtitle
                FadeTransition(
                  opacity: _subtitleFade,
                  child: Text(
                    'Envie e receba dinheiro\ninstantaneamente em Angola.',
                    textAlign: TextAlign.center,
                    style: BanzaTextStyles.bodyMd.copyWith(
                      color:      BanzaColors.white.withValues(alpha: 0.70),
                      fontSize:   15,
                      height:     1.45,
                    ),
                  ),
                ),

                const SizedBox(height: 40),

                // Loader
                FadeTransition(
                  opacity: _loaderFade,
                  child: const CupertinoActivityIndicator(
                    color:  Color(0x99FFFFFF),
                    radius: 11,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _FloatingIcon extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(24),
        boxShadow: [
          BoxShadow(
            color:        const Color(0xFF000000).withValues(alpha: 0.35),
            blurRadius:   40,
            offset:       const Offset(0, 16),
            spreadRadius: -4,
          ),
          BoxShadow(
            color:        const Color(0xFFC21A2C).withValues(alpha: 0.28),
            blurRadius:   24,
            offset:       const Offset(0, 4),
            spreadRadius: -2,
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(24),
        child: Image.asset(
          'assets/images/banza_icon.png',
          width:  84,
          height: 84,
          fit:    BoxFit.cover,
        ),
      ),
    );
  }
}
