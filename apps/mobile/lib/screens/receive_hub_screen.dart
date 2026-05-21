import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:share_plus/share_plus.dart';
import 'package:banza_flutter/banza_flutter.dart';

import '../services/session_service.dart';

/// Bottom-nav "Receber" hub: QR card at top + received transactions list below.
class ReceiveHubScreen extends StatefulWidget {
  final VoidCallback? onViewAll;

  const ReceiveHubScreen({super.key, this.onViewAll});

  @override
  State<ReceiveHubScreen> createState() => _ReceiveHubScreenState();
}

class _ReceiveHubScreenState extends State<ReceiveHubScreen> {
  int       _amountMinor = 0;
  bool      _amountSet   = false;
  bool      _sharing     = false;
  ui.Image? _logoUiImage;

  List<ActivityItem> _received         = [];
  bool               _loadingTransfers = false;
  String?            _transferError;

  final _shareLinkKey = GlobalKey();
  final _shareQrKey   = GlobalKey();

  @override
  void initState() {
    super.initState();
    _loadLogo();
    _loadReceived();
  }

  Future<void> _loadLogo() async {
    final data  = await rootBundle.load('assets/images/banza_icon.png');
    final codec = await ui.instantiateImageCodec(
      data.buffer.asUint8List(),
      targetWidth: 160, targetHeight: 160,
    );
    final frame = await codec.getNextFrame();
    if (mounted) setState(() => _logoUiImage = frame.image);
  }

  Future<void> _loadReceived() async {
    if (_loadingTransfers) return;
    setState(() { _loadingTransfers = true; _transferError = null; });
    try {
      final client = context.read<ConsumerPublicClient>();
      final page   = await client.getActivity(limit: 50, directionFilter: 'INCOMING');
      if (mounted) setState(() { _received = page.items; _loadingTransfers = false; });
    } catch (_) {
      if (mounted) setState(() {
        _transferError    = 'Não foi possível carregar os pagamentos.';
        _loadingTransfers = false;
      });
    }
  }

  String _qrPayload(String handle) {
    if (_amountSet && _amountMinor > 0) {
      return 'banza:@$handle?amount=$_amountMinor&currency=AOA';
    }
    return 'banza:@$handle';
  }

  String _shareUrl(String handle) {
    final base = 'https://pay.banzami.org/u/$handle';
    if (_amountSet && _amountMinor > 0) return '$base?amount=$_amountMinor';
    return base;
  }

  void _clearAmount() => setState(() { _amountSet = false; _amountMinor = 0; });

  Future<void> _copyHandle(String handle) async {
    HapticFeedback.selectionClick();
    await Clipboard.setData(ClipboardData(text: '@$handle'));
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Endereço copiado')),
      );
    }
  }

  Future<void> _showAmountSheet() async {
    int draft = 0;
    final result = await showModalBottomSheet<int>(
      context:            context,
      isScrollControlled: true,
      backgroundColor:    BanzaColors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) => Padding(
        padding: EdgeInsets.fromLTRB(
          BanzaSpacing.xl, BanzaSpacing.xl, BanzaSpacing.xl,
          MediaQuery.of(ctx).viewInsets.bottom + BanzaSpacing.xl,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Montante a cobrar', style: BanzaTextStyles.headingSm),
            const SizedBox(height: BanzaSpacing.md),
            BanzaAmountInput(onChanged: (v) => draft = v),
            const SizedBox(height: BanzaSpacing.lg),
            Row(children: [
              Expanded(
                child: BanzaSecondaryButton(
                  label:     'Cancelar',
                  onPressed: () => Navigator.pop(ctx),
                ),
              ),
              const SizedBox(width: BanzaSpacing.sm),
              Expanded(
                child: BanzaPrimaryButton(
                  label:     'Aplicar',
                  onPressed: () { if (draft > 0) Navigator.pop(ctx, draft); },
                ),
              ),
            ]),
          ],
        ),
      ),
    );
    if (result != null && result > 0) {
      setState(() { _amountMinor = result; _amountSet = true; });
    }
  }

  Future<void> _shareLink(String handle) async {
    HapticFeedback.lightImpact();
    try {
      final box    = _shareLinkKey.currentContext?.findRenderObject() as RenderBox?;
      final origin = box != null ? box.localToGlobal(Offset.zero) & box.size : null;
      await Share.share(
        _shareUrl(handle),
        subject:             'Pagar @$handle via Banza',
        sharePositionOrigin: origin,
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Erro ao partilhar: $e')),
        );
      }
    }
  }

  Future<void> _shareQr(String handle) async {
    if (_sharing) return;
    HapticFeedback.lightImpact();
    setState(() => _sharing = true);
    try {
      final painter = QrPainter(
        data:                 _qrPayload(handle),
        version:              QrVersions.auto,
        errorCorrectionLevel: QrErrorCorrectLevel.H,
        eyeStyle:        const QrEyeStyle(eyeShape: QrEyeShape.square, color: BanzaColors.wine),
        dataModuleStyle: const QrDataModuleStyle(dataModuleShape: QrDataModuleShape.square, color: BanzaColors.gray900),
        embeddedImage:      _logoUiImage,
        embeddedImageStyle: _logoUiImage != null
            ? const QrEmbeddedImageStyle(size: Size(80, 80))
            : null,
      );
      final byteData = await painter.toImageData(512);
      if (byteData == null) throw Exception('QR render retornou imagem vazia');
      final file = File(
        '${Directory.systemTemp.path}/qr_${handle.replaceAll(RegExp(r'[^a-zA-Z0-9]'), '_')}.png',
      );
      await file.writeAsBytes(byteData.buffer.asUint8List());
      final box    = _shareQrKey.currentContext?.findRenderObject() as RenderBox?;
      final origin = box != null ? box.localToGlobal(Offset.zero) & box.size : null;
      await Share.shareXFiles(
        [XFile(file.path, mimeType: 'image/png')],
        subject:             'QR de pagamento — @$handle',
        sharePositionOrigin: origin,
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Erro ao partilhar: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _sharing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = context.read<SessionService>().session!;
    final handle  = session.handle;

    return Scaffold(
      backgroundColor: BanzaColors.offWhite,
      appBar: AppBar(
        backgroundColor:        BanzaColors.offWhite,
        foregroundColor:        BanzaColors.gray900,
        elevation:              0,
        scrolledUnderElevation: 0,
        title: const Text('Receber com QR', style: BanzaTextStyles.headingMd),
        actions: [
          IconButton(
            icon:      const Icon(Icons.refresh_rounded, size: 22),
            onPressed: _loadReceived,
            tooltip:   'Actualizar',
          ),
        ],
      ),
      body: RefreshIndicator(
        color:     BanzaColors.wine,
        onRefresh: _loadReceived,
        child: CustomScrollView(
          slivers: [

            // ── QR card ────────────────────────────────────────────────────
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(
                  BanzaSpacing.lg, 0, BanzaSpacing.lg, BanzaSpacing.sm,
                ),
                child: BanzaCard(
                  shadow: BanzaShadows.cardElevated,
                  padding: EdgeInsets.zero,
                  child: Column(
                    children: [
                      // QR area
                      Padding(
                        padding: const EdgeInsets.fromLTRB(
                          BanzaSpacing.xl, BanzaSpacing.xl,
                          BanzaSpacing.xl, BanzaSpacing.lg,
                        ),
                        child: Column(
                          children: [
                            BanzaQrDisplay(
                              payload:       _qrPayload(handle),
                              amountLabel:   (_amountSet && _amountMinor > 0)
                                  ? formatMinor(_amountMinor, 'AOA')
                                  : null,
                              size:          190,
                              embeddedImage: const AssetImage('assets/images/banza_icon.png'),
                            ),
                            const SizedBox(height: BanzaSpacing.lg),

                            // Handle pill
                            GestureDetector(
                              onTap: () => _copyHandle(handle),
                              child: Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: BanzaSpacing.lg,
                                  vertical:   BanzaSpacing.sm,
                                ),
                                decoration: BoxDecoration(
                                  color:        BanzaColors.gray100,
                                  borderRadius: BanzaRadius.fullAll,
                                ),
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Text(
                                      '@$handle',
                                      style: BanzaTextStyles.mono.copyWith(
                                        fontSize:   15,
                                        fontWeight: FontWeight.w600,
                                        color:      BanzaColors.gray900,
                                      ),
                                    ),
                                    const SizedBox(width: BanzaSpacing.sm),
                                    const Icon(
                                      Icons.copy_rounded,
                                      size:  14,
                                      color: BanzaColors.gray400,
                                    ),
                                  ],
                                ),
                              ),
                            ),
                            const SizedBox(height: BanzaSpacing.xs),
                            Text(
                              'Mostre este QR para receber pagamentos',
                              style: BanzaTextStyles.bodySm.copyWith(
                                color: BanzaColors.gray400,
                              ),
                            ),
                          ],
                        ),
                      ),

                      const Divider(height: 1, color: BanzaColors.gray100),

                      // Action buttons
                      Padding(
                        padding: const EdgeInsets.all(BanzaSpacing.lg),
                        child: Column(
                          children: [
                            BanzaPrimaryButton(
                              key:       _shareLinkKey,
                              label:     'Partilhar link',
                              icon:      Icons.link_rounded,
                              onPressed: () => _shareLink(handle),
                            ),
                            const SizedBox(height: BanzaSpacing.sm),
                            Row(children: [
                              Expanded(
                                child: BanzaSecondaryButton(
                                  key:       _shareQrKey,
                                  label:     _sharing ? 'A partilhar…' : 'Partilhar QR',
                                  onPressed: _sharing ? null : () => _shareQr(handle),
                                ),
                              ),
                              const SizedBox(width: BanzaSpacing.sm),
                              Expanded(
                                child: _amountSet
                                    ? BanzaSecondaryButton(
                                        label:     'Remover montante',
                                        onPressed: _clearAmount,
                                      )
                                    : BanzaSecondaryButton(
                                        label:     'Definir montante',
                                        onPressed: _showAmountSheet,
                                      ),
                              ),
                            ]),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),

            // ── Received payments header ───────────────────────────────────
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(
                  BanzaSpacing.xl, BanzaSpacing.lg,
                  BanzaSpacing.xl, BanzaSpacing.sm,
                ),
                child: Row(
                  children: [
                    Text(
                      'Pagamentos recebidos',
                      style: BanzaTextStyles.headingSm.copyWith(fontWeight: FontWeight.w700),
                    ),
                    const Spacer(),
                    if (widget.onViewAll != null)
                      GestureDetector(
                        onTap: widget.onViewAll,
                        child: Text(
                          'Ver todos',
                          style: BanzaTextStyles.label.copyWith(
                            color:   BanzaColors.wine,
                            fontSize: 13,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ),

            // ── Received list ──────────────────────────────────────────────
            if (_loadingTransfers)
              const SliverToBoxAdapter(
                child: Padding(
                  padding: EdgeInsets.all(BanzaSpacing.xl),
                  child: Center(child: CircularProgressIndicator(color: BanzaColors.wine)),
                ),
              )
            else if (_transferError != null && _received.isEmpty)
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.all(BanzaSpacing.xl),
                  child: Center(
                    child: Column(mainAxisSize: MainAxisSize.min, children: [
                      const Icon(Icons.error_outline_rounded, color: BanzaColors.error, size: 36),
                      const SizedBox(height: BanzaSpacing.sm),
                      Text(_transferError!,
                          style: BanzaTextStyles.bodyMd.copyWith(color: BanzaColors.gray400),
                          textAlign: TextAlign.center),
                      const SizedBox(height: BanzaSpacing.md),
                      TextButton(onPressed: _loadReceived, child: const Text('Tentar novamente')),
                    ]),
                  ),
                ),
              )
            else if (_received.isEmpty)
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: BanzaSpacing.lg,
                  ),
                  child: BanzaCard(
                    padding: const EdgeInsets.all(BanzaSpacing.xl),
                    child: Center(
                      child: Column(mainAxisSize: MainAxisSize.min, children: [
                        Container(
                          width:  52,
                          height: 52,
                          decoration: const BoxDecoration(
                            color: BanzaColors.gray100,
                            shape: BoxShape.circle,
                          ),
                          child: const Icon(
                            Icons.qr_code_rounded,
                            size:  24,
                            color: BanzaColors.gray400,
                          ),
                        ),
                        const SizedBox(height: BanzaSpacing.md),
                        const Text('Nenhum pagamento recebido', style: BanzaTextStyles.headingSm),
                        const SizedBox(height: BanzaSpacing.xs),
                        Text(
                          'Partilhe o seu QR ou link para receber',
                          style: BanzaTextStyles.bodySm.copyWith(color: BanzaColors.gray400),
                          textAlign: TextAlign.center,
                        ),
                      ]),
                    ),
                  ),
                ),
              )
            else
              SliverPadding(
                padding: const EdgeInsets.symmetric(horizontal: BanzaSpacing.lg),
                sliver: SliverToBoxAdapter(
                  child: BanzaCard(
                    padding: EdgeInsets.zero,
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        for (int i = 0; i < _received.length; i++) ...[
                          BanzaTransferItem(item: _received[i]),
                          if (i < _received.length - 1)
                            const Divider(height: 1, indent: 68, color: BanzaColors.gray100),
                        ],
                      ],
                    ),
                  ),
                ),
              ),

            const SliverToBoxAdapter(child: SizedBox(height: BanzaSpacing.page)),
          ],
        ),
      ),
    );
  }
}
