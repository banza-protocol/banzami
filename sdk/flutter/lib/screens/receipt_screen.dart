import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:share_plus/share_plus.dart';

import '../models/transfer.dart';
import '../theme/banza_theme.dart';
import '../utils/money_format.dart';
import '../utils/pdf_receipt_generator.dart';
import '../utils/screen_security.dart';


// ---------------------------------------------------------------------------
// Cherry design tokens — local aliases matching the official BanzaColors family
// ---------------------------------------------------------------------------

const _kCherry     = Color(0xFFC21A2C);
const _kMidWine    = Color(0xFF7A000D);
const _kDeepShadow = Color(0xFF5E000A);

// ---------------------------------------------------------------------------
// BanzaVerifiedMark — premium layered authenticity seal with rotating ring
// ---------------------------------------------------------------------------

/// Four-layer premium badge: outer luminous ring → slowly rotating dashed
/// security ring with integrated BANZA label → inner glass ring → core cherry
/// seal + checkmark.
class BanzaVerifiedMark extends StatefulWidget {
  final double size;
  const BanzaVerifiedMark({super.key, this.size = 96});

  @override
  State<BanzaVerifiedMark> createState() => _BanzaVerifiedMarkState();
}

class _BanzaVerifiedMarkState extends State<BanzaVerifiedMark>
    with SingleTickerProviderStateMixin {
  late final AnimationController _rotCtrl;

  @override
  void initState() {
    super.initState();
    _rotCtrl = AnimationController(
      vsync:    this,
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
    // BANZA label is pinned to the topmost point of that ring (fixed, not rotating).
    const ringR = 0.42;

    return SizedBox(
      width:  size,
      height: size,
      child: Stack(
        alignment: Alignment.center,
        children: [
          // ── Layer 0: ambient cherry bloom ─────────────────────────────
          Container(
            width:  size,
            height: size,
            decoration: BoxDecoration(
              shape:     BoxShape.circle,
              boxShadow: [
                BoxShadow(
                  color:        _kCherry.withValues(alpha: 0.55),
                  blurRadius:   22,
                  spreadRadius: 4,
                ),
                BoxShadow(
                  color:        _kCherry.withValues(alpha: 0.25),
                  blurRadius:   48,
                  spreadRadius: 12,
                ),
              ],
            ),
          ),

          // ── Layer 1: outer luminous ring ───────────────────────────────
          Container(
            width:  size,
            height: size,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(
                color: _kCherry.withValues(alpha: 0.85),
                width: 2.0,
              ),
              boxShadow: [
                BoxShadow(
                  color:        _kCherry.withValues(alpha: 1.0),
                  blurRadius:   6,
                  spreadRadius: 0,
                ),
                BoxShadow(
                  color:        _kCherry.withValues(alpha: 0.55),
                  blurRadius:   18,
                  spreadRadius: 4,
                ),
              ],
            ),
          ),

          // ── Layer 2: dashed security ring (slowly rotating) ───────────
          CustomPaint(
            size:    Size(size, size),
            painter: _DashedRingPainter(
              color:          Colors.white.withValues(alpha: 0.52),
              radiusFraction: ringR,
              gapAngleRad:    1.28,
              rotation:       rotation,
            ),
          ),

          // ── BANZA label — fixed at ring top ───────────────────────────
          // Stays pinned while the dashed ring rotates beneath it.
          Positioned(
            top:   size * (0.50 - ringR - 0.046),
            left:  0,
            right: 0,
            child: Text(
              'BANZA',
              textAlign: TextAlign.center,
              style: TextStyle(
                color:         Colors.white.withValues(alpha: 0.92),
                fontSize:      size * 0.092,
                fontWeight:    FontWeight.w800,
                letterSpacing: 2.4,
                height:        1.0,
              ),
            ),
          ),

          // ── Layer 3: inner glass ring ──────────────────────────────────
          Container(
            width:  size * 0.73,
            height: size * 0.73,
            decoration: BoxDecoration(
              shape:    BoxShape.circle,
              gradient: LinearGradient(
                begin:  Alignment.bottomCenter,
                end:    Alignment.topCenter,
                colors: [
                  Colors.white.withValues(alpha: 0.14),
                  Colors.white.withValues(alpha: 0.00),
                ],
              ),
              boxShadow: [
                BoxShadow(
                  color:        Colors.black.withValues(alpha: 0.28),
                  blurRadius:   10,
                  spreadRadius: 1,
                ),
              ],
            ),
          ),

          // ── Layer 4: core cherry seal ──────────────────────────────────
          Container(
            width:  size * 0.60,
            height: size * 0.60,
            decoration: BoxDecoration(
              shape:    BoxShape.circle,
              gradient: const RadialGradient(
                center: Alignment(0, -0.28),
                colors: [_kCherry, _kMidWine, _kDeepShadow],
                stops:  [0.0,      0.52,      1.0],
              ),
              border: Border.all(
                color: Colors.white.withValues(alpha: 0.18),
                width: 1.0,
              ),
              boxShadow: [
                BoxShadow(
                  color:      Colors.black.withValues(alpha: 0.50),
                  blurRadius: 14,
                  offset:     const Offset(0, 4),
                ),
              ],
            ),
          ),

          // ── Checkmark ──────────────────────────────────────────────────
          Icon(
            Icons.check_rounded,
            color: Colors.white,
            size:  size * 0.32,
          ),
        ],
      ),
    );
  }
}

class _DashedRingPainter extends CustomPainter {
  final Color  color;
  final double radiusFraction; // radius = size.width * radiusFraction
  final double gapAngleRad;    // gap width in radians (decorative, orbits with ring)
  final double rotation;       // current rotation offset in radians

  const _DashedRingPainter({
    required this.color,
    this.radiusFraction = 0.42,
    this.gapAngleRad    = 1.28,
    this.rotation       = 0.0,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color       = color
      ..strokeWidth = 1.5
      ..style       = PaintingStyle.stroke;

    final center      = Offset(size.width / 2, size.height / 2);
    final radius      = size.width * radiusFraction;
    final drawable    = math.pi * 2 - gapAngleRad;
    final startAngle  = -math.pi / 2 + gapAngleRad / 2 + rotation;

    const segments = 32;
    const filled   = 0.52;
    final segArc   = drawable / segments;
    final dashArc  = segArc * filled;

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

// ---------------------------------------------------------------------------
// BanzamiReceiptScreen
// ---------------------------------------------------------------------------

/// Final screen of the P2P send flow — shown after a successful transfer.
///
/// "Concluído" pops back to [MainScreen] and triggers [onDone] so the home
/// screen refreshes. "Partilhar comprovativo" opens the native share sheet.
class BanzamiReceiptScreen extends StatefulWidget {
  final Transfer transfer;

  /// The sender's own handle — displayed without hitting the API.
  final String? ownHandle;

  final void Function(Transfer) onDone;

  final bool    isSandbox;
  final String? logoAssetPath;

  const BanzamiReceiptScreen({
    super.key,
    required this.transfer,
    this.ownHandle,
    required this.onDone,
    this.isSandbox    = false,
    this.logoAssetPath,
  });

  @override
  State<BanzamiReceiptScreen> createState() => _BanzamiReceiptScreenState();
}

class _BanzamiReceiptScreenState extends State<BanzamiReceiptScreen>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  late final Animation<double>   _markScale;
  late final Animation<double>   _fade;

  // Live clock — refreshes the footer timestamp every second.
  late DateTime             _liveTime;
  Timer?                    _liveTimer;

  // Screen-capture protection state.
  bool                      _isCaptured = false;
  StreamSubscription<bool>? _captureSub;

  // Key used to compute the share button's on-screen position for iOS
  // UIActivityViewController anchor (required on iPad, good practice on iPhone).
  final _shareKey = GlobalKey();

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(vsync: this, duration: BanzaMotion.slow);
    _markScale = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(
        parent: _ctrl,
        curve:  const Interval(0.15, 0.65, curve: Curves.elasticOut),
      ),
    );
    _fade = CurvedAnimation(
      parent: _ctrl,
      curve:  const Interval(0.0, 0.45, curve: Curves.easeOut),
    );
    _ctrl.forward();
    HapticFeedback.mediumImpact();

    _liveTime = DateTime.now();
    _liveTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() => _liveTime = DateTime.now());
    });

    BanzaScreenSecurity.setSecure(true);
    _captureSub = BanzaScreenSecurity.captureState.listen(
      (v) { if (mounted) setState(() => _isCaptured = v); },
      onError: (_) {},      // silently ignore — no platform channel in tests
      cancelOnError: false,
    );
  }

  @override
  void dispose() {
    _liveTimer?.cancel();
    _captureSub?.cancel();
    BanzaScreenSecurity.setSecure(false);
    _ctrl.dispose();
    super.dispose();
  }

  // ── Computed fields ────────────────────────────────────────────────────────

  String get _ref {
    final id = widget.transfer.transferId;
    return (id.length >= 8 ? id.substring(0, 8) : id).toUpperCase();
  }

  String get _amount =>
      formatMinor(widget.transfer.amountMinor, widget.transfer.currency);

  String get _dateLong {
    final ts = widget.transfer.completedAt ?? widget.transfer.createdAt;
    return DateFormat("d 'de' MMMM 'de' y, HH:mm", 'pt').format(ts.toLocal());
  }

  String get _dateShort {
    final ts = widget.transfer.completedAt ?? widget.transfer.createdAt;
    return DateFormat('dd/MM/y HH:mm', 'pt').format(ts.toLocal());
  }

  String get _from => widget.ownHandle ?? widget.transfer.sender;

  // ── Actions ────────────────────────────────────────────────────────────────

  void _done() {
    widget.onDone(widget.transfer);
    Navigator.of(context).popUntil((route) => route.isFirst);
  }

  Future<void> _share() async {
    final box = _shareKey.currentContext?.findRenderObject() as RenderBox?;
    final origin = box == null
        ? null
        : box.localToGlobal(Offset.zero) & box.size;
    try {
      final file = await BanzaPdfReceiptGenerator.generate(
        transfer:      widget.transfer,
        ownHandle:     _from,
        isSandbox:     widget.isSandbox,
        logoAssetPath: widget.logoAssetPath,
      );
      await Share.shareXFiles(
        [XFile(file.path, mimeType: 'application/pdf')],
        subject:             'Comprovativo Banza · Ref $_ref',
        sharePositionOrigin: origin,
      );
    } catch (_) {
      if (!mounted) return;
      // Emergency fallback — plain text if PDF generation fails.
      final box2 = _shareKey.currentContext?.findRenderObject() as RenderBox?;
      final origin2 = box2 == null
          ? null
          : box2.localToGlobal(Offset.zero) & box2.size;
      try {
        await Share.share(
          'Comprovativo Banza\n'
          'Ref: $_ref\n'
          'Montante: $_amount\n'
          'De: @$_from\n'
          'Para: @${widget.transfer.recipient}\n'
          'Data: $_dateShort\n'
          'Método: Saldo Banza',
          sharePositionOrigin: origin2,
        );
      } catch (_) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Não foi possível partilhar.')),
        );
      }
    }
  }

  // ── Capture overlay ────────────────────────────────────────────────────────

  Widget _buildCaptureOverlay() {
    return Positioned.fill(
      child: Container(
        color: const Color(0xF03D0008),
        child: SafeArea(
          child: Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(
                  Icons.no_photography_rounded,
                  color: Colors.white54,
                  size:  56,
                ),
                const SizedBox(height: 16),
                Text(
                  'Comprovativo protegido',
                  style: BanzaTextStyles.headingSm.copyWith(
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  'Não é possível capturar o ecrã',
                  style: BanzaTextStyles.bodyMd.copyWith(
                    color: Colors.white.withValues(alpha: 0.60),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  // ── Build ──────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final t    = widget.transfer;
    final note = (t.note?.isNotEmpty == true) ? t.note! : 'Sem descrição';
    final timeStr = DateFormat('HH:mm:ss').format(_liveTime);

    return Scaffold(
      backgroundColor:            _kDeepShadow,
      resizeToAvoidBottomInset:   false,
      body: Stack(
        children: [
          // ── Full-screen cherry gradient + content ──────────────────────
          Container(
            width:  double.infinity,
            height: double.infinity,
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                begin:  Alignment.topCenter,
                end:    Alignment.bottomCenter,
                colors: [_kCherry, Color(0xFF990011), _kMidWine, _kDeepShadow],
                stops:  [0.0,      0.35,              0.65,      1.0],
              ),
            ),
            child: SafeArea(
              child: FadeTransition(
                opacity: _fade,
                child: Column(
                  children: [
                    // ── Top bar ────────────────────────────────────────────
                    Padding(
                      padding: const EdgeInsets.symmetric(
                        horizontal: BanzaSpacing.lg,
                        vertical:   4,
                      ),
                      child: Row(children: [
                        IconButton(
                          icon: const Icon(
                            Icons.close_rounded,
                            color: Colors.white54,
                            size:  22,
                          ),
                          onPressed: _done,
                        ),
                        const Spacer(),
                        Text(
                          'Comprovativo',
                          style: BanzaTextStyles.headingSm.copyWith(
                            color: Colors.white.withValues(alpha: 0.75),
                          ),
                        ),
                        const Spacer(),
                        const SizedBox(width: 48),
                      ]),
                    ),

                    // ── Scrollable content ─────────────────────────────────
                    Expanded(
                      child: SingleChildScrollView(
                        padding: const EdgeInsets.symmetric(
                          horizontal: BanzaSpacing.xl,
                        ),
                        child: Column(children: [
                          const SizedBox(height: 6),

                          // Verified mark with rotating dashed ring
                          ScaleTransition(
                            scale: _markScale,
                            child: const BanzaVerifiedMark(size: 96),
                          ),

                          const SizedBox(height: 4),

                          Text(
                            'Enviado com sucesso',
                            style: BanzaTextStyles.headingSm.copyWith(
                              color: Colors.white.withValues(alpha: 0.80),
                            ),
                          ),

                          const SizedBox(height: BanzaSpacing.xs),

                          Text(
                            _amount,
                            style: BanzaTextStyles.monoLg.copyWith(
                              color: Colors.white,
                            ),
                          ),

                          const SizedBox(height: BanzaSpacing.xs),

                          Text(
                            'para @${t.recipient}',
                            style: BanzaTextStyles.bodyMd.copyWith(
                              color: Colors.white.withValues(alpha: 0.60),
                            ),
                          ),

                          if (widget.isSandbox) ...[
                            const SizedBox(height: 8),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 14, vertical: 5,
                              ),
                              decoration: BoxDecoration(
                                color:        const Color(0xFFFEF3C7),
                                borderRadius: BorderRadius.circular(100),
                                border: Border.all(
                                  color: const Color(0xFFF6C453),
                                  width: 1.0,
                                ),
                              ),
                              child: Text(
                                'SANDBOX  •  Dinheiro de teste',
                                style: BanzaTextStyles.bodySm.copyWith(
                                  color:         const Color(0xFF92400E),
                                  fontSize:      11.5,
                                  fontWeight:    FontWeight.w700,
                                  letterSpacing: 0.3,
                                ),
                              ),
                            ),
                          ],

                          const SizedBox(height: BanzaSpacing.sm),

                          // ── Glass detail card ──────────────────────────
                          Container(
                            width:   double.infinity,
                            padding: const EdgeInsets.symmetric(
                              horizontal: BanzaSpacing.lg,
                              vertical:   BanzaSpacing.sm,
                            ),
                            decoration: BoxDecoration(
                              color:        Colors.white.withValues(alpha: 0.12),
                              borderRadius: BorderRadius.circular(28),
                              border: Border.all(
                                color: Colors.white.withValues(alpha: 0.18),
                                width: 1,
                              ),
                            ),
                            child: Column(children: [
                              _DetailRow(label: 'De',     value: '@$_from'),
                              _DetailRow(label: 'Para',   value: '@${t.recipient}'),
                              _DetailRow(label: 'Nota',   value: note),
                              _DetailRow(label: 'Data',   value: _dateLong),
                              _DetailRow(label: 'Ref',    value: _ref),
                              const _DetailRow(
                                label:  'Método',
                                value:  'Saldo Banza',
                                isLast: true,
                              ),
                            ]),
                          ),

                          const SizedBox(height: BanzaSpacing.md),

                          // ── Concluído ──────────────────────────────────
                          SizedBox(
                            width:  double.infinity,
                            height: 58,
                            child: ElevatedButton(
                              onPressed: _done,
                              style: ElevatedButton.styleFrom(
                                backgroundColor: Colors.white,
                                foregroundColor: BanzaColors.wine,
                                elevation:       0,
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(22),
                                ),
                              ),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Container(
                                    width:  22,
                                    height: 22,
                                    decoration: BoxDecoration(
                                      shape:  BoxShape.circle,
                                      border: Border.all(
                                        color: BanzaColors.wine,
                                        width: 1.5,
                                      ),
                                    ),
                                    child: const Icon(
                                      Icons.check_rounded,
                                      size: 14,
                                    ),
                                  ),
                                  const SizedBox(width: BanzaSpacing.sm),
                                  Text(
                                    'Concluído',
                                    style: BanzaTextStyles.bodyMd.copyWith(
                                      color:      BanzaColors.wine,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),

                          const SizedBox(height: BanzaSpacing.sm),

                          // ── Partilhar comprovativo ─────────────────────
                          SizedBox(
                            key:    _shareKey,
                            width:  double.infinity,
                            height: 58,
                            child: OutlinedButton(
                              onPressed: _share,
                              style: OutlinedButton.styleFrom(
                                foregroundColor: Colors.white,
                                backgroundColor: Colors.white.withValues(alpha: 0.08),
                                side: BorderSide(
                                  color: Colors.white.withValues(alpha: 0.14),
                                  width: 1,
                                ),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(22),
                                ),
                              ),
                              child: Text(
                                'Partilhar comprovativo',
                                style: BanzaTextStyles.bodyMd.copyWith(
                                  color:      Colors.white,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                          ),

                          const SizedBox(height: BanzaSpacing.sm),

                          // ── Footer — live timestamp + security notice ──
                          Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(
                                Icons.shield_outlined,
                                size:  13,
                                color: Colors.white.withValues(alpha: 0.48),
                              ),
                              const SizedBox(width: 5),
                              Flexible(
                                child: Text(
                                  'Comprovativo Banza  •  Ref $_ref  •  $timeStr',
                                  style: BanzaTextStyles.bodySm.copyWith(
                                    color:    Colors.white.withValues(alpha: 0.55),
                                    fontSize: 11.5,
                                  ),
                                  textAlign: TextAlign.center,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 4),
                          Text(
                            widget.isSandbox
                                ? 'Comprovativo sandbox  •  sem valor financeiro real'
                                : 'Comprovativo válido apenas no ecrã vivo da app',
                            style: BanzaTextStyles.bodySm.copyWith(
                              color: widget.isSandbox
                                  ? const Color(0xFFD97706).withValues(alpha: 0.65)
                                  : Colors.white.withValues(alpha: 0.38),
                              fontSize: 11,
                            ),
                            textAlign: TextAlign.center,
                          ),

                          const SizedBox(height: BanzaSpacing.xs),
                        ]),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),

          // ── Capture protection overlay (iOS mirroring / recording) ─────
          if (_isCaptured) _buildCaptureOverlay(),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Detail row
// ---------------------------------------------------------------------------

class _DetailRow extends StatelessWidget {
  final String label;
  final String value;
  final bool   isLast;

  const _DetailRow({
    required this.label,
    required this.value,
    this.isLast = false,
  });

  @override
  Widget build(BuildContext context) {
    return Column(children: [
      Padding(
        padding: const EdgeInsets.symmetric(vertical: 7),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              label,
              style: BanzaTextStyles.bodySm.copyWith(
                color: Colors.white.withValues(alpha: 0.55),
              ),
            ),
            const SizedBox(width: BanzaSpacing.md),
            Flexible(
              child: Text(
                value,
                style: BanzaTextStyles.bodyMd.copyWith(
                  fontWeight: FontWeight.w600,
                  color:      Colors.white,
                ),
                textAlign: TextAlign.end,
              ),
            ),
          ],
        ),
      ),
      if (!isLast)
        Divider(height: 1, color: Colors.white.withValues(alpha: 0.12)),
    ]);
  }
}
