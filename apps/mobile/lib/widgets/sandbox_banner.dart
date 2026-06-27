import 'package:flutter/material.dart';
import 'package:banzami_flutter/banzami_flutter.dart';

/// Premium amber card — the single, shared SANDBOX banner reused by both the
/// Banzami Consumer and Banzami Business apps. Shown on screens that have their
/// own scroll area (Profile, Merchant dashboard, …) when running in sandbox.
///
/// Uses a breathing pulse animation to make the environment state unmistakable
/// while remaining aesthetically coherent with the product palette.
///
/// [visible] lets callers gate rendering without an outer `if`. [compact]
/// (default `true`) is the normalized, lower-height layout; pass `false` for the
/// original taller spacing. Colours, copy, radius and shadows are identical in
/// both modes — only padding/sizing changes.
class SandboxBanner extends StatefulWidget {
  final bool visible;
  final bool compact;
  const SandboxBanner({super.key, this.visible = true, this.compact = true});

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
    if (!widget.visible) return const SizedBox.shrink();

    final bool compact = widget.compact;
    // Normalized (compact) vs original sizing — ~22% shorter, same identity.
    final double vPad        = compact ? 8 : 12;
    final double dotSize     = compact ? 7 : 8;
    final double dotGap      = compact ? 8 : 10;
    final double iconSize    = compact ? 13 : 15;
    final double titleSize   = compact ? 9.5 : 10;
    final double titleSpace  = compact ? 1.3 : 1.4;
    final double titleHeight = compact ? 1.1 : 1.2;
    final double subSize     = compact ? 10.5 : 11;
    final double subHeight   = compact ? 1.2 : 1.35;

    return AnimatedBuilder(
      animation: _glow,
      builder: (_, __) => Container(
        width:   double.infinity,
        padding: EdgeInsets.symmetric(
          horizontal: BanzamiSpacing.lg,
          vertical:   vPad,
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
            _BreathingDot(glow: _glow, size: dotSize),
            SizedBox(width: dotGap),
            Icon(Icons.science_rounded, size: iconSize, color: const Color(0xFF92400E)),
            const SizedBox(width: BanzamiSpacing.sm),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize:       MainAxisSize.min,
                children: [
                  Text(
                    'SANDBOX',
                    style: TextStyle(
                      fontSize:      titleSize,
                      fontWeight:    FontWeight.w800,
                      color:         const Color(0xFF78350F),
                      letterSpacing: titleSpace,
                      height:        titleHeight,
                    ),
                  ),
                  Text(
                    'Dinheiro de teste · Sem valor financeiro real',
                    style: TextStyle(
                      fontSize:   subSize,
                      fontWeight: FontWeight.w400,
                      color:      const Color(0xFFB45309),
                      height:     subHeight,
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
  final double size;
  const _BreathingDot({required this.glow, this.size = 8});

  @override
  Widget build(BuildContext context) {
    return Container(
      width:  size,
      height: size,
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
