import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:share_plus/share_plus.dart';

import '../client/consumer_public_client.dart';
import '../models/consumer_pay_link.dart';
import '../theme/banza_theme.dart';
import '../utils/money_format.dart';
import '../utils/banza_toast.dart';
import '../utils/qr_logo_utils.dart';
import '../widgets/banza_amount_input.dart';
import '../widgets/banza_components.dart';
import '../widgets/banza_qr_display.dart';

// ---------------------------------------------------------------------------
// Bottom sheet — collects amount + optional note, calls API, pops the link
// ---------------------------------------------------------------------------

class _AmountNoteSheet extends StatefulWidget {
  final ConsumerPublicClient client;
  const _AmountNoteSheet({required this.client});

  @override
  State<_AmountNoteSheet> createState() => _AmountNoteSheetState();
}

class _AmountNoteSheetState extends State<_AmountNoteSheet> {
  int     _amount  = 0;
  String  _note    = '';
  bool    _loading = false;
  String? _error;

  Future<void> _apply() async {
    if (_amount <= 0) return;
    setState(() { _loading = true; _error = null; });
    try {
      final note = _note.trim().isEmpty ? null : _note.trim();
      final link = await widget.client.createConsumerPayLink(
        amountMinor: _amount,
        note:        note,
        locked:      true,
      );
      if (mounted) Navigator.pop(context, link);
    } catch (_) {
      if (mounted) setState(() { _loading = false; _error = 'Não foi possível criar o link.'; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(
        BanzamiSpacing.xl, BanzamiSpacing.xl, BanzamiSpacing.xl,
        MediaQuery.viewInsetsOf(context).bottom + BanzamiSpacing.xl,
      ),
      child: Column(
        mainAxisSize:       MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Montante a cobrar', style: BanzamiTextStyles.headingSm),
          const SizedBox(height: BanzamiSpacing.md),
          BanzamiAmountInput(onChanged: (v) => _amount = v),
          const SizedBox(height: BanzamiSpacing.md),
          BanzamiTextField(
            label:           'Descrição (opcional)',
            hint:            'Ex: jantar de ontem',
            textInputAction: TextInputAction.done,
            onChanged:       (v) => _note = v,
          ),
          if (_error != null) ...[
            const SizedBox(height: BanzamiSpacing.sm),
            Text(_error!, style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.error)),
          ],
          const SizedBox(height: BanzamiSpacing.lg),
          Row(children: [
            Expanded(
              child: BanzamiSecondaryButton(
                label:     'Cancelar',
                onPressed: _loading ? null : () => Navigator.pop(context),
              ),
            ),
            const SizedBox(width: BanzamiSpacing.sm),
            Expanded(
              child: BanzamiPrimaryButton(
                label:     'Aplicar',
                isLoading: _loading,
                onPressed: _loading ? null : _apply,
              ),
            ),
          ]),
        ],
      ),
    );
  }
}

class BanzamiReceiveScreen extends StatefulWidget {
  final String handle;

  /// Asset path of the logo to embed at the centre of the QR and include in
  /// the shared PNG. e.g. `'assets/images/banzami_icon.png'`.
  final String? logoAssetPath;

  /// Authenticated client used to create fixed-amount pay links.
  /// When null the "Definir montante" button is hidden.
  final ConsumerPublicClient? client;

  const BanzamiReceiveScreen({
    super.key,
    required this.handle,
    this.logoAssetPath,
    this.client,
  });

  @override
  State<BanzamiReceiveScreen> createState() => _BanzamiReceiveScreenState();
}

class _BanzamiReceiveScreenState extends State<BanzamiReceiveScreen> {
  bool             _sharing    = false;
  ui.Image?        _logoUiImage;
  ConsumerPayLink? _activeLink;

  final _shareButtonKey     = GlobalKey();
  final _shareLinkButtonKey = GlobalKey();

  String get _qrPayload {
    if (_activeLink != null) return 'banza://pay?request=${_activeLink!.linkCode}';
    return 'banza:@${widget.handle}';
  }

  String get _shareUrl {
    if (_activeLink != null) return 'https://pay.banzami.org/r/${_activeLink!.linkCode}';
    return 'https://pay.banzami.org/u/${widget.handle}';
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
    final frame   = await codec.getNextFrame();
    final rounded = await roundQrLogoCorners(frame.image);
    if (mounted) setState(() => _logoUiImage = rounded);
  }

  void _clearAmount() => setState(() => _activeLink = null);

  Future<void> _showAmountSheet() async {
    final client = widget.client;
    if (client == null) return;
    final link = await showModalBottomSheet<ConsumerPayLink>(
      context:            context,
      isScrollControlled: true,
      backgroundColor:    BanzamiColors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => _AmountNoteSheet(client: client),
    );
    if (link != null && mounted) setState(() => _activeLink = link);
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
        BanzamiToast.showError(context, 'Erro ao partilhar: $e');
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
          color:    BanzamiColors.primary,
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
        BanzamiToast.showError(context, 'Erro ao partilhar: $e');
      }
    } finally {
      if (mounted) setState(() => _sharing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return BanzamiScaffold(
      appBar: const BanzamiAppBar(title: 'Receber'),
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) {
            final qrSize = (constraints.maxHeight - 280).clamp(120.0, 220.0);

            return SingleChildScrollView(
              child: ConstrainedBox(
                constraints: BoxConstraints(minHeight: constraints.maxHeight),
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: BanzamiSpacing.xl,
                    vertical:   BanzamiSpacing.lg,
                  ),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      // QR card — clean white card with subtle shadow
                      BanzamiCard(
                        padding: const EdgeInsets.all(BanzamiSpacing.xl),
                        shadow: BanzamiShadows.cardElevated,
                        child: Column(
                          children: [
                            BanzamiQrDisplay(
                              payload:       _qrPayload,
                              amountLabel:   _activeLink?.amountMinor != null
                                  ? formatMinor(_activeLink!.amountMinor!, _activeLink!.currency)
                                  : null,
                              subtitle:      '@${widget.handle}',
                              size:          qrSize,
                              embeddedImage: widget.logoAssetPath != null
                                  ? AssetImage(widget.logoAssetPath!)
                                  : null,
                            ),

                            const SizedBox(height: BanzamiSpacing.md),

                            // Handle copy row
                            GestureDetector(
                              onTap: () async {
                                HapticFeedback.selectionClick();
                                await Clipboard.setData(
                                    ClipboardData(text: '@${widget.handle}'));
                                if (context.mounted) {
                                  BanzamiToast.showSuccess(context, '@handle copiado');
                                }
                              },
                              child: Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: BanzamiSpacing.lg,
                                  vertical:   BanzamiSpacing.sm,
                                ),
                                decoration: BoxDecoration(
                                  color:        BanzamiColors.gray100,
                                  borderRadius: BanzamiRadius.fullAll,
                                ),
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    const Icon(Icons.copy_rounded, size: 14, color: BanzamiColors.gray400),
                                    const SizedBox(width: BanzamiSpacing.xs),
                                    Text(
                                      '@${widget.handle}',
                                      style: BanzamiTextStyles.bodyMd.copyWith(
                                        color: BanzamiColors.gray600,
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

                      const SizedBox(height: BanzamiSpacing.xl),

                      // Primary action
                      BanzamiPrimaryButton(
                        key:       _shareLinkButtonKey,
                        label:     'Partilhar link',
                        icon:      Icons.link_rounded,
                        onPressed: _shareLink,
                      ),

                      const SizedBox(height: BanzamiSpacing.sm),

                      // Secondary actions row
                      Row(children: [
                        Expanded(
                          child: BanzamiSecondaryButton(
                            label:     _sharing ? 'A partilhar…' : 'Partilhar QR',
                            onPressed: _sharing ? null : _shareQr,
                          ),
                        ),
                        const SizedBox(width: BanzamiSpacing.sm),
                        if (widget.client != null) Expanded(
                          child: _activeLink != null
                              ? BanzamiSecondaryButton(
                                  label:     'Remover montante',
                                  onPressed: _clearAmount,
                                )
                              : BanzamiSecondaryButton(
                                  label:     'Definir montante',
                                  onPressed: _showAmountSheet,
                                ),
                        ),
                      ]),

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
