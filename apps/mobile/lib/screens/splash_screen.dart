import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:banzami_flutter/banzami_flutter.dart';

import '../branding_assets.dart';
import '../config.dart';
import '../services/session_service.dart';
import 'onboarding/welcome_screen.dart';
import 'pin_screen.dart';
import 'main_screen.dart';

class SplashScreen extends StatefulWidget {
  /// Called immediately AFTER the splash has navigated to its target
  /// (Main/Welcome/Pin). The app uses this to process a cold-start deep link
  /// once — deterministically after this navigation — so it is never replaced
  /// by the splash's own pushReplacement.
  final VoidCallback? onBootComplete;

  const SplashScreen({super.key, this.onBootComplete});

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

    // Bootstrap runs after the first frame so context is valid and
    // the animation is already ticking.
    WidgetsBinding.instance.addPostFrameCallback((_) => _bootstrap());
  }

  Future<void> _bootstrap() async {
    final session = context.read<SessionService>();

    // Wait for the longer of: minimum visual duration OR session load.
    await Future.wait([
      Future.delayed(const Duration(milliseconds: 1200)),
      session.initialize(),
    ]);

    if (!mounted) return;

    // Environment mismatch guard — classified by exact API host (see
    // AppConfig.apiHostIsSandbox): a sandbox build must point at
    // sandbox-api.banzami.com and a live build at api.banzami.com. The ".com"
    // suffix alone never implies production. A mismatch means the binary was
    // misconfigured at build time.
    const apiUrl = AppConfig.publicApiUrl;
    if (AppConfig.apiEnvMismatch) {
      await showDialog<void>(
        context: context,
        barrierDismissible: false,
        builder: (ctx) => AlertDialog(
          shape: const RoundedRectangleBorder(
            borderRadius: BorderRadius.all(Radius.circular(20)),
          ),
          title: const Row(children: [
            Icon(Icons.warning_amber_rounded, color: Color(0xFFB45309)),
            SizedBox(width: 8),
            Expanded(
              child: Text(
                'Configuração inválida',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
              ),
            ),
          ]),
          content: Text(
            AppConfig.isSandbox
                ? 'Esta build de sandbox está ligada a uma API de produção ($apiUrl). '
                  'Configuração de ambiente inválida.'
                : 'Esta build de produção está ligada a uma API de sandbox ($apiUrl). '
                  'Configuração de ambiente inválida.',
            style: const TextStyle(fontSize: 14, height: 1.5),
          ),
          actions: [
            TextButton(
              onPressed: () {},
              child: const Text(
                'Bloqueado',
                style: TextStyle(color: BanzamiColors.error),
              ),
            ),
          ],
        ),
      );
      // Never navigate — leave the dialog blocking.
      return;
    }

    final Widget target;
    if (!session.hasSession) {
      target = const WelcomeScreen();
    } else if (session.isLocked) {
      target = const PinScreen();
    } else {
      target = const MainScreen();
    }

    Navigator.of(context).pushReplacement(
      PageRouteBuilder(
        pageBuilder:              (_, __, ___) => target,
        transitionDuration:        Duration.zero,
        reverseTransitionDuration: Duration.zero,
      ),
    );

    // Splash has navigated — now safe to process a cold-start deep link on top
    // of the target route (no pushReplacement will replace it anymore).
    widget.onBootComplete?.call();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF9A1B22),
      body: Stack(
        children: [
          // ── Background gradient — top light, bottom dark ─────────────────
          const Positioned.fill(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin:  Alignment.topLeft,
                  end:    Alignment.bottomRight,
                  colors: [
                    Color(0xFFE8434B),
                    Color(0xFFB5101F),
                    Color(0xFFD7242E),
                    Color(0xFF9A1B22),
                  ],
                  stops: [0.0, 0.38, 0.72, 1.0],
                ),
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
                      Color(0x55E83050),
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
                    'Banzami',
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
                      color:    Color(0xB3FFFFFF),
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

// ---------------------------------------------------------------------------
// App icon
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
        image: DecorationImage(
          image: AssetImage(BrandingAssets.icon),
          fit:   BoxFit.cover,
        ),
        boxShadow: const [
          BoxShadow(
            color:        Color(0x66000000),
            blurRadius:   28,
            offset:       Offset(0, 12),
            spreadRadius: -6,
          ),
          BoxShadow(
            color:        Color(0x44C21A2C),
            blurRadius:   18,
            offset:       Offset(0, 4),
          ),
        ],
      ),
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
