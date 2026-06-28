import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:share_plus/share_plus.dart';
import 'package:banzami_flutter/banzami_flutter.dart';

import '../../branding_assets.dart';
import '../config.dart';
import '../services/merchant_session_service.dart';

/// Cria uma cobrança (link de pagamento) e exibe o QR + link para partilhar.
///
/// Dois modos:
///  • Simples   — uma cobrança, um QR/link (comportamento original).
///  • Dividida  — o valor total é dividido igualmente por N pessoas e geramos
///                N links de pagamento independentes (um por pessoa). Não há
///                agrupamento persistido no backend — cada link é uma cobrança
///                normal; o "grupo" é apenas visual nesta app. Nenhum movimento
///                financeiro acontece até cada pessoa pagar o seu link.
///
/// ⚠ PRÉ-PROTOCOLAR: o modo "Dividida" antecipa o conceito BANZA Collections
/// (BANZA ADR-036, *Proposed*) e NÃO é uma feature oficial — está atrás de
/// `AppConfig.splitChargeEnabled` (disabled por default). Por BANZA ADR-035
/// (protocol-first) um conceito estrutural nasce no protocolo e desce
/// protocolo → operador → SDK → app. Classificação operador: Banzami ADR-019.
class ChargeScreen extends StatefulWidget {
  const ChargeScreen({super.key});

  @override
  State<ChargeScreen> createState() => _ChargeScreenState();
}

class _ChargeScreenState extends State<ChargeScreen> {
  final _formKey        = GlobalKey<FormState>();
  final _shareButtonKey = GlobalKey();
  final _amountCtrl     = TextEditingController();
  final _descCtrl       = TextEditingController();

  // Charge type — false = simple (one link), true = split (N links).
  bool _split  = false;
  int  _people = 2;

  static const int _kMinPeople = 2;
  static const int _kMaxPeople = 20;

  bool         _creating = false;
  bool         _sharing  = false;
  String?      _error;
  PaymentLink? _link;          // simple result
  List<PaymentLink>? _splitLinks; // split result
  ui.Image?    _logoUiImage;

  @override
  void initState() {
    super.initState();
    _loadLogo();
    _amountCtrl.addListener(() => setState(() {})); // live per-person preview
  }

  @override
  void dispose() {
    _amountCtrl.dispose();
    _descCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadLogo() async {
    final data  = await rootBundle.load(BrandingAssets.businessLogo);
    final codec = await ui.instantiateImageCodec(
      data.buffer.asUint8List(),
      targetWidth:  160,
      targetHeight: 160,
    );
    final frame    = await codec.getNextFrame();
    final composed = await composeQrCenterLogo(frame.image);
    if (mounted) setState(() => _logoUiImage = composed);
  }

  // Converts a user-typed Kz string (e.g. "250" or "250,50") to minor units
  // (cêntimos). Accepts comma or period as decimal separator but NOT as
  // thousands separator — "2.500" is rejected to avoid 1000× mistakes.
  // Returns null if the input is invalid.
  static int? _parseKzToMinor(String raw) {
    // Normalise decimal separator, then reject anything with > 1 separator
    final normalised = raw.replaceAll(',', '.');
    if (normalised.split('.').length > 2) return null;    // multiple separators
    final value = double.tryParse(normalised);
    if (value == null || value <= 0) return null;
    const int maxKz = 10000000; // 10 million Kz sanity cap
    if (value > maxKz) return null;
    return (value * 100).round();
  }

  // ── Split maths ────────────────────────────────────────────────────────────
  // All in integer minor units — never any silent rounding.

  /// Parsed total in minor units, or null when the amount field is empty/invalid.
  int? get _totalMinor {
    final raw = _amountCtrl.text.trim();
    return raw.isEmpty ? null : _parseKzToMinor(raw);
  }

  /// True when the total divides equally by the number of people.
  bool get _splitDivisible {
    final t = _totalMinor;
    return t != null && _people >= _kMinPeople && t % _people == 0;
  }

  /// Amount each person pays, or null when not evenly divisible.
  int? get _perPersonMinor {
    if (!_splitDivisible) return null;
    return _totalMinor! ~/ _people;
  }

  // ── Simple charge ────────────────────────────────────────────────────────────

  Future<void> _create() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() { _creating = true; _error = null; });

    final session = context.read<MerchantSessionService>().session!;
    final client  = context.read<BanzamiClient>();

    // Parse Kz input → minor units (centimos). Reject comma/period as
    // thousands separator — only accept a single decimal part.
    final raw = _amountCtrl.text.trim();
    final int? amountMinor = raw.isEmpty
        ? null
        : _parseKzToMinor(raw);

    try {
      final link = await client.createPaymentLink(
        merchantId:  session.merchantId,
        walletId:    session.walletId,
        amountMinor: amountMinor,
        description: _descCtrl.text.trim().isEmpty ? null : _descCtrl.text.trim(),
      );
      setState(() => _link = link);
    } on BanzamiApiException catch (e) {
      setState(() => _error = e.message);
    } on BanzamiNetworkException {
      setState(() => _error = 'Sem ligação. Verifique a sua rede.');
    } catch (_) {
      setState(() => _error = 'Não foi possível criar a cobrança.');
    } finally {
      if (mounted) setState(() => _creating = false);
    }
  }

  // ── Split charge ─────────────────────────────────────────────────────────────

  Future<void> _createSplit() async {
    final per = _perPersonMinor;
    if (per == null) return; // guarded by button state, defensive here
    setState(() { _creating = true; _error = null; });

    final session = context.read<MerchantSessionService>().session!;
    final client  = context.read<BanzamiClient>();
    final desc    = _descCtrl.text.trim().isEmpty ? null : _descCtrl.text.trim();

    // N independent payment links — same amount + description, one per person.
    // Sequential so a failure stops cleanly and we can report it; each link is
    // a plain intent (no money moves until the payer pays).
    try {
      final links = <PaymentLink>[];
      for (var i = 0; i < _people; i++) {
        links.add(await client.createPaymentLink(
          merchantId:  session.merchantId,
          walletId:    session.walletId,
          amountMinor: per,
          description: desc,
        ));
      }
      setState(() => _splitLinks = links);
    } on BanzamiApiException catch (e) {
      setState(() => _error = e.message);
    } on BanzamiNetworkException {
      setState(() => _error = 'Sem ligação. Verifique a sua rede.');
    } catch (_) {
      setState(() => _error = 'Não foi possível criar a cobrança dividida.');
    } finally {
      if (mounted) setState(() => _creating = false);
    }
  }

  // ── Sharing ──────────────────────────────────────────────────────────────────

  String _urlFor(PaymentLink link) => '${AppConfig.payBaseUrl}/${link.slug}';
  String get _payUrl => '${AppConfig.payBaseUrl}/${_link?.slug ?? ''}';

  Future<void> _shareLink(PaymentLink link) async {
    if (_sharing) return;
    setState(() => _sharing = true);
    try {
      final subject = link.amountMinor != null
          ? 'Pagamento Banzami — ${formatMinor(link.amountMinor!, link.currency)}'
          : 'Pagamento Banzami';
      final box    = _shareButtonKey.currentContext?.findRenderObject() as RenderBox?;
      final origin = box != null ? box.localToGlobal(Offset.zero) & box.size : null;
      await Share.share(_payUrl, subject: subject, sharePositionOrigin: origin);
    } catch (e) {
      if (mounted) {
        BanzamiToast.showError(context, 'Erro ao partilhar: $e');
      }
    } finally {
      if (mounted) setState(() => _sharing = false);
    }
  }

  Future<void> _shareSplitLink(PaymentLink link, Rect? origin) async {
    try {
      final subject = 'Pagamento Banzami — ${formatMinor(link.amountMinor!, link.currency)}';
      await Share.share(_urlFor(link), subject: subject, sharePositionOrigin: origin);
    } catch (e) {
      if (mounted) BanzamiToast.showError(context, 'Erro ao partilhar: $e');
    }
  }

  Future<void> _shareAll(Rect? origin) async {
    final links = _splitLinks;
    if (links == null || _sharing) return;
    setState(() => _sharing = true);
    try {
      final lines = [
        for (var i = 0; i < links.length; i++)
          'Pessoa ${i + 1}: ${_urlFor(links[i])}',
      ].join('\n');
      final per = links.first.amountMinor;
      final head = per != null
          ? 'Cobrança dividida Banzami — ${formatMinor(per, links.first.currency)} por pessoa'
          : 'Cobrança dividida Banzami';
      await Share.share('$head\n\n$lines', sharePositionOrigin: origin);
    } catch (e) {
      if (mounted) BanzamiToast.showError(context, 'Erro ao partilhar: $e');
    } finally {
      if (mounted) setState(() => _sharing = false);
    }
  }

  void _reset() => setState(() {
        _link       = null;
        _splitLinks = null;
        _error      = null;
        _amountCtrl.clear();
        _descCtrl.clear();
        _people = _kMinPeople;
        _split  = false;
      });

  @override
  Widget build(BuildContext context) {
    final Widget body;
    if (_link != null) {
      body = _buildResult();
    } else if (_splitLinks != null) {
      body = _buildSplitResult();
    } else {
      body = _buildForm();
    }

    return BanzamiScaffold(
      backgroundColor: BanzamiColors.white,
      appBar: const BanzamiAppBar(
        title:           'Nova cobrança',
        backgroundColor: BanzamiColors.white,
      ),
      body: body,
    );
  }

  // ---------------------------------------------------------------------------
  // Formulário
  // ---------------------------------------------------------------------------

  Widget _buildForm() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(BanzamiSpacing.xl),
      child: Form(
        key: _formKey,
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          // ── Type toggle ──────────────────────────────────────────────────
          // Pre-protocol: the split mode only appears when explicitly enabled.
          // When disabled, the toggle is hidden and the screen is the original
          // simple charge (no way to set _split = true). See Banzami ADR-019.
          if (AppConfig.splitChargeEnabled) ...[
            _ChargeTypeToggle(
              split: _split,
              onChanged: (v) => setState(() { _split = v; _error = null; }),
            ),
            const SizedBox(height: BanzamiSpacing.xl),
          ],

          Text(
            _split ? 'Cobrança dividida' : 'Detalhes da cobrança',
            style: BanzamiTextStyles.headingSm,
          ),
          const SizedBox(height: BanzamiSpacing.xl),

          TextFormField(
            controller:  _amountCtrl,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9,.]'))],
            decoration: InputDecoration(
              labelText:  _split ? 'Valor total em Kz (ex: 30000)' : 'Valor em Kz (ex: 250)',
              hintText:   _split ? null : 'Deixe em branco para valor livre',
              prefixIcon: const Icon(Icons.payments_outlined),
              suffixText: 'Kz',
            ),
            validator: (v) {
              if (v == null || v.trim().isEmpty) {
                // Total is required for split; free amount is allowed for simple.
                return _split ? 'Indique o valor total' : null;
              }
              if (_parseKzToMinor(v.trim()) == null) {
                return 'Valor inválido. Insira o montante em Kz (ex: 250)';
              }
              return null;
            },
          ),
          const SizedBox(height: BanzamiSpacing.lg),

          if (_split) ..._buildSplitFields(),

          TextFormField(
            controller:  _descCtrl,
            maxLength:   120,
            decoration: const InputDecoration(
              labelText:  'Descrição (opcional)',
              hintText:   'Ex: Produto, serviço, referência…',
              prefixIcon: Icon(Icons.notes_rounded),
            ),
          ),

          if (_error != null) ...[
            const SizedBox(height: BanzamiSpacing.lg),
            _ErrorBox(message: _error!),
          ],

          const SizedBox(height: BanzamiSpacing.xxl),

          SizedBox(
            width: double.infinity,
            child: BanzamiPrimaryButton(
              label:     _split ? 'Gerar cobrança dividida' : 'Gerar cobrança',
              onPressed: _creating
                  ? null
                  : (_split ? (_splitDivisible ? _createSplit : null) : _create),
              isLoading: _creating,
            ),
          ),
        ]),
      ),
    );
  }

  // Split-only fields: people stepper + per-person preview + helper copy.
  List<Widget> _buildSplitFields() {
    final total       = _totalMinor;
    final per         = _perPersonMinor;
    final indivisible = total != null && _people >= _kMinPeople && per == null;

    return [
      // People stepper
      Container(
        padding: const EdgeInsets.symmetric(
          horizontal: BanzamiSpacing.lg, vertical: BanzamiSpacing.sm),
        decoration: BoxDecoration(
          color:        BanzamiColors.offWhite,
          borderRadius: BanzamiRadius.lgAll,
          border:       Border.all(color: BanzamiColors.gray200),
        ),
        child: Row(children: [
          const Icon(Icons.group_outlined, color: BanzamiColors.gray400, size: 20),
          const SizedBox(width: BanzamiSpacing.sm),
          const Expanded(
            child: Text('Número de pessoas', style: BanzamiTextStyles.bodyMd),
          ),
          _StepButton(
            icon:    Icons.remove_rounded,
            onTap:   _people > _kMinPeople
                ? () => setState(() => _people--)
                : null,
          ),
          SizedBox(
            width: 36,
            child: Text(
              '$_people',
              textAlign: TextAlign.center,
              style: BanzamiTextStyles.headingSm,
            ),
          ),
          _StepButton(
            icon:    Icons.add_rounded,
            onTap:   _people < _kMaxPeople
                ? () => setState(() => _people++)
                : null,
          ),
        ]),
      ),
      const SizedBox(height: BanzamiSpacing.lg),

      // Per-person preview / divisibility error
      if (per != null)
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(BanzamiSpacing.lg),
          decoration: BoxDecoration(
            color:        BanzamiColors.primary.withValues(alpha: 0.06),
            borderRadius: BanzamiRadius.lgAll,
          ),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Valor por pessoa',
                style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.gray400)),
            const SizedBox(height: 2),
            Text(
              formatMinor(per, 'AOA'),
              style: BanzamiTextStyles.headingMd.copyWith(
                color: BanzamiColors.primary, fontWeight: FontWeight.w700),
            ),
          ]),
        )
      else if (indivisible)
        const _ErrorBox(
          message:
              'Este valor não pode ser dividido igualmente. Ajuste o valor ou o número de pessoas.',
        ),

      const SizedBox(height: BanzamiSpacing.md),
      Text(
        'Este valor será dividido igualmente. Cada pessoa recebe o seu próprio '
        'link de pagamento. O pagamento só é confirmado quando cada pessoa pagar.',
        style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.gray400),
      ),
      const SizedBox(height: BanzamiSpacing.lg),
    ];
  }

  // ---------------------------------------------------------------------------
  // Resultado — cobrança simples (QR + link)
  // ---------------------------------------------------------------------------

  Widget _buildResult() {
    final link    = _link!;
    final session = context.read<MerchantSessionService>().session!;
    return SingleChildScrollView(
      padding: const EdgeInsets.all(BanzamiSpacing.xl),
      child: Column(children: [
        const SizedBox(height: BanzamiSpacing.lg),

        Text(
          session.merchantName,
          style: BanzamiTextStyles.label.copyWith(
            color:          BanzamiColors.gray400,
            letterSpacing:  0.5,
          ),
        ),
        const SizedBox(height: BanzamiSpacing.xs),

        if (link.amountMinor != null)
          Text(
            formatMinor(link.amountMinor!, link.currency),
            style: BanzamiTextStyles.displayLg.copyWith(
              color:      BanzamiColors.primary,
              fontWeight: FontWeight.w700,
            ),
          ),
        if (link.description != null) ...[
          const SizedBox(height: 4),
          Text(link.description!,
              style: BanzamiTextStyles.bodyMd.copyWith(color: BanzamiColors.gray400)),
        ],

        const SizedBox(height: BanzamiSpacing.xl),

        // QR code
        Container(
          padding:     const EdgeInsets.all(BanzamiSpacing.lg),
          decoration:  BoxDecoration(
            color:        BanzamiColors.white,
            borderRadius: BanzamiRadius.fieldAll,
            boxShadow: [
              BoxShadow(
                color:       BanzamiColors.gray400.withValues(alpha: 0.2),
                blurRadius:  16,
                offset:      const Offset(0, 4),
              ),
            ],
          ),
          child: CustomPaint(
            size: const Size(220, 220),
            painter: QrPainter(
              data:                 _payUrl,
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
                  ? const QrEmbeddedImageStyle(
                      size: Size(220 * kQrEmbeddedBoxFraction, 220 * kQrEmbeddedBoxFraction))
                  : null,
            ),
          ),
        ),

        const SizedBox(height: BanzamiSpacing.xl),

        // Partilhar
        SizedBox(
          width: double.infinity,
          child: BanzamiPrimaryButton(
            key:       _shareButtonKey,
            label:     'Partilhar link',
            isLoading: _sharing,
            onPressed: _sharing ? null : () => _shareLink(link),
          ),
        ),
        const SizedBox(height: BanzamiSpacing.md),

        // Nova cobrança
        BanzamiSecondaryButton(
          label:     'Nova cobrança',
          onPressed: _reset,
        ),
      ]),
    );
  }

  // ---------------------------------------------------------------------------
  // Resultado — cobrança dividida (lista de links)
  // ---------------------------------------------------------------------------

  Widget _buildSplitResult() {
    final links   = _splitLinks!;
    final session = context.read<MerchantSessionService>().session!;
    final per     = links.first.amountMinor;
    final total   = per != null ? per * links.length : null;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(BanzamiSpacing.xl),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        const SizedBox(height: BanzamiSpacing.sm),
        Center(
          child: Text(
            session.merchantName,
            style: BanzamiTextStyles.label.copyWith(
              color: BanzamiColors.gray400, letterSpacing: 0.5),
          ),
        ),
        const SizedBox(height: BanzamiSpacing.xs),
        if (total != null)
          Center(
            child: Text(
              formatMinor(total, links.first.currency),
              style: BanzamiTextStyles.displayMd.copyWith(
                color: BanzamiColors.primary, fontWeight: FontWeight.w700),
            ),
          ),
        Center(
          child: Text(
            'dividido por ${links.length} pessoas'
            '${per != null ? ' · ${formatMinor(per, links.first.currency)} cada' : ''}',
            style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.gray400),
          ),
        ),
        const SizedBox(height: BanzamiSpacing.xl),

        for (var i = 0; i < links.length; i++) ...[
          _SplitLinkRow(
            index:  i + 1,
            link:   links[i],
            onShare: (origin) => _shareSplitLink(links[i], origin),
          ),
          const SizedBox(height: BanzamiSpacing.sm),
        ],

        const SizedBox(height: BanzamiSpacing.lg),

        Builder(builder: (ctx) {
          return BanzamiPrimaryButton(
            label:     'Partilhar todos',
            isLoading: _sharing,
            onPressed: _sharing
                ? null
                : () {
                    final box = ctx.findRenderObject() as RenderBox?;
                    final origin = box != null
                        ? box.localToGlobal(Offset.zero) & box.size
                        : null;
                    _shareAll(origin);
                  },
          );
        }),
        const SizedBox(height: BanzamiSpacing.md),
        BanzamiSecondaryButton(
          label:     'Nova cobrança',
          onPressed: _reset,
        ),
      ]),
    );
  }
}

// =============================================================================
// Charge-type segmented toggle (Simples / Dividida) — built from existing tokens
// =============================================================================

class _ChargeTypeToggle extends StatelessWidget {
  final bool split;
  final ValueChanged<bool> onChanged;

  const _ChargeTypeToggle({required this.split, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color:        BanzamiColors.offWhite,
        borderRadius: BanzamiRadius.xlAll,
        border:       Border.all(color: BanzamiColors.gray200),
      ),
      child: Row(children: [
        _segment(label: 'Simples',  selected: !split, onTap: () => onChanged(false)),
        _segment(label: 'Dividida', selected: split,  onTap: () => onChanged(true)),
      ]),
    );
  }

  Widget _segment({
    required String label,
    required bool selected,
    required VoidCallback onTap,
  }) {
    return Expanded(
      child: GestureDetector(
        onTap:    onTap,
        behavior: HitTestBehavior.opaque,
        child: AnimatedContainer(
          duration:   const Duration(milliseconds: 180),
          curve:      Curves.easeInOut,
          padding:    const EdgeInsets.symmetric(vertical: 10),
          decoration: BoxDecoration(
            color:        selected ? BanzamiColors.white : Colors.transparent,
            borderRadius: BanzamiRadius.lgAll,
            boxShadow: selected
                ? [BoxShadow(
                    color:      BanzamiColors.gray400.withValues(alpha: 0.18),
                    blurRadius: 8, offset: const Offset(0, 2))]
                : null,
          ),
          child: Text(
            label,
            textAlign: TextAlign.center,
            style: BanzamiTextStyles.label.copyWith(
              fontSize:   14,
              fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
              color:      selected ? BanzamiColors.primary : BanzamiColors.gray400,
            ),
          ),
        ),
      ),
    );
  }
}

// =============================================================================
// People stepper button
// =============================================================================

class _StepButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback? onTap;

  const _StepButton({required this.icon, this.onTap});

  @override
  Widget build(BuildContext context) {
    final enabled = onTap != null;
    return GestureDetector(
      onTap:    onTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        width:  36, height: 36,
        decoration: BoxDecoration(
          color: enabled
              ? BanzamiColors.primary.withValues(alpha: 0.10)
              : BanzamiColors.gray100,
          shape: BoxShape.circle,
        ),
        child: Icon(icon, size: 20,
            color: enabled ? BanzamiColors.primary : BanzamiColors.gray400),
      ),
    );
  }
}

// =============================================================================
// Split result row — one person, their amount, pending state, share button
// =============================================================================

class _SplitLinkRow extends StatelessWidget {
  final int index;
  final PaymentLink link;
  final ValueChanged<Rect?> onShare;

  const _SplitLinkRow({
    required this.index,
    required this.link,
    required this.onShare,
  });

  @override
  Widget build(BuildContext context) {
    final shareKey = GlobalKey();
    return Container(
      padding: const EdgeInsets.all(BanzamiSpacing.md),
      decoration: BoxDecoration(
        color:        BanzamiColors.white,
        borderRadius: BanzamiRadius.lgAll,
        border:       Border.all(color: BanzamiColors.gray200),
      ),
      child: Row(children: [
        Container(
          width: 36, height: 36,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: BanzamiColors.primary.withValues(alpha: 0.10),
            shape: BoxShape.circle,
          ),
          child: Text('$index',
              style: BanzamiTextStyles.label.copyWith(
                color: BanzamiColors.primary, fontWeight: FontWeight.w700)),
        ),
        const SizedBox(width: BanzamiSpacing.sm),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Pessoa $index', style: BanzamiTextStyles.bodyMd),
            const SizedBox(height: 2),
            Text(
              link.amountMinor != null
                  ? formatMinor(link.amountMinor!, link.currency)
                  : '—',
              style: BanzamiTextStyles.headingSm.copyWith(color: BanzamiColors.primary),
            ),
            const SizedBox(height: 4),
            Row(mainAxisSize: MainAxisSize.min, children: [
              const Icon(Icons.schedule_rounded, size: 13, color: BanzamiColors.gray400),
              const SizedBox(width: 4),
              Text('A aguardar pagamento',
                  style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.gray400)),
            ]),
          ]),
        ),
        IconButton(
          key:     shareKey,
          icon:    const Icon(Icons.ios_share_rounded, size: 20),
          color:   BanzamiColors.primary,
          tooltip: 'Partilhar link',
          onPressed: () {
            final box = shareKey.currentContext?.findRenderObject() as RenderBox?;
            final origin = box != null
                ? box.localToGlobal(Offset.zero) & box.size
                : null;
            onShare(origin);
          },
        ),
      ]),
    );
  }
}

// =============================================================================
// Inline error box (reused for API errors and the divisibility error)
// =============================================================================

class _ErrorBox extends StatelessWidget {
  final String message;
  const _ErrorBox({required this.message});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(BanzamiSpacing.md),
      decoration: BoxDecoration(
        color:        BanzamiColors.error.withValues(alpha: 0.08),
        borderRadius: BanzamiRadius.lgAll,
      ),
      child: Row(children: [
        const Icon(Icons.error_outline_rounded, color: BanzamiColors.error, size: 20),
        const SizedBox(width: 10),
        Expanded(child: Text(message,
            style: BanzamiTextStyles.bodySm.copyWith(color: BanzamiColors.error))),
      ]),
    );
  }
}
