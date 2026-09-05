import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../theme/banzami_theme.dart';

// ---------------------------------------------------------------------------
// BanzamiVerifiedMark — premium layered authenticity seal with rotating ring
// ---------------------------------------------------------------------------

/// Four-layer premium success seal: outer luminous ring → slowly rotating
/// dashed security ring with a fixed "BANZAMI" label → inner glass ring → core
/// cherry seal + checkmark.
///
/// Shared across the payment flow (receipt, link-pay success) so every "paid"
/// moment uses the exact same mark. Set [onLight] when placing it on the light
/// premium background (offWhite) so the dashed ring and label switch from white
/// to the primary tone and stay legible; the cherry core is unchanged.
class BanzamiVerifiedMark extends StatefulWidget {
  final double size;
  final bool onLight;

  /// Optional accent overrides for the bloom/ring and the core seal. Default to
  /// the official Banzami palette (so every other usage is unchanged). The
  /// immersive receipt passes its historical deep-cherry reds here without
  /// affecting any other screen.
  final Color? bloom; // ambient bloom + outer ring (default primaryLight)
  final Color? coreMid; // core radial mid stop       (default primaryMid)
  final Color? coreEdge; // core radial edge stop      (default primaryDark)

  const BanzamiVerifiedMark({
    super.key,
    this.size = 96,
    this.onLight = false,
    this.bloom,
    this.coreMid,
    this.coreEdge,
  });

  @override
  State<BanzamiVerifiedMark> createState() => _BanzamiVerifiedMarkState();
}

class _BanzamiVerifiedMarkState extends State<BanzamiVerifiedMark>
    with SingleTickerProviderStateMixin {
  late final AnimationController _rotCtrl;

  @override
  void initState() {
    super.initState();
    _rotCtrl = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 12),
    )..repeat();
  }

  @override
  void dispose() {
    _rotCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _rotCtrl,
      builder: (_, __) => _buildContent(_rotCtrl.value * 2 * math.pi),
    );
  }

  Widget _buildContent(double rotation) {
    final size = widget.size;
    // Dashed ring sits at 42 % of size from centre = radius 40.3 px at size 96.
    // BANZAMI label is pinned to the topmost point of that ring (fixed, not rotating).
    const ringR = 0.42;

    // On a light background the white ring/label vanish — switch them to the
    // primary tone. On dark they stay white. The cherry core never changes.
    final ringColor = widget.onLight
        ? BanzamiColors.primary.withValues(alpha: 0.45)
        : BanzamiColors.white.withValues(alpha: 0.52);
    final labelColor = widget.onLight
        ? BanzamiColors.primaryDark.withValues(alpha: 0.90)
        : BanzamiColors.white.withValues(alpha: 0.92);
    final glassTop = widget.onLight
        ? BanzamiColors.white.withValues(alpha: 0.22)
        : BanzamiColors.white.withValues(alpha: 0.14);

    // Accent colours — official palette by default; the receipt overrides them
    // with its historical deep-cherry reds.
    final bloom = widget.bloom ?? BanzamiColors.primaryLight;
    final coreMid = widget.coreMid ?? BanzamiColors.primaryMid;
    final coreEdge = widget.coreEdge ?? BanzamiColors.primaryDark;

    return SizedBox(
      width: size,
      height: size,
      child: Stack(
        alignment: Alignment.center,
        clipBehavior:
            Clip.none, // lets the BANZAMI label sit just above the ring
        children: [
          // ── Layer 0: ambient cherry bloom ─────────────────────────────
          Container(
            width: size,
            height: size,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              boxShadow: [
                BoxShadow(
                  color: bloom.withValues(alpha: 0.55),
                  blurRadius: 22,
                  spreadRadius: 4,
                ),
                BoxShadow(
                  color: bloom.withValues(alpha: 0.25),
                  blurRadius: 48,
                  spreadRadius: 12,
                ),
              ],
            ),
          ),

          // ── Layer 1: outer luminous ring ───────────────────────────────
          Container(
            width: size,
            height: size,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(
                color: bloom.withValues(alpha: 0.85),
                width: 2.0,
              ),
              boxShadow: [
                BoxShadow(
                  color: bloom,
                  blurRadius: 6,
                  spreadRadius: 0,
                ),
                BoxShadow(
                  color: bloom.withValues(alpha: 0.55),
                  blurRadius: 18,
                  spreadRadius: 4,
                ),
              ],
            ),
          ),

          // ── Layer 2: dashed security ring (slowly rotating) ───────────
          CustomPaint(
            size: Size(size, size),
            painter: _DashedRingPainter(
              color: ringColor,
              radiusFraction: ringR,
              gapAngleRad: 0.0, // full dashed circle — no break at the top
              rotation: rotation,
            ),
          ),

          // ── BANZAMI label — fixed above the ring ──────────────────────
          // Stays pinned while the full dashed ring rotates beneath it. The
          // 0.16 offset lifts it clear of the ring for comfortable separation.
          Positioned(
            top: size * (0.50 - ringR - 0.16),
            left: 0,
            right: 0,
            child: Text(
              'BANZAMI',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: labelColor,
                fontSize: size * 0.092,
                fontWeight: FontWeight.w800,
                letterSpacing: 2.4,
                height: 1.0,
              ),
            ),
          ),

          // ── Layer 3: inner glass ring ──────────────────────────────────
          Container(
            width: size * 0.73,
            height: size * 0.73,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: LinearGradient(
                begin: Alignment.bottomCenter,
                end: Alignment.topCenter,
                colors: [
                  glassTop,
                  BanzamiColors.white.withValues(alpha: 0.00),
                ],
              ),
              boxShadow: [
                BoxShadow(
                  color: BanzamiColors.black.withValues(alpha: 0.28),
                  blurRadius: 10,
                  spreadRadius: 1,
                ),
              ],
            ),
          ),

          // ── Layer 4: core cherry seal ──────────────────────────────────
          Container(
            width: size * 0.60,
            height: size * 0.60,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: RadialGradient(
                center: const Alignment(0, -0.28),
                colors: [
                  bloom,
                  coreMid,
                  coreEdge,
                ],
                stops: const [0.0, 0.52, 1.0],
              ),
              border: Border.all(
                color: BanzamiColors.white.withValues(alpha: 0.18),
                width: 1.0,
              ),
              boxShadow: [
                BoxShadow(
                  color: BanzamiColors.black.withValues(alpha: 0.50),
                  blurRadius: 14,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
          ),

          // ── Checkmark ──────────────────────────────────────────────────
          Icon(
            Icons.check_rounded,
            color: BanzamiColors.white,
            size: size * 0.32,
          ),
        ],
      ),
    );
  }
}

class _DashedRingPainter extends CustomPainter {
  final Color color;
  final double radiusFraction; // radius = size.width * radiusFraction
  final double
      gapAngleRad; // gap width in radians (decorative, orbits with ring)
  final double rotation; // current rotation offset in radians

  const _DashedRingPainter({
    required this.color,
    this.radiusFraction = 0.42,
    this.gapAngleRad = 1.28,
    this.rotation = 0.0,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = 1.5
      ..style = PaintingStyle.stroke;

    final center = Offset(size.width / 2, size.height / 2);
    final radius = size.width * radiusFraction;
    final drawable = math.pi * 2 - gapAngleRad;
    final startAngle = -math.pi / 2 + gapAngleRad / 2 + rotation;

    const segments = 32;
    const filled = 0.52;
    final segArc = drawable / segments;
    final dashArc = segArc * filled;

    for (int i = 0; i < segments; i++) {
      canvas.drawArc(
        Rect.fromCircle(center: center, radius: radius),
        startAngle + i * segArc,
        dashArc,
        false,
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _DashedRingPainter old) =>
      old.color != color ||
      old.radiusFraction != radiusFraction ||
      old.gapAngleRad != gapAngleRad ||
      old.rotation != rotation;
}
