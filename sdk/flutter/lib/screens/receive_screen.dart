import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:share_plus/share_plus.dart';

import '../theme/banzami_theme.dart';
import '../utils/money_format.dart';
import '../widgets/banzami_amount_input.dart';
import '../widgets/banzami_button.dart';
import '../widgets/banzami_qr_display.dart';

class BanzamiReceiveScreen extends StatefulWidget {
  final String handle;

  /// Asset path of the logo to embed at the centre of the QR and include in
  /// the shared PNG. e.g. `'assets/images/banzami_icon_1024.png'`.
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

  final _shareButtonKey = GlobalKey();
  final _shareLinkButtonKey = GlobalKey();

  String get _qrPayload {
    if (_amountSet && _amountMinor > 0) {
      return 'banzami:@${widget.handle}?amount=$_amountMinor&currency=AOA';
    }
    return 'banzami:@${widget.handle}';
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
      backgroundColor:    BanzamiColors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => Padding(
        padding: EdgeInsets.fromLTRB(
          BanzamiSpacing.xl,
          BanzamiSpacing.xl,
          BanzamiSpacing.xl,
          MediaQuery.of(ctx).viewInsets.bottom + BanzamiSpacing.xl,
        ),
        child: Column(
          mainAxisSize:      MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Montante a cobrar', style: BanzamiTextStyles.headingSm),
            const SizedBox(height: BanzamiSpacing.md),
            BanzamiAmountInput(onChanged: (v) => draft = v),
            const SizedBox(height: BanzamiSpacing.lg),
            Row(children: [
              Expanded(
                child: BanzamiButton.secondary(
                  label:     'Cancelar',
                  onPressed: () => Navigator.pop(ctx),
                ),
              ),
              const SizedBox(width: BanzamiSpacing.sm),
              Expanded(
                child: BanzamiButton(
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
    try {
      final box    = _shareLinkButtonKey.currentContext?.findRenderObject() as RenderBox?;
      final origin = box != null ? box.localToGlobal(Offset.zero) & box.size : null;
      await Share.share(
        _shareUrl,
        subject:             'Pagar @${widget.handle} via Banzami',
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
    setState(() => _sharing = true);
    try {
      final painter = QrPainter(
        data:                 _qrPayload,
        version:              QrVersions.auto,
        errorCorrectionLevel: QrErrorCorrectLevel.H,
        eyeStyle:        const QrEyeStyle(
          eyeShape: QrEyeShape.square,
          color:    BanzamiColors.wine,
        ),
        dataModuleStyle: const QrDataModuleStyle(
          dataModuleShape: QrDataModuleShape.square,
          color:           BanzamiColors.gray900,
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
    return Scaffold(
      backgroundColor: BanzamiColors.white,
      appBar: AppBar(
        title:           const Text('Receber'),
        backgroundColor: BanzamiColors.white,
        foregroundColor: BanzamiColors.gray900,
        elevation:       0,
      ),
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) {
            final qrSize =
                (constraints.maxHeight - 236).clamp(120.0, 240.0);

            return SingleChildScrollView(
              child: ConstrainedBox(
                constraints: BoxConstraints(minHeight: constraints.maxHeight),
                child: Padding(
                  padding: const EdgeInsets.all(BanzamiSpacing.xl),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      BanzamiQrDisplay(
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

                      const SizedBox(height: BanzamiSpacing.lg),

                      TextButton.icon(
                        onPressed: () async {
                          await Clipboard.setData(
                              ClipboardData(text: '@${widget.handle}'));
                          if (context.mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(content: Text('@handle copiado')),
                            );
                          }
                        },
                        icon:  const Icon(Icons.copy_rounded, size: 16,
                            color: BanzamiColors.gray400),
                        label: Text(
                          '@${widget.handle}',
                          style: BanzamiTextStyles.bodyMd
                              .copyWith(color: BanzamiColors.gray400),
                        ),
                      ),

                      const SizedBox(height: BanzamiSpacing.xl),

                      SizedBox(
                        width: double.infinity,
                        child: ElevatedButton.icon(
                          key:       _shareButtonKey,
                          onPressed: _sharing ? null : _shareQr,
                          icon: _sharing
                              ? const SizedBox(
                                  width: 18, height: 18,
                                  child: CircularProgressIndicator(
                                      strokeWidth: 2, color: BanzamiColors.white))
                              : const Icon(Icons.share_rounded),
                          label: const Text('Partilhar QR'),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: BanzamiColors.wine,
                            foregroundColor: BanzamiColors.white,
                            padding:   const EdgeInsets.symmetric(vertical: 14),
                            shape:     RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(14)),
                            textStyle: BanzamiTextStyles.headingSm,
                          ),
                        ),
                      ),

                      const SizedBox(height: BanzamiSpacing.sm),

                      SizedBox(
                        width: double.infinity,
                        child: OutlinedButton.icon(
                          key:      _shareLinkButtonKey,
                          onPressed: _shareLink,
                          icon:  const Icon(Icons.link_rounded),
                          label: const Text('Partilhar link'),
                          style: OutlinedButton.styleFrom(
                            foregroundColor: BanzamiColors.wine,
                            side:    const BorderSide(color: BanzamiColors.wine),
                            padding: const EdgeInsets.symmetric(vertical: 14),
                            shape:   RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(14)),
                            textStyle: BanzamiTextStyles.headingSm,
                          ),
                        ),
                      ),

                      const SizedBox(height: BanzamiSpacing.md),

                      if (_amountSet)
                        SizedBox(
                          width: double.infinity,
                          child: BanzamiButton.secondary(
                            label:     'Remover montante',
                            onPressed: _clearAmount,
                          ),
                        )
                      else
                        SizedBox(
                          width: double.infinity,
                          child: OutlinedButton.icon(
                            onPressed: _showAmountSheet,
                            icon:  const Icon(Icons.add_rounded),
                            label: const Text('Definir montante fixo'),
                            style: OutlinedButton.styleFrom(
                              foregroundColor: BanzamiColors.wine,
                              side:    const BorderSide(color: BanzamiColors.wine),
                              padding: const EdgeInsets.symmetric(vertical: 14),
                              shape:   RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(14)),
                              textStyle: BanzamiTextStyles.headingSm,
                            ),
                          ),
                        ),

                      const SizedBox(height: BanzamiSpacing.lg),
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
