import 'package:flutter/material.dart';
import 'package:banza_flutter/banza_flutter.dart';

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
    _ctrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 700));
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
      backgroundColor: BanzaColors.wineDark,
      body: Container(
        width:      double.infinity,
        height:     double.infinity,
        decoration: const BoxDecoration(gradient: BanzaGradients.wine),
        child: FadeTransition(
          opacity: _fade,
          child: const Center(child: _Logo()),
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
        ClipRRect(
          borderRadius: BorderRadius.circular(24),
          child: Image.asset(
            'assets/images/banza_icon.png',
            width: 100,
          ),
        ),
        const SizedBox(height: 20),
        Text(
          'Banza',
          style: BanzaTextStyles.displayMd.copyWith(
            color:      BanzaColors.white,
            fontWeight: FontWeight.w700,
            letterSpacing: -0.5,
          ),
        ),
      ],
    );
  }
}
