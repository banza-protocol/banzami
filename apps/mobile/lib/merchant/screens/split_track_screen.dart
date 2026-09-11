import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';
import 'package:banzami_flutter/banzami_flutter.dart';

import '../../branding_assets.dart';
import '../config.dart';

/// What cancelling does, in words that stay true whatever happens to the
/// share links afterwards: only what this screen can verify is promised.
const String kSplitCancelExplanation =
    'A cobrança fica cancelada; as partes já pagas mantêm-se. Este ecrã '
    'continua a mostrar qualquer pagamento que ainda chegue.';

/// Acompanha uma cobrança dividida (BANZA ADR-036 Collection).
///
/// Mostra o total, quanto já foi pago e quanto falta; lista cada parte (share)
/// com o seu estado (Pago / Pendente); permite partilhar o link/QR de cada
/// parte; e atualiza-se sozinho enquanto a cobrança está aberta. Cada parte é um
/// objeto financeiro real do protocolo — quando alguém paga a sua parte, o
/// dinheiro entra imediatamente na carteira do comerciante e o estado reflete-o.
class SplitTrackScreen extends StatefulWidget {
  final String collectionId;
  final Collection? initialCollection;
  final List<CollectionShare>? initialShares;

  const SplitTrackScreen({
    super.key,
    required this.collectionId,
    this.initialCollection,
    this.initialShares,
  });

  @override
  State<SplitTrackScreen> createState() => _SplitTrackScreenState();
}

class _SplitTrackScreenState extends State<SplitTrackScreen> {
  Collection? _collection;
  int _collected = 0;
  int _remaining = 0;
  List<CollectionShare> _shares = [];

  // shareId → full pay URL (resolved after surfacing the share as a link).
  final Map<String, String> _payUrls = {};
  final Set<String> _surfacing = {};

  bool _loading = true;
  bool _cancelling = false;
  String? _error;
  Timer? _poll;

  @override
  void initState() {
    super.initState();
    _collection = widget.initialCollection;
    if (widget.initialShares != null) _shares = widget.initialShares!;
    _load();
    _poll = Timer.periodic(const Duration(seconds: 4), (_) => _refresh());
  }

  @override
  void dispose() {
    _poll?.cancel();
    super.dispose();
  }

  BanzamiClient get _client => context.read<BanzamiClient>();

  Future<void> _load() async {
    try {
      final detail = await _client.getCollection(widget.collectionId);
      final shares = await _client.listCollectionShares(widget.collectionId);
      if (!mounted) return;
      setState(() {
        _collection = detail.collection;
        _collected  = detail.collectedAmountMinor;
        _remaining  = detail.remainingAmountMinor;
        _shares     = shares;
        _loading    = false;
        _error      = null;
      });
      _surfacePending();
    } catch (e) {
      if (mounted) setState(() { _error = banzamiErrorMessage(e); _loading = false; });
    }
  }

  // Silent refresh used by the poller — never toggles the loading spinner.
  // It stops only once every share is paid. A CANCELLED collection keeps being
  // watched: cancelling changes the collection's status, and this screen cannot
  // know that no share link will still be paid — so a later payment shows up.
  Future<void> _refresh() async {
    final c = _collection;
    if (c != null && c.isCompleted) {
      _poll?.cancel();
      return;
    }
    try {
      final detail = await _client.getCollection(widget.collectionId);
      final shares = await _client.listCollectionShares(widget.collectionId);
      if (!mounted) return;
      setState(() {
        _collection = detail.collection;
        _collected  = detail.collectedAmountMinor;
        _remaining  = detail.remainingAmountMinor;
        _shares     = shares;
      });
      _surfacePending();
    } catch (_) {
      // Best-effort — a transient failure just waits for the next tick.
    }
  }

  // Surface every still-pending share once (as a payment link) and resolve its
  // shareable URL. Guarded so we never create a second intent for a share.
  void _surfacePending() {
    for (final s in _shares) {
      if (!s.isPending) continue;
      if (_payUrls.containsKey(s.id)) continue;
      if (s.paymentIntentId != null) continue; // already surfaced elsewhere
      if (_surfacing.contains(s.id)) continue;
      _surfacing.add(s.id);
      _ensureSurface(s.id);
    }
  }

  Future<String?> _ensureSurface(String shareId) async {
    final existing = _payUrls[shareId];
    if (existing != null) return existing;
    try {
      final surfaced = await _client.surfaceCollectionShare(shareId, surface: 'LINK');
      final ref = surfaced.surfaceRef;
      if (ref == null) return null;
      final link = await _client.getPaymentLink(ref);
      final url  = '${AppConfig.payBaseUrl}/${link.slug}';
      if (mounted) setState(() => _payUrls[shareId] = url);
      return url;
    } catch (_) {
      return null;
    } finally {
      _surfacing.remove(shareId);
    }
  }

  int get _paidCount => _shares.where((s) => s.isPaid).length;

  Future<void> _cancel() async {
    final confirmed = await showModalBottomSheet<bool>(
      context: context,
      backgroundColor: BanzamiColors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) => Padding(
        padding: const EdgeInsets.all(BanzamiSpacing.xl),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const Text('Cancelar cobrança?', style: BanzamiTextStyles.headingSm),
          const SizedBox(height: BanzamiSpacing.sm),
          Text(
            kSplitCancelExplanation,
            textAlign: TextAlign.center,
            style: BanzamiTextStyles.bodyMd.copyWith(color: BanzamiColors.gray400),
          ),
          const SizedBox(height: BanzamiSpacing.xl),
          BanzamiPrimaryButton(
            label: 'Cancelar cobrança',
            onPressed: () => Navigator.pop(ctx, true),
          ),
          const SizedBox(height: BanzamiSpacing.sm),
          BanzamiSecondaryButton(
            label: 'Voltar',
            onPressed: () => Navigator.pop(ctx, false),
          ),
        ]),
      ),
    );
    if (confirmed != true) return;
    setState(() => _cancelling = true);
    try {
      final c = await _client.cancelCollection(widget.collectionId);
      if (mounted) setState(() { _collection = c; _cancelling = false; });
      // The poll keeps running: a payment that still arrives is shown here.
    } catch (e) {
      if (mounted) {
        setState(() => _cancelling = false);
        BanzamiToast.showError(context, banzamiErrorMessage(e));
      }
    }
  }

  Future<void> _shareAll() async {
    // Every share still waiting for its money — PENDING, LINK_CREATED (the
    // poll turns a surfaced share into it) or a status we do not know yet.
    final awaiting = _shares.where((s) => s.isAwaitingPayment).toList();
    final lines = <String>[];
    for (var i = 0; i < awaiting.length; i++) {
      final s = awaiting[i];
      final url = _payUrls[s.id] ?? (s.isPending ? await _ensureSurface(s.id) : null);
      if (url != null) {
        lines.add('Pessoa ${_shares.indexOf(s) + 1}: $url');
      }
    }
    if (lines.isEmpty) {
      if (mounted) BanzamiToast.showError(context, 'Ainda a gerar os links. Tente novamente.');
      return;
    }
    final c = _collection;
    final head = c != null
        ? 'Cobrança dividida Banzami — ${formatMinor(c.totalAmountMinor, c.currency)}'
        : 'Cobrança dividida Banzami';
    await Share.share('$head\n\n${lines.join('\n')}');
  }

  @override
  Widget build(BuildContext context) {
    final c = _collection;
    return BanzamiScaffold(
      backgroundColor: BanzamiColors.white,
      appBar: BanzamiAppBar(
        title:           'Cobrança dividida',
        backgroundColor: BanzamiColors.white,
        actions: [
          if (c != null && !c.isTerminal)
            IconButton(
              icon: _cancelling
                  ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.cancel_outlined),
              tooltip: 'Cancelar cobrança',
              onPressed: _cancelling ? null : _cancel,
            ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? _ErrorState(message: _error!, onRetry: _load)
              : RefreshIndicator(onRefresh: _load, child: _content()),
    );
  }

  Widget _content() {
    final c = _collection!;
    final total = c.totalAmountMinor;
    final progress = total > 0 ? (_collected / total).clamp(0.0, 1.0) : 0.0;

    return SingleChildScrollView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(BanzamiSpacing.xl),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        // ── Summary ────────────────────────────────────────────────────────
        Text(
          _statusLabel(c.status),
          style: BanzamiTextStyles.label.copyWith(
            color: _statusColor(c.status), letterSpacing: 0.5),
        ),
        const SizedBox(height: BanzamiSpacing.xs),
        MoneyAmount(total, currency: c.currency, size: MoneySize.xl, tone: MoneyTone.brand),
        if (c.title != null) ...[
          const SizedBox(height: 2),
          Text(c.title!, style: BanzamiTextStyles.bodyMd.copyWith(color: BanzamiColors.gray400)),
        ],
        const SizedBox(height: BanzamiSpacing.lg),

        ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: LinearProgressIndicator(
            value: progress,
            minHeight: 8,
            backgroundColor: BanzamiColors.gray100,
            valueColor: const AlwaysStoppedAnimation(BanzamiColors.primary),
          ),
        ),
        const SizedBox(height: BanzamiSpacing.sm),
        Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          Text('Pago ${formatMinor(_collected, c.currency)}',
              style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.gray900)),
          Text('Falta ${formatMinor(_remaining, c.currency)}',
              style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.gray400)),
        ]),
        const SizedBox(height: 2),
        Text('$_paidCount de ${_shares.length} pagaram',
            style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.gray400)),

        const SizedBox(height: BanzamiSpacing.xl),

        // ── Shares ─────────────────────────────────────────────────────────
        for (var i = 0; i < _shares.length; i++) ...[
          ShareRow(
            index: i + 1,
            share: _shares[i],
            hasLink: _payUrls.containsKey(_shares[i].id),
            onTap: !c.isTerminal && _shares[i].isAwaitingPayment
                ? () => _openShareSheet(i)
                : null,
          ),
          const SizedBox(height: BanzamiSpacing.sm),
        ],

        const SizedBox(height: BanzamiSpacing.lg),
        if (!c.isTerminal)
          BanzamiPrimaryButton(label: 'Partilhar todos', onPressed: _shareAll),
        const SizedBox(height: BanzamiSpacing.md),
        BanzamiSecondaryButton(
          label: 'Concluir',
          onPressed: () => Navigator.of(context).popUntil((r) => r.isFirst),
        ),
      ]),
    );
  }

  Future<void> _openShareSheet(int i) async {
    final share = _shares[i];
    var url = _payUrls[share.id];
    if (url == null && !share.isPending) {
      // Surfaced before this screen opened (LINK_CREATED): the server does not
      // surface a share twice, and this screen never learnt its link.
      BanzamiToast.showInfo(context,
          'O link desta parte já foi gerado noutra sessão e não pode ser mostrado aqui.');
      return;
    }
    if (url == null) {
      BanzamiToast.showInfo(context, 'A gerar o link…');
      url = await _ensureSurface(share.id);
      if (url == null) {
        if (mounted) BanzamiToast.showError(context, 'Não foi possível gerar o link.');
        return;
      }
    }
    if (!mounted) return;
    final payUrl = url;
    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: BanzamiColors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) => Padding(
        padding: const EdgeInsets.all(BanzamiSpacing.xl),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Text('Pessoa ${i + 1}',
              style: BanzamiTextStyles.label.copyWith(color: BanzamiColors.gray400)),
          const SizedBox(height: 2),
          MoneyAmount(share.amountMinor, currency: share.currency, size: MoneySize.lg, tone: MoneyTone.brand),
          const SizedBox(height: BanzamiSpacing.lg),
          Container(
            padding: const EdgeInsets.all(BanzamiSpacing.md),
            decoration: BoxDecoration(
              color: BanzamiColors.white,
              borderRadius: BanzamiRadius.fieldAll,
              boxShadow: [
                BoxShadow(
                    color: BanzamiColors.gray400.withValues(alpha: 0.2),
                    blurRadius: 16, offset: const Offset(0, 4)),
              ],
            ),
            child: BanzamiQr(
              payload: payUrl,
              size: 200,
              logo: AssetImage(BrandingAssets.businessLogo),
            ),
          ),
          const SizedBox(height: BanzamiSpacing.lg),
          Row(children: [
            Expanded(
              child: BanzamiSecondaryButton(
                label: 'Copiar',
                onPressed: () async {
                  await Clipboard.setData(ClipboardData(text: payUrl));
                  if (ctx.mounted) BanzamiToast.showSuccess(ctx, 'Link copiado');
                },
              ),
            ),
            const SizedBox(width: BanzamiSpacing.sm),
            Expanded(
              child: BanzamiPrimaryButton(
                label: 'Partilhar',
                onPressed: () => Share.share(payUrl),
              ),
            ),
          ]),
        ]),
      ),
    );
  }

  static String _statusLabel(String s) {
    switch (s) {
      case CollectionStatus.completed:           return 'CONCLUÍDA';
      case CollectionStatus.partiallyCompleted:  return 'PARCIALMENTE PAGA';
      case CollectionStatus.cancelled:           return 'CANCELADA';
      default:                                    return 'A AGUARDAR PAGAMENTOS';
    }
  }

  static Color _statusColor(String s) {
    switch (s) {
      case CollectionStatus.completed:  return BanzamiColors.success;
      case CollectionStatus.cancelled:  return BanzamiColors.error;
      default:                          return BanzamiColors.gray400;
    }
  }
}

// =============================================================================
// One share row
// =============================================================================

class ShareRow extends StatelessWidget {
  final int index;
  final CollectionShare share;
  final bool hasLink;
  final VoidCallback? onTap;

  const ShareRow({
    super.key,
    required this.index,
    required this.share,
    required this.hasLink,
    this.onTap,
  });

  /// The share's state in words; unknown statuses read as still waiting.
  static String stateLabel(CollectionShare share) => switch (share.status) {
        ShareStatus.paid      => 'Pago',
        ShareStatus.expired   => 'Expirada',
        ShareStatus.cancelled => 'Cancelada',
        ShareStatus.failed    => 'Falhou',
        _                     => 'A aguardar pagamento',
      };

  @override
  Widget build(BuildContext context) {
    final paid = share.isPaid;
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        padding: const EdgeInsets.all(BanzamiSpacing.md),
        decoration: BoxDecoration(
          color: BanzamiColors.white,
          borderRadius: BanzamiRadius.lgAll,
          border: Border.all(
              color: paid ? BanzamiColors.success.withValues(alpha: 0.4) : BanzamiColors.gray200),
        ),
        child: Row(children: [
          Container(
            width: 36, height: 36,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: (paid ? BanzamiColors.success : BanzamiColors.primary)
                  .withValues(alpha: 0.10),
              shape: BoxShape.circle,
            ),
            child: paid
                ? const Icon(Icons.check_rounded, size: 20, color: BanzamiColors.success)
                : Text('$index',
                    style: BanzamiTextStyles.label.copyWith(
                        color: BanzamiColors.primary, fontWeight: FontWeight.w700)),
          ),
          const SizedBox(width: BanzamiSpacing.sm),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Pessoa $index', style: BanzamiTextStyles.bodyMd),
              const SizedBox(height: 2),
              MoneyAmount(share.amountMinor, currency: share.currency,
                  size: MoneySize.md, tone: paid ? MoneyTone.success : MoneyTone.brand),
              const SizedBox(height: 4),
              Row(mainAxisSize: MainAxisSize.min, children: [
                Icon(paid ? Icons.check_circle_rounded : Icons.schedule_rounded,
                    size: 13,
                    color: paid ? BanzamiColors.success : BanzamiColors.gray400),
                const SizedBox(width: 4),
                Text(stateLabel(share),
                    style: BanzamiTextStyles.bodySm.copyWith(
                        color: paid ? BanzamiColors.success : BanzamiColors.gray400)),
              ]),
            ]),
          ),
          if (onTap != null)
            Icon(hasLink ? Icons.qr_code_rounded : Icons.hourglass_empty_rounded,
                size: 22, color: BanzamiColors.primary),
        ]),
      ),
    );
  }
}

// =============================================================================
// Error state
// =============================================================================

class _ErrorState extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;
  const _ErrorState({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(BanzamiSpacing.xl),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const Icon(Icons.error_outline_rounded, color: BanzamiColors.error, size: 40),
          const SizedBox(height: BanzamiSpacing.md),
          Text(message, textAlign: TextAlign.center, style: BanzamiTextStyles.bodyMd),
          const SizedBox(height: BanzamiSpacing.lg),
          BanzamiSecondaryButton(label: 'Tentar novamente', onPressed: onRetry),
        ]),
      ),
    );
  }
}
