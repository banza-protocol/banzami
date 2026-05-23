import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:share_plus/share_plus.dart';
import 'package:banza_flutter/banza_flutter.dart';

import '../branding_assets.dart';
import '../config.dart';
import '../services/session_service.dart';
import '../widgets/sandbox_banner.dart';
import '../widgets/tab_screen_header.dart';

// ---------------------------------------------------------------------------
// Bottom-sheet widget — collects amount + optional note, calls API, pops link
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
        BanzaSpacing.xl, BanzaSpacing.xl, BanzaSpacing.xl,
        MediaQuery.viewInsetsOf(context).bottom + BanzaSpacing.xl,
      ),
      child: Column(
        mainAxisSize:       MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Montante a cobrar', style: BanzaTextStyles.headingSm),
          const SizedBox(height: BanzaSpacing.md),
          BanzaAmountInput(onChanged: (v) => _amount = v),
          const SizedBox(height: BanzaSpacing.md),
          BanzaTextField(
            label:           'Descrição (opcional)',
            hint:            'Ex: jantar de ontem',
            textInputAction: TextInputAction.done,
            onChanged:       (v) => _note = v,
          ),
          if (_error != null) ...[
            const SizedBox(height: BanzaSpacing.sm),
            Text(_error!, style: BanzaTextStyles.bodySm.copyWith(color: BanzaColors.error)),
          ],
          const SizedBox(height: BanzaSpacing.lg),
          Row(children: [
            Expanded(
              child: BanzaSecondaryButton(
                label:     'Cancelar',
                onPressed: _loading ? null : () => Navigator.pop(context),
              ),
            ),
            const SizedBox(width: BanzaSpacing.sm),
            Expanded(
              child: BanzaPrimaryButton(
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

/// Bottom-nav "Receber" hub: QR card at top + received transactions list below.
class ReceiveHubScreen extends StatefulWidget {
  final VoidCallback? onViewAll;

  const ReceiveHubScreen({super.key, this.onViewAll});

  @override
  State<ReceiveHubScreen> createState() => _ReceiveHubScreenState();
}

class _ReceiveHubScreenState extends State<ReceiveHubScreen> {
  bool             _sharing    = false;
  ui.Image?        _logoUiImage;
  ConsumerPayLink? _activeLink;

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
    final data  = await rootBundle.load(BrandingAssets.icon);
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
      if (mounted) {
        setState(() {
          _transferError    = 'Não foi possível carregar os pagamentos.';
          _loadingTransfers = false;
        });
      }
    }
  }

  String _qrPayload(String handle) {
    if (_activeLink != null) {
      final scheme = AppConfig.isSandbox ? 'banza-sandbox' : 'banza';
      return '$scheme://pay?request=${_activeLink!.linkCode}';
    }
    // Sandbox QR uses a distinct scheme so it cannot be scanned as live payment.
    final scheme = AppConfig.isSandbox ? 'banza-sandbox' : 'banza';
    return '$scheme:@$handle';
  }

  String _shareUrl(String handle) {
    if (_activeLink != null) {
      final base = 'https://pay.banzami.org/r/${_activeLink!.linkCode}';
      return AppConfig.isSandbox ? '$base?sandbox=1' : base;
    }
    final base = 'https://pay.banzami.org/u/$handle';
    return AppConfig.isSandbox ? '$base?sandbox=1' : base;
  }

  void _clearAmount() => setState(() { _activeLink = null; });

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
    final client = context.read<ConsumerPublicClient>();
    final link = await showModalBottomSheet<ConsumerPayLink>(
      context:            context,
      isScrollControlled: true,
      backgroundColor:    BanzaColors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (_) => _AmountNoteSheet(client: client),
    );
    if (link != null && mounted) setState(() => _activeLink = link);
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
      body: SafeArea(
        child: RefreshIndicator(
          color:     BanzaColors.wine,
          onRefresh: _loadReceived,
          child: CustomScrollView(
            slivers: [

              // ── Header ──────────────────────────────────────────────────
              SliverToBoxAdapter(
                child: TabScreenHeader(
                  title:    'Receber',
                  subtitle: 'QR Code e ligação de pagamento',
                  trailing: IconButton(
                    icon:    const Icon(Icons.refresh_rounded, size: 20),
                    color:   BanzaColors.gray400,
                    tooltip: 'Actualizar',
                    onPressed: _loadReceived,
                  ),
                ),
              ),

              // ── QR card ────────────────────────────────────────────────
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(
                    BanzaSpacing.xl, 0, BanzaSpacing.xl, BanzaSpacing.sm,
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
                              amountLabel:   (_activeLink?.amountMinor != null)
                                  ? formatMinor(_activeLink!.amountMinor!, _activeLink!.currency)
                                  : null,
                              size:          190,
                              embeddedImage: AssetImage(BrandingAssets.icon),
                            ),
                            if (_activeLink?.note != null &&
                                _activeLink!.note!.trim().isNotEmpty) ...[
                              const SizedBox(height: BanzaSpacing.md),
                              Text(
                                '"${_activeLink!.note!.trim()}"',
                                style: BanzaTextStyles.bodyMd.copyWith(
                                  fontWeight: FontWeight.w500,
                                  fontStyle:  FontStyle.italic,
                                  color:      BanzaColors.gray700,
                                ),
                                textAlign: TextAlign.center,
                                maxLines:  2,
                                overflow:  TextOverflow.ellipsis,
                              ),
                            ],
                            if (AppConfig.isSandbox) ...[
                              const SizedBox(height: BanzaSpacing.sm),
                              const SandboxBadge(),
                            ],
                            const SizedBox(height: BanzaSpacing.lg),

                            // Handle pill
                            GestureDetector(
                              onTap: () => _copyHandle(handle),
                              child: Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: BanzaSpacing.lg,
                                  vertical:   BanzaSpacing.sm,
                                ),
                                decoration: const BoxDecoration(
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
                              AppConfig.isSandbox
                                  ? 'QR de teste · Sem valor financeiro real'
                                  : 'Mostre este QR para receber pagamentos',
                              style: BanzaTextStyles.bodySm.copyWith(
                                color: AppConfig.isSandbox
                                    ? const Color(0xFFB45309)
                                    : BanzaColors.gray400,
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
                                child: _activeLink != null
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
                    horizontal: BanzaSpacing.xl,
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
                padding: const EdgeInsets.symmetric(horizontal: BanzaSpacing.xl),
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
      ),
    );
  }
}
