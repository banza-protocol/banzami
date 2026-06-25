import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:share_plus/share_plus.dart';

import '../models/transfer.dart';
import '../theme/banzami_theme.dart';
import '../utils/banzami_toast.dart';
import '../utils/money_format.dart';
import '../utils/pdf_receipt_generator.dart';
import '../utils/screen_security.dart';
import '../widgets/banzami_components.dart';
import '../widgets/banzami_verified_mark.dart';

// ---------------------------------------------------------------------------
// Historical receipt reds — a DELIBERATE, receipt-only exception to the official
// Banzami palette (#B5101F…). The immersive "comprovativo moment" keeps the
// deeper, higher-contrast cherry→near-black gradient of the original receipt
// (restored from 6683edb^). No other screen uses these.
// ---------------------------------------------------------------------------

const _kReceiptCherry = Color(0xFFC21A2C); // top of the gradient + bloom/core
const _kReceiptWine   = Color(0xFF7A000D); // mid-low gradient + core mid
const _kReceiptDeep   = Color(0xFF5E000A); // page background + gradient base + core edge

// ---------------------------------------------------------------------------
// BanzamiReceiptScreen
// ---------------------------------------------------------------------------

/// Final screen of the P2P send flow — shown after a successful transfer.
///
/// Light / premium surface, consistent with Home, Wallet and the rest of the
/// app: the success "moment" stays premium (animated [BanzamiVerifiedMark],
/// cherry accents) but on the same offWhite background as every other screen —
/// no separate dark immersive theme.
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

  /// Whether [transfer.recipient] is a @handle (P2P) or a plain display name
  /// (e.g. a merchant / payment-link payee like "Doa Sandbox"). When false the
  /// "@" prefix is dropped so merchant payments read "para Doa Sandbox".
  final bool recipientIsHandle;

  const BanzamiReceiptScreen({
    super.key,
    required this.transfer,
    this.ownHandle,
    required this.onDone,
    this.isSandbox         = false,
    this.logoAssetPath,
    this.recipientIsHandle = true,
  });

  @override
  State<BanzamiReceiptScreen> createState() => _BanzamiReceiptScreenState();
}

class _BanzamiReceiptScreenState extends State<BanzamiReceiptScreen>
    with SingleTickerProviderStateMixin, WidgetsBindingObserver {
  late final AnimationController _ctrl;
  late final Animation<double>   _markScale;
  late final Animation<double>   _fade;

  // Live clock — refreshes the footer timestamp every second.
  late DateTime             _liveTime;
  Timer?                    _liveTimer;

  // Screen-capture protection state.
  bool                      _isCaptured       = false;
  bool                      _isBackground     = false;
  bool                      _screenshotTaken  = false;
  StreamSubscription<bool>? _captureSub;
  StreamSubscription<void>? _screenshotSub;

  // Key used to compute the share button's on-screen position for iOS
  // UIActivityViewController anchor (required on iPad, good practice on iPhone).
  final _shareKey = GlobalKey();

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(vsync: this, duration: BanzamiMotion.slow);
    _markScale = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(
        parent: _ctrl,
        curve:  const Interval(0.15, 0.65, curve: BanzamiMotion.spring),
      ),
    );
    _fade = CurvedAnimation(
      parent: _ctrl,
      curve:  const Interval(0.0, 0.45, curve: BanzamiMotion.decelerate),
    );
    _ctrl.forward();
    HapticFeedback.mediumImpact();

    _liveTime = DateTime.now();
    _liveTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() => _liveTime = DateTime.now());
    });

    WidgetsBinding.instance.addObserver(this);

    BanzamiScreenSecurity.setSecure(true);
    _captureSub = BanzamiScreenSecurity.captureState.listen(
      (v) { if (mounted) setState(() => _isCaptured = v); },
      onError: (_) {},
      cancelOnError: false,
    );
    _screenshotSub = BanzamiScreenSecurity.screenshotTaken.listen(
      (_) { if (mounted) setState(() => _screenshotTaken = true); },
      onError: (_) {},
      cancelOnError: false,
    );
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final background = state == AppLifecycleState.inactive ||
                       state == AppLifecycleState.paused   ||
                       state == AppLifecycleState.hidden;
    if (mounted) setState(() => _isBackground = background);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _liveTimer?.cancel();
    _captureSub?.cancel();
    _screenshotSub?.cancel();
    BanzamiScreenSecurity.setSecure(false);
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

  /// Recipient as shown to the user — "@handle" for P2P, plain name for a
  /// merchant / payment-link payee.
  String get _recipientLabel =>
      '${widget.recipientIsHandle ? '@' : ''}${widget.transfer.recipient}';

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
      final file = await BanzamiPdfReceiptGenerator.generate(
        transfer:          widget.transfer,
        ownHandle:         _from,
        isSandbox:         widget.isSandbox,
        logoAssetPath:     widget.logoAssetPath,
        recipientIsHandle: widget.recipientIsHandle,
      );
      await Share.shareXFiles(
        [XFile(file.path, mimeType: 'application/pdf')],
        subject:             'Comprovativo Banzami · Ref $_ref',
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
          'Comprovativo Banzami\n'
          'Ref: $_ref\n'
          'Montante: $_amount\n'
          'De: @$_from\n'
          'Para: @${widget.transfer.recipient}\n'
          'Data: $_dateShort\n'
          'Método: Saldo Banzami',
          sharePositionOrigin: origin2,
        );
      } catch (_) {
        if (!mounted) return;
        BanzamiToast.showError(context, 'Não foi possível partilhar.');
      }
    }
  }

  // ── Security overlays ──────────────────────────────────────────────────────
  // These intentionally stay dark/opaque — they hide receipt content from
  // screen capture, recording and the app switcher. Not part of the light theme.

  // App switcher / background — pure black so no content leaks in the preview.
  Widget _buildPrivacyBlackout() => const Positioned.fill(
    child: ColoredBox(color: Colors.black),
  );

  // Screen recording / mirroring — dark primary with camera-off icon.
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
                const SizedBox(height: BanzamiSpacing.lg),
                Text(
                  'Comprovativo protegido',
                  style: BanzamiTextStyles.headingSm.copyWith(color: Colors.white),
                ),
                const SizedBox(height: BanzamiSpacing.sm),
                Text(
                  'Não é possível capturar este ecrã',
                  style: BanzamiTextStyles.bodyMd.copyWith(
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

  // Screenshot detected — dismissable warning with PDF share guidance.
  // Fully opaque so any subsequent screenshot only captures the warning.
  Widget _buildScreenshotWarning() {
    return Positioned.fill(
      child: GestureDetector(
        onTap: () => setState(() => _screenshotTaken = false),
        child: Container(
          color: const Color(0xFF1A0004),
          child: SafeArea(
            child: Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(
                    Icons.camera_rounded,
                    color: Colors.white54,
                    size:  56,
                  ),
                  const SizedBox(height: BanzamiSpacing.lg),
                  Text(
                    'Captura detectada',
                    style: BanzamiTextStyles.headingSm.copyWith(
                      color: Colors.white,
                    ),
                  ),
                  const SizedBox(height: BanzamiSpacing.sm),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 40),
                    child: Text(
                      'Partilhe apenas o comprovativo PDF verificável.',
                      style: BanzamiTextStyles.bodyMd.copyWith(
                        color: Colors.white.withValues(alpha: 0.60),
                      ),
                      textAlign: TextAlign.center,
                    ),
                  ),
                  const SizedBox(height: BanzamiSpacing.xl),
                  TextButton(
                    onPressed: () => setState(() => _screenshotTaken = false),
                    child: Text(
                      'Dispensar',
                      style: BanzamiTextStyles.bodyMd.copyWith(
                        color: Colors.white.withValues(alpha: 0.45),
                      ),
                    ),
                  ),
                ],
              ),
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
      // Deliberate exception to the official Banzami palette, for the immersive
      // "comprovativo moment" ONLY (this screen). The historical receipt used a
      // deeper, higher-contrast cherry→near-black gradient; no other screen is
      // affected. Cherry #C21A2C, #990011, wine #7A000D, deep #5E000A.
      backgroundColor:          _kReceiptDeep,
      resizeToAvoidBottomInset: false,
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
                colors: [
                  _kReceiptCherry,
                  Color(0xFF990011),
                  _kReceiptWine,
                  _kReceiptDeep,
                ],
                stops:  [0.0, 0.35, 0.65, 1.0],
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
                        horizontal: BanzamiSpacing.lg,
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
                          style: BanzamiTextStyles.headingSm.copyWith(
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
                          horizontal: BanzamiSpacing.xl,
                        ),
                        child: Column(children: [
                          const SizedBox(height: 6),

                          // Verified mark with rotating dashed ring — historical
                          // deep-cherry reds (this screen only; defaults elsewhere).
                          ScaleTransition(
                            scale: _markScale,
                            child: const BanzamiVerifiedMark(
                              size:     96,
                              bloom:    _kReceiptCherry,
                              coreMid:  _kReceiptWine,
                              coreEdge: _kReceiptDeep,
                            ),
                          ),

                          const SizedBox(height: 4),

                          Text(
                            // P2P keeps the established "Enviado com sucesso";
                            // a merchant / payment-link payment reads "Pagamento
                            // concluído" — consistent with the PDF title rule.
                            widget.recipientIsHandle
                                ? 'Enviado com sucesso'
                                : 'Pagamento concluído',
                            style: BanzamiTextStyles.headingSm.copyWith(
                              color: Colors.white.withValues(alpha: 0.80),
                            ),
                          ),

                          const SizedBox(height: BanzamiSpacing.xs),

                          Text(
                            _amount,
                            style: BanzamiTextStyles.monoLg.copyWith(
                              color: Colors.white,
                            ),
                          ),

                          const SizedBox(height: BanzamiSpacing.xs),

                          Text(
                            'para $_recipientLabel',
                            style: BanzamiTextStyles.bodyMd.copyWith(
                              color: Colors.white.withValues(alpha: 0.60),
                            ),
                          ),

                          if (widget.isSandbox) ...[
                            const SizedBox(height: 8),
                            const BanzamiSandboxBadge(
                              label: 'SANDBOX  •  Dinheiro de teste',
                            ),
                          ],

                          const SizedBox(height: BanzamiSpacing.sm),

                          // ── Glass detail card ──────────────────────────
                          Container(
                            width:   double.infinity,
                            padding: const EdgeInsets.symmetric(
                              horizontal: BanzamiSpacing.lg,
                              vertical:   BanzamiSpacing.sm,
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
                              _DetailRow(label: 'Para',   value: _recipientLabel),
                              _DetailRow(label: 'Nota',   value: note),
                              _DetailRow(label: 'Data',   value: _dateLong),
                              _DetailRow(label: 'Ref',    value: _ref),
                              const _DetailRow(
                                label:  'Método',
                                value:  'Saldo Banzami',
                                isLast: true,
                              ),
                            ]),
                          ),

                          const SizedBox(height: BanzamiSpacing.md),

                          // ── Concluído ──────────────────────────────────
                          SizedBox(
                            width:  double.infinity,
                            height: 58,
                            child: ElevatedButton(
                              onPressed: _done,
                              style: ElevatedButton.styleFrom(
                                backgroundColor: Colors.white,
                                foregroundColor: BanzamiColors.primary,
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
                                        color: BanzamiColors.primary,
                                        width: 1.5,
                                      ),
                                    ),
                                    child: const Icon(
                                      Icons.check_rounded,
                                      size: 14,
                                    ),
                                  ),
                                  const SizedBox(width: BanzamiSpacing.sm),
                                  Text(
                                    'Concluído',
                                    style: BanzamiTextStyles.bodyMd.copyWith(
                                      color:      BanzamiColors.primary,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),

                          const SizedBox(height: BanzamiSpacing.sm),

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
                                style: BanzamiTextStyles.bodyMd.copyWith(
                                  color:      Colors.white,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                          ),

                          const SizedBox(height: BanzamiSpacing.sm),

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
                                  'Comprovativo Banzami  •  Ref $_ref  •  $timeStr',
                                  style: BanzamiTextStyles.bodySm.copyWith(
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
                            style: BanzamiTextStyles.bodySm.copyWith(
                              color: widget.isSandbox
                                  ? const Color(0xFFD97706).withValues(alpha: 0.65)
                                  : Colors.white.withValues(alpha: 0.38),
                              fontSize: 11,
                            ),
                            textAlign: TextAlign.center,
                          ),

                          const SizedBox(height: BanzamiSpacing.xs),
                        ]),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),

          // ── Security overlays (order matters — blackout always on top) ──
          if (_isCaptured)      _buildCaptureOverlay(),
          if (_screenshotTaken) _buildScreenshotWarning(),
          if (_isBackground)    _buildPrivacyBlackout(),
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
              style: BanzamiTextStyles.bodySm.copyWith(
                color: Colors.white.withValues(alpha: 0.55),
              ),
            ),
            const SizedBox(width: BanzamiSpacing.md),
            Flexible(
              child: Text(
                value,
                style: BanzamiTextStyles.bodyMd.copyWith(
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
