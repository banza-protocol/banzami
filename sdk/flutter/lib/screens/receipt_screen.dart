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
        transfer:      widget.transfer,
        ownHandle:     _from,
        isSandbox:     widget.isSandbox,
        logoAssetPath: widget.logoAssetPath,
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

    return BanzamiScaffold(
      resizeToAvoidBottomInset: false,
      body: Stack(
        children: [
          // ── Light premium content ──────────────────────────────────────
          SafeArea(
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
                          color: BanzamiColors.gray400,
                          size:  24,
                        ),
                        onPressed: _done,
                      ),
                      const Spacer(),
                      Text(
                        'Comprovativo',
                        style: BanzamiTextStyles.headingSm.copyWith(
                          color: BanzamiColors.gray700,
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
                        const SizedBox(height: BanzamiSpacing.sm),

                        // Verified mark with rotating dashed ring (on light bg)
                        ScaleTransition(
                          scale: _markScale,
                          child: const BanzamiVerifiedMark(size: 96, onLight: true),
                        ),

                        const SizedBox(height: BanzamiSpacing.lg),

                        Text(
                          'Enviado com sucesso',
                          style: BanzamiTextStyles.headingSm.copyWith(
                            color:      BanzamiColors.gray900,
                            fontWeight: FontWeight.w700,
                          ),
                        ),

                        const SizedBox(height: BanzamiSpacing.xs),

                        Text(
                          _amount,
                          style: BanzamiTextStyles.monoLg.copyWith(
                            color: BanzamiColors.gray900,
                          ),
                        ),

                        const SizedBox(height: BanzamiSpacing.xs),

                        Text(
                          'para @${t.recipient}',
                          style: BanzamiTextStyles.bodyMd.copyWith(
                            color: BanzamiColors.gray400,
                          ),
                        ),

                        if (widget.isSandbox) ...[
                          const SizedBox(height: BanzamiSpacing.md),
                          const BanzamiSandboxBadge(
                            label: 'SANDBOX  •  Dinheiro de teste',
                          ),
                        ],

                        const SizedBox(height: BanzamiSpacing.lg),

                        // ── Detail card ────────────────────────────────
                        BanzamiCard(
                          padding: const EdgeInsets.symmetric(
                            horizontal: BanzamiSpacing.lg,
                            vertical:   BanzamiSpacing.sm,
                          ),
                          child: Column(children: [
                            _DetailRow(label: 'De',     value: '@$_from'),
                            _DetailRow(label: 'Para',   value: '@${t.recipient}'),
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

                        const SizedBox(height: BanzamiSpacing.lg),

                        // ── Concluído ──────────────────────────────────
                        BanzamiPrimaryButton(
                          label:    'Concluído',
                          icon:     Icons.check_rounded,
                          onPressed: _done,
                        ),

                        const SizedBox(height: BanzamiSpacing.sm),

                        // ── Partilhar comprovativo ─────────────────────
                        SizedBox(
                          key: _shareKey,
                          child: BanzamiSecondaryButton(
                            label:     'Partilhar comprovativo',
                            onPressed: _share,
                          ),
                        ),

                        const SizedBox(height: BanzamiSpacing.lg),

                        // ── Footer — live timestamp + security notice ──
                        Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const Icon(
                              Icons.shield_outlined,
                              size:  13,
                              color: BanzamiColors.gray400,
                            ),
                            const SizedBox(width: 5),
                            Flexible(
                              child: Text(
                                'Comprovativo Banzami  •  Ref $_ref  •  $timeStr',
                                style: BanzamiTextStyles.bodySm.copyWith(
                                  color:    BanzamiColors.gray400,
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
                                ? BanzamiColors.sandboxText.withValues(alpha: 0.85)
                                : BanzamiColors.gray400,
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
        padding: const EdgeInsets.symmetric(vertical: BanzamiSpacing.sm),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              label,
              style: BanzamiTextStyles.bodySm.copyWith(
                color: BanzamiColors.gray400,
              ),
            ),
            const SizedBox(width: BanzamiSpacing.md),
            Flexible(
              child: Text(
                value,
                style: BanzamiTextStyles.bodyMd.copyWith(
                  fontWeight: FontWeight.w600,
                  color:      BanzamiColors.gray900,
                ),
                textAlign: TextAlign.end,
              ),
            ),
          ],
        ),
      ),
      if (!isLast)
        const Divider(height: 1, color: BanzamiColors.gray200),
    ]);
  }
}
