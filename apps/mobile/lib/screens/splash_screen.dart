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
  late final Animation<double>   _fade;
  late final Animation<double>   _scale;
  late final Animation<Offset>   _slide;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync:    this,
      duration: const Duration(milliseconds: 1000),
    );
    _fade = CurvedAnimation(
      parent: _ctrl,
      curve:  const Interval(0.0, 0.55, curve: Curves.easeOut),
    );
    _scale = Tween<double>(begin: 0.86, end: 1.0).animate(
      CurvedAnimation(
        parent: _ctrl,
        curve:  const Interval(0.0, 0.65, curve: Curves.easeOutCubic),
      ),
    );
    _slide = Tween<Offset>(
      begin: const Offset(0, 0.07),
      end:   Offset.zero,
    ).animate(
      CurvedAnimation(
        parent: _ctrl,
        curve:  const Interval(0.0, 0.65, curve: Curves.easeOutCubic),
      ),
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
            top:  -110,
            left: -70,
            child: IgnorePointer(
              child: Container(
                width:  380,
                height: 380,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: RadialGradient(
                    colors: [
                      const Color(0xFFC21A2C).withValues(alpha: 0.38),
                      const Color(0xFFC21A2C).withValues(alpha: 0.0),
                    ],
                  ),
                ),
              ),
            ),
          ),

          // ── Bottom-right vignette ───────────────────────────────────────
          Positioned(
            bottom: -80,
            right:  -80,
            child: IgnorePointer(
              child: Container(
                width:  280,
                height: 280,
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
          SafeArea(
            child: FadeTransition(
              opacity: _fade,
              child: SlideTransition(
                position: _slide,
                child: ScaleTransition(
                  scale: _scale,
                  child: const Center(child: _SplashContent()),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// =============================================================================
// Content — floating icon + wordmark + indicator
// =============================================================================

class _SplashContent extends StatelessWidget {
  const _SplashContent();

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        // ── Floating icon ─────────────────────────────────────────────────
        Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(22),
            boxShadow: [
              BoxShadow(
                color:       const Color(0xFF000000).withValues(alpha: 0.32),
                blurRadius:  36,
                offset:      const Offset(0, 14),
                spreadRadius: -4,
              ),
              BoxShadow(
                color:       const Color(0xFFC21A2C).withValues(alpha: 0.30),
                blurRadius:  24,
                offset:      const Offset(0, 4),
                spreadRadius: -2,
              ),
            ],
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(22),
            child: Image.asset(
              'assets/images/banza_icon.png',
              width:  80,
              height: 80,
            ),
          ),
        ),

        const SizedBox(height: 28),

        // ── Wordmark ──────────────────────────────────────────────────────
        Text(
          'Banza',
          style: BanzaTextStyles.displayMd.copyWith(
            color:         BanzaColors.white,
            fontWeight:    FontWeight.w700,
            letterSpacing: -0.5,
          ),
        ),

        const SizedBox(height: 8),

        // ── Tagline ───────────────────────────────────────────────────────
        Text(
          'Pagamentos instantâneos em Angola',
          style: BanzaTextStyles.bodyMd.copyWith(
            color:         BanzaColors.white.withValues(alpha: 0.50),
            letterSpacing: 0.1,
          ),
        ),

        const SizedBox(height: 52),

        // ── Loading indicator ─────────────────────────────────────────────
        const CupertinoActivityIndicator(
          color:  Color(0x55FFFFFF),
          radius: 9,
        ),
      ],
    );
  }
}
