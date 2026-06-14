import 'package:flutter/material.dart';
import 'package:banza_flutter/banza_flutter.dart';

/// Premium amber card — shown on screens that have their own scroll area
/// (Profile, Receive, etc.) when the app is running in sandbox mode.
///
/// Uses a breathing pulse animation to make the environment state unmistakable
/// while remaining aesthetically coherent with the product palette.
class SandboxBanner extends StatefulWidget {
  const SandboxBanner({super.key});

  @override
  State<SandboxBanner> createState() => _SandboxBannerState();
}

class _SandboxBannerState extends State<SandboxBanner>
    with SingleTickerProviderStateMixin {
  late final AnimationController _pulse;
  late final Animation<double>   _glow;

  @override
  void initState() {
    super.initState();
    _pulse = AnimationController(
      vsync:    this,
      duration: const Duration(milliseconds: 2400),
    )..repeat(reverse: true);
    _glow = CurvedAnimation(parent: _pulse, curve: Curves.easeInOut);
  }

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _glow,
      builder: (_, __) => Container(
        width:   double.infinity,
        padding: const EdgeInsets.symmetric(
          horizontal: BanzamiSpacing.lg,
          vertical:   12,
        ),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            colors: [Color(0xFFFFF9E6), Color(0xFFFFF0C0)],
            begin:  Alignment.topLeft,
            end:    Alignment.bottomRight,
          ),
          borderRadius: BanzamiRadius.lgAll,
          border: Border.all(
            color: Color.lerp(
              const Color(0xFFF6C453).withValues(alpha: 0.5),
              const Color(0xFFF6C453).withValues(alpha: 0.9),
              _glow.value,
            )!,
          ),
          boxShadow: [
            BoxShadow(
              color:       const Color(0xFFF6C453).withValues(alpha: 0.15 + 0.10 * _glow.value),
              blurRadius:  12,
              offset:      const Offset(0, 3),
              spreadRadius: 1,
            ),
          ],
        ),
        child: Row(
          children: [
            _BreathingDot(glow: _glow),
            const SizedBox(width: 10),
            const Icon(Icons.science_rounded, size: 15, color: Color(0xFF92400E)),
            const SizedBox(width: BanzamiSpacing.sm),
            const Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize:       MainAxisSize.min,
                children: [
                  Text(
                    'SANDBOX',
                    style: TextStyle(
                      fontSize:      10,
                      fontWeight:    FontWeight.w800,
                      color:         Color(0xFF78350F),
                      letterSpacing: 1.4,
                      height:        1.2,
                    ),
                  ),
                  Text(
                    'Dinheiro de teste · Sem valor financeiro real',
                    style: TextStyle(
                      fontSize:   11,
                      fontWeight: FontWeight.w400,
                      color:      Color(0xFFB45309),
                      height:     1.35,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Shared breathing amber dot used by both [SandboxBanner] and the SDK's
/// home-screen environment card.
class _BreathingDot extends StatelessWidget {
  final Animation<double> glow;
  const _BreathingDot({required this.glow});

  @override
  Widget build(BuildContext context) {
    return Container(
      width:  8,
      height: 8,
      decoration: BoxDecoration(
        color: Color.lerp(
          const Color(0xFFF59E0B).withValues(alpha: 0.55),
          const Color(0xFFF59E0B),
          glow.value,
        ),
        shape: BoxShape.circle,
        boxShadow: [
          BoxShadow(
            color:       const Color(0xFFF59E0B).withValues(alpha: glow.value * 0.55),
            blurRadius:  6,
            spreadRadius: glow.value * 2,
          ),
        ],
      ),
    );
  }
}

/// Small inline badge — appended contextually where financial content appears
/// (QR embeds, transaction rows, etc.).
class SandboxBadge extends StatelessWidget {
  const SandboxBadge({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      decoration: BoxDecoration(
        color:        const Color(0xFFFFF4D6),
        borderRadius: BanzamiRadius.fullAll,
        border:       Border.all(color: const Color(0xFFF6C453)),
      ),
      child: const Text(
        'SANDBOX',
        style: TextStyle(
          fontSize:      9,
          fontWeight:    FontWeight.w700,
          color:         Color(0xFF92400E),
          letterSpacing: 0.8,
        ),
      ),
    );
  }
}
