import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:share_plus/share_plus.dart';
import 'package:banzami_sdk/banzami_sdk.dart';

import '../services/session_service.dart';

/// Bottom-nav "Receber" hub: compact QR/share card at top + received
/// transactions list below.
class ReceiveHubScreen extends StatefulWidget {
  /// Called when the user taps "Ver todos" — typically switches to the
  /// Histórico tab in the parent [NavigationBar].
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

  List<Transfer> _received         = [];
  bool           _loadingTransfers = false;
  String?        _transferError;

  final _shareLinkKey = GlobalKey();
  final _shareQrKey   = GlobalKey();

  @override
  void initState() {
    super.initState();
    _loadLogo();
    _loadReceived();
  }

  Future<void> _loadLogo() async {
    final data  = await rootBundle.load('assets/images/banzami_icon.png');
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
      final client     = context.read<ConsumerPublicClient>();
      final consumerId = context.read<SessionService>().session!.consumerId;
      final page       = await client.listTransfers(limit: 50);
      final received   = page.data
          .where((t) => t.recipientId == consumerId && t.isCompleted)
          .toList();
      if (mounted) setState(() { _received = received; _loadingTransfers = false; });
    } catch (_) {
      if (mounted) {
        setState(() {
          _transferError    = 'Não foi possível carregar os pagamentos.';
          _loadingTransfers = false;
        });
      }
    }
  }

  String _qrPayload(String handle) {
    if (_amountSet && _amountMinor > 0) {
      return 'banzami:@$handle?amount=$_amountMinor&currency=AOA';
    }
    return 'banzami:@$handle';
  }

  String _shareUrl(String handle) {
    final base = 'https://pay.banzami.org/u/$handle';
    if (_amountSet && _amountMinor > 0) return '$base?amount=$_amountMinor';
    return base;
  }

  void _clearAmount() => setState(() { _amountSet = false; _amountMinor = 0; });

  Future<void> _showAmountSheet() async {
    int draft = 0;
    final result = await showModalBottomSheet<int>(
      context:            context,
      isScrollControlled: true,
      backgroundColor:    BanzamiColors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => Padding(
        padding: EdgeInsets.fromLTRB(
          BanzamiSpacing.xl, BanzamiSpacing.xl, BanzamiSpacing.xl,
          MediaQuery.of(ctx).viewInsets.bottom + BanzamiSpacing.xl,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Montante a cobrar', style: BanzamiTextStyles.headingSm),
            const SizedBox(height: BanzamiSpacing.md),
            BanzamiAmountInput(onChanged: (v) => draft = v),
            const SizedBox(height: BanzamiSpacing.lg),
            Row(children: [
              Expanded(
                child: BanzamiButton.secondary(
                  label: 'Cancelar',
                  onPressed: () => Navigator.pop(ctx),
                ),
              ),
              const SizedBox(width: BanzamiSpacing.sm),
              Expanded(
                child: BanzamiButton(
                  label: 'Aplicar',
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
    try {
      final box    = _shareLinkKey.currentContext?.findRenderObject() as RenderBox?;
      final origin = box != null ? box.localToGlobal(Offset.zero) & box.size : null;
      await Share.share(
        _shareUrl(handle),
        subject:             'Pagar @$handle via Banzami',
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
    setState(() => _sharing = true);
    try {
      final painter = QrPainter(
        data:                 _qrPayload(handle),
        version:              QrVersions.auto,
        errorCorrectionLevel: QrErrorCorrectLevel.H,
        eyeStyle:        const QrEyeStyle(eyeShape: QrEyeShape.square, color: BanzamiColors.wine),
        dataModuleStyle: const QrDataModuleStyle(dataModuleShape: QrDataModuleShape.square, color: BanzamiColors.gray900),
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
    final session    = context.read<SessionService>().session!;
    final handle     = session.handle;
    final consumerId = session.consumerId;

    return Scaffold(
      backgroundColor: BanzamiColors.offWhite,
      appBar: AppBar(
        backgroundColor: BanzamiColors.white,
        foregroundColor: BanzamiColors.gray900,
        elevation:       0,
        title: const Text('Receber', style: BanzamiTextStyles.headingSm),
        actions: [
          IconButton(
            icon:      const Icon(Icons.refresh_rounded),
            onPressed: _loadReceived,
          ),
        ],
      ),
      body: RefreshIndicator(
        color:     BanzamiColors.wine,
        onRefresh: _loadReceived,
        child: CustomScrollView(
          slivers: [
            // ---- QR + share card ----------------------------------------
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.all(BanzamiSpacing.lg),
                child: Container(
                  decoration: const BoxDecoration(
                    color:        BanzamiColors.white,
                    borderRadius: BanzamiRadius.lgAll,
                    boxShadow:    BanzamiShadows.card,
                  ),
                  child: Column(
                    children: [
                      Padding(
                        padding: const EdgeInsets.fromLTRB(
                          BanzamiSpacing.xl, BanzamiSpacing.xl,
                          BanzamiSpacing.xl, BanzamiSpacing.sm,
                        ),
                        child: BanzamiQrDisplay(
                          payload:       _qrPayload(handle),
                          amountLabel:   (_amountSet && _amountMinor > 0)
                              ? formatMinor(_amountMinor, 'AOA')
                              : null,
                          subtitle:      '@$handle',
                          size:          160,
                          embeddedImage: const AssetImage('assets/images/banzami_icon.png'),
                        ),
                      ),
                      TextButton.icon(
                        onPressed: () async {
                          await Clipboard.setData(ClipboardData(text: '@$handle'));
                          if (context.mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(content: Text('@handle copiado')),
                            );
                          }
                        },
                        icon:  const Icon(Icons.copy_rounded, size: 14, color: BanzamiColors.gray400),
                        label: Text(
                          '@$handle',
                          style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.gray400),
                        ),
                      ),
                      const Divider(height: 1),
                      Padding(
                        padding: const EdgeInsets.all(BanzamiSpacing.lg),
                        child: Column(
                          children: [
                            SizedBox(
                              width: double.infinity,
                              child: ElevatedButton.icon(
                                key:      _shareLinkKey,
                                onPressed: () => _shareLink(handle),
                                icon:  const Icon(Icons.link_rounded),
                                label: const Text('Partilhar link'),
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: BanzamiColors.wine,
                                  foregroundColor: BanzamiColors.white,
                                  padding:   const EdgeInsets.symmetric(vertical: 12),
                                  shape:     RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(12)),
                                  textStyle: BanzamiTextStyles.headingSm,
                                ),
                              ),
                            ),
                            const SizedBox(height: BanzamiSpacing.sm),
                            SizedBox(
                              width: double.infinity,
                              child: OutlinedButton.icon(
                                key:       _shareQrKey,
                                onPressed: _sharing ? null : () => _shareQr(handle),
                                icon: _sharing
                                    ? const SizedBox(
                                        width: 16, height: 16,
                                        child: CircularProgressIndicator(
                                            strokeWidth: 2, color: BanzamiColors.wine))
                                    : const Icon(Icons.share_rounded),
                                label: const Text('Partilhar QR'),
                                style: OutlinedButton.styleFrom(
                                  foregroundColor: BanzamiColors.wine,
                                  side:    const BorderSide(color: BanzamiColors.wine),
                                  padding: const EdgeInsets.symmetric(vertical: 12),
                                  shape:   RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(12)),
                                  textStyle: BanzamiTextStyles.headingSm,
                                ),
                              ),
                            ),
                            const SizedBox(height: BanzamiSpacing.sm),
                            SizedBox(
                              width: double.infinity,
                              child: _amountSet
                                  ? BanzamiButton.secondary(
                                      label:     'Remover montante',
                                      onPressed: _clearAmount,
                                    )
                                  : OutlinedButton.icon(
                                      onPressed: _showAmountSheet,
                                      icon:  const Icon(Icons.add_rounded),
                                      label: const Text('Definir montante fixo'),
                                      style: OutlinedButton.styleFrom(
                                        foregroundColor: BanzamiColors.wine,
                                        side:    const BorderSide(color: BanzamiColors.wine),
                                        padding: const EdgeInsets.symmetric(vertical: 12),
                                        shape:   RoundedRectangleBorder(
                                            borderRadius: BorderRadius.circular(12)),
                                        textStyle: BanzamiTextStyles.headingSm,
                                      ),
                                    ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),

            // ---- Received header ----------------------------------------
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(
                  BanzamiSpacing.lg, BanzamiSpacing.xs,
                  BanzamiSpacing.md, BanzamiSpacing.xs,
                ),
                child: Row(
                  children: [
                    const Text('Pagamentos recebidos', style: BanzamiTextStyles.headingSm),
                    const Spacer(),
                    if (widget.onViewAll != null)
                      TextButton(
                        onPressed: widget.onViewAll,
                        style: TextButton.styleFrom(
                          foregroundColor: BanzamiColors.wine,
                          padding:         EdgeInsets.zero,
                          tapTargetSize:   MaterialTapTargetSize.shrinkWrap,
                        ),
                        child: Text(
                          'Ver todos',
                          style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.wine),
                        ),
                      ),
                  ],
                ),
              ),
            ),

            // ---- Received list -------------------------------------------
            if (_loadingTransfers)
              const SliverToBoxAdapter(
                child: Padding(
                  padding: EdgeInsets.all(BanzamiSpacing.xl),
                  child: Center(
                    child: CircularProgressIndicator(color: BanzamiColors.wine),
                  ),
                ),
              )
            else if (_transferError != null && _received.isEmpty)
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.all(BanzamiSpacing.xl),
                  child: Center(
                    child: Column(mainAxisSize: MainAxisSize.min, children: [
                      const Icon(Icons.error_outline_rounded,
                          color: BanzamiColors.error, size: 36),
                      const SizedBox(height: BanzamiSpacing.sm),
                      Text(_transferError!,
                          style: BanzamiTextStyles.bodyMd
                              .copyWith(color: BanzamiColors.gray400),
                          textAlign: TextAlign.center),
                      const SizedBox(height: BanzamiSpacing.md),
                      TextButton(
                          onPressed: _loadReceived,
                          child: const Text('Tentar novamente')),
                    ]),
                  ),
                ),
              )
            else if (_received.isEmpty)
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.all(BanzamiSpacing.xl),
                  child: Center(
                    child: Text(
                      'Nenhum pagamento recebido ainda.',
                      style: BanzamiTextStyles.bodyMd
                          .copyWith(color: BanzamiColors.gray400),
                    ),
                  ),
                ),
              )
            else
              SliverList(
                delegate: SliverChildBuilderDelegate(
                  (context, i) => Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      BanzamiTransferItem(
                        transfer:          _received[i],
                        currentConsumerId: consumerId,
                      ),
                      if (i < _received.length - 1)
                        const Divider(height: 1, indent: 72),
                    ],
                  ),
                  childCount: _received.length,
                ),
              ),

            const SliverToBoxAdapter(
              child: SizedBox(height: BanzamiSpacing.page),
            ),
          ],
        ),
      ),
    );
  }
}
