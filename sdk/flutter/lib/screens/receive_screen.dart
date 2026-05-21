import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:share_plus/share_plus.dart';

import '../theme/banza_theme.dart';
import '../utils/money_format.dart';
import '../widgets/banza_amount_input.dart';
import '../widgets/banza_components.dart';
import '../widgets/banza_qr_display.dart';

class BanzamiReceiveScreen extends StatefulWidget {
  final String handle;

  /// Asset path of the logo to embed at the centre of the QR and include in
  /// the shared PNG. e.g. `'assets/images/banzami_icon.png'`.
  final String? logoAssetPath;

  const BanzamiReceiveScreen({
    super.key,
    required this.handle,
    this.logoAssetPath,
  });

  @override
  State<BanzamiReceiveScreen> createState() => _BanzamiReceiveScreenState();
}

class _BanzamiReceiveScreenState extends State<BanzamiReceiveScreen> {
  int       _amountMinor = 0;
  bool      _amountSet   = false;
  bool      _sharing     = false;
  ui.Image? _logoUiImage;

  final _shareButtonKey     = GlobalKey();
  final _shareLinkButtonKey = GlobalKey();

  String get _qrPayload {
    if (_amountSet && _amountMinor > 0) {
      return 'banza:@${widget.handle}?amount=$_amountMinor&currency=AOA';
    }
    return 'banza:@${widget.handle}';
  }

  @override
  void initState() {
    super.initState();
    if (widget.logoAssetPath != null) _loadLogoUiImage();
  }

  Future<void> _loadLogoUiImage() async {
    final data  = await rootBundle.load(widget.logoAssetPath!);
    final codec = await ui.instantiateImageCodec(
      data.buffer.asUint8List(),
      targetWidth:  160,
      targetHeight: 160,
    );
    final frame = await codec.getNextFrame();
    if (mounted) setState(() => _logoUiImage = frame.image);
  }

  void _clearAmount() => setState(() { _amountSet = false; _amountMinor = 0; });

  Future<void> _showAmountSheet() async {
    int draft = 0;
    await showModalBottomSheet<int>(
      context:            context,
      isScrollControlled: true,
      backgroundColor:    BanzaColors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => Padding(
        padding: EdgeInsets.fromLTRB(
          BanzaSpacing.xl,
          BanzaSpacing.xl,
          BanzaSpacing.xl,
          MediaQuery.of(ctx).viewInsets.bottom + BanzaSpacing.xl,
        ),
        child: Column(
          mainAxisSize:       MainAxisSize.min,
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
                  onPressed: () {
                    if (draft > 0) Navigator.pop(ctx, draft);
                  },
                ),
              ),
            ]),
          ],
        ),
      ),
    ).then((result) {
      if (result != null && result > 0) {
        setState(() { _amountMinor = result; _amountSet = true; });
      }
    });
  }

  String get _shareUrl {
    final base = 'https://pay.banzami.org/u/${widget.handle}';
    if (_amountSet && _amountMinor > 0) return '$base?amount=$_amountMinor';
    return base;
  }

  Future<void> _shareLink() async {
    HapticFeedback.lightImpact();
    try {
      final box    = _shareLinkButtonKey.currentContext?.findRenderObject() as RenderBox?;
      final origin = box != null ? box.localToGlobal(Offset.zero) & box.size : null;
      await Share.share(
        _shareUrl,
        subject:             'Pagar @${widget.handle} via Banza',
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

  Future<void> _shareQr() async {
    if (_sharing) return;
    HapticFeedback.lightImpact();
    setState(() => _sharing = true);
    try {
      final painter = QrPainter(
        data:                 _qrPayload,
        version:              QrVersions.auto,
        errorCorrectionLevel: QrErrorCorrectLevel.H,
        eyeStyle: const QrEyeStyle(
          eyeShape: QrEyeShape.square,
          color:    BanzaColors.wine,
        ),
        dataModuleStyle: const QrDataModuleStyle(
          dataModuleShape: QrDataModuleShape.square,
          color:           BanzaColors.gray900,
        ),
        embeddedImage:      _logoUiImage,
        embeddedImageStyle: _logoUiImage != null
            ? const QrEmbeddedImageStyle(size: Size(80, 80))
            : null,
      );

      final byteData = await painter.toImageData(512);
      if (byteData == null) throw Exception('QR render retornou imagem vazia');

      final file = File(
          '${Directory.systemTemp.path}/qr_${widget.handle.replaceAll(RegExp(r'[^a-zA-Z0-9]'), '_')}.png');
      await file.writeAsBytes(byteData.buffer.asUint8List());

      final box    = _shareButtonKey.currentContext?.findRenderObject() as RenderBox?;
      final origin = box != null ? box.localToGlobal(Offset.zero) & box.size : null;

      await Share.shareXFiles(
        [XFile(file.path, mimeType: 'image/png')],
        subject:             'QR de pagamento — @${widget.handle}',
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
    return BanzaScaffold(
      appBar: const BanzaAppBar(title: 'Receber'),
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) {
            final qrSize = (constraints.maxHeight - 280).clamp(120.0, 220.0);

            return SingleChildScrollView(
              child: ConstrainedBox(
                constraints: BoxConstraints(minHeight: constraints.maxHeight),
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: BanzaSpacing.xl,
                    vertical:   BanzaSpacing.lg,
                  ),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      // QR card — clean white card with subtle shadow
                      BanzaCard(
                        padding: const EdgeInsets.all(BanzaSpacing.xl),
                        shadow: BanzaShadows.cardElevated,
                        child: Column(
                          children: [
                            BanzaQrDisplay(
                              payload:       _qrPayload,
                              amountLabel:   (_amountSet && _amountMinor > 0)
                                  ? formatMinor(_amountMinor, 'AOA')
                                  : null,
                              subtitle:      '@${widget.handle}',
                              size:          qrSize,
                              embeddedImage: widget.logoAssetPath != null
                                  ? AssetImage(widget.logoAssetPath!)
                                  : null,
                            ),

                            const SizedBox(height: BanzaSpacing.md),

                            // Handle copy row
                            GestureDetector(
                              onTap: () async {
                                HapticFeedback.selectionClick();
                                await Clipboard.setData(
                                    ClipboardData(text: '@${widget.handle}'));
                                if (context.mounted) {
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    const SnackBar(content: Text('@handle copiado')),
                                  );
                                }
                              },
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
                                    const Icon(Icons.copy_rounded, size: 14, color: BanzaColors.gray400),
                                    const SizedBox(width: BanzaSpacing.xs),
                                    Text(
                                      '@${widget.handle}',
                                      style: BanzaTextStyles.bodyMd.copyWith(
                                        color: BanzaColors.gray600,
                                        fontWeight: FontWeight.w500,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),

                      const SizedBox(height: BanzaSpacing.xl),

                      // Primary action
                      BanzaPrimaryButton(
                        key:       _shareLinkButtonKey,
                        label:     'Partilhar link',
                        icon:      Icons.link_rounded,
                        onPressed: _shareLink,
                      ),

                      const SizedBox(height: BanzaSpacing.sm),

                      // Secondary actions row
                      Row(children: [
                        Expanded(
                          child: BanzaSecondaryButton(
                            label:     _sharing ? 'A partilhar…' : 'Partilhar QR',
                            onPressed: _sharing ? null : _shareQr,
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

                      const SizedBox(height: BanzaSpacing.lg),
                    ],
                  ),
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}
