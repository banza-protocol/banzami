import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
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

/// Bottom-nav "Receber" hub: QR card at top + received transactions list below.
class ReceiveHubScreen extends StatefulWidget {
  final VoidCallback? onViewAll;

  const ReceiveHubScreen({super.key, this.onViewAll});

  @override
  State<ReceiveHubScreen> createState() => _ReceiveHubScreenState();
}

class _ReceiveHubScreenState extends State<ReceiveHubScreen> {
  ConsumerPayLink? _activeLink;

  List<ActivityItem> _received         = [];
  bool               _loadingTransfers = false;
  String?            _transferError;

  final _shareLinkKey = GlobalKey();

  @override
  void initState() {
    super.initState();
    _loadReceived();
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
      BanzamiToast.showSuccess(context, 'Endereço copiado');
    }
  }

  Future<void> _showAmountSheet() async {
    final client = context.read<ConsumerPublicClient>();
    final link = await showModalBottomSheet<ConsumerPayLink>(
      context:            context,
      isScrollControlled: true,
      backgroundColor:    BanzamiColors.white,
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
        BanzamiToast.showError(context, 'Erro ao partilhar: $e');
      }
    }
  }

  Future<void> _openShareModal(Session session) async {
    final handle = session.handle;
    await showP2PShareModal(
      context,
      handle:      handle,
      displayName: session.displayName,
      qrPayload:   _qrPayload(handle),
      shareUrl:    _shareUrl(handle),
      amountMinor: _activeLink?.amountMinor,
      currency:    _activeLink?.currency,
      note:        _activeLink?.note,
      isSandbox:         AppConfig.isSandbox,
      logoWidget:        BanzamiLogoWidget(assetPath: BrandingAssets.icon, size: 20),
      embeddedLogoImage: AssetImage(BrandingAssets.icon),
    );
  }

  @override
  Widget build(BuildContext context) {
    final session = context.read<SessionService>().session!;
    final handle  = session.handle;

    return Scaffold(
      backgroundColor: BanzamiColors.offWhite,
      body: SafeArea(
        child: RefreshIndicator(
          color:     BanzamiColors.primary,
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
                    color:   BanzamiColors.gray400,
                    tooltip: 'Actualizar',
                    onPressed: _loadReceived,
                  ),
                ),
              ),

              // ── QR card ────────────────────────────────────────────────
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(
                    BanzamiSpacing.xl, 0, BanzamiSpacing.xl, BanzamiSpacing.sm,
                  ),
                child: BanzamiCard(
                  shadow: BanzamiShadows.cardElevated,
                  padding: EdgeInsets.zero,
                  child: Column(
                    children: [
                      // QR area
                      Padding(
                        padding: const EdgeInsets.fromLTRB(
                          BanzamiSpacing.xl, BanzamiSpacing.lg,
                          BanzamiSpacing.xl, BanzamiSpacing.sm,
                        ),
                        child: Column(
                          children: [
                            BanzamiQrDisplay(
                              payload:       _qrPayload(handle),
                              amountLabel:   (_activeLink?.amountMinor != null)
                                  ? formatMinor(_activeLink!.amountMinor!, _activeLink!.currency)
                                  : null,
                              size:          190,
                              embeddedImage: AssetImage(BrandingAssets.icon),
                            ),
                            if (_activeLink?.note != null &&
                                _activeLink!.note!.trim().isNotEmpty) ...[
                              const SizedBox(height: BanzamiSpacing.xs),
                              Text(
                                '"${_activeLink!.note!.trim()}"',
                                style: BanzamiTextStyles.bodyMd.copyWith(
                                  fontWeight: FontWeight.w500,
                                  fontStyle:  FontStyle.italic,
                                  color:      BanzamiColors.gray700,
                                  height:     1.2,
                                ),
                                textAlign: TextAlign.center,
                                maxLines:  2,
                                overflow:  TextOverflow.ellipsis,
                              ),
                            ],
                            if (AppConfig.isSandbox) ...[
                              const SizedBox(height: BanzamiSpacing.xs),
                              const SandboxBadge(),
                            ],
                            const SizedBox(height: BanzamiSpacing.sm),

                            // Handle pill
                            GestureDetector(
                              onTap: () => _copyHandle(handle),
                              child: Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: BanzamiSpacing.lg,
                                  vertical:   BanzamiSpacing.sm,
                                ),
                                decoration: const BoxDecoration(
                                  color:        BanzamiColors.gray100,
                                  borderRadius: BanzamiRadius.fullAll,
                                ),
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Text(
                                      '@$handle',
                                      style: BanzamiTextStyles.mono.copyWith(
                                        fontSize:   15,
                                        fontWeight: FontWeight.w600,
                                        color:      BanzamiColors.gray900,
                                      ),
                                    ),
                                    const SizedBox(width: BanzamiSpacing.sm),
                                    const Icon(
                                      Icons.copy_rounded,
                                      size:  14,
                                      color: BanzamiColors.gray400,
                                    ),
                                  ],
                                ),
                              ),
                            ),
                            const SizedBox(height: BanzamiSpacing.xs),
                            Text(
                              AppConfig.isSandbox
                                  ? 'QR de teste · Sem valor financeiro real'
                                  : 'Mostre este QR para receber pagamentos',
                              style: BanzamiTextStyles.bodySm.copyWith(
                                color: AppConfig.isSandbox
                                    ? const Color(0xFFB45309)
                                    : BanzamiColors.gray400,
                              ),
                            ),
                          ],
                        ),
                      ),

                      const Divider(height: 1, color: BanzamiColors.gray100),

                      // Action buttons
                      Padding(
                        padding: const EdgeInsets.fromLTRB(
                          BanzamiSpacing.lg, BanzamiSpacing.sm,
                          BanzamiSpacing.lg, BanzamiSpacing.lg,
                        ),
                        child: Column(
                          children: [
                            BanzamiPrimaryButton(
                              key:       _shareLinkKey,
                              label:     'Partilhar link',
                              icon:      Icons.link_rounded,
                              onPressed: () => _shareLink(handle),
                            ),
                            const SizedBox(height: BanzamiSpacing.sm),
                            Row(children: [
                              Expanded(
                                child: BanzamiSecondaryButton(
                                  label:     _activeLink != null
                                      ? 'Partilhar pedido'
                                      : 'Partilhar QR',
                                  onPressed: () => _openShareModal(session),
                                ),
                              ),
                              const SizedBox(width: BanzamiSpacing.sm),
                              Expanded(
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
                  BanzamiSpacing.xl, BanzamiSpacing.lg,
                  BanzamiSpacing.xl, BanzamiSpacing.sm,
                ),
                child: Row(
                  children: [
                    Text(
                      'Pagamentos recebidos',
                      style: BanzamiTextStyles.headingSm.copyWith(fontWeight: FontWeight.w700),
                    ),
                    const Spacer(),
                    if (widget.onViewAll != null)
                      GestureDetector(
                        onTap: widget.onViewAll,
                        child: Text(
                          'Ver todos',
                          style: BanzamiTextStyles.label.copyWith(
                            color:   BanzamiColors.primary,
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
                  padding: EdgeInsets.all(BanzamiSpacing.xl),
                  child: Center(child: CircularProgressIndicator(color: BanzamiColors.primary)),
                ),
              )
            else if (_transferError != null && _received.isEmpty)
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.all(BanzamiSpacing.xl),
                  child: Center(
                    child: Column(mainAxisSize: MainAxisSize.min, children: [
                      const Icon(Icons.error_outline_rounded, color: BanzamiColors.error, size: 36),
                      const SizedBox(height: BanzamiSpacing.sm),
                      Text(_transferError!,
                          style: BanzamiTextStyles.bodyMd.copyWith(color: BanzamiColors.gray400),
                          textAlign: TextAlign.center),
                      const SizedBox(height: BanzamiSpacing.md),
                      TextButton(onPressed: _loadReceived, child: const Text('Tentar novamente')),
                    ]),
                  ),
                ),
              )
            else if (_received.isEmpty)
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: BanzamiSpacing.xl,
                  ),
                  child: BanzamiCard(
                    padding: const EdgeInsets.all(BanzamiSpacing.xl),
                    child: Center(
                      child: Column(mainAxisSize: MainAxisSize.min, children: [
                        Container(
                          width:  52,
                          height: 52,
                          decoration: const BoxDecoration(
                            color: BanzamiColors.gray100,
                            shape: BoxShape.circle,
                          ),
                          child: const Icon(
                            Icons.qr_code_rounded,
                            size:  24,
                            color: BanzamiColors.gray400,
                          ),
                        ),
                        const SizedBox(height: BanzamiSpacing.md),
                        const Text('Nenhum pagamento recebido', style: BanzamiTextStyles.headingSm),
                        const SizedBox(height: BanzamiSpacing.xs),
                        Text(
                          'Partilhe o seu QR ou link para receber',
                          style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.gray400),
                          textAlign: TextAlign.center,
                        ),
                      ]),
                    ),
                  ),
                ),
              )
            else
              SliverPadding(
                padding: const EdgeInsets.symmetric(horizontal: BanzamiSpacing.xl),
                sliver: SliverToBoxAdapter(
                  child: BanzamiCard(
                    padding: EdgeInsets.zero,
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        for (int i = 0; i < _received.length; i++) ...[
                          BanzamiTransferItem(item: _received[i]),
                          if (i < _received.length - 1)
                            const Divider(height: 1, indent: 68, color: BanzamiColors.gray100),
                        ],
                      ],
                    ),
                  ),
                ),
              ),

            const SliverToBoxAdapter(child: SizedBox(height: BanzamiSpacing.page)),
          ],
          ),
        ),
      ),
    );
  }
}
