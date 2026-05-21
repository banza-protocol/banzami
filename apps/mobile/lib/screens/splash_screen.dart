import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';

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
          // ── Background gradient — top light, bottom dark ─────────────────
          Container(
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                begin:  Alignment.topLeft,
                end:    Alignment.bottomRight,
                colors: [
                  Color(0xFFC21A2C),
                  Color(0xFF990011),
                  Color(0xFF7A000D),
                  Color(0xFF5E000A),
                ],
                stops: [0.0, 0.38, 0.72, 1.0],
              ),
            ),
          ),

          // ── Top-left radial light bloom ─────────────────────────────────
          Positioned(
            top:  -100,
            left: -80,
            child: IgnorePointer(
              child: Container(
                width:  440,
                height: 440,
                decoration: const BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: RadialGradient(
                    colors: [
                      Color(0x55E83050), // bright rose bloom
                      Color(0x00E83050),
                    ],
                  ),
                ),
              ),
            ),
          ),

          // ── Bottom-right dark vignette ──────────────────────────────────
          Positioned(
            bottom: -80,
            right:  -80,
            child: IgnorePointer(
              child: Container(
                width:  320,
                height: 320,
                decoration: const BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: RadialGradient(
                    colors: [
                      Color(0x55000000),
                      Color(0x00000000),
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
                    child: const _AppIcon(),
                  ),
                ),

                const SizedBox(height: 28),

                // Title
                FadeTransition(
                  opacity: _titleFade,
                  child: const Text(
                    'Banza',
                    style: TextStyle(
                      color:         Colors.white,
                      fontSize:      36,
                      fontWeight:    FontWeight.w700,
                      letterSpacing: -0.5,
                    ),
                  ),
                ),

                const SizedBox(height: 10),

                // Subtitle
                FadeTransition(
                  opacity: _subtitleFade,
                  child: const Text(
                    'Envie e receba dinheiro\ninstantaneamente em Angola.',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color:  Color(0xB3FFFFFF), // white 70%
                      fontSize: 15,
                      height:   1.45,
                    ),
                  ),
                ),

                const SizedBox(height: 40),

                // Loader
                FadeTransition(
                  opacity: _loaderFade,
                  child: const CupertinoActivityIndicator(
                    color:  Color(0x99FFFFFF), // white 60%
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

// ---------------------------------------------------------------------------
// App icon — rounded container matching the welcome screen treatment
// ---------------------------------------------------------------------------

class _AppIcon extends StatelessWidget {
  const _AppIcon();

  @override
  Widget build(BuildContext context) {
    return Container(
      width:  88,
      height: 88,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(24),
        // DecorationImage clips to borderRadius — no separate ClipRRect needed,
        // which means no square-edge artefact on non-transparent PNGs.
        image: const DecorationImage(
          image: AssetImage('assets/images/banza_icon.png'),
          fit:   BoxFit.cover,
        ),
        boxShadow: [
          BoxShadow(
            color:        const Color(0x66000000),
            blurRadius:   28,
            offset:       const Offset(0, 12),
            spreadRadius: -6,
          ),
          BoxShadow(
            color:        const Color(0x44C21A2C),
            blurRadius:   18,
            offset:       const Offset(0, 4),
          ),
        ],
      ),
      // Subtle glossy highlight at the top of the icon
      child: ClipRRect(
        borderRadius: BorderRadius.circular(24),
        child: const Align(
          alignment: Alignment.topCenter,
          child: SizedBox(
            height: 32,
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin:  Alignment.topCenter,
                  end:    Alignment.bottomCenter,
                  colors: [
                    Color(0x22FFFFFF),
                    Color(0x00FFFFFF),
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
