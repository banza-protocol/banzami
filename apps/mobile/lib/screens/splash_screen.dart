import 'package:flutter/material.dart';
import 'package:banzami_sdk/banzami_sdk.dart';

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  late final Animation<double>   _fade;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 600));
    _fade = CurvedAnimation(parent: _ctrl, curve: Curves.easeIn);
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
      backgroundColor: BanzamiColors.wine,
      body: FadeTransition(
        opacity: _fade,
        child: const Center(
          child: _Logo(),
        ),
      ),
    );
  }
}

class _Logo extends StatelessWidget {
  const _Logo();

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width:  72,
          height: 72,
          decoration: BoxDecoration(
            color:        BanzamiColors.white.withValues(alpha: 0.15),
            borderRadius: BorderRadius.circular(20),
          ),
          child: const Icon(Icons.bolt_rounded, color: BanzamiColors.white, size: 40),
        ),
        const SizedBox(height: 16),
        Text(
          'Banzami',
          style: BanzamiTextStyles.headingLg.copyWith(
            color:       BanzamiColors.white,
            fontSize:    32,
            fontWeight:  FontWeight.w700,
            letterSpacing: 0.5,
          ),
        ),
        const SizedBox(height: 6),
        Text(
          'Pagamentos instantâneos',
          style: BanzamiTextStyles.bodyMd.copyWith(
            color: BanzamiColors.white.withValues(alpha: 0.7),
          ),
        ),
      ],
    );
  }
}
