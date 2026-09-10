import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import '../models/receipt.dart';
import '../models/transfer.dart';
import '../utils/date_formatter.dart';
import '../theme/banzami_theme.dart';
import '../utils/banzami_toast.dart';
import '../utils/money_format.dart';
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
const _kReceiptWine = Color(0xFF7A000D); // mid-low gradient + core mid
const _kReceiptDeep =
    Color(0xFF5E000A); // page background + gradient base + core edge

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

  final bool isSandbox;
  final String? logoAssetPath;

  /// Whether [transfer.recipient] is a @handle (P2P) or a plain display name
  /// (e.g. a merchant / payment-link payee like "Doa Sandbox"). When false the
  /// "@" prefix is dropped so merchant payments read "para Doa Sandbox".
  final bool recipientIsHandle;

  /// Fetches the official receipt PDF bytes from the backend Document Engine
  /// (e.g. `() => client.fetchReceiptPdf(transfer.transferId)`). The app must
  /// NOT build PDFs locally. When null, sharing falls back to plain text.
  final Future<List<int>> Function()? fetchReceiptPdf;

  /// The canonical receipt, when the caller already has it (a link payment's
  /// pay response carries it).
  final Receipt? receipt;

  /// Fetches the canonical receipt (e.g. `() => client.fetchReceipt(id)`).
  /// Every party, label, time and the proof reference on this screen come from
  /// it — the same receipt the PDF and the public verifier show.
  final Future<Receipt> Function()? fetchReceipt;

  const BanzamiReceiptScreen({
    super.key,
    required this.transfer,
    this.ownHandle,
    required this.onDone,
    this.isSandbox = false,
    this.logoAssetPath,
    this.recipientIsHandle = true,
    this.fetchReceiptPdf,
    this.receipt,
    this.fetchReceipt,
  });

  @override
  State<BanzamiReceiptScreen> createState() => _BanzamiReceiptScreenState();
}

class _BanzamiReceiptScreenState extends State<BanzamiReceiptScreen>
    with SingleTickerProviderStateMixin, WidgetsBindingObserver {
  late final AnimationController _ctrl;
  late final Animation<double> _markScale;
  late final Animation<double> _fade;

  // Live clock — refreshes every second so the screen is visibly live (not a
  // screenshot). Labelled as such: it is NOT when the payment happened.
  late DateTime _liveTime;
  Timer? _liveTimer;

  // The canonical receipt (see [BanzamiReceiptScreen.fetchReceipt]).
  Receipt? _receipt;
  bool _receiptFailed = false;
  bool _receiptLoading = false;
  Timer? _receiptRetry;

  // Screen-capture protection state.
  bool _isCaptured = false;
  bool _isBackground = false;
  bool _screenshotTaken = false;
  StreamSubscription<bool>? _captureSub;
  StreamSubscription<void>? _screenshotSub;

  // Key used to compute the share button's on-screen position for iOS
  // UIActivityViewController anchor (required on iPad, good practice on iPhone).
  final _shareKey = GlobalKey();
  bool _sharing = false;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(vsync: this, duration: BanzamiMotion.slow);
    _markScale = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(
        parent: _ctrl,
        curve: const Interval(0.15, 0.65, curve: BanzamiMotion.spring),
      ),
    );
    _fade = CurvedAnimation(
      parent: _ctrl,
      curve: const Interval(0.0, 0.45, curve: BanzamiMotion.decelerate),
    );
    _ctrl.forward();
    HapticFeedback.mediumImpact();

    _receipt = (widget.receipt?.isComplete ?? false) ? widget.receipt : null;
    if (_receipt == null) _loadReceipt();

    _liveTime = DateTime.now();
    _liveTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() => _liveTime = DateTime.now());
    });

    WidgetsBinding.instance.addObserver(this);

    BanzamiScreenSecurity.setSecure(true);
    _captureSub = BanzamiScreenSecurity.captureState.listen(
      (v) {
        if (mounted) setState(() => _isCaptured = v);
      },
      onError: (_) {},
      cancelOnError: false,
    );
    _screenshotSub = BanzamiScreenSecurity.screenshotTaken.listen(
      (_) {
        if (mounted) setState(() => _screenshotTaken = true);
      },
      onError: (_) {},
      cancelOnError: false,
    );
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final background = state == AppLifecycleState.inactive ||
        state == AppLifecycleState.paused ||
        state == AppLifecycleState.hidden;
    if (mounted) setState(() => _isBackground = background);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _liveTimer?.cancel();
    _receiptRetry?.cancel();
    _captureSub?.cancel();
    _screenshotSub?.cancel();
    BanzamiScreenSecurity.setSecure(false);
    _ctrl.dispose();
    super.dispose();
  }

  Future<void> _loadReceipt({int attempt = 1}) async {
    final fetch = widget.fetchReceipt;
    if (fetch == null) return;
    setState(() {
      _receiptLoading = true;
      _receiptFailed = false;
    });
    try {
      final r = await fetch();
      if (!mounted) return;
      if (!r.isComplete) throw StateError('incomplete receipt');
      setState(() {
        _receipt = r;
        _receiptLoading = false;
      });
    } catch (_) {
      if (!mounted) return;
      if (attempt < 3) {
        _receiptRetry?.cancel();
        _receiptRetry = Timer(Duration(milliseconds: 900 * attempt), () {
          if (mounted) _loadReceipt(attempt: attempt + 1);
        });
        return;
      }
      setState(() {
        _receiptLoading = false;
        _receiptFailed = true;
      });
    }
  }

  // ── Computed fields ────────────────────────────────────────────────────────
  //
  // With the canonical receipt, everything below comes from it. Until it
  // arrives the screen shows what the app already knows — and NEVER a
  // transaction-id prefix as if it were the receipt reference: the only
  // reference a comprovativo shows is the proof's (BZM-…).

  /// The full canonical proof reference, or null while unknown.
  String? get _proofRef => _receipt?.proofReference;

  bool get _isPayment => _receipt?.isPayment ?? !widget.recipientIsHandle;

  String get _amount => _receipt != null
      ? formatMinor(_receipt!.amountMinor, _receipt!.currency)
      : formatMinor(widget.transfer.amountMinor, widget.transfer.currency);

  DateTime get _when =>
      _receipt?.confirmedAt ??
      widget.transfer.completedAt ??
      widget.transfer.createdAt;

  /// The official receipt clock — Luanda time, labelled (WAT) — the same the
  /// PDF and the public verifier print.
  String get _dateLong => BanzamiDateFormatter.formatOfficialReceipt(_when);

  String get _from {
    final h =
        _receipt?.payer.handle ?? widget.ownHandle ?? widget.transfer.sender;
    return h.startsWith('@') ? h : '@$h';
  }

  /// Recipient as shown to the user: the receipt's payee ("Doa · @doa" for a
  /// Business, "@ana" for a person). Before the receipt arrives, what the flow
  /// already knew.
  String get _recipientLabel {
    if (_receipt != null) return _receipt!.payee.label;
    return '${widget.recipientIsHandle ? '@' : ''}${widget.transfer.recipient}';
  }

  String get _refStatus => _proofRef != null
      ? _receipt!.shortReference!
      : (_receiptFailed ? 'Indisponível — toque para tentar' : 'A obter…');

  Future<void> _copyReference() async {
    final ref = _proofRef;
    if (ref == null) {
      if (_receiptFailed) _loadReceipt();
      return;
    }
    await Clipboard.setData(ClipboardData(text: ref));
    if (mounted) BanzamiToast.showSuccess(context, 'Referência copiada.');
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  void _done() {
    widget.onDone(widget.transfer);
    Navigator.of(context).popUntil((route) => route.isFirst);
  }

  Future<void> _share() async {
    final box = _shareKey.currentContext?.findRenderObject() as RenderBox?;
    final origin =
        box == null ? null : box.localToGlobal(Offset.zero) & box.size;

    // The official Banzami PDF (Document Engine: logo, dados, QR de verificação,
    // watermark SANDBOX) is the ONLY thing shared — never a locally-built PDF and
    // never plain text. On failure we show a clear error; tocar de novo tenta
    // outra vez. O texto existe apenas como "Copiar detalhes".
    if (widget.fetchReceiptPdf == null || _sharing) {
      if (mounted && widget.fetchReceiptPdf == null) {
        BanzamiToast.showError(
            context, 'Não foi possível obter o comprovativo.');
      }
      return;
    }
    setState(() => _sharing = true);
    File? file;
    try {
      final bytes = await widget.fetchReceiptPdf!();
      final dir = await getTemporaryDirectory();
      final ref = _proofRef;
      file = File(ref == null
          ? '${dir.path}/Banzami-Comprovativo.pdf'
          : '${dir.path}/Banzami-Comprovativo-$ref.pdf');
      await file.writeAsBytes(bytes, flush: true);
      await Share.shareXFiles(
        [XFile(file.path, mimeType: 'application/pdf')],
        subject: ref == null
            ? 'Comprovativo Banzami'
            : 'Comprovativo Banzami · $ref',
        sharePositionOrigin: origin,
      );
    } catch (_) {
      if (mounted)
        BanzamiToast.showError(
            context, 'Não foi possível obter o comprovativo.');
    } finally {
      // Never accumulate PDFs — delete the temp file after sharing.
      if (file != null) {
        try {
          await file.delete();
        } catch (_) {}
      }
      if (mounted) setState(() => _sharing = false);
    }
  }

  // Secondary action — copies the receipt's details + its verification link as
  // plain text. Not the primary share (that is the official PDF). Only from the
  // canonical receipt: without its proof reference there is nothing to verify.
  Future<void> _copyDetails() async {
    final r = _receipt;
    if (r == null || r.proofReference == null) {
      BanzamiToast.showError(
          context, 'O comprovativo ainda não está disponível.');
      if (_receiptFailed) _loadReceipt();
      return;
    }
    final lines = <String>[
      'Comprovativo Banzami',
      r.operationLine,
      'Montante: $_amount',
      'De: $_from',
      'Para: ${r.payee.label}',
      if (r.merchantReference != null)
        'Referência do comerciante: ${r.merchantReference}',
      if (r.displayContext != null) 'Finalidade: ${r.displayContext}',
      if (r.description != null) 'Descrição: ${r.description}',
      'Data: $_dateLong',
      if (r.fundingLabel != null) 'Fonte: ${r.fundingLabel}',
      'Comprovativo: ${r.proofReference}',
      'Verificar: ${r.verificationUrl ?? 'https://banzami.com/r/${r.proofReference}'}',
    ];
    await Clipboard.setData(ClipboardData(text: lines.join('\n')));
    if (mounted) BanzamiToast.showSuccess(context, 'Detalhes copiados.');
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
                  size: 56,
                ),
                const SizedBox(height: BanzamiSpacing.lg),
                Text(
                  'Comprovativo protegido',
                  style:
                      BanzamiTextStyles.headingSm.copyWith(color: Colors.white),
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
                    size: 56,
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
    final t = widget.transfer;
    final r = _receipt;
    // Before the receipt arrives, the flow's own note; with it, only what the
    // receipt says (a Business's reference and context are separate rows).
    final note = r != null
        ? r.description
        : (t.note?.isNotEmpty == true ? t.note : null);
    final liveStr = DateFormat('HH:mm:ss').format(_liveTime);

    return Scaffold(
      // Deliberate exception to the official Banzami palette, for the immersive
      // "comprovativo moment" ONLY (this screen). The historical receipt used a
      // deeper, higher-contrast cherry→near-black gradient; no other screen is
      // affected. Cherry #C21A2C, #990011, wine #7A000D, deep #5E000A.
      backgroundColor: _kReceiptDeep,
      resizeToAvoidBottomInset: false,
      body: Stack(
        children: [
          // ── Full-screen cherry gradient + content ──────────────────────
          Container(
            width: double.infinity,
            height: double.infinity,
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [
                  _kReceiptCherry,
                  Color(0xFF990011),
                  _kReceiptWine,
                  _kReceiptDeep,
                ],
                stops: [0.0, 0.35, 0.65, 1.0],
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
                        vertical: 4,
                      ),
                      child: Row(children: [
                        IconButton(
                          icon: const Icon(
                            Icons.close_rounded,
                            color: Colors.white54,
                            size: 22,
                          ),
                          onPressed: _done,
                        ),
                        const Spacer(),
                        Flexible(
                          child: Text(
                            'Comprovativo',
                            overflow: TextOverflow.ellipsis,
                            style: BanzamiTextStyles.headingSm.copyWith(
                              color: Colors.white.withValues(alpha: 0.75),
                            ),
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
                              size: 96,
                              bloom: _kReceiptCherry,
                              coreMid: _kReceiptWine,
                              coreEdge: _kReceiptDeep,
                            ),
                          ),

                          const SizedBox(height: 4),

                          Text(
                            // A payment reads "Pagamento concluído", a P2P
                            // transfer "Enviado com sucesso" — by what the
                            // operation WAS (the receipt's operation kind).
                            _isPayment
                                ? 'Pagamento concluído'
                                : 'Enviado com sucesso',
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
                            width: double.infinity,
                            padding: const EdgeInsets.symmetric(
                              horizontal: BanzamiSpacing.lg,
                              vertical: BanzamiSpacing.sm,
                            ),
                            decoration: BoxDecoration(
                              color: Colors.white.withValues(alpha: 0.12),
                              borderRadius: BorderRadius.circular(28),
                              border: Border.all(
                                color: Colors.white.withValues(alpha: 0.18),
                                width: 1,
                              ),
                            ),
                            child: Column(children: [
                              _DetailRow(label: 'De', value: _from),
                              _DetailRow(label: 'Para', value: _recipientLabel),
                              if (r?.merchantReference != null)
                                _DetailRow(
                                    label: 'Referência do comerciante',
                                    value: r!.merchantReference!),
                              if (r?.displayContext != null)
                                _DetailRow(
                                    label: 'Finalidade',
                                    value: r!.displayContext!),
                              if (note != null)
                                _DetailRow(label: 'Descrição', value: note),
                              _DetailRow(label: 'Data', value: _dateLong),
                              if (r != null)
                                _DetailRow(
                                    label: 'Operação', value: r.operationLine),
                              _DetailRow(
                                label: 'Fonte',
                                value: r?.fundingLabel ?? 'Saldo Banzami',
                              ),
                              _DetailRow(
                                label: 'Referência',
                                value: _refStatus,
                                mono: _proofRef != null,
                                trailing: _proofRef != null
                                    ? Icons.copy_rounded
                                    : (_receiptLoading
                                        ? null
                                        : Icons.refresh_rounded),
                                onTap: _copyReference,
                                isLast: true,
                              ),
                            ]),
                          ),

                          const SizedBox(height: BanzamiSpacing.md),

                          // ── Concluído ──────────────────────────────────
                          SizedBox(
                            width: double.infinity,
                            height: 58,
                            child: ElevatedButton(
                              onPressed: _done,
                              style: ElevatedButton.styleFrom(
                                backgroundColor: Colors.white,
                                foregroundColor: BanzamiColors.primary,
                                elevation: 0,
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(22),
                                ),
                              ),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Container(
                                    width: 22,
                                    height: 22,
                                    decoration: BoxDecoration(
                                      shape: BoxShape.circle,
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
                                      color: BanzamiColors.primary,
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
                            key: _shareKey,
                            width: double.infinity,
                            height: 58,
                            child: OutlinedButton(
                              onPressed: _sharing ? null : _share,
                              style: OutlinedButton.styleFrom(
                                foregroundColor: Colors.white,
                                backgroundColor:
                                    Colors.white.withValues(alpha: 0.08),
                                side: BorderSide(
                                  color: Colors.white.withValues(alpha: 0.14),
                                  width: 1,
                                ),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(22),
                                ),
                              ),
                              child: _sharing
                                  ? const SizedBox(
                                      width: 20,
                                      height: 20,
                                      child: CircularProgressIndicator(
                                          strokeWidth: 2, color: Colors.white))
                                  : Text(
                                      'Partilhar comprovativo',
                                      style: BanzamiTextStyles.bodyMd.copyWith(
                                        color: Colors.white,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                            ),
                          ),

                          const SizedBox(height: BanzamiSpacing.xs),

                          // ── Copiar detalhes (secondary) ────────────────
                          TextButton(
                            onPressed: _copyDetails,
                            child: Text(
                              'Copiar detalhes',
                              style: BanzamiTextStyles.bodySm.copyWith(
                                color: Colors.white.withValues(alpha: 0.75),
                                fontWeight: FontWeight.w600,
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
                                size: 13,
                                color: Colors.white.withValues(alpha: 0.48),
                              ),
                              const SizedBox(width: 5),
                              Flexible(
                                child: Text(
                                  _proofRef != null
                                      ? 'Comprovativo Banzami  •  ${_receipt!.shortReference}'
                                      : 'Comprovativo Banzami',
                                  style: BanzamiTextStyles.bodySm.copyWith(
                                    color: Colors.white.withValues(alpha: 0.55),
                                    fontSize: 11.5,
                                  ),
                                  textAlign: TextAlign.center,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 2),
                          // The live clock proves the screen is live; it is not
                          // when the payment happened (that is "Data" above).
                          Text(
                            'Ecrã em direto  •  $liveStr',
                            style: BanzamiTextStyles.bodySm.copyWith(
                              color: Colors.white.withValues(alpha: 0.45),
                              fontSize: 11,
                            ),
                            textAlign: TextAlign.center,
                          ),
                          const SizedBox(height: 4),
                          Text(
                            widget.isSandbox
                                ? 'Comprovativo sandbox  •  sem valor financeiro real'
                                : 'Comprovativo válido apenas no ecrã vivo da app',
                            style: BanzamiTextStyles.bodySm.copyWith(
                              color: widget.isSandbox
                                  ? const Color(0xFFD97706)
                                      .withValues(alpha: 0.65)
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
          if (_isCaptured) _buildCaptureOverlay(),
          if (_screenshotTaken) _buildScreenshotWarning(),
          if (_isBackground) _buildPrivacyBlackout(),
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
  final bool isLast;
  final bool mono;
  final IconData? trailing;
  final VoidCallback? onTap;

  const _DetailRow({
    required this.label,
    required this.value,
    this.isLast = false,
    this.mono = false,
    this.trailing,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final valueStyle = BanzamiTextStyles.bodyMd.copyWith(
      color: Colors.white,
      fontWeight: FontWeight.w600,
      fontFamily: mono ? 'JetBrainsMono' : null,
      letterSpacing: mono ? 0.2 : null,
    );
    final row = Padding(
      padding: const EdgeInsets.symmetric(vertical: 7),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Label and value share the row: a long label ("Referência do
          // comerciante") wraps instead of pushing the value off-screen.
          Flexible(
            flex: 2,
            child: Text(
              label,
              style: BanzamiTextStyles.bodySm.copyWith(
                color: Colors.white.withValues(alpha: 0.55),
              ),
            ),
          ),
          const SizedBox(width: BanzamiSpacing.md),
          Expanded(
            flex: 3,
            child: Text(
              value,
              style: valueStyle,
              textAlign: TextAlign.right,
              softWrap: true,
            ),
          ),
          if (trailing != null) ...[
            const SizedBox(width: 6),
            Icon(trailing,
                size: 15, color: Colors.white.withValues(alpha: 0.7)),
          ],
        ],
      ),
    );
    return Column(children: [
      onTap == null
          ? row
          : Semantics(
              button: true,
              label: '$label: $value',
              child: InkWell(onTap: onTap, child: row),
            ),
      if (!isLast)
        Divider(
            height: 1,
            thickness: 1,
            color: Colors.white.withValues(alpha: 0.12)),
    ]);
  }
}
